#!/usr/bin/env python3
"""Small JSON manifest helper for the shell installer (no third-party deps)."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone

PACK_ID = "dayz-mod-studio-agent-skills"


def fail(message: str) -> "NoReturn":
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def load(path: Path) -> dict:
    if not path.is_file():
        return {"schema": 1, "pack": PACK_ID, "version": "", "updated": None, "installs": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"refusing to modify an unreadable manifest {path}: {error}")
    if not isinstance(data, dict):
        fail(f"invalid manifest: {path}")
    if data.get("pack") and data["pack"] != PACK_ID:
        fail(f"manifest belongs to {data['pack']!r}")
    entries = data.setdefault("installs", [])
    if not isinstance(entries, list):
        fail("manifest installs must be a list")
    return data


def save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["schema"] = 1
    data["pack"] = PACK_ID
    data["updated"] = datetime.now(timezone.utc).isoformat()
    data["installs"] = sorted(data.get("installs", []), key=lambda item: str(item.get("path", "")))
    fd, temporary = tempfile.mkstemp(prefix=".install-", suffix=".json", dir=str(path.parent), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def key(value: str) -> str:
    return os.path.normcase(os.path.abspath(value))


def find(data: dict, target: str):
    wanted = key(target)
    for entry in data.get("installs", []):
        if isinstance(entry, dict) and entry.get("path") and key(str(entry["path"])) == wanted:
            return entry
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add")
    add.add_argument("--manifest", required=True)
    add.add_argument("--name", required=True)
    add.add_argument("--agent", required=True)
    add.add_argument("--scope", required=True)
    add.add_argument("--root", required=True)
    add.add_argument("--path", required=True)
    add.add_argument("--source", required=True)
    add.add_argument("--mode", required=True)
    add.add_argument("--version", required=True)

    remove = sub.add_parser("remove")
    remove.add_argument("--manifest", required=True)
    remove.add_argument("--path", required=True)

    get = sub.add_parser("get")
    get.add_argument("--manifest", required=True)
    get.add_argument("--path", required=True)

    listing = sub.add_parser("list")
    listing.add_argument("--manifest", required=True)
    listing.add_argument("--tsv", action="store_true")

    set_version = sub.add_parser("version")
    set_version.add_argument("--manifest", required=True)
    set_version.add_argument("--version", required=True)

    args = parser.parse_args()
    manifest = Path(args.manifest)
    data = load(manifest)

    if args.command == "add":
        entry = {
            "pack": PACK_ID,
            "name": args.name,
            "agent": args.agent,
            "scope": args.scope,
            "root": os.path.abspath(args.root),
            "path": os.path.abspath(args.path),
            "source": os.path.abspath(args.source),
            "mode": args.mode,
            "version": args.version,
            "installed": datetime.now(timezone.utc).isoformat(),
        }
        old = find(data, entry["path"])
        if old is not None:
            data["installs"].remove(old)
        data["installs"].append(entry)
        data["version"] = args.version
        save(manifest, data)
        print(json.dumps(entry))
        return 0

    if args.command == "remove":
        entry = find(data, args.path)
        if entry is not None:
            data["installs"].remove(entry)
            save(manifest, data)
        return 0

    if args.command == "get":
        entry = find(data, args.path)
        if entry is None:
            return 1
        print(json.dumps(entry))
        return 0

    if args.command == "version":
        data["version"] = args.version
        save(manifest, data)
        return 0

    if args.command == "list":
        entries = data.get("installs", [])
        if args.tsv:
            for entry in entries:
                fields = [entry.get(name, "") for name in ("agent", "scope", "path", "source", "name", "mode", "version")]
                print("\t".join(str(value).replace("\t", " ").replace("\n", " ") for value in fields))
        else:
            print(json.dumps({"pack": PACK_ID, "version": data.get("version", ""), "installs": entries}, indent=2))
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
