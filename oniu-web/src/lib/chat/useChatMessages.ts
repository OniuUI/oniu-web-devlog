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
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`) as Error & { status?: number }
        error.status = res.status
        throw error
      }
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

      let retryCount = 0
      let consecutive503s = 0

      try {
        await pollOnce(0)
        retryCount = 0
        consecutive503s = 0
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return
        const status = (e as { status?: number })?.status
        if (status === 503) {
          consecutive503s++
        }
        onNetChange('offline')
        onModeChange('local')
        onAdminChange(false)
      }

      while (!cancelled) {
        try {
          await pollOnce(20)
          retryCount = 0
          consecutive503s = 0
        } catch (e: unknown) {
          if ((e as { name?: string })?.name === 'AbortError') continue
          
          const status = (e as { status?: number })?.status
          const is503 = status === 503
          
          if (is503) {
            consecutive503s++
            retryCount++
            
            if (consecutive503s >= 3) {
              const backoff = Math.min(30000, 2000 * Math.pow(2, Math.min(retryCount - 3, 5)))
              console.warn(`[Chat] Server overloaded (503), backing off for ${backoff}ms`)
              await new Promise((r) => setTimeout(r, backoff))
            } else {
              await new Promise((r) => setTimeout(r, 2000 * consecutive503s))
            }
          } else {
            consecutive503s = 0
            retryCount++
            const backoff = Math.min(10000, 1000 * retryCount)
            await new Promise((r) => setTimeout(r, backoff))
          }
          
          onNetChange('offline')
          onModeChange('local')
          onAdminChange(false)
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
