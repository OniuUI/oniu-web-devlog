import { useEffect, useRef, useState } from 'react'
import { pollVideoChunks, type VideoChunk } from '@/lib/videoCdn'

type UserVideoState = {
  cid: string
  chunks: VideoChunk[]
  lastChunkTs: number
  status: 'active' | 'inactive'
}

type UseVideoChunkPollingProps = {
  room: string
  selfCid: string
  joined: boolean
  onError: (error: string) => void
}

const MAX_CHUNKS_PER_USER = 15
const CHUNK_MAX_AGE_MS = 15000

export function useVideoChunkPolling({ room, selfCid, joined, onError }: UseVideoChunkPollingProps) {
  const [userVideos, setUserVideos] = useState<Record<string, UserVideoState>>({})
  const sinceRef = useRef(0)
  const pollAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!joined) {
      sinceRef.current = 0
      setUserVideos({})
      return
    }

    sinceRef.current = Math.max(0, Date.now() - 60000)
    const ac = new AbortController()
    pollAbortRef.current = ac
    let cancelled = false
    let retryCount = 0

    const pump = async () => {
      try {
        while (!cancelled) {
          try {
            const res = await pollVideoChunks({
              room,
              since: sinceRef.current,
              timeout: 10,
              signal: ac.signal,
            })
            sinceRef.current = Math.max(sinceRef.current, res.now)
            retryCount = 0

            setUserVideos((prev) => {
              const next = { ...prev }
              const now = Date.now()

              if (res.chunks.length > 0) {
                console.log(`[VideoPoll] Room: ${room}, Received ${res.chunks.length} chunks, Self: ${selfCid}`)
              }

              for (const chunk of res.chunks) {
                if (chunk.cid === selfCid) {
                  continue
                }
                if (chunk.room !== room) {
                  console.warn(`[VideoPoll] Chunk room mismatch: ${chunk.room} !== ${room}`)
                  continue
                }

                const existing = next[chunk.cid]
                if (existing) {
                  const seen = new Set(existing.chunks.map((c) => c.id))
                  if (!seen.has(chunk.id)) {
                    existing.chunks.push(chunk)
                    existing.lastChunkTs = Math.max(existing.lastChunkTs, chunk.ts)
                    existing.status = 'active'

                    existing.chunks.sort((a, b) => a.ts - b.ts)

                    const cutoffTime = now - CHUNK_MAX_AGE_MS
                    existing.chunks = existing.chunks.filter((c) => c.ts > cutoffTime)

                    if (existing.chunks.length > MAX_CHUNKS_PER_USER) {
                      existing.chunks = existing.chunks.slice(-MAX_CHUNKS_PER_USER)
                    }
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

              for (const cid in next) {
                const userVideo = next[cid]
                const cutoffTime = now - CHUNK_MAX_AGE_MS
                userVideo.chunks = userVideo.chunks.filter((c) => c.ts > cutoffTime)

                if (userVideo.chunks.length === 0) {
                  delete next[cid]
                  continue
                }

                if (now - userVideo.lastChunkTs > 10000) {
                  userVideo.status = 'inactive'
                } else {
                  userVideo.status = 'active'
                }
              }

              const activeCount = Object.values(next).filter((v) => v.status === 'active').length
              if (activeCount > 0) {
                console.log(`[VideoPoll] Active video users: ${activeCount}`)
              }

              return next
            })
          } catch (pollError: unknown) {
            if ((pollError as { name?: string })?.name === 'AbortError') return
            const errorMsg = pollError instanceof Error ? pollError.message : 'Video poll failed'
            if (errorMsg.includes('503') || errorMsg.includes('Service Unavailable')) {
              retryCount++
              if (retryCount <= 5) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * retryCount))
                continue
              }
            }
            retryCount++
            if (retryCount > 3) {
              onError(errorMsg)
              await new Promise((resolve) => setTimeout(resolve, 5000))
              retryCount = 0
            } else {
              await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
            }
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return
        onError(e instanceof Error ? e.message : 'Video poll failed')
      }
    }

    void pump()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [joined, room, selfCid, onError])

  function clearVideos() {
    setUserVideos({})
  }

  const activeVideoUsers = Object.values(userVideos).filter((v) => v.status === 'active')

  return {
    userVideos,
    activeVideoUsers,
    clearVideos,
  }
}
