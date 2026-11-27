#!/usr/bin/env python3
"""Validate the DayZ Mod Studio Agent Skills pack (offline, no app needed)."""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys
from urllib.parse import unquote

try:
    import yaml
except ImportError as error:  # pragma: no cover - exercised by the test runner
    raise SystemExit("PyYAML is required: python -m pip install pyyaml") from error

NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SKILL_GLOB = "dayz-mod-studio*"
LINK = re.compile(r"(?<!!)\[([^\]]+)\]")
FENCE = re.compile(r"(?ms)^(\x60{3}|~{3}).*?^\1[ \t]*$")
FRONTMATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.S)


def skill_dirs(root: Path) -> list[Path]:
    return sorted(
        item for item in root.glob(SKILL_GLOB)
        if item.is_dir() and (item / "SKILL.md").is_file()
    )


def frontmatter(path: Path) -> tuple[dict, str, list[str]]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER.match(text)
    if not match:
        return {}, "", ["missing YAML frontmatter delimited by ---"]
    try:
        data = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        return {}, "", [f"invalid YAML: {error}"]
    if not isinstance(data, dict):
        return {}, "", ["frontmatter must be a YAML mapping"]
    return data, text[match.end():], errors


def validate_skill(path: Path) -> list[str]:
    errors: list[str] = []
    directory = path.parent
    data, body, parse_errors = frontmatter(path)
    errors.extend(parse_errors)
    if not data:
        return errors or ["empty frontmatter"]

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("name must be a non-empty string")
    else:
        if len(name) > 64:
            errors.append(f"name exceeds 64 characters ({len(name)})")
        if not NAME.match(name):
            errors.append(f"name is not lowercase kebab-case: {name!r}")
        if "--" in name:
            errors.append("name must not contain consecutive hyphens")
        if name != directory.name:
            errors.append(f"name {name!r} does not match directory {directory.name!r}")

    description = data.get("description")
    if not isinstance(description, str) or not description.strip():
        errors.append("description must be a non-empty string")
    elif len(description) > 1024:
        errors.append(f"description exceeds 1024 characters ({len(description)})")

    compatibility = data.get("compatibility")
    if compatibility is not None:
        if not isinstance(compatibility, str):
            errors.append("compatibility must be a string")
        elif len(compatibility) > 500:
            errors.append(f"compatibility exceeds 500 characters ({len(compatibility)})")

    metadata = data.get("metadata")
    if metadata is not None:
        if not isinstance(metadata, dict):
            errors.append("metadata must be a mapping of strings")
        else:
            for key, value in metadata.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    errors.append(f"metadata {key!r} must map string to string")

    allowed = data.get("allowed-tools")
    if allowed is not None and not isinstance(allowed, (str, list)):
        errors.append("allowed-tools must be a string or list")

    if not body.strip():
        errors.append("SKILL.md has no instruction body")
    if not (directory / "references").is_dir():
        errors.append("missing references/ directory")

    for target, line in markdown_links(path):
        if target.startswith(("/", "\\")):
            errors.append(f"line {line}: absolute link is not portable: {target}")
            continue
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            errors.append(f"line {line}: broken link: {target}")
    return errors


def markdown_links(path: Path):
    text = FENCE.sub("", path.read_text(encoding="utf-8"))
    text = re.sub(r"`[^`\n]*`", "", text)
    for match in LINK.finditer(text):
        target = match.group(1).strip().strip("<>")
        if not target or target.startswith(("#", "http://", "https://", "mailto:", "//")):
            continue
        target = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if target:
            yield target, text.count("\n", 0, match.start()) + 1


def duplicate_markdown_blocks(path: Path) -> list[str]:
    """Return repeated level-2 headings and repeated multi-line code blocks."""
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    headings = [line.strip() for line in text.splitlines() if line.startswith("## ")]
    seen: set[str] = set()
    for heading in headings:
        if heading in seen:
            errors.append(f"duplicate heading {heading!r}")
        seen.add(heading)

    blocks = re.findall(r"(?ms)^(\x60{3}|~{3})(.*?)^\1[ \t]*$", text)
    seen_blocks: set[str] = set()
    for fence, block in blocks:
        lines = [line.rstrip() for line in block.strip().splitlines() if line.strip()]
        if len(lines) < 3:
            continue
        normalized = "\n".join(lines)
        if normalized in seen_blocks:
            errors.append(f"duplicate {fence} code block ({len(lines)} lines)")
        seen_blocks.add(normalized)
    return errors


def link_errors(path: Path) -> list[str]:
    errors: list[str] = []
    for target, line in markdown_links(path):
        if target.startswith("/") or target.startswith(chr(92)):
            errors.append(f"line {line}: absolute link is not portable: {target}")
            continue
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            errors.append(f"line {line}: broken link: {target}")
    return errors


def validate_pack(root: Path) -> list[str]:
    errors: list[str] = []
    directories = skill_dirs(root)
    if not directories:
        return ["no skill directories with SKILL.md found"]
    names: list[str] = []
    for directory in directories:
        skill_errors = validate_skill(directory / "SKILL.md")
        errors.extend(f"{directory.name}: {error}" for error in skill_errors)
        data, _, _ = frontmatter(directory / "SKILL.md")
        if isinstance(data.get("name"), str):
            names.append(data["name"])

    if len(names) != len(set(names)):
        errors.append("duplicate skill names")
    main = root / "dayz-mod-studio" / "SKILL.md"
    if not main.is_file():
        errors.append("missing main dayz-mod-studio/SKILL.md")
    else:
        text = main.read_text(encoding="utf-8")
        for name in names:
            if name not in text:
                errors.append(f"router does not mention skill {name!r}")

    for markdown in sorted(root.rglob("*.md")):
        if any(part.startswith(".") for part in markdown.relative_to(root).parts):
            continue
        errors.extend(f"{markdown.relative_to(root)}: {error}" for error in duplicate_markdown_blocks(markdown))
        errors.extend(f"{markdown.relative_to(root)}: {error}" for error in link_errors(markdown))
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=str(Path(__file__).resolve().parent.parent))
    args = parser.parse_args(argv)
    errors = validate_pack(Path(args.root).resolve())
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"OK: {len(skill_dirs(Path(args.root).resolve()))} skills validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
