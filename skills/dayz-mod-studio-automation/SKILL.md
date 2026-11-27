---
name: dayz-mod-studio-automation
description: "Run a bounded end-to-end DayZ Mod Studio loop: discover environment, inspect project, edit source, build/sign, deploy, start a local test, analyze logs, fix, and report evidence. Use for autonomous mod iteration, CI-like verification, rollback after a bad deploy, and deciding when to stop or ask for approval."
compatibility: "Windows 10/11, DayZ Mod Studio 2.3.x, DayZ Tools, DayZ client/server, and a configured project. Publication and production deployment require explicit approval. Functional gameplay verification remains human."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Autonomous build-test-fix loop

## Purpose

Coordinate the specialized skills into one evidence-driven loop without overstating success. The loop separates:

1. **Packed** — PBO/signature/package valid.
2. **Installed** — deployment transaction completed.
3. **Server started** — process running.
4. **Ready** — CE/Hive, mission, UDP PID, 15 s stability.
5. **Functional** — the intended gameplay behavior actually works (not proven by the app).

## Activate when

- The user asks to autonomously find, build, test, and fix a mod.
- A change must be validated end-to-end on the local machine.
- A failed test needs bounded diagnosis and another attempt.
- A deploy must be rolled back or a run summarized with evidence.

## Preconditions

- Read `dayz-mod-studio` and `dayz-mod-studio-environment` first.
- Know the exact project root; never infer it from the current directory when multiple projects exist.
- Check `git status`/source control before editing; do not overwrite uncommitted user work.
- `publish_workshop=false` unless the user explicitly authorizes publication.
- External approval gates are known (production remote, Workshop, private keys, deleting sources).

## Procedure

### Phase 0 — Discover and snapshot (read-only)

~~~powershell
& $python "<skill>/scripts/find_studio.py" --json --project "D:\Mods\MyMod"
& $backend --project "D:\Mods\MyMod" --json status
& $backend --project "D:\Mods\MyMod" --json config --get tools
~~~

Record:

- backend path/version, Studio install, tools/server/client paths;
- project root, addons, mod target, prefix, sign/shared/separate;
- `status.checks`, `dependencies`, `sourcesChanged`, `packageReady`, `tested`, `deployment`, `rollback`;
- current `buildId` and last operation;
- `publish_workshop` and remote settings.

Stop if project/config/tools are invalid; do not "fix" by guessing paths.

### Phase 1 — Reproduce and localize

- Reproduce the failure once with `update --json` (or `build` + `deploy` + `launch` when isolating stages).
- Capture full JSONL and exit code.
- Identify the first failing stage: source validation, packing, signing, install, server start, readiness, client.
- Read the operation log and current profile logs; use `dayz-mod-studio-debugging`.

Do not edit until the first failing check and its evidence are recorded.

### Phase 2 — Edit source

- Change only files inside the configured addons, with a minimal diff.
- Preserve encodings/line endings/config syntax.
- No private keys in source; no symlinks/junctions; no new PBO name collisions.
- If the change requires new files, keep paths and `$PBOPREFIX$` consistent.
- Before any broad refactor, get approval; autonomous scope is fixing the observed failure.

### Phase 3 — Build and verify package

~~~powershell
& $backend --project "D:\Mods\MyMod" --json build
~~~

Require:

- exit 0 and `result` with `built=true`, `signed=true`, new `buildId`;
- no `error`/`attention`;
- `package-checkpoint.json` and manifest present;
- source inputs unchanged during build;
- signatures non-empty and signature check passed.

Packing success alone is not runtime success.

### Phase 4 — Deploy locally and test

Preferred staged path:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json deploy
& $backend --project "D:\Mods\MyMod" --json launch
~~~

Or one command:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json update
~~~

Require:

- `installed=true` (deploy);
- `serverReady=true` (launch/update);
- readiness evidence: `[CE][Hive] ... init sequence finished`, mission loaded, UDP listener owned by the server PID, stable for 15 s;
- no fatal compile/missing-addon/VM/corrupt-storage/termination patterns;
- `tested.json` written only after readiness;
- `clientLaunched` means process start only; `connected` is not a reliable success flag.

If no serverReady, collect `server-console.log`, profile logs, and the operation log before changing code.

### Phase 5 — Diagnose and retry

- Classify the failure (packaging, config, script compile, missing dependency, server startup, readiness, client).
- Apply one minimal fix per cycle.
- Re-run from the earliest affected stage; for source changes, rebuild (do not reuse a stale checkpoint).
- Bound: max 3 attempts per failure signature and max 5 total cycles. Stop earlier on no new evidence.
- If the same error returns unchanged twice, stop and report; do not random-walk settings.

### Phase 6 — Verify functional behavior

Use only evidence available:

- server readiness and clean logs;
- expected class/config/asset present in the packed PBO;
- client process/connection logs if available;
- user-visible/manual test for gameplay, visuals, sounds, UI, damage, spawns.

Never claim gameplay works from `serverReady=true`. Mark it **not verified** and state the exact manual check needed.

### Phase 7 — Roll back on regression

If the new deployment is worse:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json rollback
~~~

- Rollback restores only the **first install** recorded in `previous.json`.
- It is not source control: source edits remain.
- After rollback, re-check readiness and report restored build ID.

### Phase 8 — Report

Use `references/loop-and-report.md`. Include commands, exit codes, build IDs, evidence, changes, pass/fail per level, limitations, and next action.

## Approval gates

| Action | Approval |
|---|---|
| Read status/logs/config | no |
| Edit project source within requested scope | per user request |
| Local build/deploy/test | per user request |
| Delete/rename mod sources | explicit |
| Overwrite/rotate private keys | explicit |
| Remote production deploy | explicit every time |
| Workshop create/publish/retry | explicit every time |
| Change global/default settings or `prep_exe` | explicit |
| Kill unrelated DayZ processes | explicit and verified |

## Stop conditions

Stop and report when:

- missing app, tools, game, server, or configured project;
- source control conflict or uncommitted changes outside scope;
- permission/secret required;
- 3 attempts on one signature or 5 cycles total;
- two consecutive runs add no new evidence;
- remote/Workshop approval absent;
- only manual gameplay verification remains.

## Examples

### One cycle

~~~powershell
& $backend --project "D:\Mods\MyMod" --json update *> run.jsonl
$code = $LASTEXITCODE
& $python "<skill>/scripts/studio.py" --source $backend --project "D:\Mods\MyMod" --json status
~~~

### Isolate a readiness failure

~~~powershell
& $backend --project "D:\Mods\MyMod" --json build
& $backend --project "D:\Mods\MyMod" --json deploy
& $backend --project "D:\Mods\MyMod" --json launch
& $backend --project "D:\Mods\MyMod" --json logs
~~~

## Safety and limitations

- Build/deploy backups cover installation, not source. Use version control for code.
- Do not loop forever; bounded attempts are mandatory.
- Do not publish or deploy to production as part of "testing".
- Do not print SSH passwords, tokens, private keys, or Workshop secrets.
- Do not kill all `DayZ*.exe`; the app refuses unrelated sessions for a reason.
- A JSON `result` can coexist with partial file errors (textures) or warnings; inspect the payload, not just exit 0.
- No CLI for stop server, P3D preview, GUI edits, or model export; do not fabricate them.

## Source anchors

- `backend/sidecar.py` (operations, status, exit/event contract).
- `backend/pipeline.py` (build, install transaction, readiness).
- `backend/test_workflow.py` (local test, readiness).
- `backend/remote.py` and `backend/workshop.py` (approval-gated externals).
- `skills/dayz-mod-studio/scripts/studio.py` (JSONL runner).
- Reference: `references/loop-and-report.md`.
