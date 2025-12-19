# Chat System Specification

## Overview
This document lists all features currently implemented in the chat system. Please verify each section is correct before we proceed with testing.

---

## 1. CHAT FEATURES

### 1.1 Core Messaging
- ✅ **Send Messages**: Users can type and send text messages (max 800 chars) (VERIFIED: Works)
- ✅ **Real-time Updates**: Long-polling (20s timeout) for instant message delivery (VERIFIED: Works)
- ✅ **Message Display**: Messages show name, timestamp, and text content (VERIFIED: Works)
- ✅ **Message Persistence**: Messages stored in localStorage and on server (VERIFIED: Works)
- ✅ **Offline Support**: Messages queued in outbox when offline, auto-sent when online (VERIFIED: Works)
- ✅ **Local Fallback Mode**: Chat works locally when server is offline (VERIFIED: Works)

### 1.2 User Identity
- ✅ **Custom Name**: Users can set/edit their display name (max 40 chars) (VERIFIED: Works)
- ✅ **Random Name Generator**: Button to generate random chat names (VERIFIED: Works)
- ✅ **Name Persistence**: Name saved in localStorage (VERIFIED: Works, messages retained after rename)
- ✅ **Client ID (CID)**: Unique persistent client identifier stored in localStorage (VERIFIED: Works, links everything correctly)

### 1.3 Message Management
- ✅ **Delete Own Messages**: Users can delete their own messages (VERIFIED: Works)
- ✅ **Clear Chat**: Button to clear all messages from local view (VERIFIED: Works)
- ✅ **Message Timestamps**: Each message shows time sent (VERIFIED: Works)
- ✅ **Message IDs**: Unique IDs for each message (UUID or hex) (VERIFIED: Works)

### 1.4 Presence System
- ✅ **Online Count**: Green dot with number showing active users (VERIFIED: Works)
- ⚠️ **Presence Updates**: User presence tracked and updated every 2 seconds (VERIFIED: Works but SLOW)
- ❌ **Last Seen**: Tracks when users were last active (45s threshold for "online") (VERIFIED: NOT IMPLEMENTED - missing in chat and video views)
- ⚠️ **Public Presence List**: Shows all active users in chat (VERIFIED: Works for chat but EXTREMELY SLOW, does NOT work for video)

### 1.5 UI/UX
- ✅ **Chat Widget**: Floating button in bottom-right corner
- ✅ **Unread Count Badge**: Shows number of unread messages (max 99+)
- ✅ **Auto-scroll**: Chat auto-scrolls to bottom when new messages arrive
- ✅ **Sound Notifications**: Optional sound alerts for new messages
- ✅ **Keyboard Shortcuts**: Ctrl/⌘ + Enter to send message
- ✅ **Connection Status**: Shows "online", "offline", or "connecting" status
- ✅ **Mode Indicator**: Shows "Global chat" or "Local fallback"

### 1.6 Data Synchronization
- ✅ **BroadcastChannel**: Cross-tab synchronization via BroadcastChannel API
- ✅ **localStorage Sync**: Messages synced across browser tabs via storage events
- ✅ **Server Sync**: Messages merged with server state on each poll
- ✅ **Moderation Sync**: Instant updates when messages are deleted/banned

---

## 2. VIDEO CHAT FEATURES

### 2.1 Video Rooms
- ✅ **Global Room**: Default "global" room for video chat
- ✅ **Custom Rooms**: Users can create named rooms (max 32 chars, alphanumeric + dash/underscore)
- ✅ **Room List**: View and rejoin previously accepted rooms
- ✅ **Room Persistence**: Accepted rooms saved in localStorage (30 day retention)
- ✅ **Room Switching**: Join different rooms dynamically

### 2.2 Video Streaming (CDN-based)
- ✅ **Local Video Recording**: MediaRecorder captures video chunks every 2 seconds
- ✅ **Video Upload**: Chunks uploaded as base64 to `/api/video_upload.php`
- ✅ **Video Polling**: Continuous polling for new video chunks from other users
- ✅ **Chunk Playback**: CDN video tiles play chunks sequentially from `/cdn/video?src=...`
- ✅ **Buffering Indicators**: Shows "Buffering..." and spinner while loading
- ✅ **Status Indicators**: Green dot when video is playing, buffering status shown

### 2.3 Video UI
- ✅ **Video Grid**: Responsive grid layout (2 cols mobile, 3-4 cols desktop)
- ✅ **Fullscreen Mode**: Toggle fullscreen for video panel
- ✅ **Participant Count**: Green dot with number showing active participants
- ✅ **Status Indicators**: "Joining...", "Connected" status shown
- ✅ **Video Tiles**: Each user gets their own video tile with label
- ✅ **Local Video**: "You" tile shows local camera feed (muted)

### 2.4 User Interaction
- ✅ **Call Users**: "Call" button next to each user to invite to current room
- ✅ **Room Invitations**: Send RTC signals to invite users to join a room
- ✅ **Join/Leave**: Join global room or leave current room
- ✅ **User List**: Shows all participants in current room with online/idle status

### 2.5 Video State Management
- ✅ **Active/Inactive Tracking**: Users marked inactive after 10s without new chunks
- ✅ **Chunk Deduplication**: Prevents duplicate chunks from being added
- ✅ **Stream Cleanup**: Properly stops media tracks on leave/unmount

---

## 3. ADMIN/MODERATION FEATURES

### 3.1 Admin Authentication
- ✅ **Admin Session**: Requires login at `/admin/` to access admin features
- ✅ **CSRF Protection**: All admin actions require valid CSRF token
- ✅ **Admin Detection**: Server returns admin status in API responses

### 3.2 User Management
- ✅ **User List**: View all connected users with IP addresses
- ✅ **Ban Users**: Ban users by IP address (permanent until unban)
- ✅ **Unban Users**: Remove ban from IP address
- ✅ **Mute Users**: Mute users by IP for specified duration (default 10 minutes)
- ✅ **Unmute Users**: Remove mute from IP address
- ✅ **Purge Messages**: Delete all messages from a specific IP address
- ✅ **Conditional UI**: Only shows mute/unmute or ban/unban based on current state

### 3.3 Message Moderation
- ✅ **Delete Message**: Admins can delete any message by ID
- ✅ **Delete Own Message**: Regular users can delete their own messages
- ✅ **Clear History**: Admins can clear entire chat history
- ✅ **Instant Sync**: Deleted messages removed instantly from all clients
- ✅ **Moderation Payload**: Server sends moderation state with each poll

### 3.4 Chat Control
- ✅ **Pause Chat**: Admins can pause chat for specified duration (e.g., 60 seconds)
- ✅ **Resume Chat**: Admins can resume paused chat
- ✅ **System Notices**: Admins can post system messages (marked as "SYSTEM")

### 3.5 Admin UI
- ✅ **Admin Panel**: Toggle admin panel within chat widget
- ✅ **Refresh Button**: Manually refresh admin state
- ✅ **Banned List**: View all currently banned IPs
- ✅ **Muted List**: View all currently muted IPs with expiration times
- ✅ **Action Feedback**: Shows errors and loading states for admin actions

---

## 4. TECHNICAL FEATURES

### 4.1 Data Storage
- ✅ **localStorage**: Client-side caching of messages and settings
- ✅ **Server Storage**: Messages stored in `/_data/chat-<room>.jsonl`
- ✅ **Moderation Storage**: Moderation state in `/_data/mod-<room>.json`
- ✅ **Presence Storage**: User presence in `/_data/presence-<room>.json`
- ✅ **Video Storage**: Video chunks stored in uploads directory

### 4.2 Error Handling
- ✅ **Global Error Handler**: PHP errors logged to `/_data/error.log`
- ✅ **Network Errors**: Graceful handling of network failures
- ✅ **Error Messages**: User-friendly error messages displayed in UI
- ✅ **Retry Logic**: Automatic retry for failed requests

### 4.3 Performance
- ✅ **Long-polling**: Efficient server polling with 20s timeout
- ✅ **Message Limits**: Max 50 messages per poll response
- ✅ **Outbox Queue**: Max 50 messages in offline queue
- ✅ **Chunk Management**: Video chunks cleaned up after playback

### 4.4 Security
- ✅ **Input Sanitization**: All user inputs sanitized (name, text, room names)
- ✅ **IP Tracking**: Client IPs tracked for moderation (admins only)
- ✅ **Session Management**: PHP sessions for admin authentication
- ✅ **CSRF Tokens**: Protection against cross-site request forgery

---

## 5. FILE STRUCTURE

### 5.1 Frontend Components
- `LocalChatWidget.tsx` - Main chat widget component
- `VideoChatPanel.tsx` - Video chat orchestrator
- `video/VideoTile.tsx` - Local video display
- `video/CdnVideoTile.tsx` - Remote video chunk player
- `video/RoomManagement.tsx` - Room creation/list UI
- `video/UserList.tsx` - User list with call functionality

### 5.2 Backend APIs
- `/api/chat.php` - Chat messages and moderation
- `/api/video_upload.php` - Video chunk upload/polling
- `/api/rtc.php` - RTC signaling for video invitations
- `/admin/index.php` - Admin panel (separate from chat widget)
- `/admin/monitor.php` - Server monitoring endpoint

### 5.3 Utilities
- `lib/chatSync.ts` - Message merging and moderation application
- `lib/videoCdn.ts` - Video chunk upload/poll API functions
- `lib/rtc.ts` - RTC signaling functions
- `lib/video/useFullscreen.ts` - Fullscreen hook
- `lib/video/useVideoRecording.ts` - Video recording hook
- `lib/video/roomStorage.ts` - Room persistence utilities

---

## 6. VERIFICATION STATUS

### 6.1 Chat Features (VERIFIED)
- [x] Message sending works correctly ✅
- [x] Messages appear instantly for all users ✅
- [x] Offline queue works and syncs when online ✅
- [x] Delete own message removes from all clients instantly ✅
- [x] Clear chat only clears local view ✅
- [x] Presence count updates correctly ✅
- [ ] Unread count badge works correctly (NOT YET VERIFIED)

### 6.2 Issues Found
- ❌ **Last Seen Display**: Missing in both chat and video views (needs implementation)
- ⚠️ **Presence Updates**: Working but too slow (needs optimization)
- ⚠️ **Public Presence List**: Extremely slow in chat, not working in video (needs fix)

### 6.2 Video Features
- [ ] Video recording starts when joining room
- [ ] Video chunks upload successfully
- [ ] Video chunks appear for other users
- [ ] Video playback works smoothly
- [ ] Fullscreen mode works
- [ ] Room creation works
- [ ] Room invitations work
- [ ] User calling/inviting works

### 6.3 Admin Features
- [ ] Admin panel only visible to admins
- [ ] Ban/unban works correctly
- [ ] Mute/unmute works correctly
- [ ] Purge messages works
- [ ] Delete message works
- [ ] Clear history works
- [ ] Pause/resume works
- [ ] System notices work
- [ ] Conditional UI shows correct buttons (mute vs unmute, ban vs unban)

### 6.4 Technical
- [ ] Moderation syncs instantly across all clients
- [ ] Error handling works gracefully
- [ ] localStorage persistence works
- [ ] Cross-tab sync works
- [ ] Network reconnection works

---

---

## 7. ISSUES TO FIX

### 7.1 Critical Issues
1. ❌ **Last Seen Display Missing**
   - Not shown in chat view
   - Not shown in video view
   - Should display when users were last active (45s threshold for "online")

2. ❌ **Public Presence List Not Working in Video**
   - Works in chat but extremely slow
   - Does NOT work in video chat at all
   - Need to implement presence list for video participants

### 7.2 Performance Issues
1. ⚠️ **Presence Updates Too Slow**
   - Currently updates every 2 seconds
   - User reports it's too slow
   - Need to optimize presence update frequency or mechanism

2. ⚠️ **Public Presence List Extremely Slow in Chat**
   - Works but performance is poor
   - Need to investigate and optimize

---

## Notes
- All features should work in both global and local fallback modes
- Admin features require authentication at `/admin/`
- Video features use CDN-based chunk streaming (not WebRTC P2P)
- Moderation actions should be instant across all connected clients
