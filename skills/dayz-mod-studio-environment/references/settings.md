# Project settings reference

All keys below exist in the effective settings returned by `config`. `config --set` refuses anything else. Values are strings unless marked boolean.

The GUI saves some keys to shared `environment.json`. `project.json` overlays them. `environment_override=true` makes the project ignore shared values for those keys. The build/settings validation still applies.

## Source, packaging, and signing

| Key | Default | Meaning / constraints |
|---|---|---|
| `addons` | auto-discovered | Newline-separated addon paths relative to the project. At least one must contain `config.cpp` with CfgPatches/include. Each resolved path must be inside the project. |
| `addon_name` | `""` | PBO name for a single addon. Valid name pattern `[\w-]+`; cannot duplicate another addon or a reserved PBO name. |
| `prefix` | `""` | PBO prefix for a single addon. No CR/LF/NUL. Otherwise uses `$PBOPREFIX$` or the addon name. |
| `addon_options` | `""` | JSON object as a string: `{"addons/Core": {"name":"MyCore","prefix":"MyMod\\Core"}}`. Values must be strings. Invalid JSON fails validation. |
| `metadata` | auto-detected `mod.cpp` | Relative path to a `.cpp` copied into the package as `mod.cpp`. |
| `extra` | `""` | Newline-separated relative package files. Allowed extensions: `.cpp .md .txt .paa .png .jpg .jpeg .xml`. No dotfiles, links, or paths outside the project. |
| `pack` | inferred | `packonly` mode. Inferred true when the addon source has no `.p3d` or `.rtm`; an empty PBO fails. |
| `prep_exe` | `""` | Optional executable run with cwd = project root before AddonBuilder. It is arbitrary code: do not set it without explicit user intent. |
| `prep_args` | `""` | Newline-separated arguments for `prep_exe`, not a shell command line. |
| `addon_builder` | `""` | Optional AddonBuilder executable override. Default is `<tools>/Bin/AddonBuilder/AddonBuilder.exe` (the app also supports its detected location). |
| `tools` | detected or `F:/.../DayZ Tools` | DayZ Tools root. Must contain AddonBuilder and the signing/conversion tools used. |
| `sign` | `true` | Sign built PBOs. If shared client profile is enabled, signing may be mandatory. |
| `private` | `""` | Absolute/relative path to `.biprivatekey` for signing. Must pair by stem with `public`. |
| `public` | `""` | Matching `.bikey`. |
| `mod` | `@` + sanitized project name | Mod folder name used for install targets/dependencies. |

## Local targets and deployment

| Key | Default | Meaning |
|---|---|---|
| `server` | detected or `F:/.../DayZServer` | DayZ Server root. |
| `client` | detected or `F:/.../DayZ` | DayZ client root. |
| `server_exe` | `DayZServer_x64.exe` | Relative to `server`. |
| `client_exe` | `DayZ_BE.exe` | Relative to `client`. |
| `copy_server` | `true` | Quick build copies into the server mods folder. Otherwise the server target uses `server` root. |
| `copy_client` | `true` | Quick build copies into the client mods folder. |
| `shared` | `true` | Shared client/server profile: one install may serve both and client test launch uses the same mod. |
| `separate` | `true` | Keep separate server/client target paths where applicable; path overlap is rejected. |
| `client_mods_root` | `""` | Optional dedicated local test mods folder. Must not be inside Steam Workshop or contain `;`. |
| `open_dayz` | `false` | Start the client after a successful local test/deploy flow. |

Local install targets cannot overlap the project source, Steam Workshop content (`workshop`, `!workshop`), each other, or contain links. Local server `Keys` cannot overlap the project.

## Local test server

| Key | Default | Meaning |
|---|---|---|
| `config` | `serverDZ.cfg` | Relative server config path. |
| `profiles` | `profiles` | Server profile directory, relative to server root unless absolute. |
| `client_profiles` | `""` | Optional client profile directory. |
| `port` | `"2302"` | UDP game port. Must be an integer in range used by the app; local tests use it for readiness. |
| `address` | `"127.0.0.1"` | Connect address for the local client. Local test requires `127.0.0.1`, `localhost`, or `::1`. |
| `timeout` | `"300"` | Readiness timeout seconds. Accepted range 5–1800. |
| `server_args` | `-dologs\n-adminlog\n-freezecheck` | Newline-separated extra server arguments. Reserved args cannot be supplied here. |
| `client_args` | `""` | Newline-separated extra client arguments. Reserved args cannot be supplied here. |
| `base` | `""` | Newline-separated base dependency folders relative to server root, or Workshop IDs (`digits` / `workshop:digits`). Each must contain `Addons/*.pbo`. |
| `server_only` | `""` | Dependencies loaded only on the server. Same rules; cannot include the mod itself. |
| `connection_timeout` | `"120"` | Client connection wait budget (GUI/test flow), string seconds. |

The server is started hidden with `CREATE_NEW_CONSOLE` and startup info hiding the window. Readiness is described in the testing skill.

## Workshop and remote

| Key | Default | Meaning |
|---|---|---|
| `workshop` | `""` | Existing Workshop item ID or accepted Steam Community URL. Required for checks/publish after creation. |
| `steam_owner` | `""` | SteamID64, exactly 17 digits. Must match the item owner and active signed-in client. |
| `publish_workshop` | `false` | Use the confirmed Workshop build as the source for remote deployment and select publication flow. |
| `workshop_title` | `""` | Required to create an item. |
| `workshop_description` | `""` | Required to create an item. |
| `workshop_preview` | `""` | Relative/absolute PNG, JPG, or JPEG preview. |
| `workshop_visibility` | `private` | `public`, `friends`, `private`, or `unlisted`. |
| `notes` | `""` | Changelog/notes passed to Workshop publication. |
| `remote_host` | `""` | Hostname/IP. No scheme, path, or whitespace. |
| `remote_port` | `"22"` | SSH port 1–65535. |
| `remote_user` | `""` | POSIX username accepted by the app's regex. |
| `remote_root` | `""` | Absolute remote DayZ server root. |
| `remote_mod` | project `mod` | Remote mod folder name, must match `@[A-Za-z0-9_-]+`. |
| `remote_keys` | `""` | Absolute remote keys directory. |
| `remote_service` | `""` | Existing systemd service name. |
| `remote_readiness` | `""` | Shell command run remotely; exit 0 means healthy. |
| `remote_files_only` | `false` | Upload staging files only; skip install/restart/health check. Requires manual completion. |

SSH uses OpenSSH `ssh`/`sftp` with BatchMode and strict host-key checking. There is no password setting; use keys/agent.

## Shared/environment keys

`MACHINE` keys copied to `environment.json` when `environment_override` is false:

`tools`, `server`, `client`, `server_exe`, `client_exe`, `config`, `profiles`, `client_profiles`, `port`, `address`, `timeout`, `base`, `server_only`, `server_args`, `client_args`, `sign`, `private`, `public`, `client_mods_root`, `connection_timeout`.

`PROJECT_ONLY` keys are never taken from `environment.json`: `tools`, `addon_builder`, `server`, `client`, `private`, `public`, `sign`.

## Legacy `settings.json`

The defaults loader still reads `<project>\settings.json` for migration-era fields such as `SourceDir`, `ModFolder`, `AddonName`, `Prefix`, `PackOnly`, `LoadOnClient`, `SignPbo`, `PrivateKey`, `PublicKey`, `BaseMods`, `BaseServerMods`, `ServerConfig`, `Profiles`, `Port`, `ConnectAddress`, `ReadyTimeoutSeconds`, `ToolsPath`, `ServerRoot`, `ClientRoot`.

Do not edit `settings.json` as the primary configuration path. `project.json` is authoritative after a save; the finder warns when a legacy file is present.

## Safe change procedure

1. `config --json` to list keys.
2. `config --json --get KEY` to capture the old value.
3. Apply all related `--set` pairs in one invocation so validation sees a coherent project.
4. Rerun `status --json` and confirm the relevant checks.
5. Only then build/test/deploy.

Do not set `sign=false` to make a shared test pass; the app may require signing for a shared profile. Do not point `private` at a new file to avoid a mismatch; select a valid matching pair.

## Source anchors

- Defaults: `backend/pipeline.py` lines 188–228.
- Overlay and environment logic: `backend/sidecar.py` lines 75–104.
- CLI set validation: `backend/sidecar.py` lines 882–904.
- Shared keys: `backend/test_workflow.py` lines 10–12.
- Key generation: `backend/sidecar.py` lines 411–433.
