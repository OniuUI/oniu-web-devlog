export type GithubRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  updated_at: string
  pushed_at: string
  archived: boolean
  fork: boolean
}

export async function fetchGithubRepos(username: string, signal?: AbortSignal): Promise<GithubRepo[]> {
  const url = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/repos`)
  url.searchParams.set('per_page', '100')
  url.searchParams.set('sort', 'updated')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/vnd.github+json',
    },
    signal,
  })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as GithubRepo[]
  return data
}

export function pickFeaturedRepos(repos: GithubRepo[], max = 6): GithubRepo[] {
  return repos
    .filter((r) => !r.archived)
    .filter((r) => !r.fork)
    .sort((a, b) => {
      // Prefer stars, then recent activity
      const star = b.stargazers_count - a.stargazers_count
      if (star !== 0) return star
      return +new Date(b.pushed_at) - +new Date(a.pushed_at)
    })
    .slice(0, max)
}


