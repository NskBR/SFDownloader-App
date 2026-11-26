//! Windows proves holes through FSCTL_QUERY_ALLOCATED_RANGES; unsupported filesystems fall back.
use std::path::Path;
#[derive(Debug)]
pub struct SparseMap {
    pub length: u64,
    pub allocated: Vec<std::ops::Range<u64>>,
}
impl SparseMap {
    pub fn is_zero(&self, offset: u64, length: u64) -> bool {
        let Some(end) = offset.checked_add(length) else {
            return false;
        };
        if length == 0 || end > self.length {
            return false;
        }
        let next = self.allocated.partition_point(|range| range.end <= offset);
        self.allocated
            .get(next)
            .map(|range| range.start >= end)
            .unwrap_or(true)
    }
}
#[cfg(not(windows))]
pub fn inspect(_path: &Path) -> Option<SparseMap> {
    None
}
#[cfg(windows)]
pub fn inspect(path: &Path) -> Option<SparseMap> {
    use std::os::windows::{fs::MetadataExt, io::AsRawHandle};
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_MORE_DATA},
        Storage::FileSystem::FILE_ATTRIBUTE_SPARSE_FILE,
        System::{
            Ioctl::{FILE_ALLOCATED_RANGE_BUFFER, FSCTL_QUERY_ALLOCATED_RANGES},
            IO::DeviceIoControl,
        },
    };
    let file = std::fs::File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_SPARSE_FILE == 0 {
        return None;
    }
    let length = metadata.len();
    if length > i64::MAX as u64 {
        return None;
    }
    let mut allocated = Vec::new();
    let mut cursor = 0;
    while cursor < length {
        let input = FILE_ALLOCATED_RANGE_BUFFER {
            FileOffset: cursor as i64,
            Length: (length - cursor) as i64,
        };
        let mut output = [FILE_ALLOCATED_RANGE_BUFFER {
            FileOffset: 0,
            Length: 0,
        }; 512];
        let mut bytes = 0u32;
        // Both buffers are initialized C-layout POD values, alive for this synchronous call.
        let ok = unsafe {
            DeviceIoControl(
                file.as_raw_handle(),
                FSCTL_QUERY_ALLOCATED_RANGES,
                &input as *const _ as *const _,
                std::mem::size_of_val(&input) as u32,
                output.as_mut_ptr().cast(),
                std::mem::size_of_val(&output) as u32,
                &mut bytes,
                std::ptr::null_mut(),
            )
        };
        let error = if ok == 0 {
            unsafe { GetLastError() }
        } else {
            0
        };
        if ok == 0 && error != ERROR_MORE_DATA {
            return None;
        }
        let count = bytes as usize / std::mem::size_of::<FILE_ALLOCATED_RANGE_BUFFER>();
        if count > output.len() {
            return None;
        }
        for range in &output[..count] {
            if range.FileOffset < 0 || range.Length <= 0 {
                return None;
            }
            let start = range.FileOffset as u64;
            let end = start.checked_add(range.Length as u64)?.min(length);
            if start >= end {
                return None;
            }
            allocated.push(start..end);
        }
        if ok != 0 {
            break;
        }
        let end = allocated.last()?.end;
        if end <= cursor || allocated.len() > 1_000_000 {
            return None;
        }
        cursor = end;
    }
    allocated.sort_by_key(|r| r.start);
    Some(SparseMap { length, allocated })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_proven_in_bounds_holes_are_zero() {
        let map = SparseMap {
            length: 100,
            allocated: vec![10..20, 60..80],
        };
        assert!(map.is_zero(0, 10));
        assert!(map.is_zero(20, 40));
        assert!(map.is_zero(80, 20));
        assert!(!map.is_zero(0, 11));
        assert!(!map.is_zero(15, 50));
        assert!(!map.is_zero(80, 21));
        assert!(!map.is_zero(u64::MAX, 10));
    }
}
