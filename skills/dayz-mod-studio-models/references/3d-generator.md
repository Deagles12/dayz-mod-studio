# 3D-Generator batch workflow

## What it is

A repo-shipped PowerShell 7 driver around Blender for trusted generator archives. It is separate from Studio's GLB export. It does not use the Studio CLI.

## Requirements

- PowerShell 7+ (hard check).
- Blender at `-BlenderPath` (default shown in the script is machine-specific; always pass the real path).
- Trusted Python generator source inside the archive.
- ImageToPAA only for `-PrepareDayZMaps`.
- Input folder containing `*.zip`.

## Command

~~~powershell
.\Process_DayZ_Archives.ps1 -InputDir .\incoming -OutputDir .\ready -Force -TextureResolution 2048 -Seed 17 -Wear 0.7
~~~

Parameters (from the script):

| Parameter | Default | Notes |
|---|---|---|
| `-InputDir` | required | Archives. |
| `-OutputDir` | `<InputDir>/ready` | Must contain all results. |
| `-BlenderPath` | script default | Must exist; pass explicitly. |
| `-Force` | off | Replace existing result with backup. |
| `-Seed` | 17 | Reproducible variation. |
| `-Wear` | 0.7 | 0..1. |
| `-TextureResolution` | 2048 | 1024/2048/4096. |
| `-MaterialLibrary` | `materials` | Local material library. |
| `-SkipRenders` | off | Skip four renders. |
| `-PrepareDayZMaps` | off | DayZ map/PAA/RVMAT profile. |
| `-ImageToPAAPath` | script default | Required for DayZ maps. |
| `-NormalGreen` | keep | keep/flip. |
| `-DayZPrefix` | dayz_models | Trimmed, appended with archive name. |
| `-TimeoutSeconds` | 1800 | 30..7200. |

## Safety checks

- Archive entries rejected for absolute paths, `..` traversal, drive letters.
- At most one generator script matching generator/make_/generate/create.
- Uses the newest BLEND if the archive has one; otherwise runs the generator.
- Outputs confined under `OutputDir`; work folder starts `.working_`.
- `validation.json.status == "ok"` and `glb.reimported == true` required.
- Old result moved to `_backup_<name>_<UTC timestamp>` only after new result validates; restored on failure.
- Failure keeps work folder/logs and old result.
- `batch.json` summarizes statuses.

## Outputs

For each successful archive: BLEND, GLB, OBJ/MTL, Base Color, tangent normal, roughness, metallic, AO, ORM, `validation.json`, four renders (unless skipped). DayZ profile adds PNG/PAA/RVMAT/`dayz-validation.json` under `dayz/`.

## DayZ map profile

~~~powershell
.\Process_DayZ_Archives.ps1 -InputDir .\incoming -OutputDir .\ready -Force -PrepareDayZMaps -NormalGreen keep -DayZPrefix dayz_models
~~~

- Mother shader approximation, not a simple PBR rename.
- NOHQ: swizzle + DXT5 via `TexConvert.cfg`.
- SMDI: R=1, G=F0 estimate, B=specular power from roughness.
- AS: AO in G.
- CO sRGB; other maps Non-Color.
- `dayz-validation.json` readiness remains false until in-game shader testing.

## Failure guide

| Error | Fix |
|---|---|
| PowerShell <7 | Run pwsh 7+. |
| Blender not found | Pass `-BlenderPath`. |
| Output exists; use `-Force` | Approve replacement or choose another output. |
| More than one generator script | Split archive, leave one. |
| Unsafe archive entry | Do not run; rebuild archive. |
| Did not provide/generate BLEND | Fix generator or include BLEND. |
| Validation did not confirm success | Read `finish.log`/`validation.json`; do not trust output. |
| Timeout | Raise within limit only after inspecting; reduce work. |

## Source anchors

- `tools/3D-Generator/Process_DayZ_Archives.ps1` 1–180.
- `tools/3D-Generator/README_UA.md`.
- `tools/3D-Generator/MATERIAL_RULES.md`.
