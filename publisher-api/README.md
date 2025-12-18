### ONIU Publisher API

Small API intended to be deployed on Fly.io. It accepts your admin “Save” request and uploads `publications.json` to your one.com webroot over SFTP.

#### Run locally

```bash
cd publisher-api
npm install

# required
set ADMIN_PASSWORD=oniu-admin-test
set SFTP_HOST=ssh.c301cl0wu.service.one
set SFTP_USER=c301cl0wu_ssh
set SFTP_PASSWORD=...
set SFTP_REMOTE_DIR=/run/webroots/www

# optional (comma-separated)
set CORS_ORIGINS=https://your-domain.example

npm start
```

#### Deploy on Fly.io (high level)

- Create a Fly app from this folder (`fly launch`) and set secrets:
  - `ADMIN_PASSWORD`
  - `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`
  - `SFTP_REMOTE_DIR` (default `/run/webroots/www`)
  - `CORS_ORIGINS` (your site origin)


