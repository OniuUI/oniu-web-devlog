import Background from '@/components/Background'
import LogoMark from '@/components/LogoMark'
import { profile } from '@/content/profile'
import { applySeo } from '@/lib/seo'
import { useEffect } from 'react'

type Price = {
  label: string
  amountNok: number
  unit: 'hr' | 'fixed'
  note?: string
}

type Package = {
  title: string
  amountNok: number
  items: string[]
  note?: string
}

const prices: Price[] = [
  { label: 'Development hours', amountNok: 1000, unit: 'hr' },
  { label: 'Tech lead', amountNok: 1500, unit: 'hr' },
  { label: 'ML/AI engineering + custom model development', amountNok: 1200, unit: 'hr' },
  { label: 'Project survey + roadmap', amountNok: 5000, unit: 'fixed' },
]

const packages: Package[] = [
  {
    title: 'Frontend package',
    amountNok: 18000,
    items: ['5 pages', '2 complex features', '3 simple features', 'Documentation'],
    note: 'Overages billed at 1000 NOK/hr.',
  },
]

function formatNok(n: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n)
}

export default function ServicesPage() {
  useEffect(() => {
    applySeo({
      title: `Services | ONIU`,
      description: 'Freelance services: project management, tech lead, frontend, backend, DevOps, and ML/AI engineering.',
      path: '/services',
    })
  }, [])

  return (
    <div className="min-h-svh bg-neutral-950 text-neutral-100">
      <Background />

      <header className="relative mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <nav className="relative z-10 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2">
            <span className="oniu-mark relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 backdrop-blur">
              <span className="relative z-10 grid place-items-center">
                <LogoMark className="h-5 w-5" animated />
              </span>
            </span>
            <span className="text-sm font-semibold tracking-wide">ONIU</span>
          </a>
          <div className="flex items-center gap-3">
            <a
              href="/#projects"
              className="hidden rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-white/10 backdrop-blur hover:bg-white/5 sm:inline-flex"
            >
              Projects
            </a>
            <a
              href={profile.links.linkedin}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-white/10 backdrop-blur hover:bg-white/5"
            >
              LinkedIn
            </a>
            <a
              href={profile.links.email}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-100"
            >
              Contact
            </a>
          </div>
        </nav>

        <div className="relative z-10 pt-10 pb-10 sm:pt-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-neutral-200 ring-1 ring-white/10 backdrop-blur">
            Freelance services
          </div>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Services & pricing</h1>
          <p className="mt-4 max-w-2xl text-pretty text-base text-neutral-300 sm:text-lg">
            Project support across discovery, delivery, and engineering. Clear scope, fast execution, and pragmatic decisions.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#pricing"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-100"
            >
              View pricing
            </a>
            <a
              href="#packages"
              className="rounded-full px-5 py-3 text-sm font-semibold text-neutral-100 ring-1 ring-white/15 hover:bg-white/5"
            >
              Packages
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section id="offer" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <h2 className="text-xl font-semibold">What I can help with</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ServiceCard title="Project management" text="Scope, milestones, stakeholder comms, delivery cadence, and risk management." />
            <ServiceCard title="Tech lead" text="Architecture decisions, reviews, technical direction, and team execution." />
            <ServiceCard title="Frontend development" text="Modern React/TypeScript, UX polish, performance, and maintainable UI systems." />
            <ServiceCard title="Backend development" text="APIs, integrations, data modelling, auth, and reliability." />
            <ServiceCard title="DevOps" text="Deployments, monitoring, CI/CD, and production hardening." />
            <ServiceCard title="ML/AI engineering" text="Prototypes to production: data, evaluation, fine-tuning, and model-backed features." />
          </div>
        </section>

        <section id="pricing" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Rates</h2>
              <p className="mt-2 text-sm text-neutral-300">Transparent pricing, billed in NOK.</p>
            </div>
            <a href={profile.links.email} className="rounded-full px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/5">
              Request availability →
            </a>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {prices.map((p) => (
              <div key={p.label} className="rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
                <div className="text-sm font-semibold text-neutral-100">{p.label}</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-100">
                  {formatNok(p.amountNok)}
                  <span className="ml-2 text-sm font-medium text-neutral-400">{p.unit === 'hr' ? '/ hour' : 'fixed'}</span>
                </div>
                {p.note ? <div className="mt-2 text-sm text-neutral-300">{p.note}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section id="packages" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <h2 className="text-xl font-semibold">Packages</h2>
          <p className="mt-2 text-sm text-neutral-300">Fixed-price delivery for common needs.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {packages.map((p) => (
              <div key={p.title} className="rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-base font-semibold text-neutral-100">{p.title}</div>
                  <div className="text-sm font-semibold text-neutral-100">{formatNok(p.amountNok)}</div>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                  {p.items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-emerald-300/80" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
                {p.note ? <div className="mt-4 text-sm text-neutral-300">{p.note}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <h2 className="text-xl font-semibold">Let’s talk</h2>
          <p className="mt-2 max-w-2xl text-sm text-neutral-300">
            Send a short brief with timeline, constraints, and success criteria. I’ll respond with a quick plan and next steps.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={profile.links.email} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-100">
              Email
            </a>
            <a
              href={profile.links.linkedin}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-5 py-3 text-sm font-semibold text-neutral-100 ring-1 ring-white/15 hover:bg-white/5"
            >
              LinkedIn
            </a>
          </div>
        </section>

        <footer className="mt-10 flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} {profile.name}</div>
          <div className="flex gap-4">
            <a className="hover:text-neutral-200" href="/" rel="noreferrer">
              Home
            </a>
            <a className="hover:text-neutral-200" href="/#publications" rel="noreferrer">
              Devlog
            </a>
          </div>
        </footer>
      </main>
    </div>
  )
}

function ServiceCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
      <div className="text-base font-semibold text-neutral-100">{title}</div>
      <div className="mt-2 text-sm text-neutral-300">{text}</div>
    </div>
  )
}


