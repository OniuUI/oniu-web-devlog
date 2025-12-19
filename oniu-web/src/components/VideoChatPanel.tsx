import { useRef, useEffect } from 'react'
import { useFullscreen } from '@/lib/video/useFullscreen'
import { useVideoRecording } from '@/lib/video/useVideoRecording'
import { useVideoChunkPolling } from '@/lib/video/useVideoChunkPolling'
import { useRoomPresence } from '@/lib/video/useRoomPresence'
import { useRoomManagement } from '@/lib/video/useRoomManagement'
import { useRtcInvites } from '@/lib/video/useRtcInvites'
import RoomManagement from '@/components/video/RoomManagement'
import UserList from '@/components/video/UserList'
import VideoHeader from '@/components/video/VideoHeader'
import VideoGrid from '@/components/video/VideoGrid'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type Props = {
  room: string
  selfCid: string
  selfName: string
  peers: PresenceUser[]
  onClose: () => void
}

export default function VideoChatPanel({ room, selfCid, selfName, peers, onClose }: Props) {
  const { isFullscreen, containerRef, toggleFullscreen } = useFullscreen()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const syncParticipantsRef = useRef<((r: string) => Promise<void>) | null>(null)
  const clearVideosRef = useRef<(() => void) | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const { activeRoom, joined, joining, error, joinGlobal, joinRoom, leave, setError } = useRoomManagement({
    initialRoom: room,
    selfCid,
    selfName,
    onSyncParticipants: async (r: string) => {
      if (syncParticipantsRef.current) {
        await syncParticipantsRef.current(r)
      }
    },
    onClearVideos: () => {
      if (clearVideosRef.current) {
        clearVideosRef.current()
      }
    },
    localStream: localStreamRef.current,
  })

  useEffect(() => {
    console.log(`[VideoChatPanel] State update - activeRoom: "${activeRoom}", joined: ${joined}, initialRoom: "${room}"`)
  }, [activeRoom, joined, room])

  console.log(`[VideoChatPanel] Calling useVideoRecording with activeRoom: "${activeRoom}", selfCid: ${selfCid}, joined: ${joined}`)
  const { localStream } = useVideoRecording(activeRoom, selfCid, joined)

  const { roomParticipants, participantCount, syncRoomParticipants } = useRoomPresence({
    room: activeRoom,
    selfCid,
    joined,
    peers,
  })

  const { activeVideoUsers, clearVideos } = useVideoChunkPolling({
    room: activeRoom,
    selfCid,
    joined,
    onError: setError,
  })

  useEffect(() => {
    console.log(`[VideoChatPanel] activeVideoUsers count: ${activeVideoUsers.length}`, activeVideoUsers.map(u => ({ cid: u.cid, chunks: u.chunks.length, status: u.status })))
  }, [activeVideoUsers])

  useRtcInvites({
    room: activeRoom,
    selfCid,
    enabled: true,
    onInvite: (inviteRoom, _from, fromName) => {
      if (confirm(`${fromName} invited you to join room "${inviteRoom}". Join?`)) {
        void joinRoom(inviteRoom)
      }
    },
  })

  useEffect(() => {
    syncParticipantsRef.current = syncRoomParticipants
  }, [syncRoomParticipants])

  useEffect(() => {
    clearVideosRef.current = clearVideos
  }, [clearVideos])

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen ? 'fixed inset-0 z-50 bg-neutral-950' : 'mt-3 rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10'
      }
    >
      <div ref={wrapRef} className={isFullscreen ? 'h-full flex flex-col p-4' : ''}>
        <VideoHeader
          activeRoom={activeRoom}
          joined={joined}
          joining={joining}
          participantCount={participantCount}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onClose={onClose}
        />

        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-2">
            {!joined ? (
              <button
                onClick={() => {
                  console.log(`[VideoChatPanel] Join global button clicked`)
                  void joinGlobal()
                }}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-100"
                type="button"
              >
                Join global room
              </button>
            ) : (
              <button
                onClick={() => void leave()}
                className="rounded-xl px-3 py-1.5 text-xs text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
                type="button"
              >
                Leave
              </button>
            )}
          </div>

          {error ? <div className="text-[11px] text-rose-300">{error}</div> : null}

          <RoomManagement onJoinRoom={joinRoom} />
          <UserList
            participants={roomParticipants}
            selfCid={selfCid}
            activeRoom={activeRoom}
            selfName={selfName}
            joined={joined}
          />

          <VideoGrid
            isFullscreen={isFullscreen}
            localStream={localStream}
            activeVideoUsers={activeVideoUsers}
            roomParticipants={roomParticipants}
            videoRefs={videoRefs}
          />
        </div>
      </div>
    </div>
  )
}
