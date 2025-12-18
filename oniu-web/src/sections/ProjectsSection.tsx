import { useEffect, useMemo, useState } from 'react'
import { profile } from '@/content/profile'
import { fetchGithubRepos, pickFeaturedRepos, type GithubRepo } from '@/lib/github'

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

export default function ProjectsSection() {
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [reposError, setReposError] = useState<string | null>(null)
  const featured = useMemo(() => (repos ? pickFeaturedRepos(repos, 6) : null), [repos])

  useEffect(() => {
    const ac = new AbortController()
    fetchGithubRepos(profile.handle, ac.signal)
      .then((r) => {
        setRepos(r)
        setReposError(null)
      })
      .catch((e: unknown) => {
        setRepos(null)
        setReposError(e instanceof Error ? e.message : 'Failed to load GitHub repos')
      })
    return () => ac.abort()
  }, [])

  return (
    <section id="projects" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="mt-2 text-sm text-neutral-300">From GitHub @{profile.handle}.</p>
        </div>
        <a href={profile.links.github} target="_blank" rel="noreferrer" className="text-xs text-neutral-300 hover:text-white">
          View all →
        </a>
      </div>

      <div className="mt-8">
        {reposError ? (
          <div className="rounded-2xl bg-neutral-950/30 p-5 text-sm text-neutral-300 ring-1 ring-white/10">
            Couldn’t load GitHub repos: <span className="text-neutral-400">{reposError}</span>
          </div>
        ) : null}

        {!featured ? (
          <div className="rounded-2xl bg-neutral-950/30 p-5 text-sm text-neutral-400 ring-1 ring-white/10">
            Loading…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((r) => (
              <CardLink
                key={r.id}
                href={r.html_url}
                title={r.name}
                description={r.description}
                meta={
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>★ {r.stargazers_count}</span>
                    <span>⑂ {r.forks_count}</span>
                    {r.language ? <span>{r.language}</span> : null}
                    <span className="text-neutral-500">Updated {new Date(r.pushed_at).toLocaleDateString()}</span>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}


