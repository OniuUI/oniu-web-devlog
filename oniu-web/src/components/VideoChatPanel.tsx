import { useEffect, useMemo, useRef, useState } from 'react'
import { rtcPoll, rtcPresence, rtcSend, type RtcSignal } from '@/lib/rtc'
import { enableSound, playDialSound, startRingtone } from '@/lib/sound'

type PresenceUser = { cid: string; name: string; lastSeen: number }

type Props = {
  room: string
  selfCid: string
  selfName: string
  peers: PresenceUser[]
  onClose: () => void
}

type PeerState = {
  cid: string
  pc: RTCPeerConnection
  stream: MediaStream | null
  pendingIce: RTCIceCandidateInit[]
  hasLocalTracks: boolean
}

function uniquePeers(selfCid: string, peers: PresenceUser[]): PresenceUser[] {
  const seen = new Set<string>()
  const out: PresenceUser[] = []
  for (const p of peers) {
    if (!p?.cid || p.cid === selfCid) continue
    if (seen.has(p.cid)) continue
    seen.add(p.cid)
    out.push(p)
  }
  return out
}

export default function VideoChatPanel({ room, selfCid, selfName, peers, onClose }: Props) {
  const signalingRoom = 'rtc'
  const [activeRoom, setActiveRoom] = useState(room)
  const [joined, setJoined] = useState(false)
  const [callTarget, setCallTarget] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remote, setRemote] = useState<Record<string, MediaStream>>({})
  const [incoming, setIncoming] = useState<{ from: string; room: string; sdp: string } | null>(null)
  const [outgoing, setOutgoing] = useState<{ to: string; room: string } | null>(null)
  const [shareOn, setShareOn] = useState(false)
  const ringerRef = useRef<{ stop: () => void } | null>(null)
  const peerRef = useRef<Map<string, PeerState>>(new Map())
  const sinceRef = useRef(0)
  const pollAbortRef = useRef<AbortController | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const peerList = useMemo(() => uniquePeers(selfCid, peers), [selfCid, peers])

  useEffect(() => {
    if (!incoming) {
      ringerRef.current?.stop()
      ringerRef.current = null
      return
    }
    void enableSound().then(() => {
      ringerRef.current?.stop()
      ringerRef.current = startRingtone()
    })
    return () => {
      ringerRef.current?.stop()
      ringerRef.current = null
    }
  }, [incoming])

  useEffect(() => {
    if (!outgoing) return
    void enableSound().then(() => playDialSound())
  }, [outgoing])

  useEffect(() => {
    const ac = new AbortController()
    pollAbortRef.current = ac
    let cancelled = false

    const pump = async () => {
      try {
        while (!cancelled) {
          const res = await rtcPoll({ room: signalingRoom, client: selfCid, since: sinceRef.current, timeout: 20, signal: ac.signal })
          sinceRef.current = Math.max(sinceRef.current, res.now)
          for (const m of res.messages) {
            handleSignal(m)
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'RTC failed')
      }
    }

    void pump()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [selfCid])

  async function syncRoomParticipants(channel: string) {
    const ac = new AbortController()
    try {
      const rows = await rtcPresence({ channel, client: selfCid, signal: ac.signal })
      const targets = rows.filter((p) => p.cid && p.cid !== selfCid && p.lastSeen > Date.now() - 45000).slice(0, 12)
      for (const p of targets) {
        const iAmInitiator = selfCid.localeCompare(p.cid) < 0
        await connectTo(p.cid, !iAmInitiator)
      }
    } catch {}
  }

  useEffect(() => {
    return () => {
      for (const s of peerRef.current.values()) {
        s.pc.close()
      }
      peerRef.current.clear()
      if (localStream) {
        for (const t of localStream.getTracks()) t.stop()
      }
    }
  }, [localStream])

  async function ensureMedia() {
    if (localStream) return localStream
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    setLocalStream(stream)
    return stream
  }

  function online(u: PresenceUser): boolean {
    const now = Date.now()
    return u.lastSeen > now - 45000
  }

  function createPeerConnection(peerCid: string): RTCPeerConnection {
    const existing = peerRef.current.get(peerCid)
    if (existing) return existing.pc

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    })

    pc.ontrack = (ev) => {
      setRemote((prev) => {
        const existingStream = prev[peerCid]
        const next = existingStream ? new MediaStream(existingStream.getTracks()) : new MediaStream()
        if (ev.track) next.addTrack(ev.track)
        return { ...prev, [peerCid]: next }
      })
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      void rtcSend({
        room: signalingRoom,
        channel: activeRoom,
        from: selfCid,
        to: peerCid,
        type: 'ice',
        payload: ev.candidate.toJSON(),
      }).catch(() => {})
    }

    peerRef.current.set(peerCid, { cid: peerCid, pc, stream: null, pendingIce: [], hasLocalTracks: false })
    return pc
  }

  async function flushIce(peerCid: string) {
    const st = peerRef.current.get(peerCid)
    if (!st) return
    if (!st.pc.remoteDescription) return
    if (st.pendingIce.length === 0) return
    const list = st.pendingIce.slice()
    st.pendingIce.length = 0
    for (const c of list) {
      try {
        await st.pc.addIceCandidate(c)
      } catch {}
    }
  }

  async function connectTo(peerCid: string, polite: boolean) {
    const stream = await ensureMedia()
    const pc = createPeerConnection(peerCid)
    const st = peerRef.current.get(peerCid)
    if (st && !st.hasLocalTracks) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }
      st.hasLocalTracks = true
    }

    if (!polite) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await rtcSend({ room: signalingRoom, channel: activeRoom, from: selfCid, to: peerCid, type: 'offer', payload: offer.sdp ?? '' })
    }
  }

  function shortCid(v: string): string {
    return v.replace(/-/g, '').slice(0, 12).toLowerCase()
  }

  function dmRoom(a: string, b: string): string {
    const x = shortCid(a)
    const y = shortCid(b)
    return x < y ? `dm-${x}-${y}` : `dm-${y}-${x}`
  }

  async function resetSession(nextRoom: string) {
    for (const p of peerRef.current.values()) {
      try {
        await rtcSend({ room: signalingRoom, channel: activeRoom, from: selfCid, to: p.cid, type: 'leave', payload: '' })
      } catch {}
      p.pc.close()
    }
    peerRef.current.clear()
    setRemote({})
    setActiveRoom(nextRoom)
    setIncoming(null)
    setOutgoing(null)
  }

  function createRoomCode(): string {
    const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
    return `room-${seed.replace(/[^0-9a-f]/gi, '').slice(0, 10).toLowerCase()}`
  }

  async function joinGlobal() {
    setError(null)
    await resetSession(room)
    setJoined(true)
    await rtcSend({ room: signalingRoom, channel: room, from: selfCid, to: '', type: 'join', payload: { name: selfName } })
    await syncRoomParticipants(room)
  }

  async function startDirectCall(target: string) {
    if (!target) return
    setError(null)
    const r = dmRoom(selfCid, target)
    await resetSession(r)
    setJoined(true)
    try {
      setOutgoing({ to: target, room: r })
      await connectTo(target, false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Call failed')
    }
  }

  async function handleSignal(m: RtcSignal) {
    if (!m?.type || !m.from) return
    const channel = typeof m.channel === 'string' && m.channel ? m.channel : m.room
    if (channel !== activeRoom) {
      if (m.type === 'offer') {
        const sdp = typeof m.payload === 'string' ? m.payload : ''
        if (sdp) {
          setIncoming({ from: m.from, room: channel, sdp })
        }
      }
      return
    }
    const peerCid = m.from
    if (peerCid === selfCid) return
    const pc = createPeerConnection(peerCid)

    if (m.type === 'join') {
      if (!joined) return
      const iAmInitiator = selfCid.localeCompare(peerCid) < 0
      void connectTo(peerCid, !iAmInitiator).catch(() => {})
      return
    }

    if (m.type === 'leave') {
      pc.close()
      peerRef.current.delete(peerCid)
      setRemote((prev) => {
        const n = { ...prev }
        delete n[peerCid]
        return n
      })
      return
    }

    if (m.type === 'offer') {
      const sdp = typeof m.payload === 'string' ? m.payload : ''
      if (!sdp) return
      if (!joined) {
        if (activeRoom === 'global') return
        setIncoming({ from: peerCid, room: activeRoom, sdp })
        return
      }
      const stream = await ensureMedia()
      const st = peerRef.current.get(peerCid)
      if (st && !st.hasLocalTracks) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream)
        }
        st.hasLocalTracks = true
      }
      await pc.setRemoteDescription({ type: 'offer', sdp })
      await flushIce(peerCid)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await rtcSend({ room: signalingRoom, channel: activeRoom, from: selfCid, to: peerCid, type: 'answer', payload: answer.sdp ?? '' })
      setIncoming(null)
      return
    }

    if (m.type === 'answer') {
      const sdp = typeof m.payload === 'string' ? m.payload : ''
      if (!sdp) return
      await pc.setRemoteDescription({ type: 'answer', sdp })
      await flushIce(peerCid)
      return
    }

    if (m.type === 'ice') {
      if (!m.payload || typeof m.payload !== 'object') return
      const cand = m.payload as RTCIceCandidateInit
      if (!pc.remoteDescription) {
        const st = peerRef.current.get(peerCid)
        if (st) st.pendingIce.push(cand)
        return
      }
      try {
        await pc.addIceCandidate(cand)
      } catch {}
    }
  }

  async function acceptIncoming() {
    if (!incoming) return
    const from = incoming.from
    const nextRoom = incoming.room
    const sdp = incoming.sdp
    if (nextRoom !== activeRoom) {
      await resetSession(nextRoom)
      setJoined(true)
    }
    await rtcSend({ room: signalingRoom, channel: nextRoom, from: selfCid, to: '', type: 'join', payload: { name: selfName } })
    await syncRoomParticipants(nextRoom)
    const pc = createPeerConnection(from)
    const stream = await ensureMedia()
    const st = peerRef.current.get(from)
    if (st && !st.hasLocalTracks) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }
      st.hasLocalTracks = true
    }
    await pc.setRemoteDescription({ type: 'offer', sdp })
    await flushIce(from)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await rtcSend({ room: signalingRoom, channel: nextRoom, from: selfCid, to: from, type: 'answer', payload: answer.sdp ?? '' })
    setIncoming(null)
  }

  async function declineIncoming() {
    if (!incoming) return
    const from = incoming.from
    const nextRoom = incoming.room
    setIncoming(null)
    try {
      await rtcSend({ room: signalingRoom, channel: nextRoom, from: selfCid, to: from, type: 'leave', payload: '' })
    } catch {}
  }

  async function inviteToRoom(target: string) {
    if (!target) return
    setError(null)
    setJoined(true)
    try {
      setOutgoing({ to: target, room: activeRoom })
      await rtcSend({ room: signalingRoom, channel: activeRoom, from: selfCid, to: '', type: 'join', payload: { name: selfName } })
      await syncRoomParticipants(activeRoom)
      await connectTo(target, false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invite failed')
    }
  }

  async function toggleShare() {
    if (!localStream) {
      try {
        await ensureMedia()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Media failed')
        return
      }
    }
    if (!localStream) return

    if (!shareOn) {
      try {
        const display = await (navigator.mediaDevices as MediaDevices).getDisplayMedia({ video: true, audio: false })
        const track = display.getVideoTracks()[0]
        if (!track) return
        track.onended = () => setShareOn(false)
        for (const p of peerRef.current.values()) {
          const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video')
          if (sender) await sender.replaceTrack(track)
        }
        const audio = localStream.getAudioTracks()[0]
        const next = new MediaStream()
        next.addTrack(track)
        if (audio) next.addTrack(audio)
        setLocalStream(next)
        setShareOn(true)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Share failed')
      }
      return
    }

    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      const track = cam.getVideoTracks()[0]
      if (!track) return
      for (const p of peerRef.current.values()) {
        const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video')
        if (sender) await sender.replaceTrack(track)
      }
      const audio = localStream.getAudioTracks()[0]
      const next = new MediaStream()
      next.addTrack(track)
      if (audio) next.addTrack(audio)
      setLocalStream(next)
      setShareOn(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Camera failed')
    }
  }

  async function toggleFullscreen() {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await el.requestFullscreen()
  }

  async function leave() {
    for (const p of peerRef.current.values()) {
      try {
        await rtcSend({ room: signalingRoom, channel: activeRoom, from: selfCid, to: p.cid, type: 'leave', payload: '' })
      } catch {}
      p.pc.close()
    }
    peerRef.current.clear()
    setRemote({})
    if (localStream) {
      for (const t of localStream.getTracks()) t.stop()
    }
    setLocalStream(null)
    setJoined(false)
    setError(null)
    setOutgoing(null)
    setIncoming(null)
  }

  const remoteStreams = Object.entries(remote)

  return (
    <div ref={wrapRef} className="mt-3 rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-100">Video</div>
          <div className="truncate text-[11px] text-neutral-400">{activeRoom}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void toggleFullscreen()}
            className="grid h-9 w-9 place-items-center rounded-xl text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="flex flex-wrap gap-2">
          {!joined ? (
            <button
              onClick={() => void joinGlobal()}
              className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-100"
              type="button"
            >
              Join global room
            </button>
          ) : (
            <button
              onClick={() => void leave()}
              className="rounded-xl px-3 py-1.5 text-xs text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/10"
              type="button"
            >
              Leave
            </button>
          )}

          <button
            onClick={() => void toggleShare()}
            className="grid h-9 w-9 place-items-center rounded-xl text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
            aria-label={shareOn ? 'Stop sharing' : 'Share screen'}
            title={shareOn ? 'Stop sharing' : 'Share screen'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16" />
              <path d="M4 18h16" />
              <path d="M7 10h10v6H7z" />
            </svg>
          </button>

          <button
            onClick={() => void resetSession(createRoomCode())}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
          >
            New room
          </button>

          <div className="flex items-center gap-2">
            <select
              value={callTarget}
              onChange={(e) => setCallTarget(e.target.value)}
              className="rounded-xl bg-neutral-950/60 px-3 py-1.5 text-xs text-neutral-100 ring-1 ring-white/10 focus:outline-none"
            >
              <option value="">Call a user…</option>
              {peerList.map((p) => (
                <option key={p.cid} value={p.cid}>
                  {p.name || p.cid}
                </option>
              ))}
            </select>
            <button
              onClick={() => void startDirectCall(callTarget)}
              className="grid h-9 w-9 place-items-center rounded-xl text-neutral-200 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50"
              type="button"
              disabled={!callTarget}
              aria-label="Call"
              title="Call"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.5-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.8 2.1Z" />
              </svg>
            </button>
            <button
              onClick={() => void inviteToRoom(callTarget)}
              className="grid h-9 w-9 place-items-center rounded-xl text-neutral-200 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50"
              type="button"
              disabled={!callTarget}
              aria-label="Add to room"
              title="Add to room"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>

        {incoming ? (
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs font-semibold text-neutral-200">Incoming call</div>
            <div className="mt-1 text-sm text-neutral-100">{incoming.from}</div>
            <div className="mt-1 text-[11px] text-neutral-400">{incoming.room}</div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void acceptIncoming()}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-100"
                type="button"
              >
                Accept
              </button>
              <button
                onClick={() => void declineIncoming()}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                type="button"
              >
                Decline
              </button>
            </div>
          </div>
        ) : null}

        {outgoing ? (
          <div className="rounded-2xl bg-white/5 p-3 text-[11px] text-neutral-300 ring-1 ring-white/10">
            Calling <span className="font-semibold text-neutral-100">{outgoing.to}</span> · <span className="text-neutral-400">{outgoing.room}</span>
          </div>
        ) : null}

        {error ? <div className="text-[11px] text-rose-300">{error}</div> : null}

        <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold text-neutral-200">Users</div>
          <div className="mt-2 max-h-40 overflow-auto rounded-xl ring-1 ring-white/10">
            {peerList.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-neutral-500">No users yet.</div>
            ) : (
              peerList
                .slice()
                .sort((a, b) => (online(b) ? 1 : 0) - (online(a) ? 1 : 0) || b.lastSeen - a.lastSeen)
                .map((p) => (
                  <div key={p.cid} className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-white/5">
                    <div className="min-w-0">
                      <div className="truncate text-neutral-200">{p.name || p.cid}</div>
                      <div className="truncate text-neutral-500">{online(p) ? 'online' : 'idle'}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => void startDirectCall(p.cid)}
                        className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                        type="button"
                      >
                        Call
                      </button>
                      <button
                        onClick={() => void inviteToRoom(p.cid)}
                        className="rounded-md px-2 py-0.5 text-[10px] text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
                        type="button"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <VideoTile label="You" muted stream={localStream} />
          {remoteStreams.map(([peerCid, stream]) => (
            <VideoTile key={peerCid} label={peerCid} stream={stream} />
          ))}
        </div>
      </div>
    </div>
  )
}

function VideoTile({ label, stream, muted }: { label: string; stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!stream) return
    ref.current.srcObject = stream
    void ref.current.play().catch(() => {})
  }, [stream])

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-200">{label}</div>
      <div className="aspect-video bg-black">
        <video ref={ref} muted={muted} playsInline autoPlay className="h-full w-full object-cover" />
      </div>
    </div>
  )
}


