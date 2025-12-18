import os
import posixpath
import stat
import sys
from pathlib import Path

import paramiko


def env(name: str, default: str | None = None) -> str:
    v = os.environ.get(name, default)
    if v is None or v == "":
        raise SystemExit(f"Missing required env var: {name}")
    return v


def is_dir(sftp: paramiko.SFTPClient, remote_path: str) -> bool:
    try:
        return stat.S_ISDIR(sftp.stat(remote_path).st_mode)
    except OSError:
        return False


def ensure_dir(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    # Create remote directories recursively (POSIX paths)
    parts = [p for p in remote_path.split("/") if p]
    cur = "/" if remote_path.startswith("/") else ""
    for p in parts:
        cur = posixpath.join(cur, p) if cur else p
        if not is_dir(sftp, cur):
            try:
                sftp.mkdir(cur)
            except OSError:
                # Might have been created concurrently or not permitted; re-check.
                if not is_dir(sftp, cur):
                    raise


def upload_dir(sftp: paramiko.SFTPClient, local_dir: Path, remote_dir: str) -> int:
    ensure_dir(sftp, remote_dir)
    uploaded = 0

    for path in local_dir.rglob("*"):
        rel = path.relative_to(local_dir)
        # Always use POSIX separators remotely
        remote_path = remote_dir.rstrip("/") + "/" + "/".join(rel.parts)

        if path.is_dir():
            ensure_dir(sftp, remote_path)
            continue

        ensure_dir(sftp, posixpath.dirname(remote_path))
        sftp.put(str(path), remote_path)
        uploaded += 1

    return uploaded


def resolve_webroot(sftp: paramiko.SFTPClient) -> str:
    # Prefer the symlink at SFTP root if it exists.
    try:
        target = sftp.readlink("webroots")
        if target:
            return target
    except OSError:
        pass
    # Fallback to previously observed default.
    return "/run/webroots"


def main() -> None:
    host = env("SFTP_HOST")
    username = env("SFTP_USER")
    password = env("SFTP_PASSWORD")
    port = int(os.environ.get("SFTP_PORT", "22"))

    local_dist = Path(env("LOCAL_DIST", str(Path("oniu-web") / "dist"))).resolve()
    if not local_dist.exists() or not local_dist.is_dir():
        raise SystemExit(f"Local dist directory not found: {local_dist}")

    transport = paramiko.Transport((host, port))
    transport.connect(username=username, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)

    root = resolve_webroot(sftp)
    candidates = [
        os.environ.get("REMOTE_WEBROOT"),
        posixpath.join(root, "www"),
        root,
    ]
    remote_target = next((c for c in candidates if c and is_dir(sftp, c)), None)
    if not remote_target:
        # Last resort: create /run/webroots/www
        remote_target = posixpath.join(root, "www")
        ensure_dir(sftp, remote_target)

    print(f"Local dist:   {local_dist}")
    print(f"Remote root:  {root}")
    print(f"Deploy to:    {remote_target}")

    uploaded = upload_dir(sftp, local_dist, remote_target)
    print(f"Uploaded {uploaded} files.")

    # quick verification listing
    try:
        names = sftp.listdir(remote_target)
        print("Remote contains (top-level):")
        for n in sorted(names)[:50]:
            print(f"  {n}")
        if len(names) > 50:
            print(f"  ... ({len(names) - 50} more)")
    except OSError as e:
        print(f"[warn] could not list remote target: {e}")

    sftp.close()
    transport.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        raise SystemExit(130)


