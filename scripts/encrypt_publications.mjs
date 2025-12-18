import { readFileSync, writeFileSync } from "node:fs"
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto"
import process from "node:process"

// Usage:
//   node scripts/encrypt_publications.mjs publications.json oniu-web/public/publications.enc.json
// Password:
//   set PUBLICATIONS_PASSWORD in env (recommended)
//   or pass --password "..." (less safe)

const [, , inPath, outPath, ...rest] = process.argv
if (!inPath || !outPath) {
  console.error("Usage: node scripts/encrypt_publications.mjs <in.json> <out.enc.json> [--password <pw>]")
  process.exit(2)
}

let password = process.env.PUBLICATIONS_PASSWORD || ""
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--password") password = rest[i + 1] || ""
}
if (!password) {
  console.error("Missing password. Set PUBLICATIONS_PASSWORD env var (recommended).")
  process.exit(2)
}

const plaintext = readFileSync(inPath)
const salt = randomBytes(16)
const iv = randomBytes(12) // recommended for GCM
const iterations = 210000
const key = pbkdf2Sync(password, salt, iterations, 32, "sha256")

const cipher = createCipheriv("aes-256-gcm", key, iv)
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
const tag = cipher.getAuthTag()

// Store tag appended to ciphertext so the browser can decrypt (WebCrypto expects tag included at end)
const combined = Buffer.concat([ciphertext, tag])

const out = {
  v: 1,
  kdf: { name: "PBKDF2", hash: "SHA-256", iterations, saltB64: salt.toString("base64") },
  cipher: { name: "AES-GCM", ivB64: iv.toString("base64") },
  ciphertextB64: combined.toString("base64"),
}

writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n")
console.log(`Wrote encrypted publications to: ${outPath}`)


