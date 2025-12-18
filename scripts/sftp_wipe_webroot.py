import os
import stat
import sys
from typing import Iterable

import paramiko


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def sftp_is_dir(sftp: paramiko.SFTPClient, path: str) -> bool:
    try:
        return stat.S_ISDIR(sftp.stat(path).st_mode)
    except IOError:
        return False


def sftp_listdir_safe(sftp: paramiko.SFTPClient, path: str) -> Iterable[str]:
    try:
        return sftp.listdir(path)
    except IOError as e:
        print(f"[warn] cannot list {path}: {e}")
        return []


def rm_rf(sftp: paramiko.SFTPClient, path: str) -> None:
    # Try file unlink first; if it's a directory, recurse.
    try:
        mode = sftp.lstat(path).st_mode
    except IOError as e:
        print(f"[skip] missing: {path} ({e})")
        return

    # Never traverse symlinks: delete the link itself.
    if stat.S_ISLNK(mode):
        print(f"[symlink] {path}")
        try:
            print(f"[unlink symlink] {path}")
            sftp.remove(path)
        except PermissionError as e:
            # Some environments forbid unlinking symlinks. Best-effort fallback:
            # wipe the symlink target's contents (without deleting the link).
            try:
                target = sftp.readlink(path)
                print(f"[warn] cannot unlink symlink; wiping target instead: {path} -> {target} ({e})")
                # If the target is relative, interpret it relative to the symlink's parent.
                if not target.startswith("/"):
                    parent = path.rsplit("/", 1)[0]
                    target = f"{parent}/{target}"
                # Only allow wiping targets under /run/webroots (guard rail).
                if not target.startswith("/run/webroots"):
                    print(f"[skip] symlink target outside /run/webroots: {target}")
                    return
                if sftp_is_dir(sftp, target):
                    for name in sftp_listdir_safe(sftp, target):
                        rm_rf(sftp, f"{target.rstrip('/')}/{name}")
                else:
                    try:
                        sftp.remove(target)
                    except Exception as e2:
                        print(f"[skip] cannot remove symlink target file {target}: {e2}")
            except Exception as e2:
                print(f"[skip] cannot handle symlink {path}: {e2}")
        return

    if stat.S_ISDIR(mode):
        for name in sftp_listdir_safe(sftp, path):
            rm_rf(sftp, f"{path.rstrip('/')}/{name}")
        print(f"[rmdir] {path}")
        sftp.rmdir(path)
        return

    print(f"[unlink file] {path}")
    sftp.remove(path)


def main() -> None:
    host = env("SFTP_HOST")
    username = env("SFTP_USER")
    password = env("SFTP_PASSWORD")
    port = int(os.environ.get("SFTP_PORT", "22"))

    # This is the actual webroot we discovered earlier via readlink('webroots')
    webroot = os.environ.get("SFTP_WEBROOT", "/run/webroots")

    # Guard rails: refuse dangerous targets.
    forbidden = {"/", "", ".", "..", "/run", "/home", "/root"}
    if webroot in forbidden or len(webroot) < 5:
        raise SystemExit(f"Refusing to wipe suspicious webroot: {webroot!r}")
    if not webroot.startswith("/"):
        raise SystemExit(f"Webroot must be an absolute path, got: {webroot!r}")

    transport = paramiko.Transport((host, port))
    transport.connect(username=username, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)

    print(f"Wiping contents of: {webroot}")
    if not sftp_is_dir(sftp, webroot):
        raise SystemExit(f"Remote webroot is not a directory: {webroot}")

    # Delete children, not the webroot folder itself.
    for name in sftp_listdir_safe(sftp, webroot):
        rm_rf(sftp, f"{webroot.rstrip('/')}/{name}")

    sftp.close()
    transport.close()
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        raise SystemExit(130)


