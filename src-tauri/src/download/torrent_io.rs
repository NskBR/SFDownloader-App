//! Count successful storage operations, never file preallocation or network traffic.
use librqbit::storage::{
    filesystem::FilesystemStorageFactory, BoxStorageFactory, StorageFactory, StorageFactoryExt,
    TorrentStorage,
};
use librqbit::{ManagedTorrentShared, TorrentMetadata};
use std::{
    collections::HashMap,
    io::IoSlice,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock, Weak,
    },
};
#[derive(Default)]
struct Counters {
    read: AtomicU64,
    written: AtomicU64,
}
fn registry() -> &'static Mutex<HashMap<String, Weak<Counters>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Weak<Counters>>>> = OnceLock::new();
    REGISTRY.get_or_init(Default::default)
}
pub fn totals(hash: &str) -> Option<(u64, u64)> {
    let counter = registry().lock().ok()?.get(hash)?.upgrade()?;
    Some((
        counter.read.load(Ordering::Relaxed),
        counter.written.load(Ordering::Relaxed),
    ))
}
#[derive(Clone)]
pub struct MeteredStorageFactory {
    pub output_dir: PathBuf,
}
impl StorageFactory for MeteredStorageFactory {
    type Storage = MeteredStorage;
    fn create(
        &self,
        shared: &ManagedTorrentShared,
        metadata: &TorrentMetadata,
    ) -> anyhow::Result<Self::Storage> {
        let counters = Arc::new(Counters::default());
        let inner = FilesystemStorageFactory::default().create(shared, metadata)?;
        let hash = super::torrent_metadata::sanitize_info_hash(&format!("{:?}", shared.info_hash));
        let mut registry = registry().lock().unwrap_or_else(|e| e.into_inner());
        registry.retain(|_, v| v.strong_count() > 0);
        registry.insert(hash, Arc::downgrade(&counters));
        Ok(MeteredStorage {
            inner: Box::new(inner),
            counters,
            output_dir: self.output_dir.clone(),
            paths: Vec::new(),
            sparse: Arc::new(Vec::new()),
            modified: Arc::new(Vec::new()),
        })
    }
    fn clone_box(&self) -> BoxStorageFactory {
        self.clone().boxed()
    }
}
pub struct MeteredStorage {
    inner: Box<dyn TorrentStorage>,
    counters: Arc<Counters>,
    output_dir: PathBuf,
    paths: Vec<PathBuf>,
    sparse: Arc<Vec<Option<super::torrent_sparse::SparseMap>>>,
    modified: Arc<Vec<AtomicBool>>,
}
impl TorrentStorage for MeteredStorage {
    fn init(
        &mut self,
        shared: &ManagedTorrentShared,
        metadata: &TorrentMetadata,
    ) -> anyhow::Result<()> {
        self.inner.init(shared, metadata)?;
        self.paths = metadata
            .file_infos
            .iter()
            .map(|file| self.output_dir.join(&file.relative_filename))
            .collect();
        self.sparse = Arc::new(
            self.paths
                .iter()
                .map(|path| super::torrent_sparse::inspect(path))
                .collect(),
        );
        self.modified = Arc::new(self.paths.iter().map(|_| AtomicBool::new(false)).collect());
        Ok(())
    }
    fn is_known_zero_range(&self, file_id: usize, offset: u64, length: u64) -> bool {
        !self
            .modified
            .get(file_id)
            .map(|v| v.load(Ordering::Acquire))
            .unwrap_or(true)
            && self
                .sparse
                .get(file_id)
                .and_then(|map| map.as_ref())
                .map(|map| map.is_zero(offset, length))
                .unwrap_or(false)
    }
    fn pread_exact(&self, file_id: usize, offset: u64, buf: &mut [u8]) -> anyhow::Result<()> {
        self.inner.pread_exact(file_id, offset, buf)?;
        self.counters
            .read
            .fetch_add(buf.len() as u64, Ordering::Relaxed);
        Ok(())
    }
    fn pwrite_all(&self, file_id: usize, offset: u64, buf: &[u8]) -> anyhow::Result<()> {
        if let Some(flag) = self.modified.get(file_id) {
            flag.store(true, Ordering::Release);
        }
        self.inner.pwrite_all(file_id, offset, buf)?;
        self.counters
            .written
            .fetch_add(buf.len() as u64, Ordering::Relaxed);
        Ok(())
    }
    fn pwrite_all_vectored(
        &self,
        file_id: usize,
        offset: u64,
        bufs: [IoSlice<'_>; 2],
    ) -> anyhow::Result<usize> {
        if let Some(flag) = self.modified.get(file_id) {
            flag.store(true, Ordering::Release);
        }
        let size = self
            .inner
            .as_ref()
            .pwrite_all_vectored(file_id, offset, bufs)?;
        self.counters
            .written
            .fetch_add(size as u64, Ordering::Relaxed);
        Ok(size)
    }
    fn remove_file(&self, file_id: usize, filename: &Path) -> anyhow::Result<()> {
        self.inner.remove_file(file_id, filename)
    }
    fn remove_directory_if_empty(&self, path: &Path) -> anyhow::Result<()> {
        self.inner.remove_directory_if_empty(path)
    }
    fn ensure_file_length(&self, file_id: usize, length: u64) -> anyhow::Result<()> {
        // Let successful writes grow the file. Do not turn an empty placeholder into
        // a torrent-sized logical file before any payload has arrived.
        if self
            .paths
            .get(file_id)
            .and_then(|path| std::fs::metadata(path).ok())
            .is_some_and(|meta| meta.len() < length)
        {
            return Ok(());
        }
        self.inner.ensure_file_length(file_id, length)
    }
    fn take(&self) -> anyhow::Result<Box<dyn TorrentStorage>> {
        Ok(Box::new(Self {
            inner: self.inner.take()?,
            counters: self.counters.clone(),
            output_dir: self.output_dir.clone(),
            paths: self.paths.clone(),
            sparse: self.sparse.clone(),
            modified: self.modified.clone(),
        }))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    struct Memory(Mutex<Vec<u8>>);
    impl TorrentStorage for Memory {
        fn init(&mut self, _: &ManagedTorrentShared, _: &TorrentMetadata) -> anyhow::Result<()> {
            Ok(())
        }
        fn pread_exact(&self, _: usize, offset: u64, buf: &mut [u8]) -> anyhow::Result<()> {
            let data = self.0.lock().unwrap();
            let src = data
                .get(offset as usize..offset as usize + buf.len())
                .ok_or_else(|| anyhow::anyhow!("short read"))?;
            buf.copy_from_slice(src);
            Ok(())
        }
        fn pwrite_all(&self, _: usize, offset: u64, buf: &[u8]) -> anyhow::Result<()> {
            if offset > 4096 {
                anyhow::bail!("write failed")
            };
            let mut data = self.0.lock().unwrap();
            let length = data.len().max(offset as usize + buf.len());
            data.resize(length, 0);
            data[offset as usize..offset as usize + buf.len()].copy_from_slice(buf);
            Ok(())
        }
        fn remove_file(&self, _: usize, _: &Path) -> anyhow::Result<()> {
            Ok(())
        }
        fn remove_directory_if_empty(&self, _: &Path) -> anyhow::Result<()> {
            Ok(())
        }
        fn ensure_file_length(&self, _: usize, length: u64) -> anyhow::Result<()> {
            self.0.lock().unwrap().resize(length as usize, 0);
            Ok(())
        }
        fn take(&self) -> anyhow::Result<Box<dyn TorrentStorage>> {
            Ok(Box::new(Memory(Mutex::new(std::mem::take(
                &mut *self.0.lock().unwrap(),
            )))))
        }
    }
    fn storage() -> MeteredStorage {
        MeteredStorage {
            inner: Box::new(Memory(Mutex::new(vec![]))),
            counters: Arc::default(),
            output_dir: PathBuf::new(),
            paths: Vec::new(),
            sparse: Arc::new(Vec::new()),
            modified: Arc::new(Vec::new()),
        }
    }
    #[test]
    fn only_successful_io_counts_and_preallocation_is_not_a_write() {
        let s = storage();
        s.ensure_file_length(0, 1024).unwrap();
        assert_eq!(s.counters.written.load(Ordering::Relaxed), 0);
        s.pwrite_all(0, 0, b"abc").unwrap();
        s.pwrite_all_vectored(0, 3, [IoSlice::new(b"de"), IoSlice::new(b"fg")])
            .unwrap();
        assert_eq!(s.counters.written.load(Ordering::Relaxed), 7);
        assert!(s.pwrite_all(0, 9999, b"x").is_err());
        assert_eq!(s.counters.written.load(Ordering::Relaxed), 7);
        s.pread_exact(0, 0, &mut [0; 7]).unwrap();
        assert!(s.pread_exact(0, 2000, &mut [0; 3]).is_err());
        assert_eq!(s.counters.read.load(Ordering::Relaxed), 7);
    }
    #[test]
    fn pause_storage_transfer_keeps_counters_and_torrents_are_isolated() {
        let a = storage();
        let b = storage();
        a.pwrite_all(0, 0, b"abc").unwrap();
        let moved = a.take().unwrap();
        moved.pwrite_all(0, 3, b"d").unwrap();
        assert_eq!(a.counters.written.load(Ordering::Relaxed), 4);
        assert_eq!(b.counters.written.load(Ordering::Relaxed), 0);
    }
}

#[cfg(all(test, windows))]
mod sparse_verification_tests {
    use super::*;
    use librqbit::{
        create_torrent, spawn_utils::BlockingSpawner, AddTorrent, AddTorrentOptions,
        CreateTorrentOptions, Session, SessionOptions,
    };
    use std::{
        io::{Seek, SeekFrom, Write},
        os::windows::io::AsRawHandle,
    };
    const PIECE: usize = 16384;
    async fn verify_fixture(
        zero_middle: bool,
        corrupt_first: bool,
        existing: bool,
    ) -> (librqbit::TorrentStats, u64, u64) {
        let root = std::env::temp_dir().join(format!("sf-sparse-check-{}", uuid::Uuid::new_v4()));
        let source = root.join("source");
        let output = root.join("destination/nested");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::create_dir_all(&output).unwrap();
        let mut contents = vec![if zero_middle { 0 } else { 9 }; 4 * 1024 * 1024];
        contents[..PIECE].fill(7);
        let len = contents.len();
        contents[len - PIECE..].fill(8);
        std::fs::write(source.join("pack.bin"), &contents).unwrap();
        let torrent = create_torrent(
            &source.join("pack.bin"),
            CreateTorrentOptions {
                piece_length: Some(PIECE as u32),
                ..Default::default()
            },
            &BlockingSpawner::new(1),
        )
        .await
        .unwrap();
        if existing {
            let mut file = std::fs::File::create(output.join("pack.bin")).unwrap();
            let mut returned = 0;
            let ok = unsafe {
                windows_sys::Win32::System::IO::DeviceIoControl(
                    file.as_raw_handle(),
                    windows_sys::Win32::System::Ioctl::FSCTL_SET_SPARSE,
                    std::ptr::null(),
                    0,
                    std::ptr::null_mut(),
                    0,
                    &mut returned,
                    std::ptr::null_mut(),
                )
            };
            assert_ne!(ok, 0, "fixture needs sparse-file support");
            file.set_len(len as u64).unwrap();
            file.write_all(&vec![if corrupt_first { 3 } else { 7 }; PIECE])
                .unwrap();
            file.seek(SeekFrom::Start((len - PIECE) as u64)).unwrap();
            file.write_all(&vec![8; PIECE]).unwrap();
            file.sync_all().unwrap();
        }
        let session = Session::new_with_opts(
            output.clone(),
            SessionOptions {
                dht: None,
                disable_trackers: true,
                listen: None,
                persistence: None,
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let handle = session
            .add_torrent(
                AddTorrent::from_bytes(torrent.as_bytes().unwrap()),
                Some(AddTorrentOptions {
                    output_folder: Some(output.to_string_lossy().into_owned()),
                    overwrite: true,
                    paused: true,
                    storage_factory: Some(
                        MeteredStorageFactory {
                            output_dir: output.clone(),
                        }
                        .boxed(),
                    ),
                    ..Default::default()
                }),
            )
            .await
            .unwrap()
            .into_handle()
            .unwrap();
        tokio::time::timeout(
            std::time::Duration::from_secs(10),
            handle.wait_until_initialized(),
        )
        .await
        .unwrap()
        .unwrap();
        let hash = super::super::torrent_metadata::sanitize_info_hash(&format!(
            "{:?}",
            handle.info_hash()
        ));
        let read = totals(&hash).unwrap().0;
        let stats = handle.stats();
        let size = std::fs::metadata(output.join("pack.bin")).unwrap().len();
        session
            .delete(librqbit::api::TorrentIdOrHash::Id(handle.id()), false)
            .await
            .unwrap();
        drop(handle);
        session.stop().await;
        drop(session);
        std::fs::remove_dir_all(&root).unwrap();
        (stats, read, size)
    }
    #[tokio::test]
    async fn skips_preallocated_holes_and_preserves_both_downloaded_ends() {
        let (stats, read, _) = verify_fixture(false, false, true).await;
        assert!(!stats.finished);
        assert_eq!(stats.file_progress[0], (2 * PIECE) as u64);
        assert!(
            read < 1024 * 1024,
            "sparse holes must not be read; actual bytes: {read}"
        );
    }
    #[tokio::test]
    async fn legitimate_zero_pieces_are_still_verified_against_the_expected_hash() {
        let (stats, read, _) = verify_fixture(true, false, true).await;
        assert!(stats.finished);
        assert_eq!(stats.file_progress[0], 4 * 1024 * 1024);
        assert!(read < 1024 * 1024);
    }
    #[tokio::test]
    async fn corrupted_allocated_piece_is_not_accepted() {
        let (stats, _, _) = verify_fixture(false, true, true).await;
        assert!(!stats.finished);
        assert_eq!(stats.file_progress[0], PIECE as u64);
    }
    #[tokio::test]
    async fn new_torrent_does_not_reserve_its_full_logical_size() {
        let (stats, read, size) = verify_fixture(false, false, false).await;
        assert!(!stats.finished);
        assert_eq!(stats.progress_bytes, 0);
        assert_eq!(read, 0);
        assert_eq!(size, 0);
    }
}

#[cfg(all(test, windows))]
mod cross_file_sparse_tests {
    use super::*;
    use std::os::windows::io::AsRawHandle;
    #[tokio::test]
    async fn hashes_cross_file_boundaries_and_partial_zero_pieces_without_reading_holes() {
        for payload_size in [0, 8192] {
            let root =
                std::env::temp_dir().join(format!("sf-sparse-boundary-{}", uuid::Uuid::new_v4()));
            let source = root.join("source");
            let output = root.join("output");
            std::fs::create_dir_all(&source).unwrap();
            std::fs::create_dir_all(&output).unwrap();
            std::fs::write(source.join("zeros.bin"), vec![0; 100_000]).unwrap();
            std::fs::write(source.join("payload.bin"), vec![6; payload_size]).unwrap();
            let file = std::fs::File::create(output.join("zeros.bin")).unwrap();
            let mut returned = 0;
            assert_ne!(
                unsafe {
                    windows_sys::Win32::System::IO::DeviceIoControl(
                        file.as_raw_handle(),
                        windows_sys::Win32::System::Ioctl::FSCTL_SET_SPARSE,
                        std::ptr::null(),
                        0,
                        std::ptr::null_mut(),
                        0,
                        &mut returned,
                        std::ptr::null_mut(),
                    )
                },
                0
            );
            file.set_len(100_000).unwrap();
            drop(file);
            std::fs::write(output.join("payload.bin"), vec![6; payload_size]).unwrap();
            let torrent = librqbit::create_torrent(
                &source,
                librqbit::CreateTorrentOptions {
                    piece_length: Some(16384),
                    ..Default::default()
                },
                &librqbit::spawn_utils::BlockingSpawner::new(1),
            )
            .await
            .unwrap();
            let session = librqbit::Session::new_with_opts(
                output.clone(),
                librqbit::SessionOptions {
                    dht: None,
                    disable_trackers: true,
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let handle = session
                .add_torrent(
                    librqbit::AddTorrent::from_bytes(torrent.as_bytes().unwrap()),
                    Some(librqbit::AddTorrentOptions {
                        output_folder: Some(output.to_string_lossy().into_owned()),
                        overwrite: true,
                        paused: true,
                        storage_factory: Some(
                            MeteredStorageFactory {
                                output_dir: output.clone(),
                            }
                            .boxed(),
                        ),
                        ..Default::default()
                    }),
                )
                .await
                .unwrap()
                .into_handle()
                .unwrap();
            tokio::time::timeout(
                std::time::Duration::from_secs(10),
                handle.wait_until_initialized(),
            )
            .await
            .unwrap()
            .unwrap();
            let hash = super::super::torrent_metadata::sanitize_info_hash(&format!(
                "{:?}",
                handle.info_hash()
            ));
            assert!(handle.stats().finished);
            assert_eq!(totals(&hash).unwrap().0, payload_size as u64);
            session
                .delete(librqbit::api::TorrentIdOrHash::Id(handle.id()), false)
                .await
                .unwrap();
            drop(handle);
            session.stop().await;
            drop(session);
            std::fs::remove_dir_all(root).unwrap();
        }
    }
}

#[cfg(test)]
mod upload_limit_lifecycle_tests {
 #[tokio::test]
 async fn upload_limit_is_kept_when_a_torrent_is_paused_and_resumed(){
  let root=std::env::temp_dir().join(format!("sf-upload-limit-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&root).unwrap();
  let source=root.join("source.bin");std::fs::write(&source,vec![7;16384]).unwrap();let output=root.join("output");std::fs::create_dir_all(&output).unwrap();
  let torrent=librqbit::create_torrent(&source,Default::default(),&librqbit::spawn_utils::BlockingSpawner::new(1)).await.unwrap();
  let session=librqbit::Session::new_with_opts(output.clone(),librqbit::SessionOptions{dht:None,disable_trackers:true,..Default::default()}).await.unwrap();
  let handle=session.add_torrent(librqbit::AddTorrent::from_bytes(torrent.as_bytes().unwrap()),Some(librqbit::AddTorrentOptions{output_folder:Some(output.to_string_lossy().into_owned()),paused:true,overwrite:true,ratelimits:librqbit::limits::LimitsConfig{upload_bps:std::num::NonZeroU32::new(65536),download_bps:None},..Default::default()})).await.unwrap().into_handle().unwrap();
  tokio::time::timeout(std::time::Duration::from_secs(10),handle.wait_until_initialized()).await.unwrap().unwrap();
  assert_eq!(handle.upload_limit().unwrap().get(),65536);handle.set_upload_limit(std::num::NonZeroU32::new(32768));
  session.unpause(&handle).await.unwrap();assert_eq!(handle.upload_limit().unwrap().get(),32768);
  handle.set_upload_limit(std::num::NonZeroU32::new(16384));assert_eq!(handle.upload_limit().unwrap().get(),16384);
  session.pause(&handle).await.unwrap();session.unpause(&handle).await.unwrap();assert_eq!(handle.upload_limit().unwrap().get(),16384);
  handle.set_upload_limit(None);assert_eq!(handle.upload_limit(),None);
  session.delete(librqbit::api::TorrentIdOrHash::Id(handle.id()),false).await.unwrap();drop(handle);session.stop().await;drop(session);std::fs::remove_dir_all(root).unwrap();
 }
}
