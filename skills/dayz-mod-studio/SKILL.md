---
name: dayz-mod-studio
description: "Router for the DayZ Mod Studio Agent Skills pack. Use when an agent must build, sign, install, test, deploy, publish, convert, diagnose, or automate a DayZ mod with DayZ Mod Studio on Windows. Establishes the real CLI contract and safety gates, then selects exactly one focused skill."
compatibility: "Agent Skills compatible host. DayZ Mod Studio 2.3.x is a portable Windows 10/11 app; build/sign needs DayZ Tools, local test needs DayZ Server plus client, remote deploy needs OpenSSH, models need Blender. Audited against upstream 2.3.7."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
  audited-commit: "556523f88d17ad14f1377e27ba9f7c16f7fb058a"
---

# DayZ Mod Studio

## Purpose

Route an agent to the smallest correct procedure for operating **DayZ Mod Studio 2.3.x**. This pack is an operational layer over the installed app. It is not a DayZ modding tutorial and does not replace the DayZ Modding Knowledge Pack.

The source of truth is the shipped application and its repository, not assumptions from older DayZ tooling. The pack was audited against upstream version 2.3.7, commit `556523f8`.

## Activate this skill when

- The user names DayZ Mod Studio, `dayz-backend.exe`, `dayz-mod-studio.exe --cli`, or this repository.
- The task is to discover the installation, build or sign a PBO, install locally, start a test server, inspect readiness/logs, deploy to a Linux server, publish to Steam Workshop, convert textures/models, roll back, or run a bounded build-test-fix loop.
- The correct specialized skill is not yet known.

Do **not** use this skill for generic Enforce Script syntax, DayZ class hierarchies, mission design, or gameplay API questions that do not involve DayZ Mod Studio.

## First decisions

1. **Is the app installed and which copy?** Do not assume `C:\Program Files`. Portable copies are normal. Run the environment skill's finder before any operation.
2. **Is the work using the CLI or the GUI?** Prefer the CLI for build, sign, install, test, remote deploy, Workshop, config, status, history, logs, and textures. P3D preview/validation and GLB-to-P3D export are GUI-only in 2.3.7; there is no supported CLI for them.
3. **Which project?** Resolve an absolute project root, then confirm with `status --json`. `--project` is a global flag and must appear **before** the subcommand.
4. **Which command matches the requested outcome?** `quick` is not a test. `deploy` is not a test. `update` (alias `test`) and `launch` run the local readiness test and can save `tested.json`; `quick` and `deploy` do not.
5. **Which gate applies?** Local install is reversible and may proceed when the user asked for it. Production remote deploy, Workshop creation/publication, private-key changes, source deletion, and killing unrelated DayZ processes need explicit approval.

## Route table

| Situation | Load |
|---|---|
| Find the app/backend, DayZ Tools/server/client, state, project, or settings | `dayz-mod-studio-environment` |
| Build, sign, verify, inspect manifest, or quick-build a package | `dayz-mod-studio-build` |
| Install a built package locally, launch it, roll back, or inspect backups | `dayz-mod-studio-deploy` |
| Start a local test server, wait for CE/UDP readiness, or rerun an interrupted test | `dayz-mod-studio-testing` |
| Read RPT/script/error logs, classify failures, or choose a fix | `dayz-mod-studio-debugging` |
| Deploy to a Linux DayZ server over SSH/SFTP | `dayz-mod-studio-remote` |
| Check ownership, create, publish, or retry a Workshop item | `dayz-mod-studio-workshop` |
| Convert PNG/JPEG/TGA/PAA textures through the CLI | `dayz-mod-studio-textures` |
| Export GLB to P3D, validate P3D, or preview a model | `dayz-mod-studio-models` |
| Run a bounded autonomous build-test-diagnose-fix loop or parse JSONL | `dayz-mod-studio-automation` |

If two skills seem relevant, choose by the **outcome the user asked for**, not by the tool involved. Build followed by install is two outcomes only when both need explanation; a full loop belongs in automation.

## Universal bootstrap

Use this order for any non-trivial task:

1. Locate the executable and backend with `dayz-mod-studio-environment/scripts/find_studio.py` or by asking the user. Verify the backend beside the app, unless the user supplies `--backend`.
2. Confirm the backend works:
   ```powershell
   .\dayz-backend.exe --help
   .\dayz-backend.exe --project "D:\Mods\MyMod" --json status
   ```
3. Resolve the project and read `status` JSON. Treat failed checks as blockers for the corresponding operation, not as cosmetic warnings.
4. Check whether the requested source changes are already present. Do not rebuild stale assumptions.
5. Run one operation at a time. Parse **all** JSON Lines and the exit code. Never judge success from the last human-readable line.
6. Report the build ID, package path, install targets, readiness evidence, and the exact verification performed.

## CLI contract essentials

Global flags must precede the command:

```text
dayz-backend.exe [--project DIR | --recent] [--json] [--verbose] [--language en|uk] COMMAND ...
```

Commands exposed by 2.3.7:

`textures`, `quick`, `update` (alias `test`), `remote`, `status`, `history`, `logs`, `config`, `steam-owner`, `workshop-check`, `keys`, `build`, `deploy`, `launch`, `retry`, `publish`, `create-workshop`, `retry-publish`, `rollback`, `remote-check`.

There is no CLI command to stop a test server, preview a P3D, validate a P3D, export a GLB, browse builds, or edit in the GUI. Do not invent one. Use the GUI for those, or state the limitation.

With `--json`, output is newline-delimited JSON. Possible event names are `progress`, `log`, `result`, and `error`. A command may emit progress/log events and still fail, or emit a result with partial file errors and exit 1. See `references/cli-contract.md` for the event envelope, exit semantics, and safe invocation patterns.

## Safety gates

Stop and ask before:

- Publishing or updating a Steam Workshop item, changing visibility, or accepting the Workshop agreement.
- Deploying to a remote production server, restarting its service, or running with `remote_files_only` disabled and passwordless sudo.
- Overwriting, replacing, or deleting `.biprivatekey`, `.bikey`, or any signing material.
- Deleting or moving mod source, build outputs, user backups, or installation targets outside what DayZ Mod Studio's own transaction would replace.
- Killing a DayZ process. The app deliberately refuses when another DayZ session is detected; do not bypass it with `taskkill`.
- Changing machine-global environment paths, Steam settings, or DayZ configuration not owned by the project.

Allowed without a new confirmation when already requested: building, signing with the configured key, installing into the configured local test folders, rolling back the last local install, and reading logs. Still respect the app's own preflight checks.

Never expose SSH passwords, tokens, private keys, Steam credentials, or full config dumps containing secrets. The supported remote transport is key/agent authentication only; there is no password option to disclose.

## What counts as success

Distinguish four levels explicitly:

1. **Packaging success** — `build` exit 0, manifest written, PBOs and signatures verified.
2. **Install success** — `deploy` or `quick` exit 0 and the manifest/targets confirm copies.
3. **Server-start success** — `update` exit 0, `serverReady: true`, CE/Hive and mission log markers observed, UDP listener owned by the test server, stable for the readiness window.
4. **Functional success** — the user's feature actually works in-game. DayZ Mod Studio cannot establish this. Say so and describe the manual check.

Never collapse level 3 into level 4 or call a package "working" because AddonBuilder produced a PBO.

## Progressive disclosure

Load only what the operation needs:

- `references/cli-contract.md` — exact global flags, JSONL events, exit codes, and common invocation mistakes.
- The selected specialized skill's `SKILL.md`.
- That skill's `references/` files for edge cases and error catalogs.
- Scripts only when deterministic discovery/parsing is useful; they are assistants, not a second source of truth.

## Source anchors

- `backend/sidecar.py` — CLI parser, JSONL emitter, project selection, all command handlers.
- `backend/pipeline.py` — install discovery, build/sign, manifests, transactions, local lifecycle, readiness.
- `src-tauri/src/main.rs` — GUI versus `--cli` forwarding.
- `README.md` — user-facing CLI examples and current limitations.
- Upstream: <https://github.com/Deagles12/dayz-mod-studio>

## Limitations

- The app is Windows-only. The skills can be installed on Linux for agent frameworks, but they cannot execute the Windows backend there.
- P3D preview/validation and GLB-to-P3D are internal/GUI features, not a public CLI contract.
- Readiness is evidence of startup, not gameplay correctness.
- Steam Workshop calls depend on a signed-in Steam client and network; retries can be uncertain and must not be blindly repeated.
- This pack does not grant approval for destructive or public actions.
