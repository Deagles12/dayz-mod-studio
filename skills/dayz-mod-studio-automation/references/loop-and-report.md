# Loop control, evidence, and reporting

## Why stage the loop

`update` is build + sign + install + local test in one operation. A single failure then has several possible causes. When diagnosing, stage it:

1. `build` — package/signature only.
2. `deploy` — install that checkpoint.
3. `launch` — start test server and client.

Use `update` for a clean, repeatable full cycle once the cause is understood.

## Evidence model

Each run must preserve:

| Evidence | Source |
|---|---|
| Command, start time, duration | operation log/result |
| Exit code | process |
| JSONL events | `--json` stdout |
| First error | `event=error`/`result.error` |
| Build ID | `result.buildId`, `package-checkpoint.json` |
| Package path/manifest | build state |
| Signed | `result.signed`, signature checks |
| Installed | `result.installed`, `deployment.json` |
| Server ready | `result.serverReady`, `server-readiness.json` |
| Readiness lines | `server-console.log`, profile logs |
| Client launched | `result.clientLaunched` |
| Workshop status | `result.workshopStatus` |
| Rollback point | `previous.json`, `rollback` |

Do not use a screenshot of the GUI as the only evidence when JSON/state exists.

## JSONL handling

- Events: `progress`, `log`, `result`, `error`.
- Terminal `result` contains the operation object and status details.
- `error` means failure; exit code should be 1.
- With `--json`, `--verbose` does not stream logs. Use `logs` or the operation log for detail.
- Progress labels are not errors; do not grep them as failures.
- Partial failures (textures, dependency checks) can carry both successes and errors.

## Success levels

### Level 1: packed

- `build` exit 0;
- `built=true`;
- all configured addons produced non-empty PBOs;
- AddonBuilder output inspected;
- signatures created and `DSCheckSignatures` passed when signing;
- package manifest/input hashes committed;
- `package-checkpoint.json` written.

### Level 2: installed

- `deploy` exit 0;
- `installed=true`;
- target `server/mod` (and `client/mod` when applicable) updated;
- transaction backup exists;
- no path/symlink/target conflict.

### Level 3: server started

- `launch`/`update` exit 0;
- server process owned by Studio and running;
- `clientLaunched` is only process launch.

### Level 4: ready

- mission line `Module: Mission ;` (or equivalent logged mission init);
- `[CE][Hive] ... init sequence finished`;
- UDP port listener owned by the exact server PID;
- stable for 15 s;
- no fatal patterns;
- `serverReady=true` and `tested.json`.

### Level 5: functional

- manual/in-game check of the intended behavior;
- no errors in client/server scripts;
- asset/class present where expected;
- performance/visuals acceptable.

**The app does not prove level 5.** Report it separately.

## Failure signatures

Normalize an error before counting attempts:

- strip timestamps, PIDs, absolute paths, line numbers that change;
- keep file/function/error code/text;
- hash the remainder as the signature.

Retry only if the signature changes or new evidence appears.

## Stop rules

- 3 attempts for the same signature.
- 5 total cycles.
- No new evidence in two consecutive cycles.
- Any required approval/secret is missing.
- The fix would touch unrelated projects/settings.
- A rollback is needed to protect the user's working install.

## Rollback policy

- `rollback` restores/removes the first install from `previous.json`.
- It does not revert source or state outside that transaction.
- After rollback, verify server can still start; a stale tested/ready record may need re-testing.
- If rollback fails, stop and preserve logs; do not force-delete targets.

## Report template

~~~markdown
# DayZ mod run report

## Objective
<one sentence>

## Environment
- Studio/backend:
- Project:
- Addons/target:
- Tools/server/client:
- Signing/shared/separate:

## Changes
- <file>: <why>
- <file>: <why>

## Commands and results
| # | Command | Exit | Build ID | Outcome |
|---|---------|------|----------|---------|
| 1 | build | 0 | ... | packed |
| 2 | deploy | 0 | ... | installed |
| 3 | launch | 0 | ... | serverReady |

## Evidence
- Packed: <PBOs/signatures/manifest>
- Installed: <targets/backup>
- Ready: <CE/Hive line, UDP PID, 15 s stability>
- Functional: <manual result or NOT VERIFIED>

## Failures and fixes
- <signature> -> <fix> -> <new evidence>

## Remaining risks / not verified
- <gameplay/visual/performance/production/Workshop>

## Rollback
- Available at <backup>; used? <yes/no>

## Next action
<single concrete step or approval request>
~~~

## Reporting language

Use precise claims:

- "PBO built and signed" not "mod works".
- "server reached readiness" not "mod is stable in gameplay".
- "client process launched" not "client connected".
- "Workshop confirmed update" not "players received it".
- "not tested" when DayZ Tools/game/Steam are unavailable.

## Source anchors

- `backend/sidecar.py` (operation result fields).
- `backend/pipeline.py` (checkpoint/build/install/readiness state).
- `backend/test_workflow.py` (readiness).
- `skills/dayz-mod-studio-debugging/scripts/triage_logs.py` (log evidence).
- `skills/dayz-mod-studio-testing/references/readiness-and-logs.md` (exact readiness).
