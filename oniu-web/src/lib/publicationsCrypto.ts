export type EncryptedPublicationsFile = {
  v: 1
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    saltB64: string
  }
  cipher: {
    name: 'AES-GCM'
    ivB64: string
  }
  ciphertextB64: string
}

export type Publication = {
  id: string
  title: string
  date: string // ISO
  bodyMarkdown: string
}

export type PublicationsPayload = {
  publications: Publication[]
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

export async function decryptPublications(
  file: EncryptedPublicationsFile,
  password: string,
): Promise<PublicationsPayload> {
  if (file.v !== 1) throw new Error('Unsupported publications file version')
  const salt = b64ToBytes(file.kdf.saltB64)
  const iv = b64ToBytes(file.cipher.ivB64)
  const ciphertext = b64ToBytes(file.ciphertextB64)
  const key = await deriveKey(password, salt, file.kdf.iterations)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const text = new TextDecoder().decode(plaintext)
  return JSON.parse(text) as PublicationsPayload
}


