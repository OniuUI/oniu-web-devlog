type VideoHeaderProps = {
  activeRoom: string
  joined: boolean
  joining: boolean
  participantCount: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onClose: () => void
}

export default function VideoHeader({
  activeRoom,
  joined,
  joining,
  participantCount,
  isFullscreen,
  onToggleFullscreen,
  onClose,
}: VideoHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold text-neutral-100">Video</div>
          {joined && participantCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-semibold text-green-400">{participantCount}</span>
            </div>
          ) : null}
          {joining ? (
            <span className="text-xs text-neutral-400">Joining...</span>
          ) : joined ? (
            <span className="text-xs text-green-400">Connected</span>
          ) : null}
        </div>
        <div className="truncate text-[11px] text-neutral-400">{activeRoom}</div>
      </div>
      <div className="flex items-center gap-2">
        {joined && (
          <button
            onClick={onToggleFullscreen}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  )
}
