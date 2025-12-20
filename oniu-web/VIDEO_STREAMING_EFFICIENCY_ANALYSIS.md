# Video Streaming Efficiency Analysis

## Current Pipeline Overview

1. **Recording** (`useVideoRecording.ts`):
   - MediaRecorder captures 2s chunks at 1Mbps (~250KB per chunk)
   - Sends Blob directly via FormData (✅ binary, no base64 overhead)
   - Interval: 2000ms

2. **Upload** (`videoCdn.ts` → `video_upload.php`):
   - POST with FormData (binary)
   - Saves to `uploads/video/{room}/{date}/{chunkId}.webm`
   - Appends metadata to `_data/video-chunks-{room}.jsonl`

3. **Polling** (`useVideoChunkPolling.ts`):
   - Long-polling with 10-20s timeout
   - Reads chunks since timestamp from JSONL file
   - Client-side pruning: max 15 chunks/user, 15s max age

4. **Playback** (`CdnVideoTile.tsx`):
   - Sequential playback of chunks
   - Each chunk = separate HTTP request to `/cdn/video?src=...`

## Performance Issues Identified

### ✅ GOOD: Already Optimized
- Binary uploads (no base64 overhead)
- Client-side chunk pruning (15 chunks max, 15s max age)
- Chunk size reasonable (2s @ 1Mbps = ~250KB)
- Video files already compressed (WebM)

### ❌ CRITICAL: Needs Fixing

#### 1. **Gzip Compression Not Enabled**
- `enable_gzip()` function exists but not called before POST handler
- JSON responses not compressed (polling responses could be 10-50KB)
- **Impact**: 60-80% bandwidth waste on polling responses

#### 2. **Inefficient File Reading**
- `read_chunks_since()` reads last 256KB of file every poll
- Re-reads entire tail even if no new chunks
- **Impact**: Unnecessary disk I/O, CPU waste

#### 3. **No File Cleanup**
- Video files accumulate forever on disk
- JSONL files grow indefinitely
- **Impact**: Disk space exhaustion over time

#### 4. **Chunk Playback Gaps**
- Sequential playback with separate HTTP requests
- Gap between chunks = network latency + file I/O
- **Impact**: Visible stuttering, poor user experience

#### 5. **Long-Polling CPU Waste**
- 250ms sleep in tight loop (usleep(250000))
- Checks file mtime every iteration
- **Impact**: Unnecessary CPU usage during idle periods

#### 6. **No Chunk Deduplication**
- Same chunk could be returned multiple times if client reconnects
- Client handles deduplication, but wastes bandwidth
- **Impact**: Redundant data transfer

## Recommended Optimizations

### Priority 1: Immediate Fixes
1. ✅ Enable gzip compression properly
2. ✅ Optimize file reading (cache file position)
3. ✅ Add file cleanup mechanism
4. ✅ Improve polling efficiency (longer sleep intervals)

### Priority 2: Quality Improvements
1. Implement chunk buffering/preloading
2. Add chunk deduplication on backend
3. Consider WebSocket for real-time delivery (future)

### Priority 3: Advanced Optimizations
1. Implement HLS/DASH for adaptive streaming (future)
2. Add CDN integration for video delivery
3. Implement server-side transcoding (future)

## Current Performance Metrics

- **Chunk Size**: ~250KB per 2s chunk
- **Upload Frequency**: Every 2s per user
- **Bandwidth per User**: ~1Mbps upstream, ~1Mbps downstream (if viewing others)
- **Storage Growth**: ~10MB per user per minute
- **Polling Frequency**: Every 10-20s (long-polling)

## Efficiency Score: 6/10

**Strengths:**
- Binary uploads (no base64 overhead)
- Reasonable chunk size
- Client-side memory management

**Weaknesses:**
- No response compression
- Inefficient file I/O
- No cleanup mechanism
- Playback gaps
- CPU waste in polling
