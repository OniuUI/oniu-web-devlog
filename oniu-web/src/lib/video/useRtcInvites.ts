import { useEffect, useRef } from 'react'
import { rtcPoll, type RtcSignal } from '@/lib/rtc'

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
      try {
        while (!cancelled) {
          const res = await rtcPoll({
            room: 'rtc',
            client: selfCid,
            since: sinceRef.current,
            timeout: 20,
            signal: ac.signal,
          })
          sinceRef.current = Math.max(sinceRef.current, res.now)

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
