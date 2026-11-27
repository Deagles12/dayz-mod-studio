#!/usr/bin/env bash
# Install the DayZ Mod Studio Agent Skills pack on Linux.
# Windows users should use install.ps1 (junctions/copy); this script is for
# Linux agent hosts and uses symlinks or copies.
set -euo pipefail

pack_root=$(cd -- "$(dirname -- "$0")" && pwd)
pack_id="dayz-mod-studio-agent-skills"
hermes_category="dayz-mod-studio"
version=$(tr -d '[:space:]' < "$pack_root/VERSION")
manifest_tool="$pack_root/install_manifest.py"

agents_arg="all"
scope="user"
project_arg=""
mode_arg=""
mode_set=0
force=0
dry_run=0

usage() {
    cat <<'EOF'
Usage: ./install.sh [options]

  -a, --agents LIST    codex, opencode, claude, hermes, or all (default all)
  -s, --scope SCOPE    user (default) or project
  -p, --project PATH   project root (required with --scope project)
  -m, --mode MODE      auto (symlink, copy fallback), link, or copy
  -f, --force          refresh even when the recorded version is current
      --dry-run        print actions without writing
  -h, --help           show this help

Targets:
  codex     ~/.agents/skills (user) or <project>/.agents/skills
  opencode  ~/.config/opencode/skills or <project>/.opencode/skills
  claude    ~/.claude/skills or <project>/.claude/skills
  hermes    ~/.hermes/skills/dayz-mod-studio or <project>/.hermes/skills/dayz-mod-studio

Manifest:
  $XDG_STATE_HOME/dayz-mod-studio-skills/install.json
  (default: ~/.local/state/dayz-mod-studio-skills/install.json)

Existing paths are replaced only when the manifest and symlink/marker prove
ownership. Third-party skills are never removed.
EOF
}

while (($#)); do
    case "$1" in
        -a|--agents)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
            agents_arg="$2"
            shift 2
            ;;
        -s|--scope)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
            scope="$2"
            shift 2
            ;;
        -p|--project)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
            project_arg="$2"
            shift 2
            ;;
        -m|--mode)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
            mode_arg="$2"
            mode_set=1
            shift 2
            ;;
        -f|--force)
            force=1
            shift
            ;;
        --dry-run)
            dry_run=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

case "$scope" in
    user|project) ;;
    *) echo "Invalid scope: $scope" >&2; exit 2 ;;
esac
if [[ "$mode_set" -eq 1 ]]; then
    case "$mode_arg" in
        auto|link|copy) ;;
        *) echo "Invalid mode: $mode_arg" >&2; exit 2 ;;
    esac
fi
if [[ "$scope" == "project" && -z "$project_arg" ]]; then
    echo "--project is required with --scope project" >&2
    exit 2
fi
if [[ -n "$project_arg" ]]; then
    if [[ ! -d "$project_arg" ]]; then
        echo "Project is not a directory: $project_arg" >&2
        exit 2
    fi
    project=$(cd -- "$project_arg" && pwd -P)
else
    project=""
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for the manifest helper." >&2
    exit 1
fi

has_skill=0
for candidate in "$pack_root"/dayz-mod-studio*/; do
    if [[ -f "$candidate/SKILL.md" ]]; then has_skill=1; fi
done
if [[ "$has_skill" -eq 0 ]]; then
    echo "No skill directories with SKILL.md found beside this installer." >&2
    exit 1
fi

if printenv XDG_STATE_HOME >/dev/null 2>&1 && [[ -n "$XDG_STATE_HOME" ]]; then
    state_root="$XDG_STATE_HOME/dayz-mod-studio-skills"
elif printenv LOCALAPPDATA >/dev/null 2>&1 && [[ "$OSTYPE" == msys* ]]; then
    state_root="$LOCALAPPDATA/DayZ Mod Studio Skills"
else
    state_root="$HOME/.local/state/dayz-mod-studio-skills"
fi
manifest="$state_root/install.json"
if [[ "$dry_run" -eq 0 ]]; then
    mkdir -p "$state_root"
fi

path_exists() { [[ -e "$1" || -L "$1" ]]; }

normalize() {
    python3 - "$1" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
}

link_points_to() {
    local path="$1" expected="$2" raw resolved
    [[ -L "$path" ]] || return 1
    raw=$(readlink "$path") || return 1
    if [[ "$raw" == /* ]]; then
        resolved="$raw"
    else
        resolved="$(dirname "$path")/$raw"
    fi
    [[ "$(normalize "$resolved")" == "$(normalize "$expected")" ]]
}

copy_marker_matches() {
    local path="$1" name="$2"
    [[ -f "$path/.dayz-mod-studio-skill" ]] || return 1
    python3 - "$path/.dayz-mod-studio-skill" "$name" <<'PY'
import json
import sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if data.get("pack") == "dayz-mod-studio-agent-skills" and data.get("name") == sys.argv[2] else 1)
PY
}

is_owned() {
    local path="$1" name="$2" source="$3" entry_source="$4" entry_mode="$5"
    if [[ -L "$path" ]]; then
        if [[ -n "$source" ]] && link_points_to "$path" "$source"; then return 0; fi
        if [[ -n "$entry_source" ]] && link_points_to "$path" "$entry_source"; then return 0; fi
        return 1
    fi
    if [[ "$entry_mode" == "copy" ]]; then
        copy_marker_matches "$path" "$name"
        return $?
    fi
    copy_marker_matches "$path" "$name"
}

write_marker() {
    local target="$1" name="$2" source="$3"
    python3 - "$target/.dayz-mod-studio-skill" "$pack_id" "$name" "$version" "$source" <<'PY'
import json
import sys
from datetime import datetime, timezone
path, pack, name, version, source = sys.argv[1:6]
data = {
    "pack": pack,
    "name": name,
    "version": version,
    "source": source,
    "installed": datetime.now(timezone.utc).isoformat(),
}
with open(path, "w", encoding="utf-8", newline="\n") as stream:
    json.dump(data, stream, indent=2)
    stream.write("\n")
PY
}

target_root() {
    local agent="$1" base
    if [[ "$scope" == "project" ]]; then base="$project"; else base="$HOME"; fi
    case "$agent" in
        codex) echo "$base/.agents/skills" ;;
        opencode) echo "$base/.config/opencode/skills" ;;
        claude) echo "$base/.claude/skills" ;;
        hermes) echo "$base/.hermes/skills" ;;
        *) return 1 ;;
    esac
}

process_skill() {
    local agent="$1" root="$2" source="$3"
    local name target source_abs entry_json entry_source entry_mode entry_version has_entry current actual
    local effective parent
    name=$(basename "$source")
    source_abs=$(cd -- "$source" && pwd -P)
    if [[ "$agent" == "hermes" ]]; then
        target="$root/$hermes_category/$name"
    else
        target="$root/$name"
    fi

    has_entry=0
    entry_json=""
    if entry_json=$(python3 "$manifest_tool" get --manifest "$manifest" --path "$target" 2>/dev/null); then
        has_entry=1
    else
        entry_json=""
    fi
    entry_source=""
    entry_mode=""
    entry_version=""
    if [[ "$has_entry" -eq 1 ]]; then
        entry_source=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("source", ""))' "$entry_json")
        entry_mode=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("mode", ""))' "$entry_json")
        entry_version=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("version", ""))' "$entry_json")
    fi

    if path_exists "$target"; then
        if [[ ! -d "$target" && ! -L "$target" ]]; then
            echo "Refusing to replace a non-directory path: $target" >&2
            exit 1
        fi
        if ! is_owned "$target" "$name" "$source_abs" "$entry_source" "$entry_mode"; then
            echo "Refusing to replace an unowned path: $target" >&2
            exit 1
        fi
        current=0
        if [[ "$force" -eq 0 && "$has_entry" -eq 1 && "$entry_version" == "$version" ]]; then
            if { [[ -L "$target" ]] && link_points_to "$target" "$source_abs"; } || copy_marker_matches "$target" "$name"; then
                current=1
            fi
        fi
        if [[ "$current" -eq 1 ]]; then
            echo "Up to date: $target"
            return 0
        fi
    fi

    if [[ "$mode_set" -eq 1 ]]; then
        effective="$mode_arg"
    elif [[ "$has_entry" -eq 1 && "$entry_mode" == "copy" ]]; then
        effective="copy"
    else
        effective="auto"
    fi

    if [[ "$dry_run" -eq 1 ]]; then
        echo "[dry-run] $target -> $source_abs ($effective)"
        return 0
    fi

    if path_exists "$target"; then
        if ! is_owned "$target" "$name" "$source_abs" "$entry_source" "$entry_mode"; then
            echo "Refusing to remove unowned path: $target" >&2
            exit 1
        fi
        if [[ -L "$target" ]]; then
            rm -f -- "$target"
        else
            rm -rf -- "$target"
        fi
    fi
    if [[ "$has_entry" -eq 1 ]]; then
        python3 "$manifest_tool" remove --manifest "$manifest" --path "$target"
    fi

    parent=$(dirname "$target")
    mkdir -p "$parent"
    actual=""
    if [[ "$effective" != "copy" ]]; then
        if ln -s -- "$source_abs" "$target" 2>/dev/null; then
            actual="link"
        elif [[ "$effective" == "link" ]]; then
            echo "Could not create symlink $target; use --mode copy." >&2
            exit 1
        fi
    fi
    if [[ -z "$actual" ]]; then
        mkdir -p "$target"
        cp -a -- "$source_abs/." "$target/"
        write_marker "$target" "$name" "$source_abs"
        actual="copy"
    fi

    if ! python3 "$manifest_tool" add --manifest "$manifest" --name "$name" --agent "$agent" --scope "$scope" --root "$root" --path "$target" --source "$source_abs" --mode "$actual" --version "$version" >/dev/null; then
        if [[ "$actual" == "link" ]]; then rm -f -- "$target"; else rm -rf -- "$target"; fi
        echo "Could not record ownership for $target; removed the new install." >&2
        exit 1
    fi
    echo "Installed: $target ($actual)"
}

process_agent() {
    local agent="$1" base root source
    if [[ "$scope" == "project" ]]; then base="$project"; else base="$HOME"; fi
    root=$(target_root "$agent")
    echo "Agent $agent -> $root"
    for source in "$pack_root"/dayz-mod-studio*/; do
        [[ -f "$source/SKILL.md" ]] || continue
        process_skill "$agent" "$root" "$source"
    done
}

old_ifs=$IFS
IFS=', '
for agent in $agents_arg; do
    case "$agent" in
        all)
            process_agent codex
            process_agent opencode
            process_agent claude
            process_agent hermes
            ;;
        codex|opencode|claude|hermes)
            process_agent "$agent"
            ;;
        "")
            ;;
        *)
            echo "Unknown agent: $agent" >&2
            exit 2
            ;;
    esac
done
IFS=$old_ifs

if [[ "$dry_run" -eq 0 ]]; then
    python3 "$manifest_tool" version --manifest "$manifest" --version "$version" >/dev/null
fi
echo "Manifest: $manifest"
echo "Pack $version installed ($scope)."
