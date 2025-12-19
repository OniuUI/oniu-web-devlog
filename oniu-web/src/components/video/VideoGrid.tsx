import VideoTile from '@/components/video/VideoTile'
import CdnVideoTile from '@/components/video/CdnVideoTile'
import type { VideoChunk } from '@/lib/videoCdn'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type UserVideoState = {
  cid: string
  chunks: VideoChunk[]
  lastChunkTs: number
  status: 'active' | 'inactive'
}

type VideoGridProps = {
  isFullscreen: boolean
  localStream: MediaStream | null
  activeVideoUsers: UserVideoState[]
  roomParticipants: PresenceUser[]
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement | null>>
}

export default function VideoGrid({
  isFullscreen,
  localStream,
  activeVideoUsers,
  roomParticipants,
  videoRefs,
}: VideoGridProps) {
  return (
    <div
      className={
        isFullscreen
          ? 'flex-1 grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          : 'grid gap-3 sm:grid-cols-2'
      }
    >
      <VideoTile label="You" stream={localStream} muted />
      {activeVideoUsers.map((userVideo) => {
        const user = roomParticipants.find((p) => p.cid === userVideo.cid)
        return (
          <CdnVideoTile
            key={userVideo.cid}
            label={user?.name || userVideo.cid}
            chunks={userVideo.chunks}
            videoRef={(el) => {
              videoRefs.current[userVideo.cid] = el
            }}
          />
        )
      })}
    </div>
  )
}
