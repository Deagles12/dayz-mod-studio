#!/usr/bin/env python3
"""Read-only discovery for DayZ Mod Studio, DayZ Tools, the game, and a project.

No files are created, changed, or deleted. Registry and Steam library reads are
best-effort; every missing item is reported instead of guessed.

Examples:
  python find_studio.py --json
  python find_studio.py --json --project "D:/Mods/MyMod"
  python find_studio.py --json --search-root "D:/Portable" --search-root "E:/Tools"
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

APP_NAMES = ("dayz-mod-studio.exe", "dayz-mod-studio")
BACKEND_NAMES = ("dayz-backend.exe", "dayz-backend")
SKIP_NAMES = {
    ".git", ".dayz-studio", "build", "backups", "work", "tests", "tools",
    "releases", "release", "outputs", "node_modules", "assets", "missions",
    "__pycache__", ".venv", "venv", "windows", "$recycle.bin",
}
DAYZ_MARKERS = {
    "tools": ("DayZ Tools", "Bin/AddonBuilder/AddonBuilder.exe"),
    "server": ("DayZServer", "DayZServer_x64.exe"),
    "client": ("DayZ", "DayZ_BE.exe"),
}


def is_file(path: Path | None) -> bool:
    if path is None:
        return False
    try:
        return path.is_file()
    except OSError:
        return False


def is_dir(path: Path | None) -> bool:
    if path is None:
        return False
    try:
        return path.is_dir()
    except OSError:
        return False


def is_link(path: Path) -> bool:
    try:
        attrs = getattr(path.lstat(), "st_file_attributes", 0)
        return path.is_symlink() or bool(attrs & 0x400)
    except OSError:
        return False


def norm(path: Path | str | None) -> str | None:
    if path is None or str(path).strip() == "":
        return None
    try:
        return str(Path(path).expanduser().resolve())
    except OSError:
        return str(Path(path).expanduser())


def windows_registry_paths() -> list[tuple[Path, str]]:
    if os.name != "nt":
        return []
    try:
        import winreg
    except ImportError:
        return []
    found: list[tuple[Path, str]] = []

    def add(value: str, source: str) -> None:
        if not value:
            return
        value = value.strip().strip('"')
        if "," in value and value.rsplit(",", 1)[-1].strip().isdigit():
            value = value.rsplit(",", 1)[0].strip('"')
        path = Path(value)
        if path.suffix.casefold() in (".exe", ".py") and is_file(path):
            found.append((path, source))
        elif is_dir(path):
            for name in APP_NAMES + BACKEND_NAMES:
                if is_file(path / name):
                    found.append((path / name, source))

    app_paths = r"Software\Microsoft\Windows\CurrentVersion\App Paths\dayz-mod-studio.exe"
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(hive, app_paths) as key:
                add(str(winreg.QueryValueEx(key, "")[0]), "registry:AppPaths")
        except OSError:
            pass

    uninstall = r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
    for hive, prefix in (
        (winreg.HKEY_CURRENT_USER, "registry:HKCU"),
        (winreg.HKEY_LOCAL_MACHINE, "registry:HKLM"),
        (winreg.HKEY_LOCAL_MACHINE, "registry:HKLM-WOW"),
    ):
        root = uninstall
        if prefix.endswith("WOW"):
            root = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        try:
            with winreg.OpenKey(hive, root) as parent:
                count = winreg.QueryInfoKey(parent)[0]
                for index in range(count):
                    try:
                        name = winreg.EnumKey(parent, index)
                        with winreg.OpenKey(parent, name) as item:
                            display = str(winreg.QueryValueEx(item, "DisplayName")[0])
                            if "dayz" not in display.casefold() or "studio" not in display.casefold():
                                continue
                            for value_name in ("InstallLocation", "DisplayIcon"):
                                try:
                                    add(str(winreg.QueryValueEx(item, value_name)[0]), prefix)
                                except OSError:
                                    pass
                    except OSError:
                        continue
        except OSError:
            pass
    return found


def direct_candidates(include_registry: bool = True) -> list[tuple[Path, str]]:
    found: list[tuple[Path, str]] = []
    seen: set[str] = set()

    def add(path: Path | None, source: str) -> None:
        if path is None:
            return
        path = Path(path)
        if not is_file(path):
            return
        key = str(path.resolve()).casefold()
        if key not in seen:
            seen.add(key)
            found.append((path, source))

    for env_key in ("DAYZ_BACKEND", "DAYZ_MOD_STUDIO_BACKEND", "DAYZ_MOD_STUDIO_EXE"):
        add(Path(value), f"env:{env_key}") if (value := os.environ.get(env_key, "").strip()) else None
    for env_key in ("DAYZ_MOD_STUDIO_DIR", "DAYZ_MOD_STUDIO_HOME"):
        value = os.environ.get(env_key, "").strip()
        if value:
            for name in APP_NAMES + BACKEND_NAMES:
                add(Path(value) / name, f"env:{env_key}")

    for name in APP_NAMES + BACKEND_NAMES:
        located = shutil.which(name)
        if located:
            add(Path(located), "PATH")

    if include_registry:
        for path, source in windows_registry_paths():
            add(path, source)

    home = Path.home()
    local = os.environ.get("LOCALAPPDATA", "")
    program = os.environ.get("PROGRAMFILES", "")
    program_x86 = os.environ.get("PROGRAMFILES(X86)", "")
    bases = [
        Path.cwd(),
        home / "Desktop",
        home / "Downloads",
        home / "Documents",
        Path(local) / "Programs" if local else None,
        Path(program) if program else None,
        Path(program_x86) if program_x86 else None,
        Path("C:/DayZ Mod Studio") if os.name == "nt" else None,
    ]
    for base in bases:
        if base is None:
            continue
        for name in APP_NAMES + BACKEND_NAMES:
            add(base / name, "known directory")
            add(base / "DayZ Mod Studio" / name, "known directory")
    return found


def walk_candidates(roots: list[str], depth: int = 4) -> list[tuple[Path, str]]:
    found: list[tuple[Path, str]] = []
    seen: set[str] = set()
    for raw in roots:
        try:
            root = Path(raw).expanduser().resolve()
        except OSError:
            continue
        if not is_dir(root):
            continue
        base = len(root.parts)
        for directory, folders, files in os.walk(root):
            current = Path(directory)
            if len(current.parts) - base >= depth:
                folders[:] = []
            else:
                folders[:] = [
                    item for item in folders
                    if item.casefold() not in SKIP_NAMES and not item.startswith(".")
                    and not is_link(current / item)
                ]
            for name in files:
                if name.casefold() in APP_NAMES + BACKEND_NAMES:
                    path = current / name
                    key = str(path.resolve()).casefold()
                    if key not in seen:
                        seen.add(key)
                        found.append((path, "bounded walk"))
    return found


def pair(path: Path) -> tuple[Path | None, Path | None]:
    folder = path.parent
    studio = path if path.name.casefold() in APP_NAMES else None
    backend = path if path.name.casefold() in BACKEND_NAMES else None
    if path.suffix.casefold() == ".py" and path.name.casefold() == "sidecar.py":
        return None, path
    if backend is None:
        for name in BACKEND_NAMES:
            if is_file(folder / name):
                backend = folder / name
                break
    if studio is None:
        for name in APP_NAMES:
            if is_file(folder / name):
                studio = folder / name
                break
    return studio, backend


def file_version(path: Path | None) -> str | None:
    if not path or os.name != "nt":
        return None
    try:
        import ctypes
        from ctypes import wintypes
        size = ctypes.windll.version.GetFileVersionInfoSizeW(str(path), None)
        if not size:
            return None
        data = ctypes.create_string_buffer(size)
        if not ctypes.windll.version.GetFileVersionInfoW(str(path), 0, size, data):
            return None
        pointer = ctypes.c_void_p()
        length = wintypes.UINT()
        if not ctypes.windll.version.VerQueryValueW(data, "\\", ctypes.byref(pointer), ctypes.byref(length)):
            return None
        fixed = ctypes.cast(pointer, ctypes.POINTER(ctypes.c_uint32 * 4)).contents
        ms, ls = fixed[2], fixed[3]
        return f"{ms >> 16}.{ms & 0xFFFF}.{ls >> 16}.{ls & 0xFFFF}"
    except Exception:
        return None


def steam_libraries() -> list[Path]:
    libraries: set[Path] = set()
    if os.name == "nt":
        try:
            import winreg
            for hive, key, field in (
                (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
                (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Valve\Steam", "InstallPath"),
            ):
                try:
                    with winreg.OpenKey(hive, key) as item:
                        libraries.add(Path(str(winreg.QueryValueEx(item, field)[0])))
                except OSError:
                    pass
        except ImportError:
            pass
    for default in ("C:/Program Files (x86)/Steam", "C:/Program Files/Steam", "F:/Steam"):
        if is_dir(Path(default)):
            libraries.add(Path(default))
    for steam in list(libraries):
        try:
            vdf = (steam / "steamapps/libraryfolders.vdf").read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for value in re.findall(r'"path"\s+"([^"]+)"', vdf, re.I):
            libraries.add(Path(value.replace("\\\\", "\\")))
    return [library / "steamapps/common" for library in sorted(libraries)]


def dayz_installs() -> dict:
    libraries = steam_libraries()
    result: dict = {"libraries": [str(path) for path in libraries], "tools": None, "server": None, "client": None}
    for key, (folder, marker) in DAYZ_MARKERS.items():
        result[key] = next(
            (str(library / folder) for library in libraries if is_file(library / folder / marker)),
            None,
        )
        result[f"{key}Marker"] = marker
    return result


def discover_project(root: str) -> dict:
    path = Path(root).expanduser().resolve()
    result: dict = {
        "path": str(path), "exists": is_dir(path), "config": None,
        "pboprefix": None, "addons": [], "state": None, "settings": None,
        "settingsSource": None, "warnings": [],
    }
    if not is_dir(path):
        result["warnings"].append("project directory does not exist")
        return result
    config = path / "config.cpp"
    if is_file(config):
        result["config"] = str(config)
        prefix = path / "$PBOPREFIX$"
        if is_file(prefix):
            result["pboprefix"] = prefix.read_text(encoding="utf-8-sig", errors="replace").strip()
    addons = []
    links = False
    base = len(path.parts)
    for directory, folders, files in os.walk(path):
        current = Path(directory)
        depth = len(current.parts) - base
        if any(is_link(current / item) for item in (*folders, *files)):
            links = True
        folders[:] = [
            item for item in folders
            if item.casefold() not in SKIP_NAMES and not item.startswith((".", "@"))
            and depth < 5 and not is_link(current / item)
        ]
        candidate = current / "config.cpp"
        if is_file(candidate) and not is_link(candidate):
            try:
                text = candidate.read_text(encoding="utf-8-sig", errors="replace")
            except OSError:
                continue
            if re.search(r"\bclass\s+CfgPatches\b|(?m:^\s*#include\s+)", text, re.I):
                addons.append(current.relative_to(path).as_posix())
    result["addons"] = sorted(addons)

    local = os.environ.get("LOCALAPPDATA") or str(Path.home())
    key = hashlib.sha256(str(path).casefold().encode()).hexdigest()[:20]
    state = Path(local) / "DayZ Mod Studio" / "projects" / key
    result["state"] = str(state)
    configured = state / "project.json"
    if is_file(configured):
        try:
            result["settings"] = json.loads(configured.read_text(encoding="utf-8-sig"))
            result["settingsSource"] = str(configured)
        except (OSError, ValueError):
            result["warnings"].append("project.json is not valid JSON")
    legacy = path / "settings.json"
    if is_file(legacy):
        result["warnings"].append("legacy settings.json exists; project.json is authoritative after save")
    if links:
        result["warnings"].append("project contains a symlink or junction; build will reject it")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true", help="JSON output (recommended)")
    parser.add_argument("--studio", help="explicit path to dayz-mod-studio.exe")
    parser.add_argument("--backend", help="explicit path to dayz-backend.exe or sidecar.py")
    parser.add_argument("--search-root", action="append", default=[], help="extra directory to search")
    parser.add_argument("--project", help="project root to inspect")
    parser.add_argument("--no-registry", action="store_true", help="skip Windows registry lookup")
    parser.add_argument("--depth", type=int, default=4, help="bounded search depth (default 4)")
    args = parser.parse_args(argv)

    candidates: list[tuple[Path, str]] = []
    if args.studio:
        candidates.append((Path(args.studio), "explicit --studio"))
    if args.backend:
        candidates.append((Path(args.backend), "explicit --backend"))
    if not args.no_registry:
        for path, source in windows_registry_paths():
            candidates.append((path, source))
    for path, source in direct_candidates(not args.no_registry):
        candidates.append((path, source))
    for path, source in walk_candidates(args.search_root, args.depth):
        candidates.append((path, source))

    unique: list[dict] = []
    seen: set[str] = set()
    for path, source in candidates:
        try:
            resolved = path.expanduser().resolve()
        except OSError:
            continue
        key = str(resolved).casefold()
        if key in seen:
            continue
        seen.add(key)
        if not is_file(resolved):
            continue
        studio, backend = pair(resolved)
        if not studio and not backend:
            continue
        unique.append({
            "studio": str(studio) if studio else None,
            "backend": str(backend) if backend else None,
            "source": source,
        })

    selected = next((item for item in unique if item["backend"]), None)
    if selected is None:
        selected = unique[0] if unique else None
    app_root = str(Path(selected["studio"]).parent) if selected and selected["studio"] else (
        str(Path(selected["backend"]).parent) if selected and selected["backend"] else None
    )
    result = {
        "ok": bool(selected and selected["backend"]),
        "selected": selected,
        "appRoot": app_root,
        "version": file_version(Path(selected["studio"])) if selected and selected["studio"] else None,
        "candidates": unique,
        "dayz": dayz_installs(),
        "project": discover_project(args.project) if args.project else None,
        "warnings": [],
    }
    if not selected:
        result["warnings"].append("DayZ Mod Studio not found; ask the user for the portable folder or use --search-root")
    elif not selected["backend"]:
        result["warnings"].append("app found but dayz-backend is missing beside it; use --backend or repair the install")
    if not result["dayz"]["tools"]:
        result["warnings"].append("DayZ Tools not found in Steam libraries")
    if not result["dayz"]["server"]:
        result["warnings"].append("DayZ Server not found in Steam libraries")
    if not result["dayz"]["client"]:
        result["warnings"].append("DayZ client not found in Steam libraries")

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"studio:  {selected['studio'] if selected else '(not found)'}")
        print(f"backend: {selected['backend'] if selected else '(not found)'}")
        print(f"version: {result['version'] or '(unknown)'}")
        print(f"tools:   {result['dayz']['tools'] or '(not found)'}")
        print(f"server:  {result['dayz']['server'] or '(not found)'}")
        print(f"client:  {result['dayz']['client'] or '(not found)'}")
        if result["project"]:
            print(f"project: {result['project']['path']}")
            print(f"state:   {result['project']['state']}")
        for warning in result["warnings"]:
            print(f"warning: {warning}", file=sys.stderr)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
