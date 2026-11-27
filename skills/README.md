# DayZ Mod Studio Agent Skills

A source-audited Agent Skills pack for operating **DayZ Mod Studio 2.3.x** from Codex, OpenCode, Claude Code, Hermes Agent, or another Agent Skills-compatible host.

The pack is an operational layer, not a DayZ modding tutorial. It teaches an agent the real `dayz-backend.exe --cli` contract, the GUI-only boundaries, the state files, and the safety gates. Every command, flag, path, and format is grounded in the shipped 2.3.7 source (commit `556523f8`).

## What is inside

| Skill | Use it for |
|---|---|
| `dayz-mod-studio` | Router, bootstrap, CLI/JSONL contract, success levels, approval gates. Start here. |
| `dayz-mod-studio-environment` | Find the app/backend, DayZ Tools/server/client, project, state, and settings. |
| `dayz-mod-studio-build` | PBO build, signing, key pair, manifest, quick build, package verification. |
| `dayz-mod-studio-deploy` | Transactional local install, launch, targets, checkpoint, rollback, stop safety. |
| `dayz-mod-studio-testing` | `update`/`test`, CE/Hive/UDP readiness, logs, retries, auto-publish trap. |
| `dayz-mod-studio-debugging` | Stage-based diagnosis, log triage, error catalog, minimal fix and re-verify. |
| `dayz-mod-studio-remote` | SSH/SFTP deploy to a Linux server, checks, atomic swap, rollback, files-only. |
| `dayz-mod-studio-workshop` | Owner checks, first item, updates, agreement, visibility, uncertain outcomes. |
| `dayz-mod-studio-textures` | PNG/JPG/TGA -> PAA and PAA -> PNG conversion with partial-error handling. |
| `dayz-mod-studio-models` | GLB -> P3D visual LODs, PAA export, P3D validation/preview, 3D-Generator. |
| `dayz-mod-studio-automation` | Bounded end-to-end loop, evidence, stop rules, rollback, report template. |

Each skill has a `SKILL.md`; deeper material is in `references/`, and deterministic helpers are in `scripts/`. The main skill loads only the focused skill for the requested outcome.

## Requirements

- **Windows 10/11** to run DayZ Mod Studio itself (the app is Windows-only).
- DayZ Mod Studio 2.3.x with `dayz-backend.exe` beside `dayz-mod-studio.exe`.
- DayZ Tools for build/sign/textures; DayZ Server + client for local tests; Blender for GLB export.
- **PowerShell 7+** for `install.ps1`, `update.ps1`, `uninstall.ps1`.
- **Bash + Python 3** for `install.sh`, `update.sh`, `uninstall.sh` on Linux agent hosts.
- An Agent Skills-compatible host. The pack does not install the DayZ app.

The .sh installers can place skill files on Linux, but the DayZ backend still cannot run there.

## Install on Windows

From this `skills` directory:

~~~powershell
pwsh -NoProfile -File .\install.ps1 -Agents all
~~~

This installs all 11 skills for Codex, OpenCode, Claude Code, and Hermes at user scope. The default mode is `auto`: directory junction, then symlink, then copy if links are unavailable.

Common variants:

~~~powershell
# Only the agents you use
pwsh -NoProfile -File .\install.ps1 -Agents codex,claude

# Project scope: skills belong to this mod/project
pwsh -NoProfile -File .\install.ps1 -Agents all -Scope project -ProjectPath "D:\Mods\MyMod"

# Force copies (no links; useful across volumes or locked-down hosts)
pwsh -NoProfile -File .\install.ps1 -Agents all -Mode copy

# Show what would change
pwsh -NoProfile -File .\install.ps1 -Agents all -DryRun
~~~

If a target path already exists and is not owned by this pack, installation stops rather than overwriting it. Use another scope, remove the conflicting path yourself, or choose different agents.

## Install on Linux

For agent hosts on Linux:

~~~bash
chmod +x install.sh update.sh uninstall.sh
./install.sh --agents all
~~~

Common variants:

~~~bash
./install.sh --agents codex,claude
./install.sh --agents all --scope project --project /home/me/DayZ/MyMod
./install.sh --agents all --mode copy
./install.sh --agents all --dry-run
~~~

`install.sh` uses symlinks by default and falls back to copies. It requires `python3` for manifest handling.

## Scopes and agent targets

| Agent | User scope | Project scope |
|---|---|---|
| Codex | `~/.agents/skills` | `<project>/.agents/skills` |
| OpenCode | `~/.config/opencode/skills` | `<project>/.opencode/skills` |
| Claude Code | `~/.claude/skills` | `<project>/.claude/skills` |
| Hermes Agent | `~/.hermes/skills/dayz-mod-studio` | `<project>/.hermes/skills/dayz-mod-studio` |

Notes:

- Codex's legacy `~/.codex/skills` is not installed; current Codex uses `~/.agents/skills`.
- OpenCode's documented native root is used. It may also read other agent roots, but this pack does not rely on that.
- Hermes uses a pack category directory. Project-scoped Hermes skills must be trusted by Hermes before use; run `hermes skills trust` in the project as required by your Hermes version.
- A manual install is possible: copy each `dayz-mod-studio*` directory containing `SKILL.md` into one of these roots. Manual copies are not tracked by the uninstaller.

## Link, copy, and ownership

- **Link mode** keeps one source of truth: the skill directory in this pack. Updates to the pack are visible immediately.
- **Copy mode** is for hosts without junction/symlink support. Each copy contains `.dayz-mod-studio-skill` with its pack name, skill name, version, and source.
- The installer records every path in a manifest:
  - Windows: `%LOCALAPPDATA%\DayZ Mod Studio Skills\install.json`
  - Linux: `$XDG_STATE_HOME/dayz-mod-studio-skills/install.json`, defaulting to `~/.local/state/dayz-mod-studio-skills/install.json`
- Uninstall removes a path only if the manifest entry exists and the link target or copy marker proves ownership. Third-party skills are never removed.
- If you move this pack, existing links point at the old location. Re-run `update` (or uninstall from the old path first) so ownership can be verified and links recreated.

## Verify

Windows:

~~~powershell
Get-ChildItem "$HOME\.agents\skills" -Directory | Select-Object Name
Get-ChildItem "$HOME\.claude\skills" -Directory | Select-Object Name
Get-Content "$env:LOCALAPPDATA\DayZ Mod Studio Skills\install.json"
~~~

Linux:

~~~bash
ls -la ~/.agents/skills
ls -la ~/.claude/skills
cat ~/.local/state/dayz-mod-studio-skills/install.json
~~~

A valid skill has `SKILL.md` with YAML frontmatter containing `name` and `description`. The `name` must match its directory.

If the host does not show the skills, restart the agent session so it rescans the skills directory.

## Use

Ask the agent for the outcome, for example:

- "Find my DayZ Mod Studio installation and this mod."
- "Build and sign this mod, then run the local test server."
- "The server never reaches readiness; diagnose the logs."
- "Deploy build 20261115-112233-aaaabbbb to my Linux test server."
- "Convert these textures to PAA."
- "Check whether this Workshop item belongs to me before publishing."

The `dayz-mod-studio` skill routes to one focused skill. A direct backend check:

~~~powershell
& "C:\Path\To\dayz-backend.exe" --help
& "C:\Path\To\dayz-backend.exe" --project "D:\Mods\MyMod" --json status
~~~

Global flags (`--project`, `--recent`, `--json`, `--verbose`) must appear **before** the command. Prefer `--json` and parse every JSONL event plus the exit code; do not judge success from the last line.

## Update

Windows:

~~~powershell
pwsh -NoProfile -File .\update.ps1 -Agents all
pwsh -NoProfile -File .\update.ps1 -Agents all -Scope project -ProjectPath "D:\Mods\MyMod"
~~~

Linux:

~~~bash
./update.sh --agents all
./update.sh --agents all --scope project --project /home/me/DayZ/MyMod
~~~

Update re-runs the safe installer with `--force`, preserves the recorded link/copy mode unless `--mode` is supplied, and only replaces owned paths.

## Uninstall

Windows:

~~~powershell
pwsh -NoProfile -File .\uninstall.ps1
pwsh -NoProfile -File .\uninstall.ps1 -Agents codex -Scope project -ProjectPath "D:\Mods\MyMod"
pwsh -NoProfile -File .\uninstall.ps1 -DryRun
~~~

Linux:

~~~bash
./uninstall.sh
./uninstall.sh --agents codex --scope project --project /home/me/DayZ/MyMod
./uninstall.sh --dry-run
~~~

Default scope is all manifest entries. Passing `-ProjectPath` limits removal to installs under that project. Refused paths are left in the manifest and reported with exit code 1.

## What the pack will not do

- It will not invent CLI commands for stop-server, P3D preview/validation, GLB export, build browsing, or GUI editing. Those are not in 2.3.7's CLI.
- It will not publish to Steam Workshop or deploy to a production remote server without explicit permission.
- It will not print SSH passwords, tokens, private keys, or Steam credentials.
- It will not delete mod sources or overwrite private keys.
- It will not call a server "ready" from process start alone, or call a mod "working" from packing success alone.
- It will not claim that a local readiness check proves gameplay.

## Compatibility

| Area | Status |
|---|---|
| DayZ Mod Studio | 2.3.7 audited; 2.3.x CLI contract |
| OS for app/backend | Windows 10/11 x64 |
| Agent hosts | Codex, OpenCode, Claude Code, Hermes Agent; other Agent Skills hosts via manual copy |
| Installers | PowerShell 7+ on Windows; Bash + Python 3 on Linux |
| Model export/P3D validation | GUI/internal only; no CLI |
| Functional in-game verification | Manual; not automatable by this pack |

## Source and tests

- Upstream: <https://github.com/Deagles12/dayz-mod-studio>
- Audited commit: `556523f88d17ad14f1377e27ba9f7c16f7fb058a`
- Detailed command/JSON contract: [dayz-mod-studio/references/cli-contract.md](dayz-mod-studio/references/cli-contract.md)
- Version history: [CHANGELOG.md](CHANGELOG.md)
- Test suite and recorded limitations: [tests/README.md](tests/README.md)

The pack was built from source inspection plus offline tests. Tests that require real DayZ Tools, DayZ Server/client, Steam, Blender, or a Linux SSH host are recorded as not run where those were unavailable; see [tests/README.md](tests/README.md).
