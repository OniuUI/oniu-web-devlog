type SeoInput = {
  title: string
  description: string
  path?: string
}

function ensureMetaByName(name: string): HTMLMetaElement {
  const selector = `meta[name="${CSS.escape(name)}"]`
  const existing = document.head.querySelector(selector)
  if (existing instanceof HTMLMetaElement) return existing
  const el = document.createElement('meta')
  el.setAttribute('name', name)
  document.head.appendChild(el)
  return el
}

function ensureMetaByProperty(property: string): HTMLMetaElement {
  const selector = `meta[property="${CSS.escape(property)}"]`
  const existing = document.head.querySelector(selector)
  if (existing instanceof HTMLMetaElement) return existing
  const el = document.createElement('meta')
  el.setAttribute('property', property)
  document.head.appendChild(el)
  return el
}

function ensureLink(rel: string): HTMLLinkElement {
  const selector = `link[rel="${CSS.escape(rel)}"]`
  const existing = document.head.querySelector(selector)
  if (existing instanceof HTMLLinkElement) return existing
  const el = document.createElement('link')
  el.setAttribute('rel', rel)
  document.head.appendChild(el)
  return el
}

function setJsonLd(id: string, data: unknown) {
  const scriptId = `jsonld-${id}`
  const existing = document.getElementById(scriptId)
  const el = existing instanceof HTMLScriptElement ? existing : document.createElement('script')
  el.type = 'application/ld+json'
  el.id = scriptId
  el.text = JSON.stringify(data)
  if (!existing) document.head.appendChild(el)
}

export function applySeo({ title, description, path }: SeoInput) {
  document.title = title

  ensureMetaByName('description').setAttribute('content', description)
  ensureMetaByName('robots').setAttribute('content', 'index,follow,max-image-preview:large')

  const url = `${window.location.origin}${path ?? window.location.pathname}`
  ensureLink('canonical').setAttribute('href', url)

  ensureMetaByProperty('og:site_name').setAttribute('content', 'ONIU')
  ensureMetaByProperty('og:type').setAttribute('content', 'website')
  ensureMetaByProperty('og:title').setAttribute('content', title)
  ensureMetaByProperty('og:description').setAttribute('content', description)
  ensureMetaByProperty('og:url').setAttribute('content', url)
  ensureMetaByProperty('og:image').setAttribute('content', `${window.location.origin}/favicon.svg`)

  ensureMetaByName('twitter:card').setAttribute('content', 'summary')
  ensureMetaByName('twitter:title').setAttribute('content', title)
  ensureMetaByName('twitter:description').setAttribute('content', description)
  ensureMetaByName('twitter:image').setAttribute('content', `${window.location.origin}/favicon.svg`)
}

export function applyPersonJsonLd(input: {
  name: string
  url: string
  sameAs: string[]
  description: string
  addressLocality?: string
  addressCountry?: string
}) {
  setJsonLd('person', {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: input.name,
    url: input.url,
    sameAs: input.sameAs,
    description: input.description,
    homeLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: input.addressLocality,
        addressCountry: input.addressCountry,
      },
    },
  })
}


