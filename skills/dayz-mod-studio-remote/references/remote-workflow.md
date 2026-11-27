# Remote workflow internals

## Build selection

Non-Workshop mode prefers the newer of:

- `quick-ready.json` (quick build/install)
- `local-ready.json` (operation with `serverReady`)

It does not require `tested.json`. Therefore a remote deploy can use a build that never started a local server. If a locally verified build is required, confirm the chosen ID and its provenance before deploying.

Workshop mode requires `workshop-items/<id>.json` or `workshop-confirmed.json` with `status=confirmed` and matching item. Route that decision to the Workshop skill.

Build IDs must match `[0-9]{8}-[0-9]{6}-[a-f0-9]{8}` and the manifest ID.

## SSH transport

Command shape:

~~~text
ssh -T -oBatchMode=yes -oStrictHostKeyChecking=yes -oConnectTimeout=10
    -oServerAliveInterval=10 -oServerAliveCountMax=3 -p <port> user@host
    sh -s -- <args...>
~~~

The script is piped on stdin; arguments are shell-quoted with `shlex.join`. SFTP uses `-b -` batch input and a 1800 s timeout.

There is no password path. BatchMode fails instead of prompting. Host keys must be in known_hosts.

## CHECK

~~~sh
set -eu
root=$1 keys=$2 unit=$3 health=$4
test "$(cd "$root" && pwd -P)" = "$root"
test -w "$root"
test "$(cd "$keys" && pwd -P)" = "$keys"
test -w "$keys"
for tool in flock sha256sum timeout systemctl sudo; do command -v "$tool" >/dev/null; done
test "$(systemctl show -p LoadState --value "$unit")" = loaded
sudo -n -l -- systemctl stop "$unit" >/dev/null
sudo -n -l -- systemctl start "$unit" >/dev/null
sh -n -c "$health"
~~~

The `sudo -n -l -- systemctl ...` check verifies command-specific sudo permission without running it. The app's error is generic; use normal SSH diagnostics to find which check failed.

## ACTIVATE

Key ordering:

1. acquired non-blocking `flock` on root;
2. target must not be a symlink and must be a directory or absent;
3. staged package checksums are verified;
4. keys are compared/copied;
5. service is stopped and confirmed inactive;
6. previous target renamed to `stage/previous` if present;
7. staged mod renamed into target;
8. new keys installed using temp file + `ln -T` with 0644;
9. service started;
10. `ready()` loops 30 times: active + health exit 0 within 5 s; 2 s sleep;
11. on failure, trap restores previous target, removes newly installed keys, restarts only if it was running before, and verifies health.

Rollback echoes:

- `DMC_ROLLBACK_OK` -> status `rolled_back`;
- `DMC_ROLLBACK_FAILED` -> status `rollback_failed`;
- `DMC_KEY_CONFLICT` -> pre-install failure (live untouched);
- `DMC_STOP_FAILED` -> pre-install failure (live untouched);
- no marker + exit 255 -> `unknown`;
- other non-zero/ambiguous -> `rejected`.

## Key behavior

- Package keys come from `<package>/Keys/*.bikey`.
- Existing key with same name and identical bytes is accepted.
- Different bytes -> abort before swap.
- New keys are linked atomically into the keys directory.
- Rollback removes only keys it installed and that still match.

## Files-only

- Stage name `<root>/.dmc-stage.<uuid hex>`.
- SFTP `mkdir`, then `put -r package` and checksums.
- Preflight only checks that SFTP can create/remove a staging dir; root is still validated.
- No checksum verification, no service manipulation, no rollback.
- Report `uploaded` and staging path. The live mod remains untouched.

## Path rules

`absolute_path` accepts only one or more `/<component>` where component characters are `[A-Za-z0-9_.@-]` and not `.`/`..`. This excludes spaces and many shell metacharacters by design. SFTP local path rejects `\"`, newline, CR, `[`, `]`, `*`, `?`. Package files must match `[A-Za-z0-9_.@ /-]+`.

## Recovery matrix

| Symptom | Live state | Next step |
|---|---|---|
| `rejected` before swap | untouched | inspect remote script error; fix; retry |
| `rolled_back` | previous target restored | inspect logs; redeploy after fix |
| `rollback_failed` | unknown | manual recovery; do not redeploy |
| `unknown` | unknown | inspect target, service, staging; then decide |
| `ready` but health command weak | installed | strengthen health check; verify manually |

## Source anchors

- `backend/remote.py` lines 13–277.
- `backend/sidecar.py` lines 567–605.
