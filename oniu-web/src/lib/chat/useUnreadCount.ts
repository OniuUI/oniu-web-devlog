import { useMemo } from 'react'
import { type ChatMessage } from '@/lib/chatSync'

type UseUnreadCountProps = {
  messages: ChatMessage[]
  lastReadTs: number
}

export function useUnreadCount({ messages, lastReadTs }: UseUnreadCountProps) {
  const unreadCount = useMemo(() => {
    const cutoff = lastReadTs
    let c = 0
    for (const m of messages) {
      if (m.ts <= cutoff) continue
      if (m.mine) continue
      c++
    }
    return c
  }, [messages, lastReadTs])

  return unreadCount
}
