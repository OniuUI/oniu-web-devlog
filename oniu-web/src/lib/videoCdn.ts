export type VideoChunk = {
  id: string
  cid: string
  room: string
  url: string
  ts: number
}

export async function uploadVideoChunk(input: {
  room: string
  cid: string
  chunk: string
}): Promise<VideoChunk> {
  const res = await fetch('/api/video_upload.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      room: input.room,
      cid: input.cid,
      chunk: input.chunk,
    }),
  })
  if (!res.ok) throw new Error(`Video upload failed (${res.status})`)
  const data = (await res.json()) as { chunk?: VideoChunk }
  if (!data.chunk) throw new Error('Invalid response')
  return data.chunk
}

export async function pollVideoChunks(input: {
  room: string
  since: number
  timeout: number
  signal: AbortSignal
}): Promise<{
  now: number
  chunks: VideoChunk[]
}> {
  const url =
    `/api/video_upload.php?room=${encodeURIComponent(input.room)}` +
    `&since=${encodeURIComponent(String(input.since))}` +
    `&timeout=${encodeURIComponent(String(input.timeout))}`

  const res = await fetch(url, { cache: 'no-store', signal: input.signal })
  if (!res.ok) throw new Error(`Video poll failed (${res.status})`)
  const data = (await res.json()) as { now?: number; chunks?: unknown }
  const chunks = Array.isArray(data.chunks) ? (data.chunks as VideoChunk[]) : []
  return { now: typeof data.now === 'number' ? data.now : Date.now(), chunks }
}
