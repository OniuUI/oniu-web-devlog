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

  useEffect(() => {
    if (!enabled) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
        recorderRef.current = null
      }
      return
    }

    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let cancelled = false

    const setup = async () => {
      try {
        if (localStream) {
          stream = localStream
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          setLocalStream(stream)
        }

        if (cancelled || !stream) return

        let mimeType = 'video/webm;codecs=vp8,opus'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm'
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''
          }
        }

        recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 1000000 } : undefined)

        recorder.ondataavailable = async (event) => {
          if (event.data.size === 0 || cancelled) return

          const currentRoom = roomRef.current
          const currentCid = cidRef.current

          try {
            await uploadVideoChunk({
              room: currentRoom,
              cid: currentCid,
              chunk: event.data,
            })
          } catch (e) {
            console.error(`[VideoUpload] Failed:`, e)
          }
        }

        recorder.onerror = (e) => {
          console.error(`[VideoRecording] MediaRecorder error:`, e)
        }

        recorder.start(2000)
        recorderRef.current = recorder
      } catch (e) {
        console.error(`[VideoRecording] Setup failed:`, e)
      }
    }

    void setup()

    return () => {
      cancelled = true
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      recorderRef.current = null
    }
  }, [enabled, localStream])

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      if (localStream) {
        for (const t of localStream.getTracks()) t.stop()
      }
    }
  }, [])

  return { localStream }
}
