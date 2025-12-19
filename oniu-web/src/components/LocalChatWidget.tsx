import { useEffect, useMemo, useRef, useState } from 'react'
import { applyMod, lastTimestamp, loadChatCache, mergeMessages, saveChatCache, type ChatMessage, type ChatMod } from '@/lib/chatSync'
import { generateChatName } from '@/lib/nameGenerator'
import VideoChatPanel from '@/components/VideoChatPanel'
import { enableSound } from '@/lib/sound'
import { useChatPresence } from '@/lib/chat/useChatPresence'
import { useOfflineQueue } from '@/lib/chat/useOfflineQueue'
import { useAdminActions } from '@/lib/chat/useAdminActions'
import { useChatMessages } from '@/lib/chat/useChatMessages'
import { useMessageManagement } from '@/lib/chat/useMessageManagement'
import { useCrossTabSync } from '@/lib/chat/useCrossTabSync'
import AdminPanel from '@/components/chat/AdminPanel'

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ')
}

function createMessageId(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined
    if (c) {
      const ru = (c as unknown as { randomUUID?: () => string }).randomUUID
      if (typeof ru === 'function') return ru()
    }
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      bytes[6] = (bytes[6]! & 0x0f) | 0x40
      bytes[8] = (bytes[8]! & 0x3f) | 0x80
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  } catch {}
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
  const hex = seed.replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32).toLowerCase()
  return hex
}

export default function LocalChatWidget({ room = 'oniu' }: { room?: string }) {
  const storageKey = useMemo(() => `oniu.chat.${room}.v1`, [room])
  const channelName = useMemo(() => `oniu.chat.${room}.bc`, [room])
  const apiUrl = useMemo(() => `/api/chat.php?room=${encodeURIComponent(room)}`, [room])
  const outboxKey = useMemo(() => `oniu.chat.${room}.outbox.v1`, [room])

  const [open, setOpen] = useState(false)
  const [name, setName] = useState(() => localStorage.getItem('oniu.chat.name') ?? generateChatName())
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'global' | 'local'>('global')
  const [net, setNet] = useState<'connecting' | 'online' | 'offline'>('connecting')
  const [isAdmin, setIsAdmin] = useState(false)
  const [csrf, setCsrf] = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const cid = useMemo(() => {
    const existing = localStorage.getItem('oniu.chat.cid')
    if (existing) return existing
    const id = createMessageId()
    localStorage.setItem('oniu.chat.cid', id)
    return id
  }, [])

  const [lastReadTs, setLastReadTs] = useState(() => lastTimestamp(loadChatCache(storageKey)))
  const [soundReady, setSoundReady] = useState(false)

  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    localStorage.setItem('oniu.chat.name', name)
  }, [name])

  const {
    messages,
    setLastSeen,
    lastSeenRef,
    kickPoll,
    updateMessages,
  } = useChatMessages({
    storageKey,
    apiUrl,
    cid,
    name,
    soundReady,
    onAdminChange: setIsAdmin,
    onNetChange: setNet,
    onModeChange: setMode,
  })

  useCrossTabSync({
    storageKey,
    channelName,
    onMessagesChange: updateMessages,
  })

  useEffect(() => {
    if (!open) return
    const cached = loadChatCache(storageKey)
    setLastReadTs(lastTimestamp(cached))
  }, [open, storageKey])

  const unreadCount = useMemo(() => {
    const cutoff = lastReadTs
    let c = 0
    for (const m of messages) {
      if (m.ts <= cutoff) continue
      if (m.mine) continue
      c++
    }
    return c
  }, [messages, lastReadTs])

  const { presencePublic, onlineCount } = useChatPresence({
    room,
    cid,
    name,
    enabled: net === 'online' && mode === 'global',
    apiUrl,
  })

  useOfflineQueue({
    room,
    cid,
    outboxKey,
    isOnline: net === 'online',
    mode,
  })

  useEffect(() => {
    if (!adminOpen) return
    if (!isAdmin) return
    if (csrf) return
    fetch('/admin/csrf.php', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('csrf'))))
      .then((d: unknown) => {
        const t = (d as { csrf?: string })?.csrf
        if (typeof t === 'string' && t) setCsrf(t)
      })
      .catch(() => {})
  }, [adminOpen, isAdmin, csrf])

  function handleModUpdate(mod: ChatMod) {
    const clearedBefore = typeof mod.cleared_before_ts === 'number' ? mod.cleared_before_ts : 0
    if (clearedBefore > 0) {
      updateMessages([])
      setLastSeen(clearedBefore)
      lastSeenRef.current = clearedBefore
    } else {
      const local = loadChatCache(storageKey)
      const filtered = applyMod(local, mod)
      saveChatCache(storageKey, filtered)
      updateMessages(filtered)
    }
  }

  const { adminAction, adminBusy } = useAdminActions({
    room,
    storageKey,
    isAdmin,
    csrf,
    onModUpdate: handleModUpdate,
    onPollKick: kickPoll,
  })

  const { deleteOwn, clearChat, userBusy } = useMessageManagement({
    room,
    storageKey,
    cid,
    onMessagesChange: updateMessages,
    onPollKick: kickPoll,
  })

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [open, messages.length])

  useEffect(() => {
    if (!open) return
    fetch('/api/track.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        event: 'chat_open',
        path: location.pathname + location.search + location.hash,
        ref: document.referrer || '',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        lang: navigator.language || '',
        cid,
        chat: true,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [open, cid])

  function post() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSendError(null)

    const msg: ChatMessage = {
      id: createMessageId(),
      name: name.trim() || 'Anonymous',
      text: trimmed,
      ts: Date.now(),
      mine: true,
    }

    const next = mergeMessages(loadChatCache(storageKey), [msg])
    saveChatCache(storageKey, next)
    updateMessages(next)
    setText('')

    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel(channelName)
      bc.postMessage({ type: 'sync' })
      bc.close()
    }

    if (mode === 'global') {
      fetch('/api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ room, cid, id: msg.id, name: msg.name, text: msg.text }),
      })
        .then((r) => {
          if (!r.ok) {
            setSendError(`Send failed (${r.status})`)
            const raw = localStorage.getItem(outboxKey)
            const items = (raw ? (JSON.parse(raw) as unknown) : null) as ChatMessage[] | null
            const q = Array.isArray(items) ? items : []
            localStorage.setItem(outboxKey, JSON.stringify([...q, msg].slice(-50)))
          } else {
            kickPoll()
          }
        })
        .catch(() => {
          setSendError('Send failed (network)')
          const raw = localStorage.getItem(outboxKey)
          const items = (raw ? (JSON.parse(raw) as unknown) : null) as ChatMessage[] | null
          const q = Array.isArray(items) ? items : []
          localStorage.setItem(outboxKey, JSON.stringify([...q, msg].slice(-50)))
        })
    } else {
      const raw = localStorage.getItem(outboxKey)
      const items = (raw ? (JSON.parse(raw) as unknown) : null) as ChatMessage[] | null
      const q = Array.isArray(items) ? items : []
      localStorage.setItem(outboxKey, JSON.stringify([...q, msg].slice(-50)))
    }
  }

  function clear() {
    clearChat()
    setLastReadTs(Date.now())
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel(channelName)
      bc.postMessage({ type: 'sync' })
      bc.close()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-5 sm:right-5">
      {open ? (
        <div className="flex h-[min(78svh,640px)] w-[min(94vw,360px)] flex-col overflow-hidden rounded-2xl bg-neutral-950/70 ring-1 ring-white/10 backdrop-blur">
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
                  onClick={() => setAdminOpen((v) => !v)}
                  className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                  title="Admin tools"
                >
                  Admin
                </button>
              ) : null}
              <button
                onClick={() => setVideoOpen((v) => !v)}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                title="Video"
              >
                Video
              </button>
              <button
                onClick={clear}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                title="Clear chat"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  void enableSound().then((ok) => ok && setSoundReady(true))
                  setOpen(false)
                }}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {adminOpen ? (
            <AdminPanel
              room={room}
              storageKey={storageKey}
              isAdmin={isAdmin}
              csrf={csrf}
              onModUpdate={handleModUpdate}
              onPollKick={kickPoll}
            />
          ) : null}

          {videoOpen ? (
            <div className="border-b border-white/10 px-4 py-3">
              <VideoChatPanel
                room="global"
                selfCid={cid}
                selfName={name}
                peers={presencePublic}
                onClose={() => setVideoOpen(false)}
              />
            </div>
          ) : null}

          <div className="px-4 py-3">
            <div className="grid gap-2">
              <span className="text-xs text-neutral-400">Name</span>
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-xl bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20"
                />
                <button
                  onClick={() => setName(generateChatName())}
                  className="rounded-xl px-3 py-2 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                  type="button"
                  title="Random name"
                >
                  Random
                </button>
              </div>
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-3">
            {messages.length === 0 ? (
              <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-neutral-400 ring-1 ring-white/10">
                No messages yet.
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-xs font-semibold text-neutral-200">{m.name}</div>
                    <div className="flex items-center gap-2">
                      {isAdmin && m.ip ? <div className="text-[10px] text-neutral-500">{m.ip}</div> : null}
                      <div className="text-[10px] text-neutral-500">{new Date(m.ts).toLocaleTimeString()}</div>
                      {isAdmin && m.ip ? (
                        <button
                          onClick={() => void adminAction({ action: 'delete_message', id: m.id })}
                          className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                          title="Delete message"
                          disabled={!csrf || adminBusy}
                        >
                          Del
                        </button>
                      ) : null}
                      {!isAdmin && m.mine ? (
                        <button
                          onClick={() => void deleteOwn(m.id)}
                          className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                          title="Delete message"
                          disabled={userBusy}
                        >
                          Del
                        </button>
                      ) : null}
                      {isAdmin && m.ip ? (
                        <button
                          onClick={() => void adminAction({ action: 'mute', ip: m.ip, minutes: 10 })}
                          className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                          title="Mute IP for 10 minutes"
                          disabled={!csrf || adminBusy}
                        >
                          Mute
                        </button>
                      ) : null}
                      {isAdmin && m.ip ? (
                        <button
                          onClick={() => void adminAction({ action: 'ban', ip: m.ip })}
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
              ))
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="Write a message…"
                className="min-h-[48px] flex-1 resize-none rounded-xl bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    post()
                  }
                }}
              />
              <button
                onClick={post}
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
        </div>
      ) : (
        <button
          onClick={() => {
            void enableSound().then((ok) => ok && setSoundReady(true))
            setOpen(true)
          }}
          className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-black/30 hover:bg-neutral-100"
        >
          <span className="relative inline-flex items-center">
            Chat
            {unreadCount > 0 ? (
              <span className="absolute -right-3 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </span>
        </button>
      )}
    </div>
  )
}


