import { useState } from 'react'
import { applyMod, loadChatCache, saveChatCache, type ChatMessage, type ChatMod } from '@/lib/chatSync'

type UseMessageManagementProps = {
  room: string
  storageKey: string
  cid: string
  onMessagesChange: (messages: ChatMessage[]) => void
  onPollKick: () => void
}

export function useMessageManagement({
  room,
  storageKey,
  cid,
  onMessagesChange,
  onPollKick,
}: UseMessageManagementProps) {
  const [userBusy, setUserBusy] = useState(false)

  async function deleteOwn(id: string) {
    if (!id) return
    if (userBusy) return
    setUserBusy(true)
    try {
      const local = loadChatCache(storageKey)
      const next = local.filter((m) => m.id !== id)
      saveChatCache(storageKey, next)
      onMessagesChange(next)
      const res = await fetch('/api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ room, action: 'delete_own', id, cid }),
      })
      if (!res.ok) {
        onMessagesChange(local)
        saveChatCache(storageKey, local)
      } else {
        const data = (await res.json()) as { mod?: ChatMod }
        if (data.mod) {
          const filtered = applyMod(next, data.mod)
          saveChatCache(storageKey, filtered)
          onMessagesChange(filtered)
        }
        onPollKick()
      }
    } catch {
      const local = loadChatCache(storageKey)
      onMessagesChange(local)
    } finally {
      setUserBusy(false)
    }
  }

  function clearChat() {
    onMessagesChange([])
    saveChatCache(storageKey, [])
  }

  return {
    deleteOwn,
    clearChat,
    userBusy,
  }
}
