import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import SftpClient from "ssh2-sftp-client"

const env = (k, def) => {
  const v = process.env[k] ?? def
  if (v === undefined || v === "") throw new Error(`Missing env var: ${k}`)
  return v
}

const app = express()
app.set("trust proxy", 1)

app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(morgan("combined"))
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin, and allow configured admin origin(s)
      const allowed = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
      if (!origin) return cb(null, true)
      if (allowed.length === 0) return cb(null, true)
      return cb(null, allowed.includes(origin))
    },
    credentials: false,
  }),
)

app.use(express.json({ limit: "10mb" })) // keep small; media should be URLs ideally

app.get("/healthz", (_req, res) => res.json({ ok: true }))

app.post("/publish", async (req, res) => {
  try {
    const password = env("ADMIN_PASSWORD")
    const auth = String(req.headers.authorization ?? "")
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing_auth" })
    }
    const token = auth.slice("Bearer ".length)
    if (token !== password) {
      return res.status(403).json({ error: "bad_auth" })
    }

    const { publications } = req.body ?? {}
    if (!Array.isArray(publications)) {
      return res.status(400).json({ error: "invalid_payload" })
    }

    const json = JSON.stringify({ publications }, null, 2) + "\n"

    const sftp = new SftpClient()
    await sftp.connect({
      host: env("SFTP_HOST"),
      port: Number(process.env.SFTP_PORT ?? "22"),
      username: env("SFTP_USER"),
      password: env("SFTP_PASSWORD"),
      readyTimeout: 20000,
    })

    const remoteDir = process.env.SFTP_REMOTE_DIR ?? "/run/webroots/www"
    const remotePath = `${remoteDir.replace(/\/$/, "")}/publications.json`
    const tmpPath = `${remotePath}.tmp`
    const bakPath = `${remotePath}.bak`

    // Best-effort backup existing
    try {
      await sftp.rename(remotePath, bakPath)
    } catch {
      // ignore
    }

    await sftp.put(Buffer.from(json, "utf8"), tmpPath)
    await sftp.rename(tmpPath, remotePath)

    await sftp.end()

    return res.json({ ok: true, remotePath })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "server_error" })
  }
})

const port = Number(process.env.PORT ?? "8080")
app.listen(port, () => {
  console.log(`publisher-api listening on :${port}`)
})


