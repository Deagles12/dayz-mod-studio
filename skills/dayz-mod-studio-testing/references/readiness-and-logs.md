# Readiness, logs, and test checkpoints

## Test flow

`TestPipeline.test`:

1. Validate signing requirement when `verifySignatures` is enabled and profile is shared.
2. Resolve dependencies and keys.
3. Build (unless resuming).
4. Verify manifest, package hashes, and current input hashes.
5. Write `package-checkpoint.json` and `retry.json`.
6. If resuming an installed package, verify installed copy.
7. Reuse an already-ready server only if its PID still owns the UDP port and its saved endpoint/readiness match.
8. Otherwise stop matching test session, install if needed, create profiles, snapshot log offsets, start server hidden.
9. `wait_ready`.
10. Save `tested.json` and `deployment.json` after readiness.
11. Launch client if configured; remove `retry.json` after the flow returns.
12. Stop was already done by next test; the server is left running on success.

## Readiness algorithm

Every 2 seconds until timeout:

- Read only newly appended bytes of `*.rpt`, `script*.log`, and `error*.log` in the profiles folder.
- If a file shrank, restart that file at offset 0.
- Keep the last 500 KB of recent text per file.
- Search the accumulated recent text for fatal patterns.
- Check process exit.
- Require mission + CE lines.
- Query `Get-NetUDPEndpoint -LocalPort <port>` and require `OwningProcess == server PID`.
- Once conditions hold, require 15 seconds of continuous hold. Any loss of CE/mission/UDP resets the stable timer.
- On success, save PID, creation timestamp, ready=true, and file offsets.

Fatal patterns include: can't/cannot compile, compilation failed, error compiling, missing addons, requires addon, cannot load mission, Virtual Machine Exception, corrupt/damaged/failed storage/persistence/save, and `[Server] :: termination in:`.

The search is over newly appended logs since the baseline, but if a file is recreated and grows past the old offset, old content could be reread only when the file shrank below offset. This is why a clean profile directory and a fresh test are safer.

## What readiness proves

Proves:

- The process stayed up for 15 s after mission/CE initialization.
- A UDP socket on the configured port belongs to that PID.
- No known fatal pattern appeared in newly appended logs.
- The mod package was installed and hashes verified beforehand.

Does not prove:

- A client can connect or authenticate.
- The mission is playable.
- Scripts are free of runtime exceptions after init.
- Gameplay features, textures, models, or network sync work.
- The server survives longer than 15 s after the check.

## Logs

`server-console.log` captures process stdout/stderr. Engine logs are in `profiles`. Operation logs are more useful for app decisions; engine logs are authoritative for Enforce.

The `logs` CLI returns the newest operation log (500 KB cap). Use filesystem reads for RPT/script/error logs. If logs contain server passwords or player data, redact them.

## Checkpoints

| File | Written when | Meaning |
|---|---|---|
| `package-checkpoint.json` | build or test | Source/settings snapshot + manifest + installed flag + targets |
| `retry.json` | test | Resumable state; removed on success |
| `tested.json` | after readiness | Manifest eligible for publish/create-workshop |
| `deployment.json` | after install/readiness | Currently installed manifest for launch |
| `local-ready.json` | operation reports serverReady | Convenience marker |
| `server-readiness.json` | while waiting | PID/ready/offsets |

`tested.json` can also be written by `launch` because launch calls the same test path. It still represents a package that reached readiness, not necessarily one built in that command.

## Client behavior

- `open_dayz` controls normal update/test client launch.
- `launch` uses `start_client=True` regardless of `open_dayz`.
- Client args: loopback `-connect`, `-port`, optional password from config, optional `-profiles`, dependencies/`-mod`.
- Client process start is recorded; `clientLaunched=true`.
- `connected` is never positively set by this code path. Do not infer connection.

## Retry semantics

`retry` requires `retry.json` and verifies:

- current build settings hash equals checkpoint;
- current source snapshot equals checkpoint;
- manifest/package hashes still match;
- if installed, targets equal checkpoint targets.

Then it may reuse a ready server, otherwise install/start. It does not rebuild. If any check fails, run `update`.

## Source anchors

- `backend/test_workflow.py` 120–206.
- `backend/pipeline.py` 552–590, 758–838.
- `backend/sidecar.py` 462–623.
