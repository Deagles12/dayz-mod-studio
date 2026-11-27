#!/usr/bin/env python3
"""Read-only first-pass triage for DayZ Mod Studio and DayZ server logs.

Exit codes:
  0  no error/fatal candidates
  1  at least one error/fatal candidate
  2  no readable input files or usage problem

The JSON output uses line numbers relative to the read window (the last part of
large files), so treat them as hints and open the file for context.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MAX_BYTES = 2 * 1024 * 1024
MAX_FINDINGS = 80

# Ordered: the first matching class for a line wins.
PATTERNS = [
    ("fatal", re.compile(r"(?i)\[Server\]\s*::\s*termination in:")),
    ("fatal", re.compile(r"(?i)virtual machine exception")),
    ("fatal", re.compile(r"(?i)(?:can't|cannot)\s+compile|compilation failed|error compiling")),
    ("fatal", re.compile(r"(?i)missing addons?|requires addon")),
    ("fatal", re.compile(r"(?i)cannot load mission")),
    ("fatal", re.compile(r"(?i)(?:corrupt|damaged|failed to (?:load|read)).*(?:storage|persistence|save)")),
    ("fatal", re.compile(r"(?i)(?:storage|persistence|save).*(?:corrupt|damaged|failed)")),
    ("signature", re.compile(r"(?i)signature (?:verification )?failed|bad signature|missing signature|not signed")),
    ("build", re.compile(r"(?i)addonbuilder.*(?:error|failed)|\[ERROR\]|build failed|error\s+\d+")),
    ("install", re.compile(r"(?i)deployment folders overlap|already has a different key|file is in use|permission denied|symbolic link|junction")),
    ("network", re.compile(r"(?i)connection (?:failed|refused|timed out)|could not connect")),
    ("error", re.compile(r"(?i)(?:^|\s)(?:error|exception|failed)(?:\s|:|\[)")),
    ("warning", re.compile(r"(?i)\[WARN(?:ING)?\s*\]|\(W\):|\bwarning\b")),
]

ADVICE = {
    "fatal": "Open the surrounding RPT/script lines. Fix the first compile, dependency, mission, storage, or termination cause; do not only raise the timeout.",
    "signature": "Check the matching .biprivatekey/.bikey pair, DSSignFile/DSCheckSignatures, and the package Keys folder. Do not disable signing to mask it.",
    "build": "Read AddonBuilder output and the operation log. Fix the addon source or tool path; rebuild rather than editing the package.",
    "install": "Fix the target/path/key/lock cause. Do not delete a target or overwrite a server key.",
    "network": "Confirm the client was launched with loopback address/port and that the server UDP listener is owned by the server PID. Connection is not proven by process start.",
    "error": "Locate the first error in context and map it to the failing stage before changing code or settings.",
    "warning": "Review warnings for real issues, but do not treat every warning as a failed test.",
}

PROFILE_PATTERNS = ("*.rpt", "*.RPT", "script*.log", "error*.log", "*.RPT")


def redact(text: str) -> str:
    text = re.sub(r"(?i)(-password=)\S+", r"\1<redacted>", text)
    text = re.sub(r'(?im)(^\s*password\s*=\s*")[^"]*(")', r"\1<redacted>\2", text)
    return text


def read_window(path: Path) -> tuple[str, bool]:
    size = path.stat().st_size
    tail = size > MAX_BYTES
    with path.open("rb") as stream:
        if tail:
            stream.seek(size - MAX_BYTES)
        data = stream.read()
    return data.decode("utf-8", errors="replace"), tail


def discover(args: argparse.Namespace) -> list[Path]:
    files: list[Path] = []
    for raw in args.log or []:
        path = Path(raw).expanduser()
        if path.is_file():
            files.append(path)
    for raw in args.profile_dir or []:
        root = Path(raw).expanduser()
        if not root.is_dir():
            continue
        for pattern in PROFILE_PATTERNS:
            files.extend(path for path in root.glob(pattern) if path.is_file())
    seen = set()
    result = []
    for path in files:
        key = str(path.resolve()).casefold()
        if key not in seen:
            seen.add(key)
            result.append(path)
    return result


def scan(path: Path) -> tuple[list[dict], bool]:
    text, tail = read_window(path)
    findings = []
    for number, raw_line in enumerate(text.splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        category = None
        for name, pattern in PATTERNS:
            if pattern.search(line):
                category = name
                break
        if not category:
            continue
        safe = redact(line)
        findings.append({
            "file": str(path),
            "line": number,
            "lineRelativeToWindow": number if tail else None,
            "category": category,
            "text": safe[:1000],
            "advice": ADVICE[category],
        })
        if len(findings) >= MAX_FINDINGS:
            break
    return findings, tail


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only DayZ Mod Studio log triage")
    parser.add_argument("--log", action="append", help="specific log file (repeatable)")
    parser.add_argument("--profile-dir", action="append", help="DayZ profiles directory (repeatable)")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--max-findings", type=int, default=40, help="cap printed findings (default 40)")
    args = parser.parse_args(argv)

    files = discover(args)
    if not files:
        print("No readable logs found. Pass --log FILE or --profile-dir DIR.", file=sys.stderr)
        return 2

    all_findings = []
    scanned = []
    for path in files:
        try:
            findings, tail = scan(path)
        except OSError as error:
            scanned.append({"file": str(path), "error": str(error), "findings": 0})
            continue
        all_findings.extend(findings)
        scanned.append({"file": str(path), "findings": len(findings), "tail": tail})

    severity = [item for item in all_findings if item["category"] in ("fatal", "error", "build", "install", "signature", "network")]
    counts = {}
    for item in all_findings:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    payload = {
        "files": scanned,
        "counts": counts,
        "findings": all_findings[: max(1, args.max_findings)],
        "totalFindings": len(all_findings),
        "errorLike": len(severity),
    }

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print("Files scanned: %d; findings: %d; error-like: %d" % (len(scanned), len(all_findings), len(severity)))
        for item in payload["findings"]:
            print("%s:%d [%s] %s" % (item["file"], item["line"], item["category"], item["text"]))
            print("  -> %s" % item["advice"])
        if len(all_findings) > len(payload["findings"]):
            print("... %d more findings; use --json or raise --max-findings" % (len(all_findings) - len(payload["findings"])))
    return 1 if severity else 0


if __name__ == "__main__":
    raise SystemExit(main())
