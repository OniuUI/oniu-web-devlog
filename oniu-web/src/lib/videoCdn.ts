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
  try {
    const chunkSize = input.chunk.length
    console.log(`[VideoBroadcast] Publishing chunk - room: "${input.room}", cid: ${input.cid}, size: ${chunkSize} chars`)
    
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
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error(`[VideoBroadcast] Server error (${res.status}): ${errorText}`)
      throw new Error(`Video broadcast failed (${res.status}): ${errorText}`)
    }
    
    const data = (await res.json()) as { chunk?: VideoChunk; error?: string }
    if (data.error) {
      console.error(`[VideoBroadcast] Server returned error: ${data.error}`)
      throw new Error(`Video broadcast error: ${data.error}`)
    }
    if (!data.chunk) {
      console.error(`[VideoBroadcast] Invalid response: no chunk data`)
      throw new Error('Invalid response: no chunk data')
    }
    
    console.log(`[VideoBroadcast] SUCCESS - Published chunk ${data.chunk.id} to room "${input.room}"`)
    return data.chunk
  } catch (e) {
    console.error(`[VideoBroadcast] FAILED - Error publishing chunk to room "${input.room}":`, e)
    throw e
  }
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
