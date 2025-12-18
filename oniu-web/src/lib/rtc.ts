export type RtcSignalType = 'offer' | 'answer' | 'ice' | 'leave' | 'join'

export type RtcSignal = {
  ts: number
  room: string
  channel?: string
  type: RtcSignalType
  from: string
  to: string
  payload: unknown
}

export async function rtcSend(input: {
  room: string
  channel: string
  from: string
  to?: string
  type: RtcSignalType
  payload: unknown
}): Promise<void> {
  const res = await fetch('/api/rtc.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      room: input.room,
      channel: input.channel,
      from: input.from,
      to: input.to ?? '',
      type: input.type,
      payload: input.payload,
    }),
  })
  if (!res.ok) throw new Error(`RTC send failed (${res.status})`)
}

export async function rtcPoll(input: { room: string; client: string; since: number; timeout: number; signal: AbortSignal }): Promise<{
  now: number
  messages: RtcSignal[]
}> {
  const url =
    `/api/rtc.php?room=${encodeURIComponent(input.room)}` +
    `&client=${encodeURIComponent(input.client)}` +
    `&since=${encodeURIComponent(String(input.since))}` +
    `&timeout=${encodeURIComponent(String(input.timeout))}`

  const res = await fetch(url, { cache: 'no-store', signal: input.signal })
  if (!res.ok) throw new Error(`RTC poll failed (${res.status})`)
  const data = (await res.json()) as { now?: number; messages?: unknown }
  const msgs = Array.isArray(data.messages) ? (data.messages as RtcSignal[]) : []
  return { now: typeof data.now === 'number' ? data.now : Date.now(), messages: msgs }
}

export async function rtcPresence(input: { channel: string; client: string; signal: AbortSignal }): Promise<
  Array<{ cid: string; name: string; lastSeen: number }>
> {
  const url =
    `/api/rtc.php?room=rtc&client=${encodeURIComponent(input.client)}` +
    `&since=0&timeout=0&presence_channel=${encodeURIComponent(input.channel)}`
  const res = await fetch(url, { cache: 'no-store', signal: input.signal })
  if (!res.ok) throw new Error(`RTC presence failed (${res.status})`)
  const data = (await res.json()) as { presence?: unknown }
  return Array.isArray(data.presence) ? (data.presence as Array<{ cid: string; name: string; lastSeen: number }>) : []
}


