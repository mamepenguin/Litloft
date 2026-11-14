#!/usr/bin/env python3
"""Run this worktree's stack on its own copy of the main checkout's data.

A worktree symlinks the main checkout's data/, drives.json and passwords.json
(.cmux/setup), so two stacks would write one SQLite DB. `clone` makes an APFS
copy-on-write clone of them under .r5-stack/ and a compose overlay that mounts
the clone in their place; the symlinks are left alone.

    python3 scripts/dev/r5_stack.py clone [--port N] [--with-drives]
    python3 scripts/dev/r5_stack.py up [SERVICE...]
    python3 scripts/dev/r5_stack.py compose ARGS...
    python3 scripts/dev/r5_stack.py down
    python3 scripts/dev/r5_stack.py destroy
    python3 scripts/dev/r5_stack.py url

The stack writes only under .r5-stack/: every other writable bind is mounted
read-only, drives included, so anything that writes a drive (upload, move,
rename, purge) fails. --with-drives clones the drives too, for a run that has
to write them.

Open the stack at the URL `up` prints (<worktree>.localhost:<port>), not at
localhost: cookies are scoped by host and not by port, so two stacks opened
under localhost share their login and viewer cookies.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import shutil
import socket
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

STATE_DIR = ".r5-stack"
SQLITE_MAGIC = b"SQLite format 3\x00"
PORT_RANGE = range(3101, 3200)


class Abort(Exception):
    pass


@dataclass(frozen=True)
class Paths:
    worktree: Path
    main: Path
    state: Path

    @property
    def main_data(self) -> Path:
        return (self.main / "data").resolve()

    @property
    def overlay(self) -> Path:
        return self.state / "compose.yml"

    @property
    def env_file(self) -> Path:
        return self.state / "env.json"


def git(*args: str, cwd: Path) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def locate(cwd: Path) -> Paths:
    worktree = Path(git("rev-parse", "--show-toplevel", cwd=cwd)).resolve()
    common = Path(git("rev-parse", "--git-common-dir", cwd=worktree))
    if not common.is_absolute():
        common = worktree / common
    main = common.resolve().parent
    if main == worktree:
        raise Abort("run this in a linked worktree, not in the main checkout")
    return Paths(worktree=worktree, main=main, state=worktree / STATE_DIR)


def is_under(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def base_compose_files(paths: Paths) -> list[str]:
    names = ["docker-compose.yml", "docker-compose.override.yml"]
    return [str(paths.worktree / n) for n in names if (paths.worktree / n).exists()]


def compose_env(files: list[str], port: int | None) -> dict[str, str]:
    env = dict(os.environ, COMPOSE_FILE=os.pathsep.join(files))
    if port is not None:
        env["LITLOFT_PORT"] = str(port)
    return env


def compose_config(paths: Paths, files: list[str]) -> dict:
    out = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=paths.worktree,
        env=compose_env(files, None),
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(out)


def binds(config: dict):
    for name, service in config.get("services", {}).items():
        for vol in service.get("volumes", []) or []:
            if vol.get("type") == "bind":
                yield name, vol


# --- cloning ---------------------------------------------------------------


def clone_tree(src: Path, dst: Path) -> None:
    if os.stat(src).st_dev != os.stat(dst.parent).st_dev:
        # cp -c falls back to a full copy across volumes without saying so.
        raise Abort(f"{src} is on another volume than {dst.parent}; no clone possible")
    subprocess.run(["cp", "-c", "-R", str(src), str(dst)], check=True)


def sqlite_files(root: Path) -> list[Path]:
    found = []
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if name.endswith(("-wal", "-shm", "-journal")):
                continue
            path = Path(dirpath) / name
            try:
                with open(path, "rb") as fh:
                    if fh.read(16) == SQLITE_MAGIC:
                        found.append(path)
            except OSError:
                continue
    return found


@dataclass(frozen=True)
class Mount:
    container: str
    source: Path
    destination: str
    rw: bool


def running_mounts() -> list[Mount]:
    ids = subprocess.run(
        ["docker", "ps", "-q"], check=True, capture_output=True, text=True
    ).stdout.split()
    if not ids:
        return []
    info = json.loads(
        subprocess.run(
            ["docker", "inspect", *ids], check=True, capture_output=True, text=True
        ).stdout
    )
    mounts = []
    for c in info:
        for m in c.get("Mounts", []):
            if m.get("Type") == "bind":
                mounts.append(
                    Mount(c["Name"].lstrip("/"), Path(m["Source"]).resolve(),
                          m["Destination"], bool(m.get("RW")))
                )
    return mounts


_BACKUP = (
    "import sqlite3, sys\n"
    "src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])\n"
    "src.backup(dst); dst.close(); src.close()\n"
)


def snapshot_live_db(db: Path, rel: Path, main_data: Path, mounts: list[Mount]) -> None:
    """Replace a cloned DB with a backup taken inside a container that has it open.

    The host never opens a DB a container is writing: Docker Desktop does not
    share the WAL index (-shm) across the VM boundary, so a host reader can see
    an inconsistent DB and a host checkpoint can lose rows.
    """
    target = main_data / rel
    candidates = sorted(
        (m for m in mounts if is_under(target, m.source)), key=lambda m: not m.rw
    )
    if not candidates:
        return
    m = candidates[0]
    inner = m.destination.rstrip("/") + "/" + target.relative_to(m.source).as_posix()
    tmp = "/tmp/r5-stack-snapshot.db"
    run = lambda *a: subprocess.run(a, check=True, capture_output=True, text=True)
    try:
        run("docker", "exec", m.container, "python3", "-c", _BACKUP, inner, tmp)
        run("docker", "cp", f"{m.container}:{tmp}", str(db))
    except subprocess.CalledProcessError as e:
        raise Abort(f"could not snapshot {rel} in {m.container}: {e.stderr.strip()}")
    finally:
        subprocess.run(["docker", "exec", m.container, "rm", "-f", tmp],
                       capture_output=True)
    for suffix in ("-wal", "-shm"):
        Path(f"{db}{suffix}").unlink(missing_ok=True)


def clone_data(paths: Paths) -> None:
    dst = paths.state / "data"
    clone_tree(paths.main_data, dst)
    mounts = [m for m in running_mounts()
              if is_under(m.source, paths.main_data) or is_under(paths.main_data, m.source)]
    if not mounts:
        return
    users = sorted({m.container for m in mounts})
    print(f"data/ is open in {', '.join(users)}; snapshotting its databases there")
    for db in sqlite_files(dst):
        snapshot_live_db(db, db.relative_to(dst), paths.main_data, mounts)


# --- overlay ---------------------------------------------------------------


def drive_targets(paths: Paths) -> set[str]:
    drives = json.loads((paths.worktree / "drives.json").read_text())
    return {posixpath.normpath(d["path"]) for d in drives if "path" in d}


def drive_sources(paths: Paths, config: dict) -> list[Path]:
    """Host sources of the backend binds that hold a drive, outermost only."""
    targets = drive_targets(paths)
    backend = config["services"].get("backend", {})
    sources = set()
    for vol in backend.get("volumes", []) or []:
        if vol.get("type") != "bind":
            continue
        target = posixpath.normpath(vol["target"])
        if any(t == target or t.startswith(target.rstrip("/") + "/") for t in targets):
            src = Path(vol["source"]).resolve()
            if not is_under(src, paths.main_data):
                sources.add(src)
    return sorted(s for s in sources if not any(o != s and is_under(s, o) for o in sources))


def plan_overlay(paths: Paths, config: dict, with_drives: bool) -> dict:
    """Clone what the stack writes and return the overlay that mounts the clones.

    Every other writable bind becomes read-only, drives included: the clone's DB
    is a snapshot, so its trash purge and any file operation would act on files
    the main checkout may have restored or moved since.
    """
    state = paths.state
    drive_clones: dict[Path, Path] = {}
    if with_drives:
        for i, src in enumerate(drive_sources(paths, config)):
            dst = state / "drives" / f"{i}-{src.name}"
            dst.parent.mkdir(parents=True, exist_ok=True)
            clone_tree(src, dst)
            drive_clones[src] = dst

    files_dir = state / "files"
    overlay: dict[str, list] = {}
    for name, vol in binds(config):
        src = Path(vol["source"]).resolve()
        read_only = bool(vol.get("read_only"))
        drive = next((d for d in drive_clones if is_under(src, d)), None)
        new = None
        if is_under(src, paths.main_data):
            new = state / "data" / src.relative_to(paths.main_data)
        elif drive is not None:
            new = drive_clones[drive] / src.relative_to(drive)
        elif read_only:
            pass
        elif src.is_file() and is_under(src, paths.main):
            files_dir.mkdir(parents=True, exist_ok=True)
            new = files_dir / src.name
            if not new.exists():
                shutil.copy2(src, new)
        else:
            new, read_only = src, True
        if new is not None:
            entry = {"type": "bind", "source": str(new), "target": vol["target"]}
            if read_only:
                entry["read_only"] = True
            overlay.setdefault(name, []).append(entry)
    return {"services": {n: {"volumes": v} for n, v in overlay.items()}}


def shared_writes(paths: Paths, config: dict) -> list[str]:
    """Bind mounts through which the stack could write outside .r5-stack/."""
    problems = []
    for name, vol in binds(config):
        src = Path(vol["source"]).resolve()
        if is_under(src, paths.state):
            continue
        if is_under(src, paths.main_data) or not vol.get("read_only"):
            problems.append(f"{name}: {src} -> {vol['target']}")
    return problems


# --- state -----------------------------------------------------------------


def load_state(paths: Paths) -> dict:
    if not paths.env_file.is_file():
        raise Abort("no clone in this worktree; run `clone` first")
    return json.loads(paths.env_file.read_text())


def free_port() -> int:
    for port in PORT_RANGE:
        with socket.socket() as s:
            try:
                s.bind(("0.0.0.0", port))
            except OSError:
                continue
            return port
    raise Abort("no free port in 3101-3199; pass --port")


def stack_url(paths: Paths, port: int) -> str:
    host = re.sub(r"[^a-z0-9-]+", "-", paths.worktree.name.lower()).strip("-")
    return f"http://{host}.localhost:{port}"


def verified_env(paths: Paths, state: dict) -> dict[str, str]:
    files = [*state["base_files"], str(paths.overlay)]
    problems = shared_writes(paths, compose_config(paths, files))
    if problems:
        raise Abort("the stack could still write outside .r5-stack/:\n  "
                    + "\n  ".join(problems))
    return compose_env(files, state["port"])


# --- commands --------------------------------------------------------------


def cmd_clone(paths: Paths, args) -> None:
    if paths.state.exists():
        raise Abort(f"{paths.state} exists; run `destroy` first")
    if not paths.main_data.is_dir():
        raise Abort(f"{paths.main_data} does not exist")
    files = base_compose_files(paths)
    config = compose_config(paths, files)
    port = args.port or free_port()
    paths.state.mkdir()
    try:
        clone_data(paths)
        overlay = plan_overlay(paths, config, args.with_drives)
        paths.overlay.write_text(json.dumps(overlay, indent=2) + "\n")
        state = {"port": port, "with_drives": args.with_drives, "base_files": files}
        paths.env_file.write_text(json.dumps(state, indent=2) + "\n")
        verified_env(paths, state)
    except BaseException:
        shutil.rmtree(paths.state)
        raise
    print(f"cloned into {paths.state}; start it with `up`, then open {stack_url(paths, port)}")


NON_STARTING = {"down", "stop", "kill", "rm", "ps", "logs"}


def compose(paths: Paths, *args: str) -> int:
    if args and args[0] in NON_STARTING:
        state = load_state(paths)
        env = compose_env([*state["base_files"], str(paths.overlay)], state["port"])
    else:
        env = verified_env(paths, load_state(paths))
    return run_compose(paths, env, *args)


def stop(paths: Paths) -> int:
    return compose(paths, "down")


def run_compose(paths: Paths, env: dict[str, str], *args: str) -> int:
    return subprocess.run(["docker", "compose", *args], cwd=paths.worktree, env=env).returncode


def cmd_up(paths: Paths, args) -> None:
    rc = compose(paths, "up", "-d", "--build", *args.services)
    if rc:
        raise Abort(f"docker compose up failed ({rc})")
    print(stack_url(paths, load_state(paths)["port"]))


def cmd_destroy(paths: Paths, _args) -> None:
    load_state(paths)
    if paths.state.is_symlink() or paths.state.parent != paths.worktree:
        raise Abort(f"refusing to delete {paths.state}")
    rc = stop(paths)
    if rc:
        raise Abort("docker compose down failed; the clone is kept")
    shutil.rmtree(paths.state)
    print(f"removed {paths.state}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("clone")
    p.add_argument("--port", type=int)
    p.add_argument("--with-drives", action="store_true")
    sub.add_parser("up").add_argument("services", nargs="*")
    sub.add_parser("compose").add_argument("rest", nargs=argparse.REMAINDER)
    sub.add_parser("down")
    sub.add_parser("destroy")
    sub.add_parser("url")
    args = parser.parse_args(argv)

    try:
        paths = locate(Path.cwd())
        if args.cmd == "clone":
            cmd_clone(paths, args)
        elif args.cmd == "up":
            cmd_up(paths, args)
        elif args.cmd == "compose":
            return compose(paths, *args.rest)
        elif args.cmd == "down":
            return stop(paths)
        elif args.cmd == "destroy":
            cmd_destroy(paths, args)
        elif args.cmd == "url":
            print(stack_url(paths, load_state(paths)["port"]))
    except Abort as e:
        print(f"r5-stack: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
