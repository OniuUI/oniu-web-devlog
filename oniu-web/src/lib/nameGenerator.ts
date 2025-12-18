function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  const c = globalThis.crypto
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    c.getRandomValues(buf)
    return Number(buf[0]! % maxExclusive)
  }
  return Math.floor(Math.random() * maxExclusive)
}

const adjectives = [
  'Brisk',
  'Calm',
  'Clever',
  'Cosmic',
  'Cozy',
  'Curious',
  'Dapper',
  'Electric',
  'Gentle',
  'Golden',
  'Mellow',
  'Neon',
  'Nimble',
  'Quiet',
  'Sunny',
  'Velvet',
  'Wild',
  'Witty',
]

const creatures = [
  'Otter',
  'Fox',
  'Raven',
  'Lynx',
  'Panda',
  'Koala',
  'Tiger',
  'Falcon',
  'Dolphin',
  'Badger',
  'Hedgehog',
  'Capybara',
  'Chameleon',
  'Kestrel',
  'Octopus',
  'Seahorse',
]

export function generateChatName(): string {
  const a = adjectives[randomInt(adjectives.length)] ?? 'Curious'
  const c = creatures[randomInt(creatures.length)] ?? 'Otter'
  const n = String(100 + randomInt(900))
  return `${a} ${c} ${n}`
}


