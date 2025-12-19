import { useEffect, useRef, useState } from 'react'
import { applyMod, lastTimestamp, loadChatCache, mergeMessages, saveChatCache, type ChatMessage, type ChatMod } from '@/lib/chatSync'
import { playMessageSound } from '@/lib/sound'

type UseChatMessagesProps = {
  storageKey: string
  apiUrl: string
  cid: string
  name: string
  soundReady: boolean
  onAdminChange: (isAdmin: boolean) => void
  onNetChange: (net: 'connecting' | 'online' | 'offline') => void
  onModeChange: (mode: 'global' | 'local') => void
}

export function useChatMessages({
  storageKey,
  apiUrl,
  cid,
  name,
  soundReady,
  onAdminChange,
  onNetChange,
  onModeChange,
}: UseChatMessagesProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatCache(storageKey))
  const [lastSeen, setLastSeen] = useState(() => lastTimestamp(loadChatCache(storageKey)))
  const lastSeenRef = useRef(lastSeen)
  const pollAbortRef = useRef<AbortController | null>(null)
  const lastNotifiedIdRef = useRef<string>('')
  const lastModRef = useRef<string>('')

  useEffect(() => {
    lastSeenRef.current = lastSeen
  }, [lastSeen])

  useEffect(() => {
    let cancelled = false
    let inFlight: AbortController | null = null

    const applyServer = (incoming: ChatMessage[], mod: ChatMod | undefined, serverNow: number | undefined) => {
      const modKey = mod ? JSON.stringify(mod) : ''
      const modChanged = modKey !== lastModRef.current
      lastModRef.current = modKey

      if (modChanged && mod) {
        const deletedIds = Array.isArray(mod.deleted_ids) ? mod.deleted_ids : []
        const clearedBefore = typeof mod.cleared_before_ts === 'number' ? mod.cleared_before_ts : 0
        
        if (clearedBefore > 0) {
          saveChatCache(storageKey, [])
          setMessages([])
          setLastSeen(clearedBefore)
          lastSeenRef.current = clearedBefore
          return
        }
        
        if (deletedIds.length > 0) {
          const local = loadChatCache(storageKey)
          const filtered = applyMod(local, mod)
          saveChatCache(storageKey, filtered)
          setMessages(filtered)
          const ts = lastTimestamp(filtered)
          if (ts) {
            setLastSeen(ts)
            lastSeenRef.current = ts
          } else if (typeof serverNow === 'number' && serverNow > 0) {
            setLastSeen(serverNow)
            lastSeenRef.current = serverNow
          }
          return
        }
      }

      const local = loadChatCache(storageKey)
      const merged = mergeMessages(local, incoming)
      const afterMod = applyMod(merged, mod)
      saveChatCache(storageKey, afterMod)
      setMessages(afterMod)
      const last = afterMod.length ? afterMod[afterMod.length - 1] : null
      if (last && !last.mine && last.id && last.id !== lastNotifiedIdRef.current) {
        lastNotifiedIdRef.current = last.id
        if (soundReady) playMessageSound()
      }
      const ts = lastTimestamp(afterMod)
      if (ts) {
        setLastSeen(ts)
        lastSeenRef.current = ts
      } else if (typeof serverNow === 'number' && serverNow > 0) {
        setLastSeen(serverNow)
        lastSeenRef.current = serverNow
      }
    }

    const pollOnce = async (timeout: number) => {
      inFlight = new AbortController()
      pollAbortRef.current = inFlight
      const url =
        `${apiUrl}&since=${encodeURIComponent(String(lastSeenRef.current))}` +
        `&timeout=${encodeURIComponent(String(timeout))}` +
        `&cid=${encodeURIComponent(cid)}` +
        `&name=${encodeURIComponent(name)}` +
        `&presence=1`
      const res = await fetch(url, { cache: 'no-store', signal: inFlight.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        messages?: ChatMessage[]
        now?: number
        admin?: boolean
        mod?: ChatMod
      }
      onAdminChange(Boolean(data.admin))
      applyServer(Array.isArray(data.messages) ? data.messages : [], data.mod, data.now)
      onNetChange('online')
      onModeChange('global')
    }

    const loop = async () => {
      onModeChange('global')
      onNetChange('connecting')

      try {
        await pollOnce(0)
      } catch {
        onNetChange('offline')
        onModeChange('local')
        onAdminChange(false)
      }

      while (!cancelled) {
        try {
          await pollOnce(20)
        } catch (e: unknown) {
          if ((e as { name?: string })?.name === 'AbortError') continue
          onNetChange('offline')
          onModeChange('local')
          onAdminChange(false)
          await new Promise((r) => setTimeout(r, 1500))
        }
      }
    }

    void loop()

    return () => {
      cancelled = true
      inFlight?.abort()
      pollAbortRef.current = null
    }
  }, [apiUrl, cid, name, storageKey, soundReady, onAdminChange, onNetChange, onModeChange])

  function kickPoll() {
    pollAbortRef.current?.abort()
  }

  function updateMessages(newMessages: ChatMessage[]) {
    setMessages(newMessages)
    saveChatCache(storageKey, newMessages)
  }

  return {
    messages,
    lastSeen,
    setLastSeen,
    lastSeenRef,
    kickPoll,
    updateMessages,
  }
}
