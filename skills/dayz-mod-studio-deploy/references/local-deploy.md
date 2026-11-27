# Local deploy transaction and recovery

## Target resolution

For a normal pipeline:

```python
targets = [server / mod]
if shared and separate and client != server:
    targets.append(client / mod)
```

For quick:

```python
paths = []
if copy_server: paths.append(server)
if copy_client: paths.append(client)
targets = unique(path / mod)
```

The server root is always the key destination root. A missing target root is a configuration error when the corresponding copy/target is enabled.

## Safety checks before install

- Package still matches its manifest hashes and belongs to this project.
- No target is inside the project or the project inside a target.
- No path component is `workshop` or `!workshop` (case-insensitive).
- Targets are unique and not nested.
- Existing targets are real directories, not links.
- Server `Keys` (case-insensitive `keys`) is not a link and does not overlap the project.
- A same-named key already on the server must be byte-identical; otherwise fail.

## Transaction

```text
state/backups/<uuid>/
  recovery.json                 records target, backup path, existed
  mod-0/                        copy of previous target or absent
  mod-1/...
  keys/<name>.bikey             copy of previous key or absent
```

Steps:

1. Compute changes: each target ← package; each new key ← package/dependency key.
2. Create backup copies for existing targets and keys.
3. Write `recovery.json` before replacing anything.
4. Copy package to a staging/backup area and verify.
5. Rename existing target aside, move staged tree into place, repeat.
6. Verify installed tree and keys.
7. Save `previous.json` with backup records and mode.
8. On any failure, restore all targets from staging/backups; keep recovery record.

The copy excludes nothing at install time: the built package is copied as-is. It has already excluded secrets.

## `previous.json` and rollback

```json
{
  "mode": "normal",
  "records": [
    {"target": "D:\\DayZServer\\@MyMod", "backup": "...\\backups\\<id>\\mod-0", "existed": true}
  ]
}
```

- Only one record set exists. A new install replaces it after success.
- Rollback validates every target is still an allowed current target and every backup is under the state backup root.
- If `existed=false`, rollback removes that target.
- Normal rollback stops matching sessions first; quick rollback does not.
- Success deletes `previous.json`; normal also deletes retry/deployment/tested/local-ready.
- Keeping the backup is intentional; do not clean it while rollback might be needed.

## Stop semantics

The app enumerates `DayZ*.exe`, reads executable path and command line, and stops only:

- a server whose executable equals the configured server exe and whose `-profiles` matches the configured profile path;
- a client whose executable parent matches the configured client and whose `-connect` is loopback and `-port` matches and, for shared profiles, whose `-mod` includes a current target.

If another DayZ server/client from the same installation is running and does not match, the app raises "Another DayZ session is running" instead of killing it. Shutdown is a close request (server via sidecar stop, client via CloseMainWindow), with a 20-second wait. There is no CLI stop command.

## Deployment checkpoint

`deployment.json` records the installed manifest and `installed=true`. `launch` requires it. `deploy` requires `package-checkpoint.json` written by `build`.

A package checkpoint can refer to a build made before recent source edits. The app's `status.sourcesChanged` exists to expose that. Always treat it as stale unless intentionally deploying a known older build.

## Failure modes

| Stage | Failure | Recovery |
|---|---|---|
| Preflight | path overlap/link/Workshop | correct config; do not bypass |
| Key check | same name different content | use a unique key pair |
| Copy | file locked/permission | close owner, fix ACL; rollback auto-restores |
| Commit | rename failure | app attempts restore; inspect recovery |
| Verification | tree/key mismatch | app fails; do not launch |
| Rollback | backup missing/path changed | manual, explicit recovery; never fabricate |

## Source anchors

- `backend/pipeline.py` lines 241–311, 611–756.
- `backend/quick_build.py` lines 28–94.
- `backend/sidecar.py` lines 534–559.
