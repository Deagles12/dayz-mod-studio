# Paths, state, and discovery

## Installation layout

A packaged DayZ Mod Studio directory normally contains:

```text
DayZ Mod Studio\
  dayz-mod-studio.exe        GUI entry point; no args opens GUI
  dayz-backend.exe           CLI and Python sidecar host
  ...bundled runtime files
  output\
    models\                  default model export root
    textures\                default texture export root
  projekt\                   default GUI workspace on first run
```

`install_directory()` is the executable's directory when frozen, otherwise the repository root. The default output folders are `<install>\output\models` and `<install>\output\textures`. A portable copy under Program Files may be unable to write there; pass an existing writable `--output` for textures or choose an export folder in the GUI.

The app is portable in the sense that the executable directory can move. Per-installation recent-project state is keyed by the executable directory, so a copied app does not inherit the original's recent project.

## Machine store

`STORE` is:

```text
%LOCALAPPDATA%\DayZ Mod Studio
```

If `LOCALAPPDATA` is missing, the backend falls back to the user's home directory. There is no project-level environment variable that changes the store; changing `LOCALAPPDATA` for the process changes both state and detection in a way that can look like data loss. Do not do that to "fix" a project.

```text
%LOCALAPPDATA%\DayZ Mod Studio\
  environment.json          shared machine paths saved by GUI/config
  interface.json            UI language/preferences
  projects\
    <20 hex chars>\
      project.json          saved project settings
      recent.json           per-installation recent project (stored under the app's hash)
      builds\<build-id>\... package, manifest.json
      logs\<timestamp>.log  operation logs
      operations\...        operation records (last 20 exposed)
      backups\...           transaction recovery copies
      tested.json           last fully ready local test build
      quick-ready.json      last quick build/install build
      local-ready.json      last verified local install build
      deployment.json       current local deployment checkpoint
      previous.json         target for local rollback
      retry.json            resumable interrupted update
      package-checkpoint.json
      server-readiness.json
      server-console.log
      signing\<name>\       generated key pairs
      workshop-*.json       attempt/draft/confirmation records
```

### State key

```python
sha256(str(project_root).casefold().encode()).hexdigest()[:20]
```

The project root is resolved first. Renaming/moving a project creates a different key. State is not automatically migrated. A symlink path and its target can produce different keys if passed differently; pass the real project root consistently.

### Recent project

`recent.json` lives under the state directory for the **application installation directory**:

```text
projects\<sha256(casefold(install_directory))[:20]>\recent.json
```

It stores `{"project": "..."}`. `--recent` uses it for normal commands and textures. There is no CLI command to set it; opening a project in the GUI does. Use `--project` in automation.

## Project layout recognized by the app

```text
MyMod\
  config.cpp                 optional at root; can itself be an addon
  mod.cpp                    optional metadata candidate
  Source\mod.cpp              alternative metadata candidate
  mod\mod.cpp                 alternative metadata candidate
  addons\Core\
    config.cpp               must contain class CfgPatches or an #include
    $PBOPREFIX$              optional prefix text
    ...assets
  addons\Core2\config.cpp
```

Discovery excludes:

```text
.git .dayz-studio build backups work tests tools releases release
outputs node_modules assets missions
hidden directories (leading .) and directories starting with @
symbolic links and junctions
```

It does not descend beyond four path components relative to the project. Adding an ignored folder as `addons` is allowed only if it is inside the project and contains `config.cpp`; the build still rejects links and reserved names.

## DayZ install detection

Markers:

| Key | Folder marker |
|---|---|
| `tools` | `Bin/AddonBuilder/AddonBuilder.exe` |
| `server` | `DayZServer_x64.exe` |
| `client` | `DayZ_BE.exe` |

The default configured paths are `F:/Steam/steamapps/common/DayZ Tools`, `.../DayZServer`, and `.../DayZ`. Detection reads Steam's registry paths and `steamapps/libraryfolders.vdf`, then checks the markers. A configured path that lacks its marker is ignored by detection and the Steam result is used; the failed configured path can still fail later checks. Prefer setting all three explicitly and verifying with `status`.

## Export folders

- Default: `<install>\output\models` and `<install>\output\textures`.
- `--output` for textures must already exist. The backend resolves it strictly and creates an `export-*` child.
- The GUI/model exporter creates a unique model subfolder, never overwriting an existing model folder.
- `--show-output` for textures prints the folder without creating a conversion folder? It returns the configured/default root; `output_folder` creates the root if needed.
- `--open` uses the Windows shell and only works where a desktop session exists.

## Read-only inspection commands

```powershell
python scripts/find_studio.py --json
python scripts/find_studio.py --json --project "D:\Mods\MyMod"
& $backend --project "D:\Mods\MyMod" --json status
& $backend --project "D:\Mods\MyMod" --json history
& $backend --project "D:\Mods\MyMod" --json logs
```

`history` returns the last 20 operation records. `logs` returns the newest operation log, capped to the last 500 KB by the internal reader. Neither starts a build or server.

## Source anchors

- `backend/pipeline.py` lines 18–20 (store, kit), 109–228 (discovery/defaults), 313–324 (state).
- `backend/sidecar.py` lines 56–104 (state/recent/project), 240–261 (status payload).
- `backend/export_folders.py` (install directory and default output).
- `backend/test_workflow.py` lines 10–12 (shared settings keys).
