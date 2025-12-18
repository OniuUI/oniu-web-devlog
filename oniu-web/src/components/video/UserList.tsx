import { useState } from 'react'
import { rtcSend } from '@/lib/rtc'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type UserListProps = {
  participants: PresenceUser[]
  selfCid: string
  activeRoom: string
  selfName: string
  joined: boolean
}

export default function UserList({ participants, selfCid, activeRoom, selfName, joined }: UserListProps) {
  const [showInviteUser, setShowInviteUser] = useState(false)
  const [inviteTargetCid, setInviteTargetCid] = useState('')

  async function inviteUser(targetCid: string, targetRoom: string) {
    try {
      await rtcSend({
        room: targetRoom,
        channel: targetRoom,
        from: selfCid,
        to: targetCid,
        type: 'join',
        payload: { name: selfName, invite: true },
      })
      setShowInviteUser(false)
      setInviteTargetCid('')
    } catch (e) {
      console.error('Failed to invite user:', e)
    }
  }

  return (
    <>
      {showInviteUser ? (
        <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold text-neutral-200 mb-2">Invite User to Room</div>
          <div className="space-y-2">
            <div className="text-[11px] text-neutral-400">
              Invite user to: <span className="text-neutral-200">{activeRoom}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void inviteUser(inviteTargetCid, activeRoom)}
                className="flex-1 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-950 hover:bg-neutral-100"
                type="button"
              >
                Send Invite
              </button>
              <button
                onClick={() => {
                  setShowInviteUser(false)
                  setInviteTargetCid('')
                }}
                className="rounded-lg px-3 py-1.5 text-[11px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
        <div className="text-[11px] font-semibold text-neutral-200">Users</div>
        <div className="mt-2 max-h-40 overflow-auto rounded-xl ring-1 ring-white/10">
          {participants.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-neutral-500">No users yet.</div>
          ) : (
            participants
              .slice()
              .sort((a, b) => b.lastSeen - a.lastSeen)
              .map((p) => (
                <div key={p.cid} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-neutral-200">{p.name || p.cid}</div>
                    <div className="truncate text-neutral-500">
                      {p.lastSeen > Date.now() - 45000 ? 'online' : 'idle'}
                    </div>
                  </div>
                  {p.cid !== selfCid && joined && (
                    <button
                      onClick={() => {
                        setInviteTargetCid(p.cid)
                        setShowInviteUser(true)
                      }}
                      className="rounded-md px-2 py-1 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                      type="button"
                      title="Invite to room"
                    >
                      Call
                    </button>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </>
  )
}
