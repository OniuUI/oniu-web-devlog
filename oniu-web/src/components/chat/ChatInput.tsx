
type ChatInputProps = {
  text: string
  onTextChange: (text: string) => void
  onPost: () => void
  sendError: string | null
}

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ')
}

export default function ChatInput({ text, onTextChange, onPost, sendError }: ChatInputProps) {
  return (
    <div className="border-t border-white/10 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={2}
          placeholder="Write a message…"
          className="min-h-[48px] flex-1 resize-none rounded-xl bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onPost()
            }
          }}
        />
        <button
          onClick={onPost}
          className={cx(
            'rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950',
            'hover:bg-neutral-100',
          )}
        >
          Send
        </button>
      </div>
      {sendError ? <div className="mt-2 text-[11px] text-rose-300">{sendError}</div> : null}
      <div className="mt-2 text-[11px] text-neutral-500">Tip: Ctrl/⌘ + Enter to send.</div>
    </div>
  )
}
