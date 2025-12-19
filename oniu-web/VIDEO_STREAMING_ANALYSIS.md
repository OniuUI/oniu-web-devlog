# Video Streaming Analysis - Why Videos Aren't Visible

## Current Flow

1. **Upload**: `useVideoRecording` records every 2s, uploads to `/api/video_upload.php` with `room`, `cid`, base64 chunk
2. **Storage**: Server saves to `uploads/video/{room}/{date}/{chunkId}.webm` and appends to `_data/video-chunks-{room}.jsonl`
3. **Polling**: `useVideoChunkPolling` polls `/api/video_upload.php?room={room}&since={timestamp}` every ~20s
4. **Filtering**: Chunks where `chunk.cid === selfCid` are excluded
5. **Display**: `CdnVideoTile` plays chunks sequentially using `/cdn/video?src={url}`

## Critical Issues Found

### Issue 1: Chunk Accumulation Without Limits
**Problem**: `useVideoChunkPolling` accumulates ALL chunks forever. If someone has been streaming for 10 minutes, that's 300 chunks per user. With 5 users, that's 1500 chunks in memory.

**Impact**: 
- Memory bloat
- Slower chunk processing
- Potential browser crashes

**Location**: `useVideoChunkPolling.ts` line 49-79

### Issue 2: Chunk Playback Logic Flaw
**Problem**: `CdnVideoTile` plays chunks sequentially, but when new chunks arrive, it doesn't handle the queue properly. The `currentChunkIndex` might be pointing to an old chunk while new ones are added.

**Impact**: 
- Videos might skip chunks
- Videos might loop incorrectly
- Videos might not play at all if chunks arrive out of order

**Location**: `CdnVideoTile.tsx` line 21-61

### Issue 3: No Chunk Pruning
**Problem**: Old chunks (older than ~10 seconds) should be removed from the queue since they're no longer relevant for live streaming. Currently, chunks accumulate indefinitely.

**Impact**: 
- Memory issues
- Slower playback
- Stale video data

### Issue 4: Race Condition in Polling
**Problem**: When joining, we set `sinceRef.current = Date.now() - 30000`, but if chunks were uploaded exactly 30 seconds ago, they might be missed due to timing.

**Impact**: 
- Missing initial chunks when joining
- Videos might not appear immediately

### Issue 5: No Error Handling for Failed Chunks
**Problem**: If a chunk fails to load (404, network error), `CdnVideoTile` just moves to the next chunk. But if ALL chunks fail, the video never plays.

**Impact**: 
- Silent failures
- Videos not displaying even if chunks exist

### Issue 6: Chunk Ordering Not Guaranteed
**Problem**: The polling might return chunks out of order, especially if multiple users upload simultaneously. The code doesn't sort chunks by timestamp.

**Impact**: 
- Videos might play out of order
- Jumpy/stuttering playback

### Issue 7: Inefficient Polling Strategy
**Problem**: Long polling with 20s timeout means we only check for new chunks every 20 seconds. For 2s chunks, that's 10 chunks per poll, which is fine, but the delay is noticeable.

**Impact**: 
- 20s delay before seeing new users
- Stale video data

## Root Cause Analysis

The most likely reason you can't see other users' videos:

1. **Chunks ARE being uploaded** (you see yourself, so upload works)
2. **Chunks ARE being polled** (the polling loop runs)
3. **Chunks ARE being filtered correctly** (self-chunks excluded)
4. **BUT**: The chunks might be:
   - Arriving out of order and not being sorted
   - Accumulating too fast and causing playback issues
   - Not being played because the playback logic is broken
   - Being filtered incorrectly if room names don't match

## Verification Steps Needed

1. Check browser console for errors
2. Check Network tab to see if chunks are being fetched
3. Check if `activeVideoUsers` array has items
4. Check if chunks array in `CdnVideoTile` has items
5. Verify room names match between upload and poll
