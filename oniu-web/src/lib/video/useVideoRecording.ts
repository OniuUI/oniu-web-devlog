import { useEffect, useRef, useState } from 'react'
import { uploadVideoChunk } from '@/lib/videoCdn'

export function useVideoRecording(room: string, cid: string, enabled: boolean) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const roomRef = useRef(room)
  const cidRef = useRef(cid)

  useEffect(() => {
    roomRef.current = room
    cidRef.current = cid
  }, [room, cid])

  async function ensureMedia() {
    if (localStream) return localStream
    console.log(`[VideoRecording] Requesting media access for room "${roomRef.current}"`)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      console.log(`[VideoRecording] Media access granted, tracks: ${stream.getVideoTracks().length} video, ${stream.getAudioTracks().length} audio`)
      setLocalStream(stream)
      return stream
    } catch (e) {
      console.error(`[VideoRecording] Failed to get media access:`, e)
      return null
    }
  }

  async function startRecording() {
    const currentRoom = roomRef.current
    const stream = await ensureMedia()
    if (!stream) {
      console.error(`[VideoRecording] No stream available for room "${currentRoom}"`)
      return
    }

    let mimeType = 'video/webm;codecs=vp8,opus'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = ''
      }
    }

    console.log(`[VideoRecording] Creating MediaRecorder with mimeType: ${mimeType || 'default'}, room: "${currentRoom}"`)

    const recorder = new MediaRecorder(stream, mimeType ? {
      mimeType,
      videoBitsPerSecond: 1000000,
    } : undefined)

    recorder.onstart = () => {
      console.log(`[VideoRecording] MediaRecorder started for room "${currentRoom}"`)
    }

    recorder.onstop = () => {
      console.log(`[VideoRecording] MediaRecorder stopped for room "${currentRoom}"`)
    }

    recorder.ondataavailable = async (event) => {
      const currentRoom = roomRef.current
      const currentCid = cidRef.current
      
      if (event.data.size === 0) {
        console.warn(`[VideoRecording] Empty chunk received for room "${currentRoom}"`)
        return
      }
      console.log(`[VideoRecording] Chunk received: ${event.data.size} bytes for room "${currentRoom}"`)
      try {
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = reader.result as string
          if (!base64) {
            console.error(`[VideoRecording] FileReader returned no data for room "${currentRoom}"`)
            return
          }
          try {
            console.log(`[VideoRecording] Uploading chunk to room "${currentRoom}", cid: ${currentCid}, size: ${base64.length} chars`)
            const chunk = await uploadVideoChunk({
              room: currentRoom,
              cid: currentCid,
              chunk: base64,
            })
            console.log(`[VideoUpload] SUCCESS - Uploaded chunk to room "${currentRoom}", cid: ${currentCid}, chunkId: ${chunk.id}`)
          } catch (e) {
            console.error(`[VideoUpload] FAILED - Upload error for room "${currentRoom}":`, e)
          }
        }
        reader.onerror = () => {
          console.error(`[VideoRecording] FileReader error for room "${currentRoom}"`)
        }
        reader.readAsDataURL(event.data)
      } catch (e) {
        console.error(`[VideoRecording] Failed to process chunk for room "${currentRoom}":`, e)
      }
    }

    recorder.onerror = (e) => {
      console.error(`[VideoRecording] MediaRecorder error for room "${currentRoom}":`, e)
    }

    try {
      recorder.start(2000)
      recorderRef.current = recorder
      console.log(`[VideoRecording] MediaRecorder.start() called for room "${currentRoom}", state: ${recorder.state}`)
    } catch (e) {
      console.error(`[VideoRecording] Failed to start MediaRecorder for room "${currentRoom}":`, e)
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      recorderRef.current = null
    }
  }

  useEffect(() => {
    if (!enabled) {
      stopRecording()
      console.log(`[VideoRecording] Recording stopped - enabled: ${enabled}, room: ${room}`)
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error(`[VideoRecording] MediaDevices API not available`)
      return
    }

    if (!window.MediaRecorder) {
      console.error(`[VideoRecording] MediaRecorder API not available`)
      return
    }

    console.log(`[VideoRecording] Starting recording - room: "${room}", cid: ${cid}, enabled: ${enabled}`)
    console.log(`[VideoRecording] MediaRecorder supported types:`, MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'vp8,opus' : 'no', MediaRecorder.isTypeSupported('video/webm') ? 'webm' : 'no')
    
    void startRecording()

    return () => {
      stopRecording()
    }
  }, [enabled, room, cid])

  useEffect(() => {
    return () => {
      stopRecording()
      if (localStream) {
        for (const t of localStream.getTracks()) t.stop()
      }
    }
  }, [localStream])

  return { localStream }
}
