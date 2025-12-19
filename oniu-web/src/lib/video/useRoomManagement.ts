import { useEffect, useRef, useState } from 'react'
import { rtcSend } from '@/lib/rtc'

type UseRoomManagementProps = {
  initialRoom: string
  selfCid: string
  selfName: string
  onSyncParticipants: (room: string) => Promise<void>
  onClearVideos: () => void
  localStream: MediaStream | null
}

export function useRoomManagement({
  initialRoom,
  selfCid,
  selfName,
  onSyncParticipants,
  onClearVideos,
  localStream,
}: UseRoomManagementProps) {
  const [activeRoom, setActiveRoom] = useState(initialRoom)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const syncRef = useRef(onSyncParticipants)
  const clearRef = useRef(onClearVideos)
  const streamRef = useRef(localStream)

  useEffect(() => {
    syncRef.current = onSyncParticipants
  }, [onSyncParticipants])

  useEffect(() => {
    clearRef.current = onClearVideos
  }, [onClearVideos])

  useEffect(() => {
    streamRef.current = localStream
  }, [localStream])

  async function joinGlobal() {
    setError(null)
    setJoining(true)
    const targetRoom = initialRoom
    setActiveRoom(targetRoom)
    setJoined(true)
    await syncRef.current(targetRoom)
    setJoining(false)
  }

  async function joinRoom(targetRoom: string) {
    setError(null)
    setJoining(true)
    setActiveRoom(targetRoom)
    setJoined(true)
    await syncRef.current(targetRoom)
    try {
      await rtcSend({
        room: targetRoom,
        channel: targetRoom,
        from: selfCid,
        type: 'join',
        payload: { name: selfName },
      })
    } catch {}
    setJoining(false)
  }

  async function leave() {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
    }
    setJoined(false)
    setError(null)
    clearRef.current()
  }

  return {
    activeRoom,
    joined,
    joining,
    error,
    setError,
    joinGlobal,
    joinRoom,
    leave,
  }
}
