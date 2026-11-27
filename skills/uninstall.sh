#!/usr/bin/env bash
# Remove only the DayZ Mod Studio skills recorded by install.sh.
set -euo pipefail

pack_root=$(cd -- "$(dirname -- "$0")" && pwd)
pack_id="dayz-mod-studio-agent-skills"
hermes_category="dayz-mod-studio"
manifest_tool="$pack_root/install_manifest.py"

agents_arg="all"
scope="all"
project_arg=""
dry_run=0

usage() {
    cat <<'EOF'
Usage: ./uninstall.sh [options]

  -a, --agents LIST    codex, opencode, claude, hermes, or all (default all)
  -s, --scope SCOPE    user, project, or all (default all)
  -p, --project PATH   only remove installs under this project
      --dry-run        print paths without deleting
  -h, --help           show this help

Only paths recorded in install.json and verified as a symlink/marker-owned
copy are removed. Other skill directories are untouched.
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
    user|project|all) ;;
    *) echo "Invalid scope: $scope" >&2; exit 2 ;;
esac
if [[ -n "$project_arg" ]]; then
    if [[ ! -d "$project_arg" ]]; then
        echo "Project is not a directory: $project_arg" >&2
        exit 2
    fi
    project=$(cd -- "$project_arg" && pwd -P)
else
    project=""
fi
if [[ "$scope" == "project" && -z "$project" ]]; then
    echo "--project is required with --scope project" >&2
    exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for the manifest helper." >&2
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
if [[ ! -f "$manifest" ]]; then
    echo "No install manifest: $manifest"
    exit 0
fi

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

agent_allowed() {
    local wanted="$1" item old_ifs
    [[ "$agents_arg" == "all" ]] && return 0
    old_ifs=$IFS
    IFS=', '
    for item in $agents_arg; do
        if [[ "$item" == "$wanted" ]]; then IFS=$old_ifs; return 0; fi
    done
    IFS=$old_ifs
    return 1
}

removed=0
failed=0
while IFS=$'\t' read -r agent entry_scope path source name entry_mode entry_version; do
    [[ -n "$path" ]] || continue
    agent_allowed "$agent" || continue
    if [[ "$scope" != "all" && "$entry_scope" != "$scope" ]]; then continue; fi
    if [[ -n "$project" ]]; then
        case "$path" in
            "$project"/*) ;;
            *) continue ;;
        esac
    fi
    if [[ ! -e "$path" && ! -L "$path" ]]; then
        echo "Already absent: $path"
        if [[ "$dry_run" -eq 0 ]]; then
            python3 "$manifest_tool" remove --manifest "$manifest" --path "$path"
        fi
        removed=$((removed + 1))
        continue
    fi
    owned=0
    if [[ -L "$path" ]]; then
        if [[ -n "$source" ]] && link_points_to "$path" "$source"; then owned=1; fi
    elif [[ -d "$path" ]] && copy_marker_matches "$path" "$name"; then
        owned=1
    fi
    if [[ "$owned" -eq 0 ]]; then
        echo "Refusing to remove unowned path: $path" >&2
        failed=1
        continue
    fi
    if [[ "$dry_run" -eq 1 ]]; then
        echo "[dry-run] remove $path"
        continue
    fi
    if [[ -L "$path" ]]; then
        rm -f -- "$path"
    else
        rm -rf -- "$path"
    fi
    if [[ "$agent" == "hermes" ]]; then
        parent=$(dirname "$path")
        if [[ "$(basename "$parent")" == "$hermes_category" ]]; then
            rmdir -- "$parent" 2>/dev/null || true
        fi
    fi
    python3 "$manifest_tool" remove --manifest "$manifest" --path "$path"
    echo "Removed: $path"
    removed=$((removed + 1))
done < <(python3 "$manifest_tool" list --manifest "$manifest" --tsv)

echo "Removed $removed path(s); $failed refusal(s)."
if [[ "$failed" -ne 0 ]]; then
    exit 1
fi
