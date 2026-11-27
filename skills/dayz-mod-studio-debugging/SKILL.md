---
name: dayz-mod-studio-debugging
description: "Diagnose DayZ Mod Studio failures by locating the first failing stage, reading operation/RPT/script logs, and classifying build, install, startup, dependency, and runtime errors. Use when a command fails, a server never becomes ready, or the user asks why a mod does not load."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x, local operation logs and/or server profile logs. Read-only. Some failures require the app's build/test commands to reproduce."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Debugging and log triage

## Purpose

Find the **first** failure and map it to the responsible layer instead of guessing from the final error. Distinguish:

`text
configuration -> build/tool/signing -> install/transaction -> server start -> CE/mission readiness -> client/network -> gameplay
`

The app records evidence at each layer. Use it.

## Activate when

- A CLI command exits non-zero or reports `status=failed`.
- A test server never becomes ready.
- The user shares an error/log and asks what to fix.
- The cause of a failed build/install/deploy is unclear.

Route code fixes back to the relevant skill. This skill does not invent fixes for unknown source code.

## Dependencies

- Read access to the project and machine state.
- Ideally the operation JSON/log from `history`, `logs`, or the failing command.
- Access to `profiles` for engine/script logs.
- No network or DayZ process requirement for static triage.

## Procedure

### 1. Establish the failing command and stage

Ask for the exact command (or result JSON), exit code, and timestamp. If absent, inspect recent operations:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json history
& $backend --project "D:\Mods\MyMod" --json logs
& $backend --project "D:\Mods\MyMod" --json status
~~~

`history` returns up to 20 operation reports. Read the newest matching report first. Use:

- `action` — quick/build/test/deploy/launch/retry/rollback/publish/remote.
- `status` — complete/failed.
- `phase` — last progress stage (0 settings, 1 build, 3 install, 4 server startup, 5 client/workshop).
- `built`, `signed`, `installed`, `serverReady`, `clientLaunched`.
- `error` and `log`.

Do not treat a late "client failed" error as a build failure if `built=true` and `serverReady=true`.

### 2. Read the operation log

`logs` returns only the newest operation log. For older reports, open the `log` path from the operation JSON. Search for:

- first `[ERROR]` / exception / "exited with code";
- first fatal readiness pattern;
- last successful phase marker;
- source changed / signature / key collisions.

Use the bundled script for a bounded first-pass:

~~~powershell
python scripts/triage_logs.py --log "C:\...\logs\2026...log" --json
python scripts/triage_logs.py --profile-dir "D:\DayZServer\profiles" --json
~~~

The script is read-only, reports candidate findings with line numbers, and exits 1 when it finds error-like lines. It is a filter, not proof; verify against the source and full context.

### 3. Classify

| Class | Signature evidence from this app | Likely fix |
|---|---|---|
| Configuration | `Required setting is empty`, invalid port/timeout, non-loopback address | Correct `config`; rerun `status`. |
| Source validation | no CfgPatches, addon outside project, duplicate PBO, links, private key in source | Fix project layout/names; see build skill. |
| Tooling | AddonBuilder/DSSignFile/DSCheckSignatures not found | Set `tools` to the real DayZ Tools root. |
| Signing | key stem/extension mismatch, no signature, DSCheckSignatures failure | Use a matching existing pair; do not disable signing blindly. |
| AddonBuilder | output has error line, missing/empty PBO | Read full AddonBuilder output; fix source. |
| Install | path overlap, Workshop target, key conflict, file lock, permission | Fix target/key; never force-delete. |
| Server startup | exited with code N, cannot load mission, missing addons, Virtual Machine Exception, termination | Fix config/dependencies/scripts; inspect RPT and script log. |
| Readiness | timeout, no CE init, no mission, UDP not owned by PID | Verify mission/config, port conflicts, CE/profiles, startup logs. |
| Client/network | client process launch error, connection not proven | Check client path/args; verify in-game; do not claim success. |
| Publication/remote | Steam prerequisites or SSH/remote checks | Route to Workshop/remote skills. |

### 4. Fix at the right layer

- Do not edit generated PBOs or manifests.
- Do not delete target folders to clear a lock.
- Do not disable signing or skip validation to mask a source problem.
- Do not change `timeout` before determining whether startup is progressing.
- For script compile errors, fix the first compile error; later errors may be cascading.
- For missing addons, fix `requiredAddons` and dependency configuration, not the load order by renaming folders.
- For key conflicts, use a unique key pair; never overwrite a server key.

### 5. Verify the fix

Rerun the smallest command that can prove the fix:

- config → `status`;
- build/sign → `build`;
- install → `deploy`;
- startup → `update`;
- client → `launch` only when needed.

Report the new build ID/readiness evidence. A fix is not verified because the error text disappeared; the relevant stage must pass.

## Common examples

### AddonBuilder output says error but exits 0

The app scans output for `[ERROR]`, `error:`, `error 123`, or `build failed` and fails. Fix the reported source issue; do not parse only the process exit code.

### Server starts then shuts down

Look for `[Server] :: termination in:` and preceding RPT lines. Check server config/mission first. Do not restart repeatedly without a fix.

### CE init never appears

Look for mission load errors, missing dependencies, compile failures, and profile/config path mistakes. Confirm the configured `profiles` is the one being read.

### UDP port conflict

The app refuses if the port is owned before startup. If a failed test left a server running, the next operation may stop it only if it matches the configured test profile. Ask the user before killing anything else.

### Works but only on the client

Server-only dependencies belong in `server_only`; shared ones in `base`. Do not put the current mod in either list.

## Safety

- Logs may contain passwords, Steam IDs, IPs, and player data. Redact when sharing.
- Do not expose SSH passwords/tokens; this app uses keys/agent only.
- Do not run destructive cleanup or kill unrelated processes during triage.
- Do not claim a root cause without evidence from the failing layer.
- Do not publish after a fix unless the user explicitly authorizes it.

## Source anchors

- Operation reports/next steps: `backend/sidecar.py` lines 436–454, 462–623.
- Readiness/fatal patterns: `backend/pipeline.py` lines 794–838.
- Build errors: `backend/pipeline.py` lines 407–549.
- Local test: `backend/test_workflow.py`.
- Script: `scripts/triage_logs.py`.
- Reference: `references/error-catalog.md`.
