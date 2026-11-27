---
name: dayz-mod-studio-textures
description: "Batch-convert PNG/JPG/TGA images to DayZ PAA, or decode PAA to PNG, using DayZ Tools ImageToPAA through DayZ Mod Studio. Use for texture conversion, preview extraction, output folder selection, partial-failure handling, and validating produced PAA/PNG headers."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x, DayZ Tools with Bin/ImageToPAA/ImageToPAA.exe. No project is required if the Tools path is known. 1–100 files per invocation."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Texture conversion

## Purpose

Convert textures in bulk with the same ImageToPAA executable the app uses:

- `.png`, `.jpg`, `.jpeg`, `.tga` -> `.paa`;
- `.paa` -> `.png`.

Each success is copied to a fresh output folder; failures are collected per file.

## Activate when

- The user asks to convert textures to PAA or decode PAA for inspection.
- A texture pipeline/CI step needs a batch conversion.
- A conversion partially failed and the successful outputs must be preserved.
- The user asks where converted textures are written.

This is **not** image authoring, PBR map generation, or a 3D-Generator workflow. Use `dayz-mod-studio-models` for the batch 3D archive workflow.

## Dependencies

- DayZ Tools containing `Bin/ImageToPAA/ImageToPAA.exe`.
- 1–100 input files per command.
- An existing writable output directory if `--output` is used.
- Source files readable; 60 s per-file converter timeout.

## Procedure

### 1. Find Tools and verify the command

~~~powershell
& $backend --project "D:\Mods\MyMod" --json config --get tools
& $backend textures --help
~~~

If no project is configured, pass the tool path directly:

~~~powershell
& $backend --json textures --tools "F:\Steam\steamapps\common\DayZ Tools" --show-output
~~~

`--show-output` must be used **without** files. It prints/returns the output root and does not convert.

### 2. Choose output behavior

- Default root: `<install>\output\textures`.
- With `--output`: that directory must already exist; the app creates a new `export-*` child inside it.
- Every invocation gets a new folder; existing files are not overwritten.
- Name collisions within the batch become `<stem>_02.paa`, `<stem>_03.paa`, etc.
- Output stem is sanitized: non `[a-zA-Z0-9_-]` becomes `_`, trimmed, max 80 chars, fallback `texture`.
- A batch with no successes removes the empty export folder and returns the root.

### 3. Convert

~~~powershell
& $backend --project "D:\Mods\MyMod" --json textures "D:\Art\camouflage.png" "D:\Art\vest.jpg" "D:\Art\old.paa" --output "D:\Mods\MyMod\addons\Core\data"
~~~

With JSON, progress events are followed by one `result` event containing:

~~~json
{
  "folder": "D:\\...\\export-abc123",
  "files": [{"source": "camouflage.png", "output": "camouflage.paa"}],
  "errors": [{"source": "bad.tga", "error": "..."}]
}
~~~

### 4. Handle partial success

- Exit 0: all requested files converted.
- Exit 1: at least one file failed **or** the entire call failed. A result may still contain successful `files` and per-file `errors`.
- Read `errors[].source` and `errors[].error`; do not discard successful outputs.
- Exit code alone does not tell how many files succeeded.

### 5. Verify

- `folder` exists and is a child of the selected root (or the root when no success).
- Every `files[].output` exists and is non-zero.
- Extension is correct for direction.
- The app validated magic bytes: PNG signature, or a known PAA header. A corrupt file should have been rejected.
- For PAA used by a mod, rebuild the PBO and test the mod; conversion success is not proof the texture displays correctly.

## Examples

### PNG/JPG to PAA in the default folder

~~~powershell
& $backend --project "D:\Mods\MyMod" --json textures "D:\Art\a.png" "D:\Art\b.jpg"
~~~

### PAA to PNG for inspection

~~~powershell
& $backend --json textures --tools "F:\Steam\steamapps\common\DayZ Tools" "D:\Mods\MyMod\addons\Core\data\vest.paa"
~~~

### Show the default output root

~~~powershell
& $backend --json textures --show-output
~~~

### Open the folder (GUI session only)

~~~powershell
& $backend textures "D:\Art\a.png" --open
~~~

Do not use `--open` in headless automation.

## Common errors and fixes

| Error | Meaning | Fix |
|---|---|---|
| `Choose 1 to 100 files.` | No files or too many | Pass 1–100. |
| `ImageToPAA was not found in DayZ Tools.` | Wrong tools path/missing tool | Set `tools` or `--tools` to the real DayZ Tools root. |
| `Supported formats are PNG, JPG, TGA and PAA.` | Unsupported extension or not a file | Convert to a supported format. |
| `Conversion failed.` / tool stderr | ImageToPAA rejected the file | Open the image; fix format/dimensions; try one file interactively. |
| `The converter returned an invalid format.` | Output magic mismatch | Treat as failure; verify input/tool version. |
| `Use --show-output without files.` | Mixed mode | Use `--show-output` alone. |
| `Choose an existing output folder.` / directory error | `--output` missing/not dir | Create the directory first. |
| `Cannot create <default>. Choose another folder.` | Portable install not writable | Use writable `--output`. |
| Permission/access error | File locked or ACL | Close the viewer/editor; use a writable output. |
| Timeout | Converter hung >60 s on one file | Isolate that file; check its size/format. |

## Safety and limitations

- Conversion does not alter sources; it copies into a new export folder.
- Do not bulk-delete old exports; they may be the only copy of a conversion.
- The CLI exposes **no** compression/format/resolution flags; ImageToPAA defaults apply. Do not invent DXT/mipmap options.
- PAA -> PNG is for inspection, not guaranteed pixel-perfect round-trip.
- Name sanitization can change stems; use the returned `files[].output`, not an assumed name.
- Max 100 inputs per call; split large batches deliberately.
- Conversion success does not validate DayZ material setup, UVs, or in-game appearance.
- Do not read or print private keys while handling texture folders.

## Source anchors

- `backend/texture_export.py` (extensions, converter, output, collisions, magic).
- `backend/sidecar.py` lines 938–1011 (CLI parser/handler).
- `backend/export_folders.py` (default/selected output).
- Reference: `references/texture-conversion.md`.
