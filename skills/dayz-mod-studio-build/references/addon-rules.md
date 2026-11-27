# Addon source and package rules

## Addon paths

`addons` is a newline-separated string. Each line is a path relative to the project root. The app:

1. Resolves it.
2. Requires the result to be inside the project.
3. Requires `config.cpp` in that exact folder.
4. Rejects the same resolved folder twice.
5. Requires CfgPatches or an include for initial project validation.

Nested addons are allowed only if listed separately. Pointing `addons` at the project root only works when the root itself has a valid `config.cpp`.

## Name and prefix

For each addon:

- explicit `addon_options[<relative>].name` wins;
- else, with exactly one addon, `addon_name`;
- else the folder name.
- explicit `prefix` wins;
- else, with exactly one addon, `prefix`;
- else `$PBOPREFIX$` contents;
- else the name.

PBO name must match `[\w-]+` and be unique case-insensitively across the build. Windows reserved device names are rejected because the app checks `<name>.pbo` with `Path.is_reserved()`.

The prefix may contain path separators for a nested addon prefix. It may not contain CR, LF, or NUL. Do not add a trailing newline; the marker file is rewritten with the resolved prefix.

## `$PBOPREFIX$`

If present in the addon root, its content is copied into the staged tree and overwritten with the resolved prefix. This means:

- Editing the marker in the source controls the default prefix.
- An explicit `prefix`/override changes the staged marker without changing the source file.
- Do not use the marker for arbitrary metadata.

## `addon_options`

A JSON object stored as a string:

```json
{
  "addons/Core": {"name": "MyMod_Core", "prefix": "MyMod/Core"},
  "addons/Weapons": {"name": "MyMod_Weapons", "prefix": "MyMod/Weapons"}
}
```

Every value must be a string; every option object must be an object. Empty values are dropped. Invalid JSON fails before build. Set it with careful quoting:

```powershell
& $backend --project "D:\Mods\MyMod" --json config --set addon_options '{"addons/Core":{"name":"MyMod_Core","prefix":"MyMod/Core"}}'
```

PowerShell single quotes preserve the JSON double quotes. Verify with `config --get addon_options`.

## Source content exclusions

When staging, the app excludes any file/directory named:

```text
.git  .dayz-studio  __pycache__  .venv
```

and any name starting with `.env` (case-insensitive), plus files with extensions:

```text
.biprivatekey  .pem  .pfx  .p12  .key
```

Separately, the source snapshot rejects the addon tree if any of those private-key extensions is present. Excluded from the PBO is not the same as safe to keep in source.

## Extra package files

`extra` is newline-separated. A root `meta.cpp` is added automatically if present. Each extra file must:

- exist;
- resolve inside the project;
- not be a symlink/junction;
- have extension `.cpp`, `.md`, `.txt`, `.paa`, `.png`, `.jpg`, `.jpeg`, or `.xml`;
- not start with a dot.

Extras are copied into the package root, flat, by basename. Two extras with the same basename collide/overwrite; avoid that. They are not added to `Addons`.

## Metadata

`metadata` is a `.cpp` file. It is copied to package root as `mod.cpp`. Auto-detection looks for `mod.cpp`, `Source/mod.cpp`, then `mod/mod.cpp`. Explicit metadata wins. Metadata contributes to the input hash.

## Pack-only mode

`pack` adds AddonBuilder `-packonly`. It is inferred true when no selected addon tree contains a `.p3d` or `.rtm`. Empty PBO output still fails. Do not infer that a pack-only PBO is a complete playable mod; it only reflects source composition.

## Mod folder name

`mod` must match `@[\w-]+`. It is the package folder and the installed folder. Do not include a path, spaces, or a semicolon. The default is `@` plus the sanitized project directory name.

## Pre-build executable

`prep_exe` runs before source snapshotting and AddonBuilder, with cwd = project root. `prep_args` is newline-separated. There is no shell interpolation by the app. This is arbitrary code execution in the project context. Only keep it if the user owns and trusts it; never add one because a build is failing.

## Common rule violations

| Violation | Detection |
|---|---|
| Addon outside root | `path outside the source folder` |
| Duplicate folder | `Duplicate addon folder` |
| Missing config.cpp | `File not found` |
| No CfgPatches/include | project validation error |
| Duplicate PBO | `Invalid or duplicate PBO name` |
| Reserved name | `Invalid or duplicate PBO name` |
| CR/LF in prefix | `Invalid PBO prefix` |
| Link in tree | `Symbolic link or junction` |
| Private key in addon | `Move private keys out of the addon source` |
| Bad extra extension | `Unsupported package file` |
| Metadata not cpp | `Metadata must be a .cpp file` |
| Source changed | `Build inputs changed during the build` |

## Source anchors

- `backend/pipeline.py` lines 109–148 (discover/addon info), 384–405 (specs), 420–506 (staging/build/extras/metadata).
- `backend/sidecar.py` lines 126–148 (addon options).
