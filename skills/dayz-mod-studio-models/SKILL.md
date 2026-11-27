---
name: dayz-mod-studio-models
description: "Convert a textured GLB into a DayZ P3D with visual LODs and PAA textures, inspect P3D previews, and apply the project's P3D validation rules. Use for model export, LOD/triangle/vertex failures, PAA path errors, and the repo's 3D-Generator batch workflow."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x GUI, Blender, DayZ Tools ImageToPAA, and a textured GLB <=64 MB with embedded images. Model export and P3D validation have no dayz-backend CLI; use the GUI/its internal commands or perform manual checks."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# 3D models, P3D export, and validation

## Purpose

Export a textured GLB to a visual DayZ model and validate the emitted MLOD subset. This produces **visual geometry only**:

- exactly three visual LODs (resolutions 1, 2, 3);
- P3D in MLOD/P3DM form;
- PAA textures referenced by the P3D;
- `validation.json` with budgets/warnings.

It does not author collision geometry, fire geometry, memory points, proxies, animations, or a complete config.

## Activate when

- The user asks to convert GLB to P3D/PAA.
- A model export fails on GLB/Material/Blender/triangle/vertex/texture rules.
- A P3D must be previewed or checked.
- The user asks about the repo's `tools/3D-Generator` batch.

## Dependencies

- DayZ Mod Studio GUI (models page) and its bundled backend.
- Blender: `DAYZ_BLENDER`, `blender` on PATH, a `blender-*/blender.exe` on common drives, Steam Blender, Program Files, or Codex output path.
- DayZ Tools ImageToPAA.
- GLB <=64 MB, glTF 2.0, JSON chunk, all buffers/images embedded (no `uri`).
- A Base Color texture on every mesh surface.
- Writable export folder.
- For generated textures: a resolvable addon prefix.

## Important: no CLI for model export

The `dayz-backend.exe --cli` command set has **no** model export, P3D preview, P3D validation, or GLB conversion command. Do not invent one.

The GUI uses internal commands:

- `exportModel` — export GLB to P3D/PAA/validation.
- `previewModel` — preview the GLB.
- `previewP3d` — parse MLOD/P3DM for the viewer.
- `revealModel` — reveal an output folder.
- Tauri `preview_odol` — preview binarized ODOL before the MLOD fallback.

Use the GUI when automation is impossible, or a script that directly uses these internal APIs only if the user explicitly supports that integration. State the GUI-only limitation.

## Procedure: GLB to P3D

### 1. Preflight the GLB

- Extension `.glb`, size <=64 MB.
- Valid header: magic `glTF`, version 2, declared size equals file size, first chunk `JSON`.
- No external `uri` in buffers/images. Embedded textures only.
- Every mesh face has a Principled BSDF with a Base Color image.
- Aim under the LOD budgets; Blender decimates to 10000/4500/1800 triangles, but hard caps are 10922 triangles and 32767 points/normals per LOD.

### 2. Preflight tools and prefix

Blender discovery order is source-defined. If not found, set `DAYZ_BLENDER` to the real executable.

Prefix resolution when exactly one addon and a project root:

1. configured `prefix`;
2. addon `$PBOPREFIX$`;
3. `addon_name`;
4. addon folder name.

If configured prefix and `$PBOPREFIX$` disagree, export fails. Prefix is normalized to backslashes and must match `[A-Za-z0-9_-]+(\[A-Za-z0-9_-]+)*`. The default is `dayz_models`.

### 3. Export in the GUI

Models -> choose GLB -> choose output folder -> export. The app:

1. validates GLB/tools/Blender;
2. runs Blender headless, 4 threads, 3-minute timeout;
3. bakes Base Color images to PNG, converts to PAA;
4. builds three decimated visual LODs;
5. writes MLOD P3D, PAA data, and `validation.json`;
6. validates the emitted P3D and copies the result into a **new** output subfolder.

No existing output folder is overwritten; the app appends `_02`, `_03`, etc.

### 4. Verify outputs

Expected in the new destination:

- `<name>.p3d`;
- `data/<texture>_co.paa` (and additional `_02` textures for distinct images);
- `validation.json`.

`validation.json` should report exactly three LODs:

~~~json
{
  "lods": [
    {"resolution": 1, "vertices": 1234, "normals": 1234, "triangles": 2400, "removedVertices": 0},
    {"resolution": 2, "vertices": 700, "normals": 700, "triangles": 1200},
    {"resolution": 3, "vertices": 300, "normals": 300, "triangles": 500}
  ],
  "uv": true,
  "materials": 1,
  "collision": false,
  "textures": ["dayz_models\\name\\data\\name_co.paa"],
  "warnings": ["Collision Geometry and Fire Geometry LODs require authoring before in-game use."]
}
~~~

### 5. Preview

- MLOD/P3DM source P3D can be previewed by the app's Python parser.
- Binarized ODOL (BIS binarize output) is previewed by the Rust `preview_odol` path; the Python parser explicitly rejects ODOL.
- Preview is visualization, not validation for the game.

## Validation rules (must pass)

The app's validator requires:

- file starts with `MLOD` version 257 and exactly 3 LODs;
- each LOD header `P3DM` major 28 minor 256 flags 0;
- 0 < points <= 32767; 0 < normals <= 32767; 0 < faces <= 10922;
- finite vertex coordinates and normals;
- triangular faces only;
- valid vertex/normal indices and finite UVs;
- every vertex used, no unused vertices;
- every texture path ends in `.paa` and material reference is empty;
- valid `TAGG`/end tags;
- LOD length 0 and resolution 1, 2, 3 exactly;
- no trailing bytes;
- collision=false.

Budget targets 10000/4500/1800 are softer than the 10922 hard cap; do not assume a mesh that passes the cap is efficient.

## Common errors and fixes

| Error | Meaning | Fix |
|---|---|---|
| `Choose a GLB of up to 64 MB.` | Wrong ext/size | Export a valid `.glb` under 64 MB. |
| `The GLB must embed its texture.` | External `uri` | Re-export GLB with embedded images. |
| `Invalid GLB header` / `Incomplete GLB` | Corrupt/non-glTF | Re-export glTF 2.0 binary. |
| `Blender was not found...` | Discovery failed | Set `DAYZ_BLENDER`. |
| `Blender exceeded three minutes.` | Heavy scene/material bake | Reduce meshes/textures; retry; split model. |
| `Every mesh surface needs a textured Base Color material.` | Missing material/image | Assign Principled Base Color image to every face. |
| `The visual LOD exceeds its triangle budget.` | >10922 after decimation | Reduce source/decimate more; fix n-gons. |
| `The visual LOD exceeds the 32767 point/normal budget.` | Too many split points/normals | Merge/clean mesh; reduce normals/UV splits. |
| `The addon prefix is unsupported.` | Bad prefix chars | Use letters/digits/_/- segments. |
| `The configured prefix differs from $PBOPREFIX$.` | Inconsistent prefix | Align config and marker. |
| `Missing PAA output for a P3D texture reference` | Texture conversion/name mismatch | Check ImageToPAA output and material image. |
| `Expected three visual MLOD LODs` / bad header | Nonconforming P3D | Re-export from the app; do not hand-edit. |
| `Unused vertices or invalid texture assignment` | Mesh/texture cleanup issue | Clean mesh/material slots; re-export. |
| ODOL preview error | Binarized file | Use ODOL viewer/Rust path; Python needs MLOD. |

## 3D-Generator batch (repo tool)

For trusted generator archives, the repo includes `tools/3D-Generator/Process_DayZ_Archives.ps1`. It is separate from the Studio GUI export.

~~~powershell
.\Process_DayZ_Archives.ps1 -InputDir .\incoming -OutputDir .\ready -Force -TextureResolution 2048 -Seed 17 -Wear 0.7
~~~

Optional: `BlenderPath`, `MaterialLibrary`, `SkipRenders`, `TimeoutSeconds`, and the DayZ maps profile:

~~~powershell
.\Process_DayZ_Archives.ps1 -InputDir .\incoming -OutputDir .\ready -Force -PrepareDayZMaps -NormalGreen keep -DayZPrefix dayz_models
~~~

It produces BLEND/GLB/OBJ/MTL/PBR maps/`validation.json`/renders; failure keeps work logs and the old result. `batch.json` records per-archive status. The DayZ maps profile is an approximation, not a guarantee; `dayz-validation.json` readiness remains false until tested in the target shader.

Do not run untrusted Python generators. The source README explicitly warns about this.

## Safety and limitations

- No model-export CLI: do not fake commands or claim a headless export if only the GUI exists.
- Do not hand-edit generated P3D/validation.json to pass checks.
- Visual LODs only: collision/fire geometry, memory points, proxies, animations, and gameplay config remain manual.
- The 3-minute Blender timeout and 64 MB input limit are hard.
- A passing validator proves structure, not appearance or gameplay.
- Avoid overwriting output; let the app create a new folder.
- 3D-Generator executes archive-provided Python; require trust and sandboxing.

## Source anchors

- `backend/model_export.py` (GLB, Blender, prefix, output).
- `backend/model_blender.py` (LOD/bake/PAA/P3D writing).
- `backend/p3d_validation.py` (exact checks).
- `backend/p3d_preview.py` (MLOD preview; ODOL rejection).
- `src-tauri/src/odol.rs` and `src/backend.ts` (internal commands).
- `tools/3D-Generator/README_UA.md` and `Process_DayZ_Archives.ps1`.
- References: `references/model-pipeline.md`, `references/3d-generator.md`.
