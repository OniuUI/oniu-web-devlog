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
  chunk: string | Blob
}): Promise<VideoChunk> {
  try {
    let blob: Blob
    if (typeof input.chunk === 'string') {
      const base64Data = input.chunk.replace(/^data:video\/[^;]+;base64,/, '')
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      blob = new Blob([bytes], { type: 'video/webm' })
    } else {
      blob = input.chunk
    }
    
    console.log(`[VideoBroadcast] Publishing chunk - room: "${input.room}", cid: ${input.cid}, size: ${blob.size} bytes`)
    
    const formData = new FormData()
    formData.append('room', input.room)
    formData.append('cid', input.cid)
    formData.append('chunk', blob, 'chunk.webm')
    
    const res = await fetch('/api/video_upload.php', {
      method: 'POST',
      cache: 'no-store',
      body: formData,
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
