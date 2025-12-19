import { useState, useEffect, useRef } from 'react'

type PresenceUser = {
  cid: string
  name: string
  lastSeen: number
}

type UseChatPresenceProps = {
  room: string
  cid: string
  name: string
  enabled: boolean
  apiUrl: string
}

export function useChatPresence({ room, cid, name, enabled, apiUrl }: UseChatPresenceProps) {
  const [presencePublic, setPresencePublic] = useState<PresenceUser[]>([])
  const lastSeenRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const updatePresence = async () => {
      try {
        const url = `${apiUrl}&since=${encodeURIComponent(String(lastSeenRef.current))}&timeout=0&cid=${encodeURIComponent(cid)}&name=${encodeURIComponent(name)}&presence=1`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as {
          presence?: Array<{ cid: string; name: string; lastSeen: number }> | null
        }
        if (Array.isArray(data.presence)) {
          setPresencePublic(data.presence)
        }
      } catch {
      }
    }

    void updatePresence()
    const interval = setInterval(() => {
      void updatePresence()
    }, 2000)

    return () => clearInterval(interval)
  }, [enabled, room, cid, name, apiUrl])

  const onlineCount = presencePublic.filter((p) => p.lastSeen > Date.now() - 45000).length

  return {
    presencePublic,
    onlineCount,
  }
}
