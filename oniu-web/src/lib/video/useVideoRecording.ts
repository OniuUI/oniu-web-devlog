import { useEffect, useRef, useState } from 'react'
import { uploadVideoChunk } from '@/lib/videoCdn'

export function useVideoRecording(room: string, cid: string, enabled: boolean) {
  console.log(`[VideoRecording] HOOK CALLED - room: "${room}", cid: ${cid}, enabled: ${enabled}`)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const roomRef = useRef(room)
  const cidRef = useRef(cid)
  const isStartingRef = useRef(false)
  const shouldStopRef = useRef(false)

  useEffect(() => {
    roomRef.current = room
    cidRef.current = cid
  }, [room, cid])

  async function ensureMedia() {
    if (localStream) {
      console.log(`[VideoRecording] Using existing stream for room "${roomRef.current}"`)
      return localStream
    }
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
      if (recorder.state === 'recording') {
        console.warn(`[VideoRecording] MediaRecorder already recording for room "${currentRoom}"`)
        recorderRef.current = recorder
        return
      }
      recorder.start(2000)
      recorderRef.current = recorder
      console.log(`[VideoRecording] MediaRecorder.start() called for room "${currentRoom}", state: ${recorder.state}`)
      
      setTimeout(() => {
        if (recorderRef.current) {
          console.log(`[VideoRecording] MediaRecorder state check after 1s: ${recorderRef.current.state}`)
          if (recorderRef.current.state !== 'recording') {
            console.error(`[VideoRecording] MediaRecorder failed to start - state: ${recorderRef.current.state}`)
          }
        }
      }, 1000)
    } catch (e) {
      console.error(`[VideoRecording] Failed to start MediaRecorder for room "${currentRoom}":`, e)
      throw e
    }
  }

  function stopRecording() {
    if (recorderRef.current) {
      const state = recorderRef.current.state
      console.log(`[VideoRecording] Stopping recorder, current state: ${state}`)
      if (state !== 'inactive') {
        try {
          recorderRef.current.stop()
        } catch (e) {
          console.error(`[VideoRecording] Error stopping recorder:`, e)
        }
      }
      recorderRef.current = null
      isStartingRef.current = false
    }
  }

  useEffect(() => {
    console.log(`[VideoRecording] useEffect triggered - enabled: ${enabled}, room: "${room}", cid: ${cid}`)
    
    if (!enabled) {
      console.log(`[VideoRecording] Recording disabled - stopping any active recording`)
      shouldStopRef.current = true
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

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      console.log(`[VideoRecording] Recorder already active, skipping start`)
      return
    }

    if (isStartingRef.current) {
      console.log(`[VideoRecording] Already starting, skipping duplicate start`)
      return
    }

    console.log(`[VideoRecording] Starting recording - room: "${room}", cid: ${cid}, enabled: ${enabled}`)
    console.log(`[VideoRecording] MediaRecorder supported types:`, MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'vp8,opus' : 'no', MediaRecorder.isTypeSupported('video/webm') ? 'webm' : 'no')
    
    shouldStopRef.current = false
    isStartingRef.current = true
    
    const start = async () => {
      try {
        await startRecording()
        isStartingRef.current = false
        if (!shouldStopRef.current && recorderRef.current) {
          console.log(`[VideoRecording] Recording started successfully, state: ${recorderRef.current.state}`)
        }
      } catch (e) {
        isStartingRef.current = false
        console.error(`[VideoRecording] Error in startRecording:`, e)
      }
    }
    
    void start()

    return () => {
      if (shouldStopRef.current) {
        console.log(`[VideoRecording] Cleanup: stopping recording (enabled changed to false)`)
        stopRecording()
      } else {
        console.log(`[VideoRecording] Cleanup: skipping stop (just a re-render, not a dependency change)`)
      }
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
