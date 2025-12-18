import { useEffect, useRef, useState } from 'react'
import { uploadVideoChunk } from '@/lib/videoCdn'

export function useVideoRecording(room: string, cid: string, enabled: boolean) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  async function ensureMedia() {
    if (localStream) return localStream
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    setLocalStream(stream)
    return stream
  }

  async function startRecording() {
    const stream = await ensureMedia()
    if (!stream) return

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 1000000,
    })

    recorder.ondataavailable = async (event) => {
      if (event.data.size === 0) return
      try {
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = reader.result as string
          try {
            await uploadVideoChunk({
              room,
              cid,
              chunk: base64,
            })
          } catch (e) {
            console.error('Failed to upload chunk:', e)
          }
        }
        reader.readAsDataURL(event.data)
      } catch (e) {
        console.error('Failed to process chunk:', e)
      }
    }

    recorder.onerror = (e) => {
      console.error('MediaRecorder error:', e)
    }

    recorder.start(2000)
    recorderRef.current = recorder
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
      return
    }

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
