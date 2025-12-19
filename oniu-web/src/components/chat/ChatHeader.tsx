type ChatHeaderProps = {
  mode: 'global' | 'local'
  net: 'connecting' | 'online' | 'offline'
  onlineCount: number
  isAdmin: boolean
  onAdminToggle: () => void
  onVideoToggle: () => void
  onClear: () => void
  onClose: () => void
}

export default function ChatHeader({
  mode,
  net,
  onlineCount,
  isAdmin,
  onAdminToggle,
  onVideoToggle,
  onClear,
  onClose,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold">Chat</div>
          {onlineCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-semibold text-green-400">{onlineCount}</span>
            </div>
          ) : null}
        </div>
        <div className="text-xs text-neutral-400">
          {mode === 'global' ? 'Global chat' : 'Local fallback'} •{' '}
          <span className={net === 'online' ? 'text-emerald-300' : net === 'offline' ? 'text-rose-300' : ''}>
            {net}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin ? (
          <button
            onClick={onAdminToggle}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            title="Admin tools"
          >
            Admin
          </button>
        ) : null}
        <button
          onClick={onVideoToggle}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          title="Video"
        >
          Video
        </button>
        <button
          onClick={onClear}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          title="Clear chat"
        >
          Clear
        </button>
        <button
          onClick={onClose}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
