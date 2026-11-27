---
name: dayz-mod-studio-environment
description: "Find and verify a DayZ Mod Studio installation, its dayz-backend, DayZ Tools, DayZ Server, DayZ client, project root, state directory, and settings. Use before any build, deploy, test, Workshop, texture, model, or remote operation, or when a project is not configured."
compatibility: "Windows 10/11. Python 3.10+ only for the read-only finder script; the CLI itself is bundled. DayZ Mod Studio 2.3.x and its Python sidecar."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Environment and project discovery

## Purpose

Establish the real installation and project context before touching a mod. Portable copies are common, machine state is not beside the executable, and `--recent` is scoped to one installation. Guessing paths is the most common cause of incorrect builds.

## Activate when

- The user asks to "use DayZ Mod Studio" but no executable path is known.
- `dayz-backend.exe` is missing, the app is portable, multiple copies exist, or `--recent` points to nothing.
- A build fails because DayZ Tools, the server, the client, the project root, addons, or settings are unresolved.
- The user wants to configure a project or inspect readiness without changing code.

Do not use this skill to build or deploy. Once context is known, route to the appropriate skill.

## Dependencies

- Windows 10/11 for the app.
- DayZ Mod Studio 2.3.x directory containing `dayz-mod-studio.exe` and normally `dayz-backend.exe`.
- DayZ Tools (AddonBuilder, DSCreateKey, DSSignFile, DSCheckSignatures, ImageToPAA) for the operations that need them.
- DayZ Server and client for local testing, not for a pure package build.
- Python 3.10+ only for `scripts/find_studio.py`; do not require it when the user only runs the packaged backend.

## Procedure

### 1. Locate the app and backend

Run the read-only finder from this skill:

```powershell
python scripts/find_studio.py --json
```

If the app is outside standard locations, add one or more bounded search roots:

```powershell
python scripts/find_studio.py --json --search-root "D:\Portable" --search-root "E:\Tools"
```

If the user gives an explicit path, prefer it:

```powershell
python scripts/find_studio.py --json --studio "D:\Apps\DayZ Mod Studio\dayz-mod-studio.exe"
python scripts/find_studio.py --json --backend "D:\Apps\DayZ Mod Studio\dayz-backend.exe"
```

The finder checks environment variables, `PATH`, Windows App Paths, uninstall entries, common portable locations, and only then a bounded walk. It does not create files or change settings.

Select a candidate only after checking that:

1. `dayz-backend.exe` exists beside the app, or an explicit backend is provided.
2. `dayz-backend.exe --help` runs and lists the expected commands.
3. The executable is the copy the user expects. If several copies exist, ask which one; do not silently choose a random portable copy.

Do not launch `dayz-mod-studio.exe` without `--cli`; no arguments opens the GUI.

### 2. Verify the CLI

```powershell
& "D:\Apps\DayZ Mod Studio\dayz-backend.exe" --help
& "D:\Apps\DayZ Mod Studio\dayz-backend.exe" --project "D:\Mods\MyMod" --json status
```

The CLI is newline-delimited JSON when `--json` is present and global flags are before the command. A clean `--help` proves the parser starts; it does not prove DayZ Tools or the project are ready.

### 3. Locate DayZ content

The finder reports Steam libraries and the default folders:

| Component | Required marker | Default when no Steam detection |
|---|---|---|
| DayZ Tools | `Bin/AddonBuilder/AddonBuilder.exe` | `F:/Steam/steamapps/common/DayZ Tools` |
| DayZ Server | `DayZServer_x64.exe` | `F:/Steam/steamapps/common/DayZServer` |
| DayZ client | `DayZ_BE.exe` | `F:/Steam/steamapps/common/DayZ` |

A configured path is accepted only if its marker exists; otherwise the app falls back to Steam library detection. The finder's Steam results are evidence, not an override. To change paths, use `config --set` or the GUI, then rerun `status`.

Do not move or modify the DayZ installation. Do not infer a server path from the client path.

### 4. Resolve the project

Use, in order:

1. An absolute path supplied by the user.
2. `--recent`, which reads the last project opened by this installation.
3. The current directory only when the user intentionally works there.

`--recent` is stored under machine state keyed by the app installation directory. A copied portable app has a different recent project. A missing recent project is not a broken project; ask for the path.

Inspect a project without building:

```powershell
python scripts/find_studio.py --json --project "D:\Mods\MyMod"
& $backend --project "D:\Mods\MyMod" --json status
& $backend --project "D:\Mods\MyMod" --json config
```

A project normally needs:

- A `config.cpp` containing `class CfgPatches` or an `#include`, or an addon directory with one.
- At least one addon source folder inside the project. Discovered addon paths are relative.
- Optional `mod.cpp` at the project root, `Source/mod.cpp`, or `mod/mod.cpp`.
- Optional `$PBOPREFIX$` inside each addon.
- No symlinks or junctions anywhere in the addon source tree.

Addon discovery walks to depth less than 5 and ignores `.git`, `.dayz-studio`, `build`, `backups`, `work`, `tests`, `tools`, `releases`, `release`, `outputs`, `node_modules`, `assets`, `missions`, hidden directories, `@` directories, and links. Do not add an ignored directory as an addon just to bypass this; it will fail validation.

### 5. Read state, checks, and next actions

`status --json` returns the project root, whether settings are configured, `checks`, `commands`, `builds`, `backups`, `logs`, readiness booleans, publication state, and the selected remote build. Read every `checks[]` entry:

```json
{"key":"tools","ok":false,"detail":"..."}
```

Do not proceed with a command whose prerequisite check fails. Fix the environment first. `status` is read-only and does not create a build.

Machine state is at:

```text
%LOCALAPPDATA%\DayZ Mod Studio\
  environment.json
  interface.json
  projects\<sha256(casefold(project_root))[:20]>\
    project.json
    builds\  logs\  operations\  backups\
    tested.json  quick-ready.json  local-ready.json
    deployment.json  previous.json  retry.json
    package-checkpoint.json  server-readiness.json
    workshop-*.json
```

The project state key is derived from the absolute, resolved root (case-folded). Moving or renaming the project creates a new state directory; old builds are not automatically migrated. Do not delete state to "fix" a check.

### 6. Configure only through real keys

List keys:

```powershell
& $backend --project "D:\Mods\MyMod" --json config
```

Read one:

```powershell
& $backend --project "D:\Mods\MyMod" --json config --get tools
```

Set one or more existing keys:

```powershell
& $backend --project "D:\Mods\MyMod" --json config `
  --set tools "D:\Steam\steamapps\common\DayZ Tools" `
  --set server "D:\Steam\steamapps\common\DayZServer" `
  --set client "D:\Steam\steamapps\common\DayZ" `
  --set addons "addons/Core" `
  --set port 2402 `
  --set timeout 420 `
  --set sign true
```

Rules enforced by `cli_config`:

- The key must already exist. There is no create-key operation.
- Boolean settings accept only `true` or `false`, case-insensitive.
- Non-boolean settings are stored as strings, including ports and timeouts.
- The project is validated after all pairs are applied; invalid values fail and no settings are saved.
- `config` without `--set` never saves.
- `--get` and `--set` are mutually exclusive.
- `quick` uses current settings but does not save settings. Configure first.

See `references/settings.md` for all settings and defaults.

### 7. Verify

```powershell
& $backend --project "D:\Mods\MyMod" --json status
```

Report:

- Selected app/backend paths, or that none was found.
- DayZ Tools/server/client paths and their marker checks.
- Project root and state directory.
- Which checks fail, in the app's words.
- Whether a command is now safe to run and which one.

## Examples

### Portable app outside standard paths

```powershell
python scripts/find_studio.py --json --search-root "D:\DayZ-Tools"
```

If two app folders are returned, report both and ask which one owns the settings. Do not merge their recent projects.

### New project with no saved settings

```powershell
python scripts/find_studio.py --json --project "D:\Mods\NewMod"
& $backend --project "D:\Mods\NewMod" --json status
```

`status` can return defaults plus failed checks before any GUI save. That is not a configured project. Set the required paths and addons with `config --set`, then rerun status.

### Machine-wide environment changes

The GUI may save shared machine paths to `environment.json`. `project.json` can override with `environment_override`. Treat this as a deliberate project decision; never set `environment_override` merely to hide a failing path.

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `Project directory not found` | Wrong path or relative path from unexpected cwd | Use an absolute path and verify it exists. |
| `No recent project` | Different portable copy or no GUI-opened project | Pass `--project`; do not fabricate a recent entry. |
| `Unknown setting` | Invented key | List keys with `config --json` and use an existing one. |
| `true / false` | Non-boolean value for a boolean key | Send exactly `true` or `false`. |
| `DayZ Tools` check fails | Wrong folder or missing AddonBuilder | Point `tools` at the folder containing `Bin/AddonBuilder`. |
| Addon check fails | `addons` empty, outside project, link, or no CfgPatches | Correct the source tree/path; do not disable validation. |
| Source tree contains links | Build rejects links/junctions | Replace links with real files or use a separate copy. |
| `recent` disappears after copying app | Recent state is per installation | Use `--project` or reopen the project in the new copy. |

## Safety and limitations

- Discovery is read-only. The finder does not save configuration or touch the project.
- Do not scan all of `C:\` or a network share without the user's consent; use `--search-root`.
- Never delete state or keys to bypass a check.
- Never expose full settings containing private paths, SSH users, or tokens in a public report. Redact as needed.
- DayZ Mod Studio is Windows-only. Finding files on Linux does not make the backend runnable.
- A successful `--help` does not validate DayZ Tools, the server, Steam, or the project.

## Source anchors

- Project selection and state: `backend/sidecar.py` lines 56–104, 647–670.
- Settings defaults and install detection: `backend/pipeline.py` lines 109–228.
- Shared environment keys: `backend/test_workflow.py` lines 10–12.
- GUI/CLI forwarding: `src-tauri/src/main.rs`.
- References: `references/settings.md`, `references/paths-and-state.md`.
