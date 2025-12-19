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

export function useVideoChunkPolling({ room, selfCid, joined, onError }: UseVideoChunkPollingProps) {
  const [userVideos, setUserVideos] = useState<Record<string, UserVideoState>>({})
  const sinceRef = useRef(0)
  const pollAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!joined) return

    const ac = new AbortController()
    pollAbortRef.current = ac
    let cancelled = false

    const pump = async () => {
      try {
        while (!cancelled) {
          const res = await pollVideoChunks({
            room,
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
