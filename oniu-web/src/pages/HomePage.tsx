import { Suspense, lazy, useEffect, useState } from 'react'
import { profile } from '@/content/profile'
import Background from '@/components/Background'
import DeploymentsSkeleton from '@/sections/DeploymentsSkeleton'
import PublicationsSkeleton from '@/sections/PublicationsSkeleton'
import ProjectsSkeleton from '@/sections/ProjectsSkeleton'
import LogoMark from '@/components/LogoMark'
import { applyPersonJsonLd, applySeo } from '@/lib/seo'

const ThreeBackground = lazy(() => import('@/components/ThreeBackground'))
const ProjectsSection = lazy(() => import('@/sections/ProjectsSection'))
const PublicationsSection = lazy(() => import('@/sections/PublicationsSection'))
const DeploymentsSection = lazy(() => import('@/sections/DeploymentsSection'))
const ChatWidget = lazy(() => import('@/components/LocalChatWidget'))

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ')
}

function Pill({
  children,
  variant = 'subtle',
}: {
  children: React.ReactNode
  variant?: 'subtle' | 'solid'
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ring-1',
        variant === 'solid'
          ? 'bg-white text-neutral-950 ring-white/20'
          : 'bg-white/5 text-neutral-300 ring-white/10',
      )}
    >
      {children}
    </span>
  )
}

function CardLink({
  href,
  title,
  description,
  meta,
}: {
  href: string
  title: string
  description?: string | null
  meta?: React.ReactNode
}) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noreferrer' : undefined}
      className="group rounded-2xl bg-neutral-950/30 p-5 ring-1 ring-white/10 transition hover:bg-neutral-950/40 hover:ring-white/20"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-200">→</div>
      </div>
      {description ? <div className="mt-2 text-sm text-neutral-300">{description}</div> : null}
      {meta ? <div className="mt-4 text-xs text-neutral-400">{meta}</div> : null}
    </a>
  )
}

export default function HomePage() {
  const [enableFx, setEnableFx] = useState(false)
  const [enableChat, setEnableChat] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setEnableFx(true), 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => setEnableChat(true), 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    applySeo({
      title: `${profile.name} | ONIU`,
      description: profile.tagline,
      path: '/',
    })
    applyPersonJsonLd({
      name: profile.name,
      url: window.location.origin,
      sameAs: [profile.links.github, profile.links.linkedin],
      description: profile.linkedinSummary,
      addressLocality: 'Oslo',
      addressCountry: 'NO',
    })
  }, [])

  return (
    <div className="min-h-svh bg-neutral-950 text-neutral-100">
      <Background />

      <header className="relative mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-[420px] overflow-hidden rounded-3xl sm:h-[520px]">
          <div className="absolute inset-0 opacity-70">
            {enableFx ? (
              <Suspense fallback={null}>
                <ThreeBackground />
              </Suspense>
            ) : null}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/10 via-neutral-950/40 to-neutral-950" />
          <div className="absolute inset-0 ring-1 ring-white/5" />
        </div>

        <nav className="relative z-10 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2">
            <span className="oniu-mark relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10 backdrop-blur">
              <span className="relative z-10 grid place-items-center">
                <LogoMark className="h-5 w-5" animated />
              </span>
            </span>
            <span className="text-sm font-semibold tracking-wide">ONIU</span>
          </a>

          <div className="hidden items-center gap-3 sm:flex">
            <a
              href="#projects"
              className="rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-white/10 backdrop-blur hover:bg-white/5"
            >
              Projects
            </a>
            <a
              href="#publications"
              className="rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-white/10 backdrop-blur hover:bg-white/5"
            >
              Publications
            </a>
            <a
              href="/services"
              className="rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-white/10 backdrop-blur hover:bg-white/5"
            >
              Services
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

          {/* Mobile nav */}
          <details className="relative z-50 sm:hidden">
            <summary className="list-none rounded-full px-4 py-2 text-sm text-neutral-200 ring-1 ring-white/10 backdrop-blur hover:bg-white/5">
              Menu
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl bg-neutral-950/90 ring-1 ring-white/10 backdrop-blur">
              <a className="block px-4 py-3 text-sm hover:bg-white/5" href="#projects">Projects</a>
              <a className="block px-4 py-3 text-sm hover:bg-white/5" href="#publications">Publications</a>
              <a className="block px-4 py-3 text-sm hover:bg-white/5" href="/services">Services</a>
              <a className="block px-4 py-3 text-sm hover:bg-white/5" href={profile.links.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
              <a className="block px-4 py-3 text-sm hover:bg-white/5" href={profile.links.github} target="_blank" rel="noreferrer">GitHub</a>
              <a className="block px-4 py-3 text-sm hover:bg-white/5" href={profile.links.email}>Contact</a>
            </div>
          </details>
        </nav>

        <div className="relative z-10 pt-10 pb-10 sm:pt-16">
          <Pill>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {profile.location}
          </Pill>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:mt-6 sm:text-6xl">{profile.name}</h1>
          <p className="mt-4 max-w-2xl text-pretty text-base text-neutral-300 sm:mt-5 sm:text-lg">{profile.tagline}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#about"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-100"
            >
              About
            </a>
            <a
              href={profile.links.github}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-5 py-3 text-sm font-semibold text-neutral-100 ring-1 ring-white/15 hover:bg-white/5"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section id="about" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">About</h2>
              <p className="mt-2 max-w-2xl text-sm font-medium text-neutral-200">{profile.linkedinSummary}</p>
              <p className="mt-2 max-w-2xl text-sm text-neutral-300">
                This site is a modern static portfolio. Older projects live under{' '}
                <span className="font-medium text-neutral-100">/legacy-apps</span>.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill variant="subtle">TypeScript</Pill>
                <Pill variant="subtle">React</Pill>
                <Pill variant="subtle">Tailwind v4</Pill>
                <Pill variant="subtle">Automation</Pill>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={profile.links.github}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-100"
              >
                GitHub
              </a>
              <a
                href={profile.links.linkedin}
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-100 ring-1 ring-white/15 hover:bg-white/5"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </section>

        <section id="companies" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <h2 className="text-xl font-semibold">Companies</h2>
          <p className="mt-2 text-sm text-neutral-300">Two ventures I’m building.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {profile.companies.map((c) => (
              <div key={c.name} className="rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
                <div className="text-base font-semibold">{c.name}</div>
                <div className="mt-2 text-sm text-neutral-300">{c.description}</div>
              </div>
            ))}
          </div>
        </section>

        <Suspense fallback={<PublicationsSkeleton />}>
          <PublicationsSection />
        </Suspense>

        <Suspense fallback={<DeploymentsSkeleton />}>
          <DeploymentsSection />
        </Suspense>

        <Suspense fallback={<ProjectsSkeleton />}>
          <ProjectsSection />
        </Suspense>

        <section id="legacy" className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold">Legacy apps</h2>
              <p className="mt-2 text-sm text-neutral-300">
                These will be restored under <span className="font-medium text-neutral-100">/legacy-apps</span>.
              </p>
            </div>
            <span className="hidden text-xs text-neutral-400 sm:block">Static hosting-friendly</span>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profile.legacyApps.map((app) => (
              <CardLink key={app.slug} href={`/legacy-apps/${app.slug}/`} title={app.title} description={app.description} />
            ))}
          </div>
        </section>

        <footer className="mt-10 flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} {profile.name}</div>
          <div className="flex gap-4">
            <a className="hover:text-neutral-200" href={profile.links.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="hover:text-neutral-200" href={profile.links.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </footer>
      </main>

      {enableChat ? (
        <Suspense fallback={null}>
          <ChatWidget room="home" />
        </Suspense>
      ) : null}
    </div>
  )
}


