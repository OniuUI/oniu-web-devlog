import { useEffect, useRef } from 'react'
import { rtcPoll } from '@/lib/rtc'

type UseRtcInvitesProps = {
  room: string
  selfCid: string
  enabled: boolean
  onInvite: (room: string, from: string, fromName: string) => void
}

export function useRtcInvites({ room, selfCid, enabled, onInvite }: UseRtcInvitesProps) {
  const sinceRef = useRef(0)
  const pollAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) return

    const ac = new AbortController()
    pollAbortRef.current = ac
    let cancelled = false

    const pump = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      
      let consecutive503s = 0
      
      try {
        while (!cancelled) {
          try {
            const res = await rtcPoll({
              room: 'rtc',
              client: selfCid,
              since: sinceRef.current,
              timeout: consecutive503s >= 3 ? 10 : 20,
              signal: ac.signal,
            })
            sinceRef.current = Math.max(sinceRef.current, res.now)
            consecutive503s = 0

            for (const msg of res.messages) {
              if (msg.to === selfCid && msg.type === 'join') {
                const payload = msg.payload as { name?: string; invite?: boolean; room?: string } | null
                if (payload?.invite === true) {
                  const inviteRoom = typeof payload.room === 'string' ? payload.room : msg.channel || room
                  const fromName = typeof payload.name === 'string' ? payload.name : msg.from
                  onInvite(inviteRoom, msg.from, fromName)
                }
              }
            }
          } catch (pollError: unknown) {
            if ((pollError as { name?: string })?.name === 'AbortError') return
            
            const errorMsg = pollError instanceof Error ? pollError.message : 'RTC poll failed'
            const is503 = errorMsg.includes('503') || errorMsg.includes('Service Unavailable')
            
            if (is503) {
              consecutive503s++
              const backoff = Math.min(20000, 2000 * Math.pow(2, Math.min(consecutive503s - 1, 3)))
              await new Promise((resolve) => setTimeout(resolve, backoff))
            } else {
              consecutive503s = 0
              await new Promise((resolve) => setTimeout(resolve, 2000))
            }
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return
      }
    }

    void pump()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [enabled, room, selfCid, onInvite])
}
