---
name: dayz-mod-studio-workshop
description: "Publish or update a DayZ Mod Studio package on Steam Workshop: verify the item and owner, create the first item, set metadata/visibility, handle the Workshop agreement, and retry a failed publication safely. Use for Workshop checks, first upload, updates, and uncertain publication outcomes."
compatibility: "Windows 10/11 with the DayZ client containing steam_api64.dll, signed-in Steam account, DayZ Mod Studio 2.3.x, a locally verified package (tested.json), and internet access to Steam. Publication is an external irreversible action and requires explicit permission."
metadata:
  version: "1.0.0"
  upstream: "https://github.com/Deagles12/dayz-mod-studio"
---

# Steam Workshop publication

## Purpose

Publish the exact locally verified package to a Steam Workshop item and record the outcome. The app uses the Steam client API, not a browser upload.

## Activate when

- The user asks to check a Workshop item/owner.
- The user asks to create the first Workshop item.
- The user asks to update an existing item.
- Publication failed, is pending/uncertain, or needs a retry.
- Visibility/title/description/preview metadata is being set.

**Do not publish without explicit user permission.** Do not infer permission from "test it" or "build it".

## Dependencies

- Signed-in Steam client on the same Windows machine.
- `steam_api64.dll` in the configured DayZ client folder.
- Internet access to Steam.
- `tested.json` from a local test that reached readiness.
- Configured `workshop` item ID (or create flow), `steam_owner` SteamID64 (17 digits), and for first item: title, description, preview PNG/JPEG.
- Accepted Steam Workshop agreement for the item.
- Steam account active user must equal `steam_owner`.

## Procedure

### 1. Confirm permission and target

Ask explicitly:

- Which Workshop item (existing ID/URL or create new)?
- Is this the first publication or an update?
- Is the visibility intended (public/friends/private/unlisted)?
- Are title/description/preview/notes approved?

Never publish to a production/public item as a side effect of build/test.

### 2. Preflight item and owner

~~~powershell
& $backend --project "D:\Mods\MyMod" --json steam-owner
& $backend --project "D:\Mods\MyMod" --json workshop-check
& $backend --project "D:\Mods\MyMod" --json status
~~~

- `steam-owner` returns the active account's SteamID64. It fails if Steam is not signed in.
- `workshop-check` returns `id`, `title`, `owner`, `status`.
- `status=owner` means the item belongs to DayZ (consumer app 221100) and to the active account.
- `status=mismatch` means wrong app or owner. Do not publish.
- `status=unknown` means item not found/private/API unavailable. Verify the ID and permissions; do not guess.

Then verify `status.tested=true`, `status.localBuild.buildId` matches the build intended, and `sourcesChanged=false`. `publish` rechecks package inputs against current sources.

### 3. First item creation

Requirements:

- `tested.json` present and package still current.
- `steam_owner` exactly 17 digits.
- Title and description non-empty.
- Preview file exists, extension `.png`, `.jpg`, or `.jpeg`.
- Visibility one of `public`, `friends`, `private`, `unlisted` (default private).
- No conflicting draft or configured item.

~~~powershell
& $backend --project "D:\Mods\MyMod" --json config --set workshop_title "My Mod" --set workshop_description "What it does." --set workshop_preview "preview.png" --set workshop_visibility private --set steam_owner "76561198000000000"
& $backend --project "D:\Mods\MyMod" --json create-workshop
~~~

The app:

1. Verifies the tested package against current inputs.
2. Creates a Workshop item for app 221100.
3. Saves the item ID to config and `workshop-draft.json`.
4. If Steam requires the Workshop agreement, fails with the item URL.
5. Otherwise immediately uploads content and metadata, then records confirmation.

If the agreement is required:

- Open the item page, accept the agreement, then run `publish` (not create again). The draft item is already saved.
- If creation timed out with `status=uncertain`, check Steam items first; do not create another item blindly.

### 4. Update an existing item

~~~powershell
& $backend --project "D:\Mods\MyMod" --json publish
~~~

Requirements:

- `tested.json` present.
- `workshop` numeric ID/URL resolves to 1..2^64-1.
- `steam_owner` 17 digits and equals active Steam user at upload time.
- Package still current.
- Previous attempt for this build/item is not `pending` or `uncertain`.

The update uploads package content and `notes` as the changelog. Metadata (title/description/preview/visibility) is applied by the app only during the first-item flow; do not promise metadata changes on later `publish` calls.

### 5. Interpret status

| Status | Meaning | Next |
|---|---|---|
| `confirmed` | Steam confirmed update; recorded in `workshop-confirmed.json` and `workshop-items/<id>.json`. | Report item URL; do not claim subscribers received it instantly. |
| `failed` | Steam raised an error before confirmation. | Read error; fix; use `retry-publish` only for the same build. |
| `pending` | Request in progress/interrupted before final result. | Do not retry blindly; check Steam item first. |
| `uncertain` | Timeout/no confirmed result. | Check the item page/Steam; do not assume failure or success. |
| `created` | Item exists, upload may still be pending/agreement. | Accept agreement if needed, then publish. |

### 6. Retry a failed publication

Only when the prior attempt is explicitly `failed` for the same build:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json retry-publish
~~~

It reuses `tested.json` and does not rebuild. It refuses if the previous status is not `failed`. If `pending`/`uncertain`, inspect Steam; running retry is blocked by design.

### 7. Automatic publication warning

If `publish_workshop=true`, a successful `update`/`test` can publish automatically. Before any test, confirm it is false unless publication is authorized:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json config --set publish_workshop false
~~~

Do not re-enable it without permission.

## Examples

### Check before touching anything

~~~powershell
& $backend --project "D:\Mods\MyMod" --json steam-owner
& $backend --project "D:\Mods\MyMod" --json workshop-check
~~~

### Publish after explicit approval

~~~powershell
& $backend --project "D:\Mods\MyMod" --json update
# confirm serverReady and buildId
& $backend --project "D:\Mods\MyMod" --json publish
~~~

### Update notes

Set `notes` before publish:

~~~powershell
& $backend --project "D:\Mods\MyMod" --json config --set notes "Fixed spawn points; added rifle."
~~~

## Common errors and fixes

| Error | Meaning | Fix |
|---|---|---|
| `The Steam API is unavailable. Sign in to Steam on this PC.` | Steam not running/logged in, or DLL/path issue | Start/sign in Steam; verify client path contains `steam_api64.dll`. |
| `The active Steam account differs from the configured SteamID64.` | Wrong account | Switch account or correct `steam_owner` after confirmation. |
| `Enter a numeric Workshop ID and owner SteamID64.` | Bad ID/owner | Use a valid item ID/URL and 17-digit SteamID64. |
| `The selected item differs from the Steam draft.` | Draft ID conflict | Resolve intentionally; do not overwrite a different item. |
| `Check your Steam items and save the resulting Workshop ID.` | Draft/configured item ambiguity | Inspect Steam; set the correct ID from evidence. |
| `Accept the Steam Workshop agreement ...` | Agreement pending | Accept on item page, then publish. |
| `Steam rejected item creation/update. EResult: N` | API rejection | Look up EResult meaning; fix permissions/metadata; do not loop. |
| `Steam returned no result. Check Workshop before trying again.` | Timeout/uncertain | Check item state; do not retry blindly. |
| `No failed publication can be retried for this build.` | Retry not eligible | Use normal publish after checking state. |
| `The previous publication result is unknown.` | pending/uncertain | Inspect Steam; wait/resolve. |
| `Enter the Workshop title and description.` | First-item metadata missing | Set all required metadata. |
| `Choose a preview image file.` / bad extension | Preview missing/unsupported | Provide PNG/JPG/JPEG inside project or absolute. |

## Safety and limitations

- Publication is public/external and may be irreversible. Require explicit approval, including item and visibility.
- Never expose Steam credentials/tokens. The app uses the local Steam client; do not ask for a password.
- Do not publish unsigned/unverified packages; `publish` requires `tested.json`.
- Do not create duplicate items to work around an uncertain outcome.
- Do not claim subscribers downloaded the update; Steam propagation is outside the app.
- `workshop-check` verifies app/owner, not content correctness.
- The first-item metadata path differs from later updates; do not promise title/description changes later.
- Private keys must never be uploaded; the package only contains public keys.

## Source anchors

- `backend/workshop.py` (Steam API, item details, create/upload, agreement).
- `backend/sidecar.py` lines 264–408 (ID parsing, publish/create/retry, metadata).
- Reference: `references/workshop-workflow.md`.
