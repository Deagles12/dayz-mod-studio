# Model export pipeline

## Input contract

`read_glb` accepts:

- path exists, file, suffix `.glb`, size <= 64 MiB;
- at least 20 bytes;
- header `<4sIII4s>` equals magic `glTF`, version 2, size equal to file length, chunk `JSON`;
- JSON chunk fits inside declared size;
- no `uri` entries in top-level `buffers` or `images`.

It does not fully validate glTF semantics; Blender is the deeper parser.

## Tool discovery

Blender candidates in order:

1. `DAYZ_BLENDER`;
2. `shutil.which("blender")`;
3. ``C:/`, `D:/`, `E:/`, `F:/` root glob `blender-*/blender.exe` (reverse-sorted);
4. Steam library shared root `Blender/blender.exe`;
5. `%ProgramFiles%/Blender Foundation/Blender */blender.exe`;
6. `~/Documents/Codex/*/*/outputs/DayZPipeline/tools/blender-*/blender.exe`.

ImageToPAA is resolved from effective `tools` via `detect_installs`.

## Export

- Sanitized lowercase stem `[^a-z0-9_]+ -> _`, max 60, fallback `model`.
- New destination: `root/stem`, then `stem_02`, ...; never overwrite.
- Blender: `-b -t 4 --python-exit-code 1 --python model_blender.py -- <glb> <scratch> <converter> <prefix> <name>`.
- Timeout 3 minutes. On timeout kill process.
- Progress 1..4.
- Outputs copied from scratch: P3D, `data/*.paa`, `validation.json`. The source GLB/BLEND is not copied.
- Return: `folder`, `model`, primary `texture`, `textures`, `prefix`, `validation`.

## Prefix rules

- Only when exactly one addon path and project root: derive from addon.
- Configured prefix vs `$PBOPREFIX$` mismatch -> error.
- Slash -> backslash.
- Pattern: one or more segments of `[A-Za-z0-9_-]+` separated by backslash.

The prefix is embedded in PAA texture references, so it must match the future addon mount path.

## Blender mesh rules

- Every material used by a polygon needs a Principled BSDF and an image in Base Color.
- Base Color image is packed/saved as PNG, converted to PAA, and referenced as `<prefix>\\<name>\\data\\<stem>_co.paa`.
- Distinct image data gets `_02` suffixes.
- Visual LOD budgets: L1 10000, L2 4500, L3 1800 triangles; decimate modifier.
- Hard limit after triangulation: 10922 triangles.
- Points/normals max 32767; source can be reduced, removed vertices reported.
- P3D writes `MLOD 257 3`, each `P3DM 28 256`, resolution 1/2/3.

## Validator exact rejects

- not exactly `MLOD 257 3`;
- bad LOD header/flags;
- points/normals <=0 or >32767;
- faces <=0 or >10922;
- non-finite positions/normals/UVs;
- non-triangle face marker;
- out-of-range indices;
- any unused vertex;
- non-`.paa` texture;
- non-empty material string;
- bad tags/end marker;
- nonzero length or wrong resolution;
- trailing byte;
- collision flag is not part of P3D, returned false.

## Preview

- Input `.p3d` <=64 MB.
- Python parser accepts `MLOD 257`, each `P3DM 28 256`; supports triangles and quads, converts clockwise to counterclockwise; base64 positions/indices.
- Rejects `ODOL` with "binarized" message.
- Rust `preview_odol` is tried first by the UI; if it returns null, the UI falls back to `previewP3d`.
- Preview does not enforce export budgets or validate gameplay.

## Source anchors

- `backend/model_export.py` 19–136.
- `backend/model_blender.py` 24–173.
- `backend/p3d_validation.py` 1–69.
- `backend/p3d_preview.py` 17–124.
- `src/models.tsx` 196–217.
