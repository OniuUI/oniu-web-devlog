export type RoomInfo = {
  room: string
  acceptedAt: number
  lastJoined?: number
}

export function loadAcceptedRooms(): RoomInfo[] {
  try {
    const stored = localStorage.getItem('oniu.rooms.accepted')
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAcceptedRoom(room: string): void {
  try {
    const rooms = loadAcceptedRooms()
    const existing = rooms.find((r) => r.room === room)
    if (existing) {
      existing.lastJoined = Date.now()
    } else {
      rooms.push({ room, acceptedAt: Date.now(), lastJoined: Date.now() })
    }
    const recent = rooms.filter((r) => Date.now() - r.acceptedAt < 30 * 24 * 60 * 60 * 1000)
    localStorage.setItem('oniu.rooms.accepted', JSON.stringify(recent))
  } catch {}
}
