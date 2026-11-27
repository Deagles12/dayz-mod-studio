---
name: dayz-mod-studio-remote
description: "Deploy a verified DayZ Mod Studio package to a Linux DayZ server over Windows OpenSSH/SFTP with systemd health checks and automatic rollback, or upload files only for manual installation. Use for remote server deployment, SSH preflight, staging uploads, and remote recovery."
compatibility: "Windows 10/11 with OpenSSH Client (ssh, sftp) in PATH; SSH key/agent authentication; Linux server with DayZ, systemd, flock, sha256sum, timeout, passwordless sudo for the service start/stop, and a health command. DayZ Mod Studio 2.3.x."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Remote Linux deployment

## Purpose

Install a verified package on a remote Linux DayZ server with:

~~~text
SSH checks -> SFTP staging -> sha256 verification -> atomic swap -> systemd start -> health command -> auto rollback on failure
~~~

Or upload to a staging directory only when the user wants manual installation.

## Activate when

- The user asks to deploy to a Linux server / VPS / remote DayZ host.
- SSH/SFTP or systemd health checks fail.
- A remote deployment rolled back or has an unknown result.
- Files-only staging is requested.

Route Workshop publication to `dayz-mod-studio-workshop`. Route local issues to deploy/testing.

## Dependencies

- Windows OpenSSH Client: `ssh` and `sftp` on `PATH`.
- SSH key or agent authentication already working. The app uses `BatchMode=yes` and strict host-key checking; it never prompts for a password.
- Remote canonical absolute `root` and `keys` directories, writable by the SSH user.
- Remote mod folder `remote_mod` matching `^@[A-Za-z0-9_-]+$`.
- Existing systemd unit ending in `.service` (not files-only).
- Passwordless `sudo -n systemctl stop/start <unit>`.
- Health command (not files-only) that exits 0 when the server is ready.
- Remote tools: `flock`, `sha256sum`, `timeout`, `systemctl`, `sudo`.

## Procedure

### 1. Preflight configuration

~~~powershell
& $backend --project "D:\Mods\MyMod" --json config --get remote_host
& $backend --project "D:\Mods\MyMod" --json config --get remote_port
& $backend --project "D:\Mods\MyMod" --json config --get remote_user
& $backend --project "D:\Mods\MyMod" --json config --get remote_root
& $backend --project "D:\Mods\MyMod" --json config --get remote_mod
& $backend --project "D:\Mods\MyMod" --json config --get remote_keys
& $backend --project "D:\Mods\MyMod" --json config --get remote_service
& $backend --project "D:\Mods\MyMod" --json config --get remote_readiness
& $backend --project "D:\Mods\MyMod" --json config --get remote_files_only
~~~

Rules the app enforces:

- Host: letters/digits/dots/hyphens, starts alphanumeric, max 253.
- User: POSIX-style `[a-zA-Z_][a-zA-Z0-9_-]*`.
- Port: 1–65535.
- Root/keys: canonical absolute POSIX, only `[A-Za-z0-9_.@-]` components; **no spaces**. `cd "$path" && pwd -P` must equal the configured path (no symlink).
- Keys must be outside `<root>/<remote_mod>`.
- Service must match `[A-Za-z0-9][A-Za-z0-9_.@-]*\.service`.
- Health command required unless files-only.

Do not lower host-key checking or add passwords. If the host key is unknown, have the user verify the fingerprint and add it with normal `ssh` once.

### 2. Remote check

~~~powershell
& $backend --project "D:\Mods\MyMod" --json remote-check
~~~

This checks:

- `ssh` host key/auth;
- canonical, writable root and keys;
- required tools;
- unit is loaded;
- passwordless sudo can stop and start it;
- health command syntax.

It does not deploy. Failures are intentionally generic to avoid exposing remote details; ask the user for the host's actual state rather than weakening checks.

### 3. Choose the source build

`remote` selects:

- If `publish_workshop=true`: the confirmed Workshop build for the configured item; it must have `status=confirmed` and matching item ID.
- Otherwise: the newer of `quick-ready.json` and `local-ready.json` (by date/build ID).

It requires a valid build ID matching `YYYYMMDD-HHMMSS-[a-f0-9]{8}` and a matching manifest. It does **not** rebuild. Confirm `status.sourcesChanged` is false and the build is the one the user intends.

To pin a specific build:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json remote --build-id 20261115-112233-aaaabbbb
~~~

If the selected build changed, the app refuses.

### 4. Deploy

~~~powershell
& $backend --project "D:\Mods\MyMod" --json remote
~~~

Flow:

1. Re-check SSH/SFTP prerequisites.
2. Verify local package hashes.
3. Create a remote staging directory `<root>/.dmc-stage.XXXXXXXX`.
4. Upload the package with SFTP and write a checksums file.
5. Run remote `sha256sum --check`.
6. Lock `<root>` with `flock`; reject symlink target.
7. If a key with the same name differs, fail before install (`DMC_KEY_CONFLICT`).
8. Stop the unit; move old target aside; move staged mod into place; install new keys.
9. Start the unit; poll up to 30 times (2 s apart) for `systemctl is-active` plus health command exit 0.
10. On any failure after swap, rollback: stop, remove new target, restore previous target, remove newly installed keys, restart if it was running.
11. Report status and staging path.

If local inputs changed since the package was built, the app logs that it is installing the previous verified build (`olderBuild=true`). Do not ignore this; rebuild if the user expects current source.

### 5. Interpret status

| Status | Meaning | Action |
|---|---|---|
| `ready` | Service active + health command passed; files installed. | Report success of deployment, not gameplay. |
| `uploaded` | Files-only staging upload; no install/restart. | User must install/restart manually. |
| `rolled_back` | New version failed; previous target restored and unit restarted (or left stopped if it was stopped). | Inspect remote logs; fix; redeploy. |
| `rollback_failed` | Recovery failed. | Stop; inspect server manually. Do not redeploy over unknown state. |
| `rejected` | Remote rejected package before/during activation; verify whether live mod changed. | Inspect staging/remote state before retry. |
| `unknown` | SSH timeout/exit 255; outcome not known. | Inspect the remote service/files before any retry. |

The CLI turns non-`ready` statuses into a failed operation with an explanatory error. Treat `unknown` and `rollback_failed` as incidents, not retryable noise.

### 6. Files-only mode

Set `remote_files_only=true` only when the user wants to finish manually:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json config --set remote_files_only true
& $backend --project "D:\Mods\MyMod" --json remote
~~~

It:

- requires root and remote_mod;
- does not require service/health/keys/sudo;
- checks SFTP can create/remove a staging directory;
- uploads to `<root>/.dmc-stage.<hex>` with checksums;
- returns `uploaded`, leaves the live mod untouched.

Provide the staging path and exact manual steps only if known; do not claim the live server was updated.

## Examples

### Standard remote deployment

~~~powershell
& $backend --project "D:\Mods\MyMod" --json remote-check
& $backend --project "D:\Mods\MyMod" --json remote
~~~

Only after the user explicitly approves production deployment. This stops and starts the live service.

### Recover from a rolled-back deploy

Read the operation report `remote.status` and staging path, then inspect remote systemd/journal and DayZ logs. Do not run `rollback` locally; it only affects local targets.

### Pin an older verified build

~~~powershell
& $backend --project "D:\Mods\MyMod" --json status
& $backend --project "D:\Mods\MyMod" --json remote --build-id <id>
~~~

Only if that build is still present and hashes verify.

## Common errors and fixes

| Error | Meaning | Fix |
|---|---|---|
| `Enter an SSH hostname and username.` | Invalid host/user | Use a plain hostname and POSIX user. |
| `SSH port must be 1–65535.` | Bad port | Correct it. |
| `Enter a canonical absolute Linux directory ...` | Spaces/symlink/relative path | Use a real absolute path with supported characters. |
| `Use a keys directory outside the mod directory.` | Keys inside mod | Choose `<root>/keys` or similar. |
| `Enter the remote systemd service and readiness command.` | Missing/invalid unit or health | Provide `name.service` and a command that exits 0. |
| `SSH checks failed ...` | Host key/auth/tool/unit/sudo/dir issue | Ask which check failed; verify manually with ssh. Never disable strict host keys. |
| `SFTP could not create and remove a staging directory.` | SFTP permission/path | Fix root ownership/permissions. |
| `SFTP transfer failed. The live mod was untouched.` | Upload failure | Inspect staging/disk/network; live untouched. |
| `A public key with the same filename and different content ...` | Key conflict | Use a unique key pair. |
| `The remote service did not stop.` | systemd/sudo issue | Fix service/sudo; live untouched. |
| `rolled_back` | New version unhealthy | Read remote logs; fix; redeploy. |
| `rollback_failed` | Manual intervention | Inspect and restore remote state. |
| `unknown` | Timeout/SSH 255 | Inspect before retrying. |

## Safety and limitations

- **Production deployment requires explicit user approval.** The operation stops the live service.
- No SSH password support. Never ask for or store a password. Use keys/agent and verified host keys.
- Do not disable `StrictHostKeyChecking`, `BatchMode`, or sudo checks.
- Do not retry `unknown`/`rollback_failed` blindly; state may be partially changed.
- The app does not deploy Windows servers, Docker, or non-systemd services.
- Health command success is defined by the user's command, not by in-game playability.
- Staging directories can remain by design for diagnosis. Do not delete them without checking status.
- Remote paths with spaces are unsupported.

## Source anchors

- `backend/remote.py` (SSH, check, activate, rollback, statuses).
- `backend/sidecar.py` lines 567–605 (remote operation).
- Reference: `references/remote-workflow.md`.
