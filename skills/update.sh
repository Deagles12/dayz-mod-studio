#!/usr/bin/env bash
# Refresh an existing DayZ Mod Studio Agent Skills installation.
set -euo pipefail

pack_root=$(cd -- "$(dirname -- "$0")" && pwd)
agents_arg="all"
scope="user"
project_arg=""
mode_arg=""
mode_set=0
dry_run=0

while (($#)); do
    case "$1" in
        -a|--agents) [[ $# -ge 2 ]] || exit 2; agents_arg="$2"; shift 2 ;;
        -s|--scope) [[ $# -ge 2 ]] || exit 2; scope="$2"; shift 2 ;;
        -p|--project) [[ $# -ge 2 ]] || exit 2; project_arg="$2"; shift 2 ;;
        -m|--mode) [[ $# -ge 2 ]] || exit 2; mode_arg="$2"; mode_set=1; shift 2 ;;
        --dry-run) dry_run=1; shift ;;
        -h|--help)
            echo "Usage: ./update.sh [-a AGENTS] [-s user|project] [-p PROJECT] [-m auto|link|copy] [--dry-run]"
            exit 0
            ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

set -- --agents "$agents_arg" --scope "$scope" --force
if [[ -n "$project_arg" ]]; then set -- "$@" --project "$project_arg"; fi
if [[ "$mode_set" -eq 1 ]]; then set -- "$@" --mode "$mode_arg"; fi
if [[ "$dry_run" -eq 1 ]]; then set -- "$@" --dry-run; fi

exec "$pack_root/install.sh" "$@"
