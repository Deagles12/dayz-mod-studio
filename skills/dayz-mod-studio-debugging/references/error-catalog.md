# Error catalog and evidence map

Use this with `triage_logs.py`. The table is source-grounded; a matching line is a lead, not a diagnosis.

## Stage map

| Phase in report | Stage | Evidence |
|---|---|---|
| 0 | settings/project validation | error text, status checks |
| 1 | package build | `built`, package/manifest, AddonBuilder log |
| 3 | backup/install/rollback | `installed`, target paths, `backups/<id>/recovery.json` |
| 4 | server startup/readiness | `serverReady`, `server-readiness.json`, RPT/script logs |
| 5 | client/Workshop/remote | `clientLaunched`, Workshop/remote result |

## Highest-value error texts

| Text (English UI) | Class | First check |
|---|---|---|
| `Choose a mod folder containing an addon with config.cpp.` | source/config | addon path + CfgPatches/include |
| `AddonBuilder not found: ...` | tools | `tools` and executable path |
| `AddonBuilder could not build ...` | build | full operation log / AddonBuilder output |
| `AddonBuilder reported an error.` | build | error line in tool output |
| `The PBO is empty.` | build | source content, pack mode |
| `Invalid or duplicate PBO name: ...` | build | unique valid @-addon/PBO name |
| `Duplicate addon folder or path outside the source folder` | build | `addons` entries |
| `Move private keys out of the addon source.` | security | relocate keys |
| `Choose a matching .biprivatekey and .bikey pair.` | signing | stems/extensions |
| `Could not sign PBO: ...` | signing | DSSignFile, key permissions |
| `Signature verification failed.` | signing | pair/Keys/DSCheckSignatures |
| `Build inputs changed during the build.` | build | concurrent writer/prep |
| `Create a package with build first.` | deploy | run build; checkpoint missing |
| `Install a package with deploy or update first.` | launch | deploy/update checkpoint |
| `Choose a deployment folder outside the project and Steam Workshop.` | install | target settings |
| `Deployment folders overlap.` | install | server/client/mod paths |
| `The server already has a different key named ...` | install | unique key pair |
| `The server keys folder is a symbolic link or junction.` | install | real keys directory |
| `Installation paths have changed since deployment.` | rollback | restore original config |
| `Backup is missing: ...` | rollback | backups present? |
| `A file is in use by another process.` | install | close DayZ/editor/AV owner |
| `Another DayZ session is running ...` | process safety | close unrelated session |
| `UDP port ... already in use.` | startup | identify owner; do not kill blindly |
| `Server did not report readiness within N seconds.` | readiness | RPT/script, config, dependencies |
| `Startup failed: ...` | startup | first fatal line |
| `Server exited with code N.` | startup | RPT + console |
| `Server requires signatures.` | signing | enable sign/pair |
| `Dependency ... does not contain PBO.` | dependencies | installed mod path/ID |
| `Sources or build settings changed. Build a new test package.` | checkpoint | run update |
| `There is no interrupted update. Run update.` | retry | no retry.json |
| `No recent project. Specify --project PATH.` | CLI | use explicit project |
| `unrecognized arguments` | CLI | global flags before command |
| `Another instance ... operation.` | lock | wait/close other operation |

## Readiness fatal patterns

The app fails readiness on newly appended logs containing:

- can't/cannot compile, compilation failed, error compiling;
- missing addons, requires addon;
- cannot load mission;
- Virtual Machine Exception;
- corrupt/damaged/failed storage, persistence, or save;
- `[Server] :: termination in:`.

A failure line can be from an error log, script log, or RPT. Open the exact file/line. The operation log stream may normalize text.

## AddonBuilder exit-zero error detection

Patterns: `[ERROR]`, `\berror\s*[:!]`, `error\s+\d+`, `build failed` (case-insensitive). This is why a non-zero exit is not the only build failure signal.

## Signature checks

`DSCheckSignatures <Addons> <Keys>` is run after signing. Failure text includes bad, missing, or mismatch wording. A valid `.bisign` name alone is insufficient. The package Keys folder must contain the matching `.bikey`.

## Log precedence

1. Operation report error + `phase`.
2. Operation log around that error.
3. Server console.
4. RPT (engine).
5. `script*.log` / `error*.log` (Enforce).

Do not let an old error in a reused profile mislead you: only logs appended after the test baseline are read for readiness. A fresh profile directory is stronger evidence.

## Source anchors

- `backend/pipeline.py` 407–549, 794–838.
- `backend/sidecar.py` 436–454, 462–623.
- `backend/test_workflow.py`.
- `scripts/triage_logs.py`.
