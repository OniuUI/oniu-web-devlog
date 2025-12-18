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
  status: 'connecting' | 'connected' | 'buffering'
}

type RoomInfo = {
  room: string
  acceptedAt: number
  lastJoined?: number
}

type CallDecision = {
  room: string
  from: string
  decision: 'accepted' | 'declined'
  timestamp: number
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

function loadCallDecisions(): CallDecision[] {
  try {
    const stored = localStorage.getItem('oniu.call.decisions')
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCallDecision(decision: CallDecision) {
  try {
    const decisions = loadCallDecisions()
    const filtered = decisions.filter((d) => !(d.room === decision.room && d.from === decision.from))
    filtered.push(decision)
    const recent = filtered.filter((d) => Date.now() - d.timestamp < 7 * 24 * 60 * 60 * 1000)
    localStorage.setItem('oniu.call.decisions', JSON.stringify(recent))
  } catch {}
}

function hasDeclinedCall(room: string, from: string): boolean {
  const decisions = loadCallDecisions()
  return decisions.some((d) => d.room === room && d.from === from && d.decision === 'declined')
}

function loadAcceptedRooms(): RoomInfo[] {
  try {
    const stored = localStorage.getItem('oniu.rooms.accepted')
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAcceptedRoom(room: string) {
  try {
    const rooms = loadAcceptedRooms()
    const existing = rooms.find((r) => r.room === room)
    if (existing) {
      existing.lastJoined = Date.now()
    } else {
      rooms.push({ room, acceptedAt: Date.now(), lastJoined: Date.now() })
    }
    const recent = rooms.filter((r) => Date.now() - r.acceptedAt < 30 * 24 * 60 * 60 * 1000)
    localStorage.setItem('oniu.rooms.accepted', JSON.stringify(recent))
  } catch {}
}

export default function VideoChatPanel({ room, selfCid, selfName, peers, onClose }: Props) {
  const signalingRoom = 'rtc'
  const [activeRoom, setActiveRoom] = useState(room)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [callTarget, setCallTarget] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remote, setRemote] = useState<Record<string, MediaStream>>({})
  const [incoming, setIncoming] = useState<{ from: string; room: string; sdp: string } | null>(null)
  const [outgoing, setOutgoing] = useState<{ to: string; room: string } | null>(null)
  const [shareOn, setShareOn] = useState(false)
  const [roomParticipants, setRoomParticipants] = useState<PresenceUser[]>([])
  const [acceptedRooms, setAcceptedRooms] = useState<RoomInfo[]>(loadAcceptedRooms())
  const [showRoomList, setShowRoomList] = useState(false)
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
      const active = rows.filter((p) => p.cid && p.lastSeen > Date.now() - 45000)
      setRoomParticipants(active)
      const targets = active.filter((p) => p.cid !== selfCid).slice(0, 12)
      for (const p of targets) {
        const iAmInitiator = selfCid.localeCompare(p.cid) < 0
        await connectTo(p.cid, !iAmInitiator)
      }
    } catch {}
  }

  useEffect(() => {
    if (!joined) return
    const interval = setInterval(() => {
      void syncRoomParticipants(activeRoom)
    }, 2000)
    return () => clearInterval(interval)
  }, [joined, activeRoom, selfCid])

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
      const st = peerRef.current.get(peerCid)
      if (st) st.status = 'connected'
      setRemote((prev) => {
        const existingStream = prev[peerCid]
        const next = existingStream ? new MediaStream(existingStream.getTracks()) : new MediaStream()
        if (ev.track) next.addTrack(ev.track)
        return { ...prev, [peerCid]: next }
      })
    }

    pc.onconnectionstatechange = () => {
      const st = peerRef.current.get(peerCid)
      if (!st) return
      if (st.pc.connectionState === 'connected' || st.pc.connectionState === 'connecting') {
        st.status = st.pc.connectionState === 'connected' ? 'connected' : 'connecting'
      }
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

    peerRef.current.set(peerCid, { cid: peerCid, pc, stream: null, pendingIce: [], hasLocalTracks: false, status: 'buffering' })
    setRemote((prev) => {
      if (prev[peerCid]) return prev
      const emptyStream = new MediaStream()
      return { ...prev, [peerCid]: emptyStream }
    })
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
    setJoining(true)
    await resetSession(room)
    setJoined(true)
    await rtcSend({ room: signalingRoom, channel: room, from: selfCid, to: '', type: 'join', payload: { name: selfName } })
    await syncRoomParticipants(room)
    setJoining(false)
  }

  async function joinRoom(targetRoom: string) {
    setError(null)
    setJoining(true)
    await resetSession(targetRoom)
    setJoined(true)
    await rtcSend({ room: signalingRoom, channel: targetRoom, from: selfCid, to: '', type: 'join', payload: { name: selfName } })
    await syncRoomParticipants(targetRoom)
    saveAcceptedRoom(targetRoom)
    setAcceptedRooms(loadAcceptedRooms())
    setJoining(false)
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
        if (hasDeclinedCall(channel, m.from)) return
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
      const st = peerRef.current.get(peerCid)
      if (!st) {
        createPeerConnection(peerCid)
      }
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
    setJoining(true)
    saveCallDecision({ room: nextRoom, from, decision: 'accepted', timestamp: Date.now() })
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
    saveAcceptedRoom(nextRoom)
    setAcceptedRooms(loadAcceptedRooms())
    setIncoming(null)
    setJoining(false)
  }

  async function declineIncoming() {
    if (!incoming) return
    const from = incoming.from
    const nextRoom = incoming.room
    saveCallDecision({ room: nextRoom, from, decision: 'declined', timestamp: Date.now() })
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

  const activeParticipants = roomParticipants.filter((p) => p.cid !== selfCid && p.lastSeen > Date.now() - 45000)
  const participantCount = activeParticipants.length + (joined ? 1 : 0)
  const allPeerCids = new Set([...Object.keys(remote), ...Array.from(peerRef.current.keys())])

  return (
    <div ref={wrapRef} className="mt-3 rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
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

          <button
            onClick={() => setShowRoomList(!showRoomList)}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-200 ring-1 ring-white/10 hover:bg-white/5"
            type="button"
          >
            Rooms
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

        {showRoomList && acceptedRooms.length > 0 ? (
          <div className="rounded-2xl bg-neutral-950/40 p-3 ring-1 ring-white/10">
            <div className="text-[11px] font-semibold text-neutral-200 mb-2">Accepted Rooms</div>
            <div className="space-y-1 max-h-40 overflow-auto">
              {acceptedRooms.map((r) => (
                <button
                  key={r.room}
                  onClick={() => void joinRoom(r.room)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] text-neutral-200 hover:bg-white/5 flex items-center justify-between"
                  type="button"
                >
                  <span className="truncate">{r.room}</span>
                  <span className="text-[10px] text-neutral-500 ml-2">
                    {new Date(r.lastJoined || r.acceptedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

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
          <VideoTile label="You" muted stream={localStream} status={joined ? 'connected' : undefined} />
          {Array.from(allPeerCids).map((peerCid) => {
            const stream = remote[peerCid] || null
            const st = peerRef.current.get(peerCid)
            const status = st?.status || (stream ? 'connected' : 'buffering')
            return <VideoTile key={peerCid} label={peerCid} stream={stream} status={status} />
          })}
        </div>
      </div>
    </div>
  )
}

function VideoTile({ label, stream, muted, status }: { label: string; stream: MediaStream | null; muted?: boolean; status?: 'connecting' | 'connected' | 'buffering' }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const hasTracks = stream && stream.getTracks().length > 0

  useEffect(() => {
    if (!ref.current) return
    if (!stream || !hasTracks) {
      ref.current.srcObject = null
      return
    }
    ref.current.srcObject = stream
    void ref.current.play().catch(() => {})
  }, [stream, hasTracks])

  const statusText = status === 'buffering' || (!hasTracks && status !== 'connected') ? 'Buffering...' : status === 'connecting' ? 'Connecting...' : null
  const showBuffering = (!hasTracks && status !== 'connected') || status === 'buffering'

  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-950/50 ring-1 ring-white/10">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-200 flex items-center justify-between">
        <span>{label}</span>
        {statusText ? (
          <span className="text-[10px] text-neutral-400">{statusText}</span>
        ) : status === 'connected' && hasTracks ? (
          <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
        ) : null}
      </div>
      <div className="aspect-video bg-black relative">
        <video ref={ref} muted={muted} playsInline autoPlay className="h-full w-full object-cover" />
        {showBuffering ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin"></div>
              <div className="text-xs text-neutral-400">Waiting for stream...</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}


