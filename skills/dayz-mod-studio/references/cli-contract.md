# DayZ Mod Studio CLI contract (2.3.7)

Audited from `backend/sidecar.py`, `backend/pipeline.py`, `backend/test_workflow.py`, `backend/quick_build.py`, and `src-tauri/src/main.rs`.

## Invocation

```text
dayz-backend.exe [GLOBAL FLAGS] COMMAND [COMMAND FLAGS]
dayz-mod-studio.exe --cli [GLOBAL FLAGS] COMMAND [COMMAND FLAGS]
```

`dayz-mod-studio.exe` launches the GUI when it receives **no** arguments. `--cli` is stripped and all remaining arguments are forwarded to the bundled backend. Run the backend directly when possible; it gives clearer process ownership and exit codes.

### Global flags

| Flag | Meaning | Rules |
|---|---|---|
| `--project DIR` | Project source root | Must precede the command. Mutually exclusive with `--recent`. |
| `--recent` | Last project opened in this installation's GUI | Per-install file, not global. Must precede the command. |
| `--json` | One JSON object per line | Must precede the command. Recommended. |
| `--verbose` | Stream log text in non-JSON mode | No effect on JSON events, which already include `log`. |
| `--language en|uk` | Output language | Also accepted before the command only. |

`argparse` is created with `allow_abbrev=False`; commands and flags must be exact. A global flag placed after the command is rejected by that subcommand unless it has the same option (it normally does not).

Without `--project` or `--recent`, non-texture commands use the current working directory as the project. A directory merely existing is not enough: project settings must be configured and validated.

## JSON Lines

With `--json`, every line is an independent JSON object:

```json
{"event":"progress","stage":2,"label":"Packing PBOs"}
{"event":"log","text":"AddonBuilder ..."}
{"event":"result","value":{...}}
{"event":"error","text":"human-readable failure"}
```

- `progress.label` may be a string or (in non-JSON formatting) a translation tuple; JSON normally contains a string.
- `log` events appear during an operation. Do not treat any log line containing "error" as fatal by itself; use the final result and exit code.
- Exactly one terminal `result` or `error` is expected for a normal command, but partial texture conversion still returns a `result` with `errors` and exits 1.
- If stdout is not valid UTF-8, decode with replacement. Do not discard malformed lines silently; preserve them as diagnostics.
- `--verbose` does not make `--json` emit raw non-JSON text. Keep JSON parsing.
- Progress/log events can be very numerous. Summarize but keep the complete stream if diagnosing.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Operation reports `status: "complete"`, or a read-only command succeeded, or textures had no per-file errors. |
| `1` | Any exception, unknown setting, failed check, incomplete build/test/deploy/publish/remote operation, or at least one texture conversion error. |

An exit 1 can still have a `result` event with useful fields (especially textures, build reports, and uncertain Workshop/remote outcomes). Parse before concluding.

## Command matrix

Commands that build, install, test, deploy, publish, or create need a configured project. Read-only commands (`status`, `history`, `logs`, `config`, `steam-owner`, `workshop-check`) can run against an existing project directory before every check passes; `config` may show defaults. `keys` needs a project directory and DayZ Tools. `textures` can run without a project. None of these is a machine-wide settings editor.

| Command | What it actually does | Durable evidence | Does **not** do |
|---|---|---|---|
| `status` | Evaluates readiness and returns commands, builds, checks, publication, dependencies, backups, logs | No new artifact | Build, install, start server |
| `history` | Last 20 operation records | No | Show full logs |
| `logs` | Newest state log, up to last 500 KB | No | Aggregate all logs or tail a live server |
| `config` | List keys, `--get KEY`, or `--set KEY VALUE` repeated | `project.json` after `--set` | Set unknown keys; infer booleans from arbitrary text |
| `keys NAME` | Runs `DSCreateKey.exe` into state `signing/NAME` | `.bikey`, `.biprivatekey` | Overwrite an existing pair; configure it automatically |
| `build` | Validates sources, runs AddonBuilder, signs/verifies, writes manifest | `builds/<id>/manifest.json`, package, checkpoint | Install, start server, test |
| `quick` | Build + sign + copy into configured local folders | `quick-ready.json` | Start a test server, save `tested.json`, publish |
| `deploy` | Verifies and installs the last package; stops the matching local test server first | `deployment.json` | Build or start a server |
| `launch` | Starts the locally installed package server and attempts to start the client (it forces the client; `open_dayz` is ignored) | Server process/session; may save tested state | Build or install |
| `update` / `test` | Build + install + start server + CE/UDP readiness (+ optional client/publish) | `tested.json` only after complete readiness | Prove gameplay correctness |
| `retry` | Resumes an interrupted update from `retry.json` | Updated checkpoints | Retry a changed source tree |
| `rollback` | Restores the previous local install recorded in `previous.json` | Restored targets, cleared checkpoints | Roll back remote or Workshop |
| `remote` | Deploys selected built package over SSH/SFTP | `remote-ready.json` or staging manifest | Build a package; deploy changed sources not built |
| `remote-check` | Verifies SSH/systemd/sudo/remote tool prerequisites | No package change | Upload or restart |
| `steam-owner` | Reads active Steam user | No | Validate Workshop item |
| `workshop-check` | Checks item is DayZ and owned by active user | No | Create or publish |
| `create-workshop` | Creates a Workshop item from the current package and configured first-item metadata, then publishes unless the agreement blocks it | `workshop-draft.json`, item ID saved | Create without preview/title/description; skip explicit publication approval |
| `publish` | Publishes the tested/current package | `workshop-confirmed.json` on confirmation | Publish untested package |
| `retry-publish` | Retries an uncertain/failed publication of the same package | Confirmation or failure record | Repackage changed sources |
| `textures` | Batch converts 1–100 images | New `export-*` folder | Modify sources in place |

## Command flags

```powershell
.\dayz-backend.exe --project "D:\Mods\MyMod" --json build
.\dayz-backend.exe --project "D:\Mods\MyMod" --json deploy
.\dayz-backend.exe --project "D:\Mods\MyMod" --json launch
.\dayz-backend.exe --project "D:\Mods\MyMod" --json update
.\dayz-backend.exe --project "D:\Mods\MyMod" --json update --help
.\dayz-backend.exe --project "D:\Mods\MyMod" --json remote --build-id 20261115-112233-aaaabbbb
.\dayz-backend.exe --project "D:\Mods\MyMod" --json remote-check
.\dayz-backend.exe --project "D:\Mods\MyMod" --json retry
.\dayz-backend.exe --project "D:\Mods\MyMod" --json rollback
.\dayz-backend.exe --project "D:\Mods\MyMod" --json config --get addons
.\dayz-backend.exe --project "D:\Mods\MyMod" --json config --set sign true --set shared true
.\dayz-backend.exe --project "D:\Mods\MyMod" --json keys my_signing_key
```

Only `remote` has `--build-id`. Only `config` has `--get`/`--set`. Only `keys` takes a name. Only `textures` has `--output`, `--tools`, `--show-output`, `--open`, and file arguments. Do not attach these to other commands.

`config --set` takes exactly two values per `--set`, and may be repeated. Existing booleans accept only `true` or `false` (case-insensitive); other keys are stored as strings. Unknown keys fail. `--set` validates the project and saves before returning. `config` without `--set` does not save.

## Global flags with `textures`

`textures` is special:

- It can run without a project, using machine `environment.json` for DayZ Tools.
- With `--project`, it uses that project's `tools` setting.
- `--tools` overrides the tools directory for this run.
- 1–100 files are required unless `--show-output` is used.
- `--show-output` returns the output folder and writes no files; combining it with files is an error.
- `--output` must name an existing directory. The converter creates a fresh `export-<random>` child inside it.
- `--open` calls the Windows shell open on the result folder; it is inappropriate on headless hosts.
- Partial failures produce exit 1 and a result containing successful `files` and failed `errors`.

## Stable report fields

Operation results are the report dictionary from `backend/sidecar.py`. Useful fields include:

`action`, `date`, `phase`, `status`, `warnings`, `built`, `signed`, `installed`, `serverReady`, `clientLaunched`, `connected`, `buildId`, `files`, `log`, `error`, `seconds`, `next`, `workshopStatus`, `remote`, `staging`, `olderBuild`.

Do not depend on fields a given run did not reach. `serverReady` true means the readiness algorithm passed, not that the mod is functionally correct. `connected` is not proof of in-game success.

## Common invocation mistakes

| Symptom | Cause | Fix |
|---|---|---|
| `unrecognized arguments: --json` | `--json` after the subcommand | Move all global flags before the command. |
| `Project directory not found` | Relative path resolved from the wrong directory | Pass an absolute project path or set the process working directory intentionally. |
| `No recent project` | `--recent` used in a fresh portable copy or different install | Pass `--project`; recent selections are per installation. |
| `Unknown setting` | `config --set` key not present in current settings | Get the key list with `config --json`; do not invent keys. |
| Exit 1 but a result exists | Partial texture errors, incomplete/uncertain remote or Workshop result | Inspect the result and `error`; do not assume nothing happened. |
| `Another instance ... operation` | Operation lock held by GUI/another CLI | Wait or close the other operation; do not delete the lock. |
| Server/client processes are refused | App detected another DayZ session | Ask the user to close it; do not force-kill. |

## Help is authoritative for the installed build

Before using a command you have not used in this session, run:

```powershell
.\dayz-backend.exe --help
.\dayz-backend.exe <COMMAND> --help
```

Help is generated by the installed backend. If it differs from this reference, the installed build wins for that machine, but do not extrapolate undocumented options.

## Source anchors

- CLI parser and event emitter: `backend/sidecar.py` lines 916–1083.
- Operation dispatch: `backend/sidecar.py` lines 455–810.
- Report construction: `backend/sidecar.py` lines 465–511.
- Report → next action: `backend/sidecar.py` lines 436–452.
- GUI/CLI forwarding: `src-tauri/src/main.rs`.
