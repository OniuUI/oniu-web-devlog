import { useEffect } from 'react'
import { loadChatCache, type ChatMessage } from '@/lib/chatSync'

type UseCrossTabSyncProps = {
  storageKey: string
  channelName: string
  onMessagesChange: (messages: ChatMessage[]) => void
}

export function useCrossTabSync({ storageKey, channelName, onMessagesChange }: UseCrossTabSyncProps) {
  useEffect(() => {
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel(channelName) : null

    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return
      onMessagesChange(loadChatCache(storageKey))
    }

    const onBroadcast = (e: MessageEvent) => {
      if (!e?.data) return
      if (e.data?.type === 'sync') {
        onMessagesChange(loadChatCache(storageKey))
      }
    }

    window.addEventListener('storage', onStorage)
    bc?.addEventListener('message', onBroadcast)

    return () => {
      window.removeEventListener('storage', onStorage)
      bc?.removeEventListener('message', onBroadcast)
      bc?.close()
    }
  }, [channelName, storageKey, onMessagesChange])
}
