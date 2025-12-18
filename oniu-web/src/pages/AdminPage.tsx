import { useEffect, useMemo, useState } from 'react'
import type { Publication, PublicationMedia, PublicationsFile } from '@/lib/publications'
import Background from '@/components/Background'
import { profile } from '@/content/profile'

const STORAGE_KEY = 'oniu.admin'

type AdminState = {
  // stored as PBKDF2-derived key bytes (base64) + salt
  passwordSaltB64: string
  passwordHashB64: string
  // draft publications (not automatically public until you upload publications.json)
  draft: PublicationsFile
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function newId() {
  return crypto.randomUUID()
}

function todayIso() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function loadState(): AdminState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AdminState
  } catch {
    return null
  }
}

function saveState(state: AdminState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export default function AdminPage() {
  const [booted, setBooted] = useState(false)
  const [locked, setLocked] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<AdminState | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    // Initialize with a known test password if first run.
    ;(async () => {
      const existing = loadState()
      if (existing) {
        setState(existing)
        setBooted(true)
        return
      }

      const defaultPassword = 'oniu-admin-test'
      const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
      const hash = await pbkdf2(defaultPassword, salt, 210000)

      const initial: AdminState = {
        passwordSaltB64: b64(salt),
        passwordHashB64: b64(hash),
        draft: {
          publications: [
            {
              id: 'welcome',
              title: 'Welcome',
              date: todayIso(),
              body: 'Edit or delete this post. Then export publications.json and upload it to the server root.',
              media: [],
            },
          ],
        },
      }
      saveState(initial)
      setState(initial)
      setBooted(true)
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Failed to initialize admin')
      setBooted(true)
    })
  }, [])

  const publications = state?.draft.publications ?? []
  const selected = useMemo(
    () => (selectedId ? publications.find((p) => p.id === selectedId) ?? null : null),
    [publications, selectedId],
  )

  async function unlock() {
    if (!state) return
    setError(null)
    try {
      const salt = b64ToBytes(state.passwordSaltB64)
      const expected = state.passwordHashB64
      const hash = await pbkdf2(password, salt, 210000)
      if (b64(hash) !== expected) {
        setLocked(true)
        setError('Wrong password.')
        return
      }
      setLocked(false)
      setPassword('')
    } catch (e: unknown) {
      setLocked(true)
      setError(e instanceof Error ? e.message : 'Failed to unlock')
    }
  }

  function updateDraft(next: PublicationsFile) {
    if (!state) return
    const nextState: AdminState = { ...state, draft: next }
    setState(nextState)
    saveState(nextState)
  }

  function createPost() {
    const p: Publication = {
      id: newId(),
      title: 'New post',
      date: todayIso(),
      body: '',
      media: [],
    }
    updateDraft({ publications: [p, ...publications] })
    setSelectedId(p.id)
  }

  function deletePost(id: string) {
    const next = publications.filter((p) => p.id !== id)
    updateDraft({ publications: next })
    if (selectedId === id) setSelectedId(null)
  }

  async function addMedia(files: FileList | null) {
    if (!files || !selected) return
    const items: PublicationMedia[] = []
    for (const f of Array.from(files)) {
      const isImage = f.type.startsWith('image/')
      const isVideo = f.type.startsWith('video/')
      // For convenience we inline as data URLs.
      // (Note: large files will bloat publications.json. Prefer uploading to /media and linking instead.)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('Failed to read file'))
        r.readAsDataURL(f)
      })
      if (isImage) items.push({ kind: 'image', title: f.name, src: dataUrl })
      else if (isVideo) items.push({ kind: 'video', title: f.name, src: dataUrl })
      else items.push({ kind: 'file', title: f.name, href: dataUrl })
    }

    const next = publications.map((p) => (p.id === selected.id ? { ...p, media: [...p.media, ...items] } : p))
    updateDraft({ publications: next })
  }

  function changeSelected(patch: Partial<Publication>) {
    if (!selected) return
    const next = publications.map((p) => (p.id === selected.id ? { ...p, ...patch } : p))
    updateDraft({ publications: next })
  }

  async function setNewPassword(newPassword: string) {
    if (!state) return
    const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
    const hash = await pbkdf2(newPassword, salt, 210000)
    const nextState: AdminState = {
      ...state,
      passwordSaltB64: b64(salt),
      passwordHashB64: b64(hash),
    }
    setState(nextState)
    saveState(nextState)
  }

  if (!booted) {
    return <div className="p-8 text-sm text-neutral-300">Loading…</div>
  }

  if (!state) {
    return <div className="p-8 text-sm text-rose-300">Admin state missing. {error ?? ''}</div>
  }

  return (
    <div className="min-h-svh bg-neutral-950 text-neutral-100">
      <Background />

      <header className="relative mx-auto max-w-6xl px-6 pt-10">
        <nav className="flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10">
              <span className="h-4 w-4 rounded-md bg-gradient-to-br from-indigo-200 to-emerald-200" />
            </span>
            <span className="text-sm font-semibold tracking-wide">ONIU</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-full px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/5">
              Back to site
            </a>
            <a
              href={profile.links.github}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/5"
            >
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Create and manage publications. On a purely static host, the browser can’t write files to the server — so
            “Save” will download <code className="text-neutral-100">publications.json</code> for you.
          </p>
        </div>
      </div>

      {locked ? (
        <div className="mt-8 rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
          <div className="text-sm font-semibold">Login</div>
          <div className="mt-1 text-xs text-neutral-400">
            Default test password (first run): <code className="text-neutral-200">oniu-admin-test</code>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className="w-full rounded-xl bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20 sm:w-72"
            />
            <button
              onClick={unlock}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-100"
            >
              Unlock
            </button>
          </div>
          {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Posts</div>
              <button
                onClick={createPost}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-100"
              >
                New
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {publications.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={[
                    'rounded-xl px-3 py-2 text-left ring-1 ring-white/10 hover:bg-white/5',
                    selectedId === p.id ? 'bg-white/5' : 'bg-transparent',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-semibold">{p.title}</div>
                  <div className="mt-1 text-xs text-neutral-400">{p.date}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <button
                onClick={() => downloadJson('publications.json', state.draft)}
                className="w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-100"
              >
                Save (download publications.json)
              </button>
              <div className="mt-2 text-xs text-neutral-400">
                Upload it to your server root (same folder as <code>index.html</code>). Automatic server save requires a
                server endpoint.
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="text-xs font-semibold text-neutral-300">Change password</div>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  placeholder="New password"
                  className="w-full rounded-xl bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 placeholder:text-neutral-500 focus:outline-none focus:ring-white/20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void setNewPassword((e.target as HTMLInputElement).value)
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-neutral-500">Press Enter to set.</div>
            </div>
          </div>

          <div className="rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
            {!selected ? (
              <div className="text-sm text-neutral-400">Select a post to edit.</div>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Edit post</div>
                    <div className="mt-1 text-xs text-neutral-400">ID: {selected.id}</div>
                  </div>
                  <button
                    onClick={() => deletePost(selected.id)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs text-neutral-400">Title</span>
                  <input
                    value={selected.title}
                    onChange={(e) => changeSelected({ title: e.target.value })}
                    className="rounded-xl bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-neutral-400">Date</span>
                  <input
                    type="date"
                    value={selected.date}
                    onChange={(e) => changeSelected({ date: e.target.value })}
                    className="rounded-xl bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs text-neutral-400">Body</span>
                  <textarea
                    value={selected.body}
                    onChange={(e) => changeSelected({ body: e.target.value })}
                    rows={10}
                    className="rounded-xl bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
                  />
                </label>

                <div className="grid gap-2">
                  <div className="text-xs text-neutral-400">Attachments</div>
                  <input type="file" multiple onChange={(e) => void addMedia(e.target.files)} />
                  <div className="text-xs text-neutral-500">
                    Tip: large videos/images will make <code>publications.json</code> huge. Prefer uploading media to{' '}
                    <code>/media</code> and linking it instead.
                  </div>
                  <div className="mt-2 grid gap-2">
                    {selected.media.map((m, idx) => (
                      <div key={idx} className="rounded-xl bg-white/5 p-3 text-xs text-neutral-300 ring-1 ring-white/10">
                        <div className="font-semibold">{m.kind}</div>
                        {'src' in m ? <div className="mt-1 truncate text-neutral-400">{m.src}</div> : null}
                        {'href' in m ? <div className="mt-1 truncate text-neutral-400">{m.href}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </main>
    </div>
  )
}


