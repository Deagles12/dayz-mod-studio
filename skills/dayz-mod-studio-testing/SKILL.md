---
name: dayz-mod-studio-testing
description: "Run the verified DayZ Mod Studio local update/test loop: build, install, start the server hidden, wait for CE and UDP readiness, and inspect the result. Use to test a mod locally, diagnose a server that will not become ready, or resume an interrupted test without rebuilding."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x, DayZ Server, configured server/client paths, and an addon project. Client launch requires the DayZ client. The app verifies process/UDP/log readiness, not in-game gameplay."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Local test and readiness

## Purpose

Exercise the complete local loop:

~~~text
build -> sign -> install -> start server -> CE/Hive ready -> mission loaded -> UDP owned by server PID -> stable 15 s
~~~

Only then is `tested.json` written and `serverReady=true`. This is still **not** a gameplay test and not a client-connection test.

## Activate when

- The user asks to test/build-and-test/update locally.
- A server must be started to verify a mod loads.
- A test timed out or failed and the user wants to retry.
- Logs/readiness evidence must be interpreted.

Route package-only builds to `dayz-mod-studio-build`; install/launch without building to `dayz-mod-studio-deploy`; log triage to `dayz-mod-studio-debugging`.

## Dependencies

- Verified build prerequisites (AddonBuilder, signing material).
- Configured `server`, `server_exe`, `client`, `config`, `profiles`, `port`, `timeout`, `address`.
- Server config exists; `profiles` is a directory or creatable.
- Dependencies (`base`, `server_only`) resolve and contain PBOs.
- Port free or owned by the app's own previous test server.
- For shared profile with `verifySignatures` in server config: signing enabled.

## Procedure

### 1. Preflight

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json status
& $backend --project "D:\Mods\\MyMod" --json config --get port
& $backend --project "D:\Mods\\MyMod" --json config --get timeout
& $backend --project "D:\Mods\\MyMod" --json config --get address
& $backend --project "D:\Mods\\MyMod" --json config --get open_dayz
& $backend --project "D:\Mods\\MyMod" --json config --get publish_workshop
~~~

Confirm:

- `address` is loopback: `127.0.0.1`, `localhost`, or `::1`.
- `port` is 1024–65535.
- `timeout` is 5–1800 seconds.
- `publish_workshop` is **false** unless the user explicitly authorized publication. `update`/`test` can publish automatically when this is true and a Workshop item/SteamID64 are configured.
- No unrelated DayZ session is running; the app refuses to kill one.

~~~powershell
& $backend update --help
~~~

### 2. Run the test

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json update
~~~

`update` and `test` are the same command. It builds a fresh package, stops the matching previous test session, installs, starts the server hidden, and waits for readiness. The client starts only when `open_dayz=true` (unless the operation is `launch`, which forces it).

For a server-only check, ensure `open_dayz=false`; do not launch a client just to make readiness pass.

### 3. Interpret the result

Key report fields:

| Field | Meaning |
|---|---|
| `built` | A fresh package was produced and verified. |
| `buildId` | Exact package installed/tested. |
| `signed` | Package was signed. |
| `installed` | Files copied and verified. |
| `serverReady` | CE + mission + UDP + 15 s stability passed. |
| `clientLaunched` | Client process started (not connected). |
| `connected` | The app does not prove this; treat false/absent as unverified. |
| `warnings` | Count of warning-like log lines. |
| `error` | Failure reason. |
| `log` | Full operation log path. |
| `next` | App's suggested next action. |

Exit code 0 with `status=complete` is only the outer envelope. Require `serverReady=true` for a server test. A build/install success without readiness is **not** a passing test.

### 4. Inspect readiness evidence

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json status
Get-Content "C:\Users\\me\\AppData\\Local\\DayZ Mod Studio\\projects\\<hash>\\server-readiness.json" -Raw
~~~

`server-readiness.json` should show:

~~~json
{"pid": 1234, "created": "2026-...", "ready": true, "offsets": {"...": 12345}}
~~~

The implementation requires all of:

1. A line matching `Module: Mission ;` (case-insensitive).
2. A line matching `[CE][Hive] ... init sequence finished` (case-insensitive).
3. A UDP listener on the configured port owned by the server PID.
4. The above state stable for at least 15 seconds.
5. No fatal/compile/missing-addon/corrupt-storage/termination line in the newly read logs.
6. Process still running.

These are necessary, not sufficient, for gameplay. Report them exactly.

### 5. Inspect logs

Log sources:

- `<profiles>/*.RPT` — main engine/server log.
- `<profiles>/script*.log` — script compile/runtime log.
- `<profiles>/error*.log` — errors.
- `<state>/server-console.log` — captured stdout/stderr from the launched process.
- `<state>/logs/<timestamp>.log` — operation log with app decisions and streamed relevant lines.
- `logs` command returns only the newest operation log.

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json logs
Get-ChildItem "D:\DayZServer\\profiles" -Filter *.RPT | Sort-Object LastWriteTime -Descending | Select-Object -First 1
~~~

Use `dayz-mod-studio-debugging` for classification. Do not paste entire logs unless needed; extract first fatal error, script compile error, missing addon/key line, and the last 20 relevant lines.

### 6. Retry an interrupted test

Only if the app left `retry.json`:

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json retry
~~~

`retry` resumes a previously built package. It refuses if source hashes, build settings, or install targets changed. If it refuses, run a fresh `update`; do not edit checkpoints. If no checkpoint exists, retry reports "There is no interrupted update."

### 7. Success report

State separately:

- Package built/signed (build ID).
- Installed to which targets.
- Server process started (PID if available).
- Readiness criteria passed (CE, mission, UDP PID, 15 s).
- Client launched or not; connection/gameplay unverified.
- Warnings/errors found.
- Any automatic publication (must have been explicitly authorized).

## Common failures

| Symptom | Likely cause | Action |
|---|---|---|
| `Server did not report readiness within N seconds` | Slow startup, wrong mission/config, stuck compile, missing dependency | Inspect RPT/script logs; fix root cause; increase timeout only if evidence shows slow-but-progressing startup. |
| `Startup failed: ... can't compile/cannot compile` | Enforce compile error | Fix script; rebuild/test. |
| `missing addons` / `requires addon` | Dependency/mod load order or missing PBO | Fix `requiredAddons`, `base`/`server_only`, or installed dependencies. |
| `Virtual Machine Exception` | Script runtime exception during init | Read script log; fix code; do not mask. |
| `[Server] :: termination in:` | Server is shutting down during startup | Check config, mission, RPT. |
| `UDP port ... already in use` | Another server owns the port | Stop the app's matching test or choose a free port; never kill unrelated process. |
| `Another DayZ session is running` | Unrelated session detected | Ask user to close it. |
| `Server requires signatures` | Shared profile + `verifySignatures` + signing off | Enable signing with a valid pair. |
| `Dependency ... has no PBO files` | Wrong base path/Workshop ID | Install/subscribe dependency or correct path. |
| `The installed copy differs` | File changed/locked after install | Roll back, fix cause, rebuild/deploy. |
| `Settings changed` / `Source files changed` on retry | Checkpoint mismatch | Run fresh `update`. |

## Examples

### Standard local test, no client

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json update
~~~

With `open_dayz=false`, success means the server reached ready. It does not mean a player can join.

### Test and open client

Set `open_dayz=true` only when the user wants the client:

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json config --set open_dayz true
& $backend --project "D:\Mods\\MyMod" --json update
~~~

The client is launched with `-connect=<address> -port=<port>`, plus server password if found in `serverDZ.cfg`. Connection is verified in-game, not by the app.

### Automatic publication warning

If `publish_workshop=true`, a successful `update` can publish. Before testing, explicitly set it false unless the user authorized publishing:

~~~powershell
& $backend --project "D:\Mods\\MyMod" --json config --set publish_workshop false
~~~

Do not toggle it back silently after the test; ask.

## Safety and limitations

- Do not claim gameplay/network success from `serverReady`.
- Do not mark a test passed if only build/install succeeded.
- Do not run `update` with `publish_workshop=true` without explicit publication permission.
- Do not kill `DayZServer_x64.exe` or clients by PID; use `rollback`, the app's next operation, or ask the user.
- A failed readiness check can leave a server process running. A subsequent app operation may stop it; do not start duplicates.
- Logs can contain server passwords, player identifiers, and paths. Redact before sharing.
- Increasing `timeout` is not a fix for a deterministic compile/mission error.

## Source anchors

- Test orchestration: `backend/test_workflow.py` lines 120–206.
- Readiness: `backend/pipeline.py` lines 794–838.
- Server/client args: `backend/pipeline.py` lines 552–590.
- Operation result/publish: `backend/sidecar.py` lines 462–623.
- Reference: `references/readiness-and-logs.md`.
