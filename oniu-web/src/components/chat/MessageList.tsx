import { type ChatMessage } from '@/lib/chatSync'

type MessageListProps = {
  messages: ChatMessage[]
  isAdmin: boolean
  csrf: string | null
  adminBusy: boolean
  userBusy: boolean
  onAdminAction: (params: { action: string; id?: string; ip?: string; minutes?: number }) => Promise<void>
  onDeleteOwn: (id: string) => Promise<void>
}

export default function MessageList({
  messages,
  isAdmin,
  csrf,
  adminBusy,
  userBusy,
  onAdminAction,
  onDeleteOwn,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-neutral-400 ring-1 ring-white/10">
        No messages yet.
      </div>
    )
  }

  return (
    <>
      {messages.map((m) => (
        <div key={m.id} className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-xs font-semibold text-neutral-200">{m.name}</div>
            <div className="flex items-center gap-2">
              {isAdmin && m.ip ? <div className="text-[10px] text-neutral-500">{m.ip}</div> : null}
              <div className="text-[10px] text-neutral-500">{new Date(m.ts).toLocaleTimeString()}</div>
              {isAdmin && m.ip ? (
                <button
                  onClick={() => void onAdminAction({ action: 'delete_message', id: m.id })}
                  className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                  title="Delete message"
                  disabled={!csrf || adminBusy}
                >
                  Del
                </button>
              ) : null}
              {!isAdmin && m.mine ? (
                <button
                  onClick={() => void onDeleteOwn(m.id)}
                  className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                  title="Delete message"
                  disabled={userBusy}
                >
                  Del
                </button>
              ) : null}
              {isAdmin && m.ip ? (
                <button
                  onClick={() => void onAdminAction({ action: 'mute', ip: m.ip, minutes: 10 })}
                  className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                  title="Mute IP for 10 minutes"
                  disabled={!csrf || adminBusy}
                >
                  Mute
                </button>
              ) : null}
              {isAdmin && m.ip ? (
                <button
                  onClick={() => void onAdminAction({ action: 'ban', ip: m.ip })}
                  className="rounded-md px-2 py-0.5 text-[10px] text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
                  title="Ban IP"
                  disabled={!csrf || adminBusy}
                >
                  Ban
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{m.text}</div>
        </div>
      ))}
    </>
  )
}
