import { useEffect, useRef, useState } from 'react'
import { pollVideoChunks, type VideoChunk } from '@/lib/videoCdn'
import { rtcPresence, rtcSend } from '@/lib/rtc'
import { useFullscreen } from '@/lib/video/useFullscreen'
import { useVideoRecording } from '@/lib/video/useVideoRecording'
import VideoTile from '@/components/video/VideoTile'
import CdnVideoTile from '@/components/video/CdnVideoTile'
import RoomManagement from '@/components/video/RoomManagement'
import UserList from '@/components/video/UserList'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type Props = {
  room: string
  selfCid: string
  selfName: string
  peers: PresenceUser[]
  onClose: () => void
}

type UserVideoState = {
  cid: string
  chunks: VideoChunk[]
  lastChunkTs: number
  status: 'active' | 'inactive'
}

export default function VideoChatPanel({ room, selfCid, selfName, onClose }: Props) {
  const [activeRoom, setActiveRoom] = useState(room)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userVideos, setUserVideos] = useState<Record<string, UserVideoState>>({})
  const [roomParticipants, setRoomParticipants] = useState<PresenceUser[]>([])
  
  const { isFullscreen, containerRef, toggleFullscreen } = useFullscreen()
  const { localStream } = useVideoRecording(activeRoom, selfCid, joined)
  
  const sinceRef = useRef(0)
  const pollAbortRef = useRef<AbortController | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  async function syncRoomParticipants(channel: string) {
    const ac = new AbortController()
    try {
      const rows = await rtcPresence({ channel, client: selfCid, signal: ac.signal })
      const active = rows.filter((p) => p.cid && p.lastSeen > Date.now() - 45000)
      setRoomParticipants(active)
    } catch {}
  }

  useEffect(() => {
    if (!joined) return
    const interval = setInterval(() => {
      void syncRoomParticipants(activeRoom)
    }, 2000)
    return () => clearInterval(interval)
  }, [joined, activeRoom, selfCid])


  useEffect(() => {
    if (!joined) return

    const ac = new AbortController()
    pollAbortRef.current = ac
    let cancelled = false

    const pump = async () => {
      try {
        while (!cancelled) {
          const res = await pollVideoChunks({
            room: activeRoom,
            since: sinceRef.current,
            timeout: 20,
            signal: ac.signal,
          })
          sinceRef.current = Math.max(sinceRef.current, res.now)

          setUserVideos((prev) => {
            const next = { ...prev }
            for (const chunk of res.chunks) {
              if (chunk.cid === selfCid) continue
              const existing = next[chunk.cid]
              if (existing) {
                const seen = new Set(existing.chunks.map((c) => c.id))
                if (!seen.has(chunk.id)) {
                  existing.chunks.push(chunk)
                  existing.lastChunkTs = Math.max(existing.lastChunkTs, chunk.ts)
                  existing.status = 'active'
                }
              } else {
                next[chunk.cid] = {
                  cid: chunk.cid,
                  chunks: [chunk],
                  lastChunkTs: chunk.ts,
                  status: 'active',
                }
              }
            }

            const now = Date.now()
            for (const cid in next) {
              if (now - next[cid].lastChunkTs > 10000) {
                next[cid].status = 'inactive'
              }
            }

            return next
          })
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'Video poll failed')
      }
    }

    void pump()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [joined, activeRoom, selfCid])

  async function joinGlobal() {
    setError(null)
    setJoining(true)
    setActiveRoom(room)
    setJoined(true)
    await syncRoomParticipants(room)
    setJoining(false)
  }

  async function joinRoom(targetRoom: string) {
    setError(null)
    setJoining(true)
    setActiveRoom(targetRoom)
    setJoined(true)
    await syncRoomParticipants(targetRoom)
    try {
      await rtcSend({
        room: targetRoom,
        channel: targetRoom,
        from: selfCid,
        type: 'join',
        payload: { name: selfName },
      })
    } catch {}
    setJoining(false)
  }

  async function leave() {
    if (localStream) {
      for (const t of localStream.getTracks()) t.stop()
    }
    setJoined(false)
    setError(null)
    setUserVideos({})
  }

  const activeParticipants = roomParticipants.filter((p) => p.cid !== selfCid && p.lastSeen > Date.now() - 45000)
  const participantCount = activeParticipants.length + (joined ? 1 : 0)
  const activeVideoUsers = Object.values(userVideos).filter((v) => v.status === 'active')

  return (
    <div ref={containerRef} className={isFullscreen ? "fixed inset-0 z-50 bg-neutral-950" : "mt-3 rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10"}>
      <div ref={wrapRef} className={isFullscreen ? "h-full flex flex-col p-4" : ""}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-neutral-100">Video</div>
              {joined && participantCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-xs font-semibold text-green-400">{participantCount}</span>
                </div>
              ) : null}
              {joining ? (
                <span className="text-xs text-neutral-400">Joining...</span>
              ) : joined ? (
                <span className="text-xs text-green-400">Connected</span>
              ) : null}
            </div>
            <div className="truncate text-[11px] text-neutral-400">{activeRoom}</div>
          </div>
          <div className="flex items-center gap-2">
            {joined && (
              <button
                onClick={toggleFullscreen}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                type="button"
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? "Exit" : "Fullscreen"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-2">
            {!joined ? (
              <button
                onClick={() => void joinGlobal()}
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
          <UserList participants={roomParticipants} selfCid={selfCid} activeRoom={activeRoom} selfName={selfName} joined={joined} />

          <div className={isFullscreen ? "flex-1 grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid gap-3 sm:grid-cols-2"}>
            <VideoTile label="You" stream={localStream} muted />
            {activeVideoUsers.map((userVideo) => {
              const user = roomParticipants.find(p => p.cid === userVideo.cid)
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
        </div>
      </div>
    </div>
  )
}
