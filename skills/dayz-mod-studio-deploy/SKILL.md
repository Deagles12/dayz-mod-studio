---
name: dayz-mod-studio-deploy
description: "Install a built DayZ Mod Studio package into local server/client folders, launch a configured local test session, and roll back the last local install. Use after build when the user wants local deployment, a quick install, launch, or recovery of the previous files."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x, a verified package from build, and configured local server/client paths. Rollback depends on the previous install record and its backup folder."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Local deploy, launch, and rollback

## Purpose

Move a verified package into the configured local server/client targets with backup and atomic replacement, start the configured local server (and optionally client), and restore the immediately previous installation when needed.

This is a **local, reversible** operation. It is not a remote deployment and not proof that the mod loads.

## Activate when

- A package was built and the user wants it installed locally.
- The user asks to launch the local test server or client from an installed package.
- A local install failed and the previous files should be restored.
- The user asks about `deployment.json`, `previous.json`, or backup folders.

Route a combined build/install/server-readiness request to `dayz-mod-studio-testing` (or automation), not here. Route remote hosts to `dayz-mod-studio-remote`.

## Dependencies

- A package built by `build`, with `package-checkpoint.json` for `deploy`.
- For `launch`: a successful `deploy` (or `update`) with `deployment.json`.
- Configured server/client roots and `mod` name.
- For signed installs, a valid key; the server `Keys` folder must not contain a different key with the same name.
- No links/junctions in targets or keys.

## Procedure

### 1. Confirm the package and freshness

```powershell
& $backend --project "D:\Mods\MyMod" --json status
& $backend --project "D:\Mods\MyMod" --json history
```

Check:

- `status.packageReady` (a package checkpoint exists); if a tested/local build record exists, compare `status.localBuild.buildId`.
- `status.sourcesChanged`. If true, the last build is stale relative to source. Ask whether to rebuild; do not silently install an old package.
- Target configuration checks: `server`, `client`, paths, `mod`.

`deploy` installs the package recorded in `package-checkpoint.json`. It does not rebuild. If no package checkpoint exists, it fails with "Create a package with build first."

### 2. Review targets before writing

```powershell
& $backend --project "D:\Mods\MyMod" --json config --get server
& $backend --project "D:\Mods\MyMod" --json config --get client
& $backend --project "D:\Mods\MyMod" --json config --get mod
& $backend --project "D:\Mods\MyMod" --json config --get shared
& $backend --project "D:\Mods\MyMod" --json config --get separate
```

Normal `deploy` targets:

- always `<server>/<mod>`;
- additionally `<client>/<mod>` when `shared=true` and `separate=true` and client/server differ.

Quick targets (from `quick`) use `copy_server` and `copy_client` instead.

The app refuses:

- targets inside the project source or Steam Workshop;
- overlapping targets;
- links, non-directories, or permissions problems;
- a server `Keys` folder overlapping the project;
- a conflicting existing `.bikey` with the same filename but different contents;
- semicolons in mod paths.

Do not "clean" a target by deleting it first. The app's transaction creates a backup and restores on failure.

### 3. Deploy

```powershell
& $backend --project "D:\Mods\MyMod" --json deploy
```

The app:

1. Loads `package-checkpoint.json`.
2. Verifies package hashes against the manifest.
3. Stops the matching local test server/client session first.
4. Creates a recovery directory under state `backups/<uuid>` with `recovery.json`.
5. Copies the package to staging and atomically swaps targets.
6. Copies package keys to `<server>/keys` if not already identical.
7. Verifies installed trees and keys.
8. Writes `deployment.json` and updates `previous.json` to point at this install's backup records.
9. Reports `installed=true`, target paths, and `buildId`.

Use the **result's** `installed` and `updated` fields as evidence; exit 0 alone is weak. Then confirm target files exist and hashes match if the report says so.

### 4. Launch local test

```powershell
& $backend --project "D:\Mods\MyMod" --json launch
```

`launch` does not build or install. It:

- requires `deployment.json` with `installed=true`;
- verifies the installed package;
- starts the configured server hidden;
- waits for the same CE/UDP readiness as `update`;
- starts the client because launch requests `start_client=True`;
- may save `tested.json` after readiness, even though it did not build.

It fails if no deployment exists ("Install a package with deploy or update first"). If the user only wants the server, use `update` with `open_dayz=false`; there is no separate CLI server-only launch.

Do not run `launch` as a substitute for `deploy`. It will run the already installed files.

### 5. Roll back

```powershell
& $backend --project "D:\Mods\MyMod" --json rollback
```

Preconditions:

- `previous.json` exists from the last normal install.
- Configured target paths still match the recorded targets.
- Every recorded backup that existed is still present under state `backups/`.

Behavior:

- Normal install: stops the matching server/client, atomically restores the prior target trees and keys. If the target did not exist before the install, rollback removes the installed target.
- Quick install: the previous record has `mode=quick`; rollback uses quick mode and does not stop a test server.
- Clears `previous.json`; normal rollback also clears `retry.json`, `deployment.json`, `tested.json`, and `local-ready.json`.
- Leaves backups and server profile/mission storage intact.

There is only one previous deployment. A second deploy overwrites the rollback point. If the user needs multiple historical versions, use separate build IDs/packages, not repeated deploys.

### 6. Verify

```powershell
& $backend --project "D:\Mods\MyMod" --json status
```

Report:

- Build ID and target paths.
- Installed files count / key paths.
- Whether `previous.json` still exists for another rollback.
- For launch: `serverReady`, readiness log evidence, PID/session evidence, and the fact that in-game behavior is unverified.
- For rollback: restored target and whether it removed a first install.

## Examples

### Build, then install

```powershell
& $backend --project "D:\Mods\MyMod" --json build
# inspect buildId and manifest
& $backend --project "D:\Mods\MyMod" --json deploy
```

### Recover the previous local install

```powershell
& $backend --project "D:\Mods\MyMod" --json rollback
```

Do not run `rollback` when no previous install is recorded; it will fail rather than guess.

### Quick build already installed

`quick` writes `previous.json` with quick mode. A subsequent `rollback` restores the pre-quick target without starting/stopping the server. If the user expects a test, run `update` instead.

## Common errors and fixes

| Error | Meaning | Correct action |
|---|---|---|
| `Create a package with build first` | No `package-checkpoint.json` | Run `build` (not just quick) or `update`. |
| `Install a package with deploy or update first` | No deployment checkpoint | Run `deploy` or `update`. |
| `Build files have changed` | Package was modified after build | Rebuild; do not deploy. |
| `Deployment folders overlap` | Targets are same/nested | Fix server/client/mod settings. |
| `Choose a deployment folder outside the project and Steam Workshop` | Unsafe target | Use a real local DayZ test folder. |
| `The server already has a different key named ...` | Key filename collision | Use a uniquely named pair; do not overwrite the server key. |
| `The server keys folder is a link` | Unsafe keys path | Replace with a real directory. |
| `Another DayZ session is running` | App refuses to kill unrelated session | Ask the user to close it; do not force-kill. |
| `UDP port ... already in use` | Port conflict | Stop the owning test session or change port; never kill an unrelated process. |
| `Installation paths have changed since deployment` | Rollback targets no longer match | Restore original settings or roll back manually with a plan. |
| `Backup is missing` | Recovery data deleted/moved | Do not fabricate; inspect `backups/` and state. |
| `A file is in use by another process` | DayZ/editor lock | Close the owning process or wait; do not force delete. |

## Safety and limitations

- Local install is reversible only for the immediately previous deployment. Do not promise arbitrary history.
- The app stops only its matching local test session. It refuses when another DayZ session is present. Never bypass with `taskkill`.
- Do not pre-delete targets. That destroys the backup/transaction guarantee.
- `deploy` can install a stale package. Always check `sourcesChanged` / build ID freshness.
- `launch` starting the client does not prove a network connection or gameplay; `clientLaunched` is not `connected`.
- Do not copy private keys into installed targets; only `.bikey` is installed.
- Backups are under the machine state store, not in the project. Moving the project changes the state key and loses the app's rollback link.

## Source anchors

- Install transaction/backups: `backend/pipeline.py` lines 241–311, 690–735.
- Rollback: `backend/pipeline.py` lines 736–756.
- Deploy/launch handlers: `backend/sidecar.py` lines 534–559.
- Process safety: `backend/pipeline.py` lines 611–677.
- Quick install: `backend/quick_build.py`.
- Reference: `references/local-deploy.md`.
