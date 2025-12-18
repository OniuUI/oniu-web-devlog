import { useEffect, useState } from 'react'
import { fetchPublications, sortPublicationsNewestFirst, type Publication } from '@/lib/publications'

function PublicationCard({ post }: { post: Publication }) {
  return (
    <article className="rounded-2xl bg-neutral-950/30 p-6 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{post.title}</h3>
        <div className="text-xs text-neutral-400">{new Date(post.date).toLocaleDateString()}</div>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-300">{post.body}</div>
      {post.media?.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {post.media.map((m, idx) => {
            if (m.kind === 'image') {
              return (
                <a key={idx} href={m.src} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={m.src}
                    alt={m.title ?? ''}
                    className="aspect-video w-full rounded-xl object-cover ring-1 ring-white/10"
                    loading="lazy"
                  />
                </a>
              )
            }
            if (m.kind === 'video') {
              return (
                <video
                  key={idx}
                  controls
                  className="aspect-video w-full rounded-xl ring-1 ring-white/10"
                  src={m.src}
                  poster={m.poster}
                />
              )
            }
            return (
              <a
                key={idx}
                href={m.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-white/5 px-4 py-3 text-sm text-neutral-200 ring-1 ring-white/10 hover:bg-white/10"
              >
                {m.title ?? 'Download file'}
              </a>
            )
          })}
        </div>
      ) : null}
    </article>
  )
}

export default function PublicationsSection() {
  const [posts, setPosts] = useState<Publication[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetchPublications(ac.signal)
      .then((f) => {
        setPosts(sortPublicationsNewestFirst(f.publications))
        setPostsError(null)
      })
      .catch((e: unknown) => {
        setPosts(null)
        setPostsError(e instanceof Error ? e.message : 'Failed to load publications')
      })
    return () => ac.abort()
  }, [])

  return (
    <section id="publications" className="mb-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur sm:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Publications</h2>
          <p className="mt-2 text-sm text-neutral-300">
            A devlog where I publish updates on what I’m building, exploring, and shipping.
          </p>
        </div>
        <a href="/admin/" className="rounded-full px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/5">
          Admin →
        </a>
      </div>

      <div className="mt-6 grid gap-4">
        {postsError ? (
          <div className="rounded-2xl bg-neutral-950/30 p-5 text-sm text-neutral-300 ring-1 ring-white/10">
            Couldn’t load publications: <span className="text-neutral-400">{postsError}</span>
          </div>
        ) : null}
        {!posts ? (
          <div className="rounded-2xl bg-neutral-950/30 p-5 text-sm text-neutral-400 ring-1 ring-white/10">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl bg-neutral-950/30 p-5 text-sm text-neutral-400 ring-1 ring-white/10">
            No publications yet.
          </div>
        ) : (
          posts.slice(0, 6).map((p) => <PublicationCard key={p.id} post={p} />)
        )}
      </div>
    </section>
  )
}


