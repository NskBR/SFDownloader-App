# SFDownloader storage patch

Upstream: librqbit 9.0.1, https://github.com/ikatson/rqbit, Apache-2.0.
Registry source retained locally so builds use the reviewed implementation.

Changes in src/storage/mod.rs and src/file_ops.rs:
- Conservative is_known_zero_range storage capability (default false).
- Initial hash check skips disk reads and reuses the zero hash for pieces entirely inside proven sparse holes.
- Mixed allocated/zero pieces still undergo full hash validation; legitimate zero-filled pieces are accepted only when their expected hash matches.
- No fast-resume trust is added; unknown allocation maps retain the original full-check behavior.

Keep this patch when updating librqbit, or remove it once equivalent upstream support is available. The app's metered storage supplies Windows allocation maps and invalidates them after writes.

The queued piece iterator in src/chunk_tracker.rs now keeps one selected unfinished file active and visits its pieces in ascending order. Inflight pieces must finish validation before the next file becomes eligible. Streaming and shared boundary pieces remain supported.

Per-torrent upload limits can be changed live and retained through pause/resume. Limiter acquisition splits packets below the configured quota and wakes waiters on changes.

- On verification completion, honor the latest pause/resume intent and create a peer stream when resuming an initially paused check. Regression tests gate initialization to reproduce a resume during verification.

- Peer snapshots expose progress from the advertised bitfield, excluding padding bits. Encryption remains unknown because the engine provides no negotiated encryption status.
