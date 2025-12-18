import { useState } from 'react'
import { loadAcceptedRooms, saveAcceptedRoom, type RoomInfo } from '@/lib/video/roomStorage'

type RoomManagementProps = {
  onJoinRoom: (room: string) => void | Promise<void>
}

export default function RoomManagement({ onJoinRoom }: RoomManagementProps) {
  const [showRoomList, setShowRoomList] = useState(false)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [acceptedRooms, setAcceptedRooms] = useState<RoomInfo[]>(loadAcceptedRooms())

  async function createRoom() {
    const roomName = newRoomName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (roomName === '') {
      return
    }
    if (roomName.length > 32) {
      return
    }
    setNewRoomName('')
    setShowCreateRoom(false)
    saveAcceptedRoom(roomName)
    setAcceptedRooms(loadAcceptedRooms())
    await onJoinRoom(roomName)
  }

  async function handleJoinRoom(room: string) {
    saveAcceptedRoom(room)
    setAcceptedRooms(loadAcceptedRooms())
    await onJoinRoom(room)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowRoomList(!showRoomList)}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          type="button"
        >
          Rooms
        </button>
        <button
          onClick={() => setShowCreateRoom(!showCreateRoom)}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          type="button"
        >
          Create Room
        </button>
      </div>

      {showCreateRoom ? (
        <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold text-neutral-200 mb-2">Create New Room</div>
          <div className="flex gap-2">
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createRoom()}
              placeholder="room-name"
              className="flex-1 rounded-lg bg-neutral-950/50 px-2 py-1.5 text-[11px] text-neutral-200 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20"
              maxLength={32}
            />
            <button
              onClick={() => void createRoom()}
              className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-950 hover:bg-neutral-100"
              type="button"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreateRoom(false)
                setNewRoomName('')
              }}
              className="rounded-lg px-3 py-1.5 text-[11px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showRoomList ? (
        <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold text-neutral-200 mb-2">Rooms</div>
          {acceptedRooms.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-auto">
              {acceptedRooms.map((r) => (
                <button
                  key={r.room}
                  onClick={() => void handleJoinRoom(r.room)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] text-neutral-200 hover:bg-white/5 flex items-center justify-between"
                  type="button"
                >
                  <span className="truncate">{r.room}</span>
                  <span className="text-[10px] text-neutral-500 ml-2">
                    {new Date(r.lastJoined || r.acceptedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-neutral-500 py-2">No rooms yet. Create one to get started.</div>
          )}
        </div>
      ) : null}
    </>
  )
}
