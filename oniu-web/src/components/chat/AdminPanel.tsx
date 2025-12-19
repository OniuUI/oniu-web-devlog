import { useAdminActions } from '@/lib/chat/useAdminActions'
import type { ChatMod } from '@/lib/chatSync'

type AdminPanelProps = {
  room: string
  storageKey: string
  isAdmin: boolean
  csrf: string | null
  onModUpdate: (mod: ChatMod) => void
  onPollKick: () => void
}

export default function AdminPanel({
  room,
  storageKey,
  isAdmin,
  csrf,
  onModUpdate,
  onPollKick,
}: AdminPanelProps) {
  const { adminBusy, adminError, adminState, adminAction, refreshAdminState } = useAdminActions({
    room,
    storageKey,
    isAdmin,
    csrf,
    onModUpdate,
    onPollKick,
  })

  if (!isAdmin) return null

  return (
    <div className="max-h-[28svh] overflow-auto border-b border-white/10 px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void refreshAdminState()}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          disabled={!csrf || adminBusy}
        >
          {adminBusy ? 'Loading' : 'Refresh'}
        </button>
        <button
          onClick={() => void adminAction({ action: 'pause', seconds: 60 })}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          disabled={!csrf || adminBusy}
        >
          Pause 1m
        </button>
        <button
          onClick={() => void adminAction({ action: 'pause', seconds: 0 })}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          disabled={!csrf || adminBusy}
        >
          Resume
        </button>
        <button
          onClick={() => void adminAction({ action: 'clear_history' })}
          className="rounded-xl px-3 py-1.5 text-xs text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
          disabled={!csrf || adminBusy}
        >
          Clear history
        </button>
      </div>
      {adminError ? <div className="mt-2 text-[11px] text-rose-300">{adminError}</div> : null}
      <div className="mt-3 grid gap-3">
        <div>
          <div className="text-[11px] font-semibold text-neutral-200">Connected users</div>
          <div className="mt-2 max-h-28 overflow-auto rounded-xl ring-1 ring-white/10">
            {adminState.presence.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-neutral-500">No presence data yet.</div>
            ) : (
              adminState.presence.map((u) => (
                <div key={u.cid} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
                  <div className="min-w-0">
                    <div className="truncate text-neutral-200">{u.name || u.cid}</div>
                    <div className="truncate text-neutral-500">{u.ip}</div>
                  </div>
                  <div className="flex gap-1">
                    {adminState.muted[u.ip] && adminState.muted[u.ip] > Date.now() ? (
                      <button
                        onClick={() => void adminAction({ action: 'unmute', ip: u.ip })}
                        className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                        disabled={!csrf || adminBusy}
                      >
                        Unmute
                      </button>
                    ) : (
                      <button
                        onClick={() => void adminAction({ action: 'mute', ip: u.ip, minutes: 10 })}
                        className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                        disabled={!csrf || adminBusy}
                      >
                        Mute
                      </button>
                    )}
                    {adminState.banned.includes(u.ip) ? (
                      <button
                        onClick={() => void adminAction({ action: 'unban', ip: u.ip })}
                        className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                        disabled={!csrf || adminBusy}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => void adminAction({ action: 'ban', ip: u.ip })}
                        className="rounded-md px-2 py-0.5 text-[10px] text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
                        disabled={!csrf || adminBusy}
                      >
                        Ban
                      </button>
                    )}
                    <button
                      onClick={() => void adminAction({ action: 'clear_by_ip', ip: u.ip })}
                      className="rounded-md px-2 py-0.5 text-[10px] text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
                      disabled={!csrf || adminBusy}
                    >
                      Purge
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] font-semibold text-neutral-200">Banned</div>
            <div className="mt-1 max-h-20 overflow-auto rounded-xl ring-1 ring-white/10">
              {adminState.banned.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-neutral-500">None</div>
              ) : (
                adminState.banned.map((ip) => (
                  <div key={ip} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
                    <div className="truncate text-neutral-300">{ip}</div>
                    <button
                      onClick={() => void adminAction({ action: 'unban', ip })}
                      className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                      disabled={!csrf || adminBusy}
                    >
                      Unban
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-neutral-200">Muted</div>
            <div className="mt-1 max-h-20 overflow-auto rounded-xl ring-1 ring-white/10">
              {Object.keys(adminState.muted).length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-neutral-500">None</div>
              ) : (
                Object.entries(adminState.muted).map(([ip]) => (
                  <div key={ip} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
                    <div className="truncate text-neutral-300">{ip}</div>
                    <button
                      onClick={() => void adminAction({ action: 'unmute', ip })}
                      className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                      disabled={!csrf || adminBusy}
                    >
                      Unmute
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-neutral-500">
        Admin actions require being logged in at <span className="text-neutral-300">/admin/</span>.
      </div>
    </div>
  )
}
