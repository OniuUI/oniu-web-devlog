import { useEffect, useRef, useState } from 'react'
import { pollVideoChunks, uploadVideoChunk, type VideoChunk } from '@/lib/videoCdn'
import { rtcPresence } from '@/lib/rtc'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type Props = {
  room: string
  selfCid: string
  selfName: string
  peers: PresenceUser[]
  onClose: () => void
}

type RoomInfo = {
  room: string
  acceptedAt: number
  lastJoined?: number
}

type UserVideoState = {
  cid: string
  chunks: VideoChunk[]
  lastChunkTs: number
  status: 'active' | 'inactive'
}

function loadAcceptedRooms(): RoomInfo[] {
  try {
    const stored = localStorage.getItem('oniu.rooms.accepted')
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAcceptedRoom(room: string) {
  try {
    const rooms = loadAcceptedRooms()
    const existing = rooms.find((r) => r.room === room)
    if (existing) {
      existing.lastJoined = Date.now()
    } else {
      rooms.push({ room, acceptedAt: Date.now(), lastJoined: Date.now() })
    }
    const recent = rooms.filter((r) => Date.now() - r.acceptedAt < 30 * 24 * 60 * 60 * 1000)
    localStorage.setItem('oniu.rooms.accepted', JSON.stringify(recent))
  } catch {}
}

export default function VideoChatPanel({ room, selfCid, onClose }: Props) {
  const [activeRoom, setActiveRoom] = useState(room)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [userVideos, setUserVideos] = useState<Record<string, UserVideoState>>({})
  const [acceptedRooms, setAcceptedRooms] = useState<RoomInfo[]>(loadAcceptedRooms())
  const [showRoomList, setShowRoomList] = useState(false)
  const [roomParticipants, setRoomParticipants] = useState<PresenceUser[]>([])
  
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunkIntervalRef = useRef<number | null>(null)
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
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current)
      }
      if (localStream) {
        for (const t of localStream.getTracks()) t.stop()
      }
      pollAbortRef.current?.abort()
    }
  }, [localStream])

  async function ensureMedia() {
    if (localStream) return localStream
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    setLocalStream(stream)
    return stream
  }

  async function startRecording() {
    const stream = await ensureMedia()
    if (!stream) return

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 1000000,
    })

    recorder.ondataavailable = async (event) => {
      if (event.data.size === 0) return
      try {
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = reader.result as string
          try {
            await uploadVideoChunk({
              room: activeRoom,
              cid: selfCid,
              chunk: base64,
            })
          } catch (e) {
            console.error('Failed to upload chunk:', e)
          }
        }
        reader.readAsDataURL(event.data)
      } catch (e) {
        console.error('Failed to process chunk:', e)
      }
    }

    recorder.onerror = (e) => {
      console.error('MediaRecorder error:', e)
      setError('Recording failed')
    }

    recorder.start(2000)
    recorderRef.current = recorder
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      recorderRef.current = null
    }
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }
  }

  useEffect(() => {
    if (!joined) {
      stopRecording()
      return
    }

    void startRecording()

    return () => {
      stopRecording()
    }
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
    saveAcceptedRoom(targetRoom)
    setAcceptedRooms(loadAcceptedRooms())
    setJoining(false)
  }

  async function leave() {
    stopRecording()
    if (localStream) {
      for (const t of localStream.getTracks()) t.stop()
    }
    setLocalStream(null)
    setJoined(false)
    setError(null)
    setUserVideos({})
  }

  const activeParticipants = roomParticipants.filter((p) => p.cid !== selfCid && p.lastSeen > Date.now() - 45000)
  const participantCount = activeParticipants.length + (joined ? 1 : 0)
  const activeVideoUsers = Object.values(userVideos).filter((v) => v.status === 'active')

  return (
    <div ref={wrapRef} className="mt-3 rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
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

          <button
            onClick={() => setShowRoomList(!showRoomList)}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
          >
            Rooms
          </button>
        </div>

        {error ? <div className="text-[11px] text-rose-300">{error}</div> : null}

        {showRoomList && acceptedRooms.length > 0 ? (
          <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
            <div className="text-[11px] font-semibold text-neutral-200 mb-2">Accepted Rooms</div>
            <div className="space-y-1 max-h-40 overflow-auto">
              {acceptedRooms.map((r) => (
                <button
                  key={r.room}
                  onClick={() => void joinRoom(r.room)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] text-neutral-200 hover:bg-white/5 flex items-center justify-between"
                  type="button"
                >
                  <span className="truncate">{r.room}</span>
                  <span className="text-[10px] text-neutral-500 ml-2">
                    {new Date(r.lastJoined || r.acceptedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold text-neutral-200">Users</div>
          <div className="mt-2 max-h-40 overflow-auto rounded-xl ring-1 ring-white/10">
            {roomParticipants.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-neutral-500">No users yet.</div>
            ) : (
              roomParticipants
                .slice()
                .sort((a, b) => b.lastSeen - a.lastSeen)
                .map((p) => (
                  <div key={p.cid} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
                    <div className="min-w-0">
                      <div className="truncate text-neutral-200">{p.name || p.cid}</div>
                      <div className="truncate text-neutral-500">
                        {p.lastSeen > Date.now() - 45000 ? 'online' : 'idle'}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <VideoTile label="You" stream={localStream} muted />
          {activeVideoUsers.map((userVideo) => (
            <CdnVideoTile
              key={userVideo.cid}
              label={userVideo.cid}
              chunks={userVideo.chunks}
              videoRef={(el) => {
                videoRefs.current[userVideo.cid] = el
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function VideoTile({ label, stream, muted }: { label: string; stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!stream) {
      ref.current.srcObject = null
      return
    }
    ref.current.srcObject = stream
    void ref.current.play().catch(() => {})
  }, [stream])

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-200">{label}</div>
      <div className="aspect-video bg-black">
        <video ref={ref} muted={muted} playsInline autoPlay className="h-full w-full object-cover" />
      </div>
    </div>
  )
}

function CdnVideoTile({
  label,
  chunks,
  videoRef,
}: {
  label: string
  chunks: VideoChunk[]
  videoRef: (el: HTMLVideoElement | null) => void
}) {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [buffering, setBuffering] = useState(true)
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (ref.current) {
      videoRef(ref.current)
    }
  }, [videoRef])

  useEffect(() => {
    if (chunks.length === 0) {
      setBuffering(true)
      return
    }

    const playChunk = async (index: number) => {
      if (index >= chunks.length) {
        setCurrentChunkIndex(0)
        return
      }

      const chunk = chunks[index]
      if (!ref.current) return

      const video = ref.current
      video.src = `/cdn/video?src=${encodeURIComponent(chunk.url)}`
      setBuffering(true)

      video.onloadeddata = () => {
        setBuffering(false)
        void video.play().catch(() => {})
      }

      video.onended = () => {
        if (index < chunks.length - 1) {
          setCurrentChunkIndex(index + 1)
        } else {
          setCurrentChunkIndex(0)
        }
      }

      video.onerror = () => {
        if (index < chunks.length - 1) {
          setCurrentChunkIndex(index + 1)
        }
      }
    }

    void playChunk(currentChunkIndex)
  }, [chunks, currentChunkIndex])

  if (chunks.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
        <div className="px-3 py-2 text-xs font-semibold text-neutral-200">{label}</div>
        <div className="aspect-video bg-black relative flex items-center justify-center">
          <div className="text-xs text-neutral-400">Waiting for video...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-200 flex items-center justify-between">
        <span>{label}</span>
        {buffering ? (
          <span className="text-[10px] text-neutral-400">Buffering...</span>
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
        )}
      </div>
      <div className="aspect-video bg-black relative">
        <video ref={ref} playsInline autoPlay className="h-full w-full object-cover" />
        {buffering ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-8 w-8 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin"></div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
