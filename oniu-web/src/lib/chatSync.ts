export type ChatMessage = {
  id: string
  name: string
  text: string
  ts: number
  ip?: string
  mine?: boolean
}

export type ChatMod = {
  paused_until?: number
  cleared_before_ts?: number
  deleted_ids?: string[]
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadChatCache(storageKey: string): ChatMessage[] {
  const data = safeParse<ChatMessage[]>(localStorage.getItem(storageKey))
  return Array.isArray(data) ? data : []
}

export function saveChatCache(storageKey: string, messages: ChatMessage[]) {
  localStorage.setItem(storageKey, JSON.stringify(messages))
}

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of existing) {
    if (!m?.id) continue
    byId.set(m.id, m)
  }
  for (const m of incoming) {
    if (!m?.id) continue
    const prev = byId.get(m.id)
    if (!prev) {
      byId.set(m.id, m)
      continue
    }
    const preferIncoming = (m.ts ?? 0) >= (prev.ts ?? 0)
    byId.set(m.id, preferIncoming ? { ...prev, ...m } : { ...m, ...prev })
  }
  const merged = Array.from(byId.values()).sort((a, b) => a.ts - b.ts)

  const deduped: ChatMessage[] = []
  for (const m of merged) {
    const prev = deduped.length ? deduped[deduped.length - 1] : undefined
    if (!prev) {
      deduped.push(m)
      continue
    }
    const sameText = prev.text === m.text && prev.name === m.name
    const closeInTime = Math.abs(prev.ts - m.ts) <= 2000
    const prevLegacy = prev.id.startsWith('m-')
    const curLegacy = m.id.startsWith('m-')
    if (sameText && closeInTime && (prevLegacy || curLegacy)) {
      const choose = (a: ChatMessage, b: ChatMessage): ChatMessage => {
        const aLegacy = a.id.startsWith('m-')
        const bLegacy = b.id.startsWith('m-')
        if (aLegacy !== bLegacy) return aLegacy ? b : a
        const aScore = (a.mine ? 2 : 0) + (a.ip ? 1 : 0)
        const bScore = (b.mine ? 2 : 0) + (b.ip ? 1 : 0)
        if (aScore !== bScore) return aScore > bScore ? a : b
        return a.ts >= b.ts ? a : b
      }
      deduped[deduped.length - 1] = choose(prev, m)
      continue
    }
    deduped.push(m)
  }

  return deduped.slice(-200)
}

export function applyMod(messages: ChatMessage[], mod: ChatMod | undefined): ChatMessage[] {
  if (!mod) return messages
  const clearedBefore = typeof mod.cleared_before_ts === 'number' ? mod.cleared_before_ts : 0
  const deletedIds = Array.isArray(mod.deleted_ids) ? mod.deleted_ids : []
  if (!clearedBefore && deletedIds.length === 0) return messages

  const del = new Set<string>(deletedIds)
  const next = messages.filter((m) => !del.has(m.id) && (clearedBefore ? m.ts > clearedBefore : true))
  return next
}

export function lastTimestamp(messages: ChatMessage[]): number {
  if (messages.length === 0) return 0
  return messages[messages.length - 1]!.ts
}


