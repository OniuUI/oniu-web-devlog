import { useState, useEffect } from 'react'
import { applyMod, loadChatCache, saveChatCache } from '@/lib/chatSync'
import type { ChatMod } from '@/lib/chatSync'

type AdminState = {
  presence: Array<{ cid: string; name: string; ip: string; lastSeen: number }>
  banned: string[]
  muted: Record<string, number>
}

type UseAdminActionsProps = {
  room: string
  storageKey: string
  isAdmin: boolean
  csrf: string | null
  onModUpdate: (mod: ChatMod) => void
  onPollKick: () => void
}

export function useAdminActions({
  room,
  storageKey,
  isAdmin,
  csrf,
  onModUpdate,
  onPollKick,
}: UseAdminActionsProps) {
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminState, setAdminState] = useState<AdminState>({
    presence: [],
    banned: [],
    muted: {},
  })

  async function adminAction(payload: Record<string, unknown>) {
    if (!csrf) return
    setAdminBusy(true)
    setAdminError(null)
    try {
      const res = await fetch('/api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ room, csrf, ...payload }),
      })
      if (!res.ok) {
        setAdminError(`Admin action failed (${res.status})`)
        return
      }
      const data = (await res.json()) as { mod?: ChatMod }
      if (data.mod) {
        const clearedBefore = typeof data.mod.cleared_before_ts === 'number' ? data.mod.cleared_before_ts : 0
        if (clearedBefore > 0) {
          saveChatCache(storageKey, [])
        } else {
          const local = loadChatCache(storageKey)
          const filtered = applyMod(local, data.mod)
          saveChatCache(storageKey, filtered)
        }
        onModUpdate(data.mod)
      }
    } catch {
      setAdminError('Admin action failed (network)')
      return
    } finally {
      setAdminBusy(false)
    }
    onPollKick()
    await refreshAdminState()
  }

  async function refreshAdminState() {
    if (!csrf) return
    setAdminBusy(true)
    setAdminError(null)
    try {
      const res = await fetch('/api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ room, csrf, action: 'list_state' }),
      })
      if (!res.ok) {
        setAdminError(`Refresh failed (${res.status})`)
        return
      }
      const data = (await res.json()) as unknown
      const d = data as {
        presence?: Array<{ cid: string; name: string; ip: string; lastSeen: number }>
        banned?: string[]
        muted?: Record<string, number>
      }
      setAdminState({
        presence: Array.isArray(d.presence) ? d.presence : [],
        banned: Array.isArray(d.banned) ? d.banned : [],
        muted: d.muted && typeof d.muted === 'object' ? d.muted : {},
      })
    } catch {
      setAdminError('Refresh failed (network)')
    } finally {
      setAdminBusy(false)
    }
  }

  useEffect(() => {
    if (!isAdmin || !csrf) return
    void refreshAdminState()
  }, [isAdmin, csrf, room])

  return {
    adminBusy,
    adminError,
    adminState,
    adminAction,
    refreshAdminState,
  }
}
