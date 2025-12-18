type PlayOptions = { volume?: number }

type Ringer = { stop: () => void }

let audioContext: AudioContext | null = null
let unlocked = false

function getContext(): AudioContext | null {
  if (audioContext) return audioContext
  const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
  const Webkit = (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  const Impl = Ctx ?? Webkit
  if (!Impl) return null
  audioContext = new Impl()
  return audioContext
}

export async function enableSound(): Promise<boolean> {
  const ctx = getContext()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') await ctx.resume()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 440
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.01)
    unlocked = true
    return true
  } catch {
    return false
  }
}

function playTone(freq: number, durationMs: number, opts?: PlayOptions) {
  const ctx = getContext()
  if (!ctx || !unlocked) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const vol = Math.max(0, Math.min(1, opts?.volume ?? 0.12))
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, durationMs / 1000))
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + durationMs / 1000 + 0.05)
}

export function playMessageSound() {
  playTone(880, 90, { volume: 0.11 })
  setTimeout(() => playTone(1240, 70, { volume: 0.09 }), 80)
}

export function playDialSound() {
  playTone(520, 120, { volume: 0.12 })
  setTimeout(() => playTone(660, 120, { volume: 0.12 }), 140)
}

export function startRingtone(): Ringer {
  const ctx = getContext()
  if (!ctx || !unlocked) return { stop: () => {} }
  let stopped = false
  const tick = () => {
    if (stopped) return
    playTone(740, 220, { volume: 0.12 })
    setTimeout(() => playTone(988, 180, { volume: 0.10 }), 160)
    setTimeout(() => {
      if (stopped) return
      tick()
    }, 1500)
  }
  tick()
  return {
    stop() {
      stopped = true
    },
  }
}


