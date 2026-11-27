---
name: dayz-mod-studio-build
description: "Build, sign, and verify a DayZ Mod Studio package with AddonBuilder, DSSignFile, and DSCheckSignatures, or run a quick build/install. Use when the user asks to pack PBOs, create a build ID, fix AddonBuilder or signing errors, or prepare a package for local deploy, testing, remote deploy, or Workshop."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x, DayZ Tools with AddonBuilder and DsUtils. A configured project with at least one addon source. Signing requires a matching .biprivatekey/.bikey pair."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Build, sign, and verify

## Purpose

Produce a reproducible package from project sources. A successful build means:

- AddonBuilder ran for every addon.
- Each expected PBO exists and is non-empty.
- If signing is enabled, each PBO has a non-empty `.bisign` and `DSCheckSignatures` found no bad/missing signature.
- A manifest with build ID, file hashes, inputs, and package path was written.
- The package contents did not change while hashing.

A build does **not** install, start a server, publish, or prove the mod works.

## Activate when

- The user asks to build, pack, compile, sign, verify, or create a PBO/package.
- A build ID or package path is needed for deploy/remote/Workshop.
- AddonBuilder, signature, or source-validation errors occur.
- The user asks for a quick build that should also install locally.

Route local install/launch/rollback to `dayz-mod-studio-deploy`. Route server startup and logs to `dayz-mod-studio-testing`.

## Dependencies

- DayZ Tools with `Bin/AddonBuilder/AddonBuilder.exe`.
- If signing: `Bin/DsUtils/DSSignFile.exe`, `Bin/DsUtils/DSCheckSignatures.exe`, and a matching pair of `.biprivatekey` + `.bikey` with the same stem.
- A configured project: `addons`, `mod`, target paths, and signing settings.
- No symlinks or junctions in addon sources or extra package files.

## Choose the command

| Need | Command |
|---|---|
| Package only | `build` |
| Package + local copy into configured quick targets | `quick` |
| Package + local install + test server readiness | `update` (or `test`) |
| Resume an interrupted update | `retry` |

Do not use `quick` as a substitute for `update`. Quick writes `quick-ready.json`, not `tested.json`, and starts no server. Do not use `deploy` to build.

## Procedure

### 1. Verify configuration and prerequisites

```powershell
& $backend --project "D:\Mods\MyMod" --json status
& $backend --project "D:\Mods\MyMod" --json config --get addons
& $backend --project "D:\Mods\MyMod" --json config --get sign
& $backend --project "D:\Mods\MyMod" --json config --get private
& $backend --project "D:\Mods\MyMod" --json config --get public
& $backend --project "D:\Mods\MyMod" --json config --get tools
```

If `status` reports `tools` or `sources` failures, fix them before building. If the user has not authorized a build, stop; building writes state and operation logs but does not alter sources.

Check the command's real options in this build:

```powershell
& $backend build --help
```

Do not use global flags after `build`.

### 2. Inspect source rules

For each path in `addons` (newline-separated):

- It must resolve inside the project root.
- `config.cpp` must exist and contain `class CfgPatches` or an `#include`.
- It must not be duplicated.
- The PBO name must match `[\w-]+` (letters, digits, underscore, hyphen), be unique case-insensitively, and not be a Windows reserved name.
- The prefix must not contain CR, LF, or NUL.
- No symlink or junction may exist anywhere in the tree.
- Private keys (`.biprivatekey`, `.pem`, `.pfx`, `.p12`, `.key`) must not be in the source. The app rejects them in the source snapshot and excludes them from the copied stage.

Per-addon name/prefix overrides can come from `addon_options`; a single addon can use `addon_name` and `prefix`. Otherwise `$PBOPREFIX$` or the folder name is used. Do not "fix" a duplicate PBO by renaming generated output; rename the addon or set an explicit unique name.

### 3. Resolve signing

If `sign=true`:

- `private` must end in `.biprivatekey`.
- `public` must end in `.bikey`.
- Both stems must match.
- Both files must exist.
- `tools` must contain `DSSignFile.exe` and `DSCheckSignatures.exe`.
- A shared client profile may require signing even if a test seems easier unsigned.

To create a pair, if the user authorizes a new key pair:

```powershell
& $backend --project "D:\Mods\MyMod" --json keys my_mod_key
```

This runs `DSCreateKey.exe` into project state `signing/my_mod_key/` and returns the public/private paths. It does **not** configure them. It refuses to overwrite an existing pair. Then, only after confirming the paths:

```powershell
& $backend --project "D:\Mods\MyMod" --json config `
  --set private "C:\Users\me\AppData\Local\DayZ Mod Studio\projects\<hash>\signing\my_mod_key\my_mod_key.biprivatekey" `
  --set public  "C:\Users\me\AppData\Local\DayZ Mod Studio\projects\<hash>\signing\my_mod_key\my_mod_key.bikey" `
  --set sign true
```

Never overwrite, regenerate, or delete existing signing material without explicit permission. Never print private key contents.

### 4. Build

```powershell
& $backend --project "D:\Mods\MyMod" --json build
```

Build ID format is `YYYYMMDD-HHMMSS-<8 hex>` in local time. The output package is:

```text
%LOCALAPPDATA%\DayZ Mod Studio\projects\<state-key>\builds\<build-id>\@MyMod\
  Addons\<Name>.pbo
  Addons\<Name>.pbo.<key-stem>.bisign   when signed
  Keys\<key-stem>.bikey                  when signed
  mod.cpp                                when metadata configured
  <extra files>
```

The result includes `buildId`, `built`, `signed`, `files`, `status`, and `log`. On failure, inspect the operation log; AddonBuilder's full output is in the report log.

### 5. Verify the artifact

Success evidence, not just exit code:

1. `buildId` is non-empty and matches the new `builds/<id>` directory.
2. `manifest.json` exists with `id`, `package`, `inputs`, `files`, `signed`.
3. Every PBO listed in `files` exists and has non-zero size.
4. If signed, a `.bisign` exists for each PBO and is non-zero.
5. `signed` reflects the actual setting.
6. `inputs` hashes were stable: the build itself would have failed with "sources changed during the build" otherwise.
7. The build did not accidentally include a private key: inspect `files` keys for sensitive suffixes.

Useful read-only checks:

```powershell
Get-Content "C:\...\builds\<id>\manifest.json" -Raw | ConvertFrom-Json
Get-ChildItem "C:\...\builds\<id>\@MyMod\Addons"
```

Do not run DSCheckSignatures manually against a different Keys folder; the build already did it with the package Keys. If the result says signed but verification failed, treat the build as failed.

### 6. If the user wants a quick build/install

Only after the package behavior is desired:

```powershell
& $backend --project "D:\Mods\MyMod" --json quick
```

Quick:

- Builds and signs with the current settings.
- Copies to configured quick targets (`copy_server`, `copy_client`).
- Saves `quick-ready.json`.
- Does not start a test server, create `tested.json`, or publish.
- Does not save modified settings. Configure before running.

If the user's goal is "make sure the server starts", use `update`, not `quick`.

## Examples

### Normal signed build

```powershell
& $backend --project "D:\Mods\MyMod" --json build
```

Interpret: exit 0 + `status=complete` + `built=true` + a new manifest. Report `buildId` and package path. Do not claim the mod loads.

### Build without a test server

The CLI has no "build only, never install" ambiguity: `build` is package-only. Use it when the user wants artifacts for another machine.

### Signing pair mismatch

```text
Choose a matching .biprivatekey and .bikey pair.
```

The stems differ or the extension is wrong. Fix configuration after locating the intended existing pair. Do not generate a new pair silently; a new key invalidates the trust relationship for clients/servers.

### Source changed during build

```text
Build inputs changed during the build. Rebuild the package.
```

A preparation step, editor, or another process modified sources after snapshotting. Stop the writer and rebuild. Do not edit the manifest.

## Common errors and fixes

| Error | Meaning | Correct action |
|---|---|---|
| `AddonBuilder not found` | Wrong `tools` or missing executable | Point `tools` at DayZ Tools containing `Bin/AddonBuilder/AddonBuilder.exe`. |
| `AddonBuilder could not build ...` | Non-zero exit or no PBO | Read the operation log; fix config.cpp/source or path. |
| `AddonBuilder reported an error` | Output matched an error line despite success exit | Treat as failure; inspect full AddonBuilder output. |
| `The PBO is empty` | Nothing packed | Add real content, or correct `pack`/source path. |
| `Invalid or duplicate PBO name` | Name violates pattern, duplicates, or is reserved | Set a unique valid `addon_name`/`addon_options`. |
| `Duplicate addon folder or path outside the source folder` | Wrong `addons` entry | Use a unique relative path inside the project. |
| `Choose a mod folder containing an addon with config.cpp` | No valid CfgPatches/include | Select the actual addon folder. |
| `Symbolic link or junction` | Link in source/package path | Replace with real content; do not disable the check. |
| `Move private keys out of the addon source` | Secret in source tree | Move keys outside; do not include them in the PBO. |
| `Could not sign PBO` | DSSignFile failed/no signature | Check tools, key path, permissions, and output log. |
| `Signature verification failed` | Bad/missing signature | Stop; inspect key pair and signing tools. Do not deploy. |
| `Build inputs changed during the build` | Concurrent edits/prep | Stop writers and rebuild. |
| `Another instance ... operation` | Global operation lock | Wait or close the other Studio operation; do not delete lock state. |

## Safety and limitations

- Creating a new key pair is a trust decision. Require explicit permission.
- Do not replace an existing private key to make a signature pass.
- Do not disable signing for a shared profile or production package merely to bypass an error.
- Do not add arbitrary `prep_exe` commands; that setting executes a program before build.
- Do not copy private keys into sources, PBOs, Workshop packages, or chat.
- The build proves format/signature integrity, not DayZ loadability or gameplay.
- A signed build can still fail at server startup due to config, dependencies, or scripts.

## Source anchors

- Build, sign, manifest: `backend/pipeline.py` lines 384–549.
- Addon discovery: `backend/pipeline.py` lines 109–148.
- Signing tools and key pair checks: `backend/pipeline.py` lines 369–381.
- Key generation: `backend/sidecar.py` lines 411–433.
- Quick build: `backend/quick_build.py`.
- References: `references/build-pipeline.md`, `references/addon-rules.md`.
