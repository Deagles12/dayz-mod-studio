#!/usr/bin/env python3
"""Locate and invoke the DayZ Mod Studio backend, with JSONL parsing.

This is a convenience wrapper for agents. The backend remains the source of
truth. It never modifies project files; it only discovers executables and runs
the CLI with explicit global flags.

Examples:
  python studio.py find --json
  python studio.py run --project "D:/Mods/MyMod" -- status --json
  python studio.py run --project "D:/Mods/MyMod" --quick -- update
  python studio.py help
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

EXE_NAMES = ("dayz-backend.exe", "dayz-backend", "dayz-mod-studio.exe")
BACKEND_NAMES = ("dayz-backend.exe", "dayz-backend")
SKIP_DIRS = {
    "$recycle.bin", "system volume information", "windows", "winsxs",
    "node_modules", ".git", "__pycache__", ".venv", "venv", "appdata",
}


def is_file(path: Path) -> bool:
    try:
        return path.is_file()
    except OSError:
        return False


def add_candidate(found: list[Path], path: Path | None) -> None:
    if not path:
        return
    try:
        path = path.expanduser().resolve()
    except OSError:
        return
    names = EXE_NAMES + ("sidecar.py",)
    if is_file(path) and path.name.lower() in names and path not in found:
        found.append(path)


def direct_candidates() -> list[Path]:
    result: list[Path] = []
    home = Path.home()
    env = os.environ
    for key in ("DAYZ_BACKEND", "DAYZ_MOD_STUDIO_BACKEND", "DAYZ_MOD_STUDIO_EXE"):
        value = env.get(key, "").strip()
        if value:
            add_candidate(result, Path(value))
    for key in ("DAYZ_MOD_STUDIO_DIR", "DAYZ_MOD_STUDIO_HOME"):
        value = env.get(key, "").strip()
        if value:
            base = Path(value)
            for name in EXE_NAMES:
                add_candidate(result, base / name)

    for name in EXE_NAMES:
        where = shutil.which(name)
        if where:
            add_candidate(result, Path(where))

    bases = [
        Path.cwd(),
        home / "Desktop",
        home / "Downloads",
        home / "Documents",
        env.get("LOCALAPPDATA", "") and Path(env["LOCALAPPDATA"]) / "Programs",
        env.get("LOCALAPPDATA", "") and Path(env["LOCALAPPDATA"]),
        env.get("PROGRAMFILES", "") and Path(env["PROGRAMFILES"]),
        env.get("PROGRAMFILES(X86)", "") and Path(env["PROGRAMFILES(X86)"]),
        Path("C:/DayZ Mod Studio") if os.name == "nt" else None,
        Path("C:/Tools") if os.name == "nt" else None,
    ]
    for base in bases:
        if not base:
            continue
        for name in EXE_NAMES:
            add_candidate(result, base / name)
            add_candidate(result, base / "DayZ Mod Studio" / name)
    return result


def walk_candidates(roots: list[Path], max_depth: int = 3) -> list[Path]:
    found: list[Path] = []
    for root in roots:
        try:
            root = root.expanduser().resolve()
        except OSError:
            continue
        if not root.is_dir():
            continue
        base_depth = len(root.parts)
        for directory, folders, files in os.walk(root):
            current = Path(directory)
            depth = len(current.parts) - base_depth
            if depth >= max_depth:
                folders[:] = []
            else:
                folders[:] = [
                    item for item in folders
                    if item.casefold() not in SKIP_DIRS and not item.startswith(".")
                ]
            for name in files:
                if name.casefold() in EXE_NAMES:
                    add_candidate(found, current / name)
    return found


def paired(path: Path) -> tuple[Path | None, Path | None]:
    """Return (studio, backend) for a discovered executable."""
    folder = path.parent
    studio = path if path.name.casefold() == "dayz-mod-studio.exe" else None
    backend = path if path.name.casefold() in BACKEND_NAMES else None
    if studio is None:
        for name in ("dayz-mod-studio.exe", "dayz-mod-studio"):
            candidate = folder / name
            if is_file(candidate):
                studio = candidate
                break
    if backend is None:
        for name in BACKEND_NAMES:
            candidate = folder / name
            if is_file(candidate):
                backend = candidate
                break
    return studio, backend


def discover(explicit: str | None = None, source: str | None = None) -> dict:
    candidates: list[Path] = []
    if explicit:
        add_candidate(candidates, Path(explicit))
        target = Path(explicit)
        if target.is_dir():
            for name in EXE_NAMES:
                add_candidate(candidates, target / name)
    if source:
        source_root = Path(source).resolve()
        for name in BACKEND_NAMES:
            add_candidate(candidates, source_root / "backend" / name)
        add_candidate(candidates, source_root / "backend" / "sidecar.py")
        add_candidate(candidates, source_root / "dayz-mod-studio.exe")

    if not candidates:
        candidates = direct_candidates()
    if not candidates:
        home = Path.home()
        roots = [
            home / "Desktop", home / "Downloads", home / "Documents",
            Path(os.environ.get("LOCALAPPDATA", home / "AppData/Local")) / "Programs",
            Path(os.environ.get("PROGRAMFILES", "C:/Program Files")),
            Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")),
        ]
        candidates = walk_candidates([root for root in roots if root.is_dir()])

    # A source checkout exposes sidecar.py, which is runnable but is not a
    # packaged backend. Keep it as an explicit fallback for tests only.
    if not candidates and source:
        sidecar = Path(source).resolve() / "backend" / "sidecar.py"
        if sidecar.is_file():
            candidates = [sidecar]

    results = []
    seen = set()
    for candidate in candidates:
        try:
            key = str(candidate.resolve()).casefold()
        except OSError:
            continue
        if key in seen:
            continue
        seen.add(key)
        studio, backend = paired(candidate)
        if candidate.suffix == ".py":
            studio, backend = None, candidate
        results.append({
            "candidate": str(candidate),
            "studio": str(studio) if studio else None,
            "backend": str(backend) if backend else None,
        })
    chosen = next((item for item in results if item["backend"]), None)
    return {
        "found": bool(chosen),
        "studio": chosen["studio"] if chosen else None,
        "backend": chosen["backend"] if chosen else None,
        "candidates": results,
        "searched": [
            "DAYZ_BACKEND / DAYZ_MOD_STUDIO_EXE / DAYZ_MOD_STUDIO_DIR",
            "PATH",
            "current directory and common portable locations",
            "Desktop, Downloads, Documents, LOCALAPPDATA/Programs, Program Files (bounded depth)",
        ],
    }


def invocation(backend: str) -> list[str]:
    path = Path(backend)
    if path.suffix.casefold() == ".py":
        return [sys.executable, str(path)]
    if path.name.casefold() == "dayz-mod-studio.exe":
        return [str(path), "--cli"]
    return [str(path)]


def parse_events(text: str) -> tuple[list[dict], list[str]]:
    events: list[dict] = []
    malformed: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            malformed.append(raw)
            continue
        if isinstance(value, dict):
            events.append(value)
        else:
            malformed.append(raw)
    return events, malformed


def summarize(events: list[dict], full: bool) -> dict:
    progress = [event for event in events if event.get("event") == "progress"]
    logs = [event.get("text", "") for event in events if event.get("event") == "log"]
    errors = [event.get("text", "") for event in events if event.get("event") == "error"]
    results = [event.get("value") for event in events if event.get("event") == "result"]
    data = {
        "eventCounts": {
            name: sum(1 for event in events if event.get("event") == name)
            for name in ("progress", "log", "result", "error")
        },
        "result": results[-1] if results else None,
        "error": errors[-1] if errors else None,
        "errors": errors,
        "progressTail": progress[-12:],
        "logTail": logs[-25:],
    }
    if full:
        data["events"] = events
    return data


def command(args: argparse.Namespace) -> int:
    discovery = discover(args.backend or args.explicit, args.source)
    if not discovery["found"]:
        print(json.dumps({"ok": False, "error": "DayZ Mod Studio backend not found", **discovery},
                         ensure_ascii=False, indent=2))
        return 2
    backend = discovery["backend"]
    argv = list(args.args)
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print("error: no backend arguments; use -- COMMAND ...", file=sys.stderr)
        return 2

    already_scoped = any(item in ("--project", "--recent") for item in argv)
    prefix: list[str] = []
    if not already_scoped:
        if args.project:
            prefix += ["--project", str(Path(args.project).expanduser().resolve())]
        elif args.recent:
            prefix += ["--recent"]
    if args.json and "--json" not in argv:
        prefix += ["--json"]
    command_line = invocation(backend) + prefix + argv

    started = time.monotonic()
    try:
        completed = subprocess.run(
            command_line,
            cwd=str(Path(args.cwd).expanduser().resolve()) if args.cwd else None,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=args.timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout or ""
        stderr = error.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", "replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", "replace")
        events, malformed = parse_events(stdout)
        payload = {
            "ok": False, "timedOut": True, "backend": backend,
            "command": command_line, "seconds": round(time.monotonic() - started, 2),
            "stdoutTail": stdout[-4000:], "stderrTail": stderr[-4000:],
            **summarize(events, args.full),
        }
        if malformed:
            payload["malformed"] = malformed[-20:]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 124
    except OSError as error:
        print(json.dumps({"ok": False, "backend": backend, "command": command_line,
                          "error": str(error)}, ensure_ascii=False, indent=2))
        return 2

    events, malformed = parse_events(completed.stdout)
    payload = {
        "ok": completed.returncode == 0,
        "backend": backend,
        "command": command_line,
        "exitCode": completed.returncode,
        "seconds": round(time.monotonic() - started, 2),
        "stdoutTail": completed.stdout[-4000:],
        "stderrTail": completed.stderr[-4000:],
        **summarize(events, args.full),
    }
    if malformed:
        payload["malformed"] = malformed[-20:]
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return completed.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="studio.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--backend", help="explicit dayz-backend executable or sidecar.py")
    parser.add_argument("--source", help="source checkout root, for development only")
    sub = parser.add_subparsers(dest="subcommand", required=True)

    find = sub.add_parser("find", help="locate the app without running it")
    find.add_argument("--json", action="store_true", help="accepted for symmetry; output is JSON")

    run = sub.add_parser("run", help="run a backend command with JSONL parsing")
    run.add_argument("--project", help="absolute project root")
    run.add_argument("--recent", action="store_true", help="use this installation's recent project")
    run.add_argument("--json", action="store_true", default=True,
                     help="request JSONL (default; cannot be disabled)")
    run.add_argument("--full", action="store_true", help="include every JSON event")
    run.add_argument("--timeout", type=float, default=3600.0)
    run.add_argument("--cwd", help="working directory for the backend process")
    run.add_argument("args", nargs=argparse.REMAINDER,
                     help="-- followed by backend command and its flags")

    help_parser = sub.add_parser("help", help="run backend --help")
    help_parser.add_argument("--json", action="store_true", help="accepted for symmetry")

    args = parser.parse_args(argv)
    if args.subcommand == "find":
        result = discover(args.backend, args.source)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["found"] else 1
    if args.subcommand == "help":
        discovery = discover(args.backend, args.source)
        if not discovery["found"]:
            print(json.dumps({"ok": False, "error": "backend not found", **discovery}, indent=2))
            return 2
        completed = subprocess.run(invocation(discovery["backend"]) + ["--help"],
                                   capture_output=True, text=True, encoding="utf-8",
                                   errors="replace", timeout=60)
        print(completed.stdout or completed.stderr)
        return completed.returncode
    return command(args)


if __name__ == "__main__":
    raise SystemExit(main())
