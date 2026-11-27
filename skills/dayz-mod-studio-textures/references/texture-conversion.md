# Texture converter details

## Direction

| Input extension | Output | Notes |
|---|---|---|
| `.png` | `.paa` | ImageToPAA |
| `.jpg` | `.paa` | ImageToPAA |
| `.jpeg` | `.paa` | staged as `.jpg` |
| `.tga` | `.paa` | ImageToPAA |
| `.paa` | `.png` | decode for inspection |

Anything else is rejected per file.

## Per-file flow

1. Resolve input strictly (must exist).
2. Check suffix and file.
3. Derive sanitized stem.
4. Create a temporary directory.
5. Copy source to a staged filename.
6. Run `ImageToPAA.exe <input> <output>` in the temp cwd, 60 s timeout, no window.
7. Fail on non-zero exit or missing output.
8. Validate first 8 bytes:
   - PNG: exact `\x89PNG\r\n\x1a\n`.
   - PAA: first two bytes in a known set or a version-like header.
9. Copy to the export folder; rename collision to `<stem>_02` etc.
10. Record source/output; on any per-file error, record error and continue.

## Output folder

- `--output` must resolve (strict) and be a directory. The app resolves it to an absolute path.
- Default is `<install>/output/textures`, created if needed.
- A unique `export-` temp directory is created with `mkdtemp` inside the root.
- A partial batch keeps the folder and its successes.
- A total failure removes the empty folder and reports the root.
- The returned `folder` is the real destination; do not reconstruct it.

## CLI details

- `--json` is a **global** option and must precede `textures`.
- `--tools` and `--output` are **textures** options after the command.
- `--show-output` cannot be combined with files.
- `--open` runs Windows `os.startfile` after output; headless/service use should omit it.
- 1–100 files.
- Converted progress labels include `<index>/<count> · <name>`.
- The CLI returns exit 1 if any result error exists, even when some files converted.

## Validation limits

- Magic-byte validation confirms container signature, not image validity, dimensions, alpha, compression, or DayZ shader compatibility.
- PAA -> PNG can lose or alter encoding; use it for inspection, not as a lossless archive.
- No CLI controls for resolution, compression, mipmaps, or channel packing.
- Overwriting a source is never intentional: output always goes to a fresh folder.

## Source anchors

- `backend/texture_export.py` lines 1–70.
- `backend/sidecar.py` lines 938–1011.
- `backend/export_folders.py`.
