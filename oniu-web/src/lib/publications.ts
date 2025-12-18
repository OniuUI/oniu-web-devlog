export type PublicationMedia =
  | {
      kind: 'image'
      title?: string
      src: string // can be a URL path (e.g. /media/x.jpg) or a data URL
    }
  | {
      kind: 'video'
      title?: string
      src: string // URL path or data URL
      poster?: string
    }
  | {
      kind: 'file'
      title?: string
      href: string
    }

export type Publication = {
  id: string
  title: string
  date: string // ISO
  body: string
  media: PublicationMedia[]
}

export type PublicationsFile = {
  publications: Publication[]
}

export async function fetchPublications(signal?: AbortSignal): Promise<PublicationsFile> {
  const res = await fetch('/publications.json', { cache: 'no-store', signal })
  if (!res.ok) throw new Error(`Failed to load publications.json (${res.status})`)
  return (await res.json()) as PublicationsFile
}

export function sortPublicationsNewestFirst(items: Publication[]): Publication[] {
  return items
    .slice()
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
}


