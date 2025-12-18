import { useEffect, useState } from 'react'
import { profile } from '@/content/profile'
import { pingUrl, type PingResult } from '@/lib/status'

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ')
}

function StatusBadge({ result }: { result: PingResult | null }) {
  if (!result) return <span className="inline-flex items-center gap-2 text-xs text-neutral-400">Checking…</span>
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className={cx('h-2 w-2 rounded-full', result.ok ? 'bg-emerald-400' : 'bg-rose-400')} />
      <span className={result.ok ? 'text-neutral-200' : 'text-neutral-300'}>{result.ok ? 'Online' : 'Offline'}</span>
      <span className="text-neutral-500">{Math.round(result.ms)}ms</span>
    </span>
  )
}

export default function DeploymentsSection() {
  const [flyStatus, setFlyStatus] = useState<Record<string, PingResult | null>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, PingResult | null> = {}
      for (const d of profile.flyDeployments) next[d.url] = null
      setFlyStatus(next)

      for (const d of profile.flyDeployments) {
        const res = await pingUrl(d.url, 6000)
        if (cancelled) return
        setFlyStatus((prev) => ({ ...prev, [d.url]: res }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="deployments" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold">Deployments</h2>
          <p className="mt-2 text-sm text-neutral-300">Live status checks for Fly.io deployments.</p>
        </div>
        <span className="hidden text-xs text-neutral-400 sm:block">Live</span>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {profile.flyDeployments.map((d) => (
          <a
            key={d.url}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-neutral-950/30 p-5 ring-1 ring-white/10 transition hover:bg-neutral-950/40 hover:ring-white/20"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-semibold">{d.name}</div>
              <StatusBadge result={flyStatus[d.url] ?? null} />
            </div>
            <div className="mt-2 truncate text-xs text-neutral-400">{d.url}</div>
          </a>
        ))}
      </div>
    </section>
  )
}


