import { useEffect } from 'react'
import type { ChatMessage } from '@/lib/chatSync'

type UseOfflineQueueProps = {
  room: string
  cid: string
  outboxKey: string
  isOnline: boolean
  mode: 'global' | 'local'
}

export function useOfflineQueue({ room, cid, outboxKey, isOnline, mode }: UseOfflineQueueProps) {
  useEffect(() => {
    if (!isOnline || mode !== 'global') return

    const raw = localStorage.getItem(outboxKey)
    const items = (raw ? (JSON.parse(raw) as unknown) : null) as ChatMessage[] | null
    const queue = Array.isArray(items) ? items : []
    if (queue.length === 0) return

    ;(async () => {
      const remaining: ChatMessage[] = []
      for (const m of queue) {
        try {
          const r = await fetch('/api/chat.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ room, cid, id: m.id, name: m.name, text: m.text }),
          })
          if (!r.ok) remaining.push(m)
        } catch {
          remaining.push(m)
        }
      }
      localStorage.setItem(outboxKey, JSON.stringify(remaining))
    })()
  }, [isOnline, mode, outboxKey, room, cid])
}
