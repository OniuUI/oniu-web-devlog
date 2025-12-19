import { generateChatName } from '@/lib/nameGenerator'

type NameInputProps = {
  name: string
  onNameChange: (name: string) => void
}

export default function NameInput({ name, onNameChange }: NameInputProps) {
  return (
    <div className="px-4 py-3">
      <div className="grid gap-2">
        <span className="text-xs text-neutral-400">Name</span>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="flex-1 rounded-xl bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20"
          />
          <button
            onClick={() => onNameChange(generateChatName())}
            className="rounded-xl px-3 py-2 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
            title="Random name"
          >
            Random
          </button>
        </div>
      </div>
    </div>
  )
}
