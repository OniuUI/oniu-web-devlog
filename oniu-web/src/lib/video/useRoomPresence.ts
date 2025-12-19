import { useEffect, useState } from 'react'
import { rtcPresence } from '@/lib/rtc'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type UseRoomPresenceProps = {
  room: string
  selfCid: string
  joined: boolean
  peers: PresenceUser[]
}

export function useRoomPresence({ room, selfCid, joined, peers }: UseRoomPresenceProps) {
  const [roomParticipants, setRoomParticipants] = useState<PresenceUser[]>([])

  async function syncRoomParticipants(channel: string) {
    const ac = new AbortController()
    try {
      const rows = await rtcPresence({ channel, client: selfCid, signal: ac.signal })
      const active = rows.filter((p) => p.cid && p.lastSeen > Date.now() - 45000)
      const merged = new Map<string, PresenceUser>()
      for (const p of peers) {
        if (p.cid && p.lastSeen > Date.now() - 45000) {
          merged.set(p.cid, p)
        }
      }
      for (const p of active) {
        if (p.cid) {
          merged.set(p.cid, p)
        }
      }
      setRoomParticipants(Array.from(merged.values()))
    } catch {
      const merged = new Map<string, PresenceUser>()
      for (const p of peers) {
        if (p.cid && p.lastSeen > Date.now() - 45000) {
          merged.set(p.cid, p)
        }
      }
      setRoomParticipants(Array.from(merged.values()))
    }
  }

  useEffect(() => {
    if (!joined) return
    
    let mounted = true
    
    const sync = async () => {
      if (!mounted) return
      await syncRoomParticipants(room)
    }
    
    setTimeout(() => {
      if (mounted) void sync()
    }, 500)
    
    const interval = setInterval(() => {
      if (mounted) void sync()
    }, 2000)
    
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [joined, room, selfCid, peers])

  const activeParticipants = roomParticipants.filter((p) => p.cid !== selfCid && p.lastSeen > Date.now() - 45000)
  const participantCount = activeParticipants.length + (joined ? 1 : 0)

  return {
    roomParticipants,
    activeParticipants,
    participantCount,
    syncRoomParticipants,
  }
}
