export type PingResult =
  | { ok: true; ms: number }
  | { ok: false; ms: number; error: string }

/**
 * Cross-origin-safe "ping" for static sites.
 * Uses an <img> request (CORS doesn't matter) and measures load/error time.
 */
export function pingUrl(url: string, timeoutMs = 5000): Promise<PingResult> {
  const start = performance.now()

  return new Promise((resolve) => {
    const img = new Image()
    const timer = window.setTimeout(() => {
      cleanup()
      resolve({ ok: false, ms: performance.now() - start, error: 'timeout' })
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
    }

    const done = (ok: boolean, error?: string) => {
      cleanup()
      const ms = performance.now() - start
      resolve(ok ? { ok: true, ms } : { ok: false, ms, error: error ?? 'error' })
    }

    img.onload = () => done(true)
    img.onerror = () => done(false, 'network')

    // Use /favicon.ico if possible; add cache-buster.
    const u = new URL(url)
    const target = new URL('/favicon.ico', u)
    target.searchParams.set('_', String(Date.now()))
    img.src = target.toString()
  })
}


