# Workshop internals and recovery

## Steam initialization

The app sets `SteamAppId=221100` and `SteamGameId=221100`, adds the client directory to the DLL search path, loads `steam_api64.dll`, and calls `SteamAPI_Init`. Failure means Steam is unavailable/not signed in or the DLL/path is wrong.

Active user comes from `ISteamUser::GetSteamID`. The app checks it against configured `steam_owner` for create/update. The ID must be 17 digits in settings (the API itself returns a 64-bit ID).

## Item parsing

`workshop_item` accepts:

- digits only, 1..2^64-1;
- `https://steamcommunity.com/sharedfiles/filedetails?id=N`;
- `https://steamcommunity.com/workshop/filedetails?id=N`.

It strips the URL only when host/path match. Other URLs are invalid. `workshop-check` fetches item details from Steam's public API and returns:

- `owner` = active Steam user (not necessarily item creator);
- `status=owner` only if `consumer_app_id == 221100` and creator equals active user;
- `status=mismatch` otherwise;
- `status=unknown` if the item isn't found/visible.

## Publication records

`workshop-attempt.json` — latest attempt (global).
`workshop-confirmed.json` — last confirmed item.
`workshop-items/<item>.json` — confirmed per item.
`workshop/<build-id>/item-<item>.json` — last attempt for that build/item.
`workshop/<build-id>/<timestamp>.json` — history attempts.
`workshop-draft.json` — first-item creation state.

Attempt statuses: `pending`, `failed`, `uncertain`, `confirmed`.

- Before upload: `pending`.
- Timeout: `uncertain`; re-raise.
- Any other exception: `failed`; re-raise.
- Successful Steam confirmation: `confirmed`.

`publish` refuses `pending`/`uncertain` for the same build/item. This is intentional: the prior result is unknown, so a retry could double-submit.

## First-item flow

`create-workshop` requires `tested.json`, validates current package/inputs, then:

1. Validate owner and first-item metadata (title, description, preview extension, visibility mapping).
2. If `workshop-draft.json` is `pending`/`uncertain` and config has an item, treat it as created/recovered.
3. If draft has an item: if configured item differs, fail; else save config and publish.
4. If draft exists without item or config has an item: fail and ask user to resolve.
5. Save draft `pending`.
6. Call Steam CreateItem for app 221100.
7. On timeout: save `uncertain`, re-raise.
8. On other error: delete draft, re-raise.
9. On success: save `created`, save item to config, then if agreement needed raise; else publish.

CreateItem result includes `agreement`. The agreement URL is `https://steamcommunity.com/sharedfiles/filedetails/?id=<item>`.

## Update flow

`publish`:

1. Require tested manifest and current package.
2. Resolve item, validate 17-digit owner.
3. Refuse pending/uncertain.
4. Persist pending.
5. Start item update for app 221100; set content folder.
6. Only when draft item matches current item (first flow): set title, description, preview, visibility.
7. Submit with `notes`.
8. Poll update progress until Steam callback; log stage/bytes.
9. If agreement flag: raise agreement error.
10. EResult must be 1 (OK); else fail.
11. Persist confirmed and write confirmed records; delete draft if metadata was applied.

Later updates do not send metadata. If the user expects title/description/visibility changes after first publication, this app has no CLI path for that; use Steam's site and say so.

## Retry

`retry-publish` loads `tested.json` and requires the item/build attempt's last status to be exactly `failed`. It does not rebuild. Pending/uncertain is blocked. Use after fixing the cause (Steam login, permissions, network, item state).

## Failure handling

| Situation | State | Safe action |
|---|---|---|
| Steam not signed in | nothing uploaded | sign in, retry |
| owner mismatch | nothing uploaded | correct account/settings |
| agreement required | item created, no content confirmed | accept agreement, publish |
| create timeout | draft uncertain; item may exist | inspect Steam items, recover ID, do not create duplicate |
| update timeout | attempt uncertain; content may be live | inspect item/Steam; do not retry blindly |
| EResult non-1 | update rejected | resolve cause; retry-publish only if status failed |
| pending from crash | unknown | inspect; do not auto-retry |

## Safety

- Treat publish/create as external side effects requiring explicit consent.
- Never ask for or print Steam password/token/2FA.
- Do not create test items on a real account without permission.
- Do not upload private keys; package build excludes them.
- Do not claim Workshop propagation or subscriber updates.

## Source anchors

- `backend/workshop.py` 13–187.
- `backend/sidecar.py` 264–408.
