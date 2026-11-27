# Skill pack tests

These tests are offline. They validate the pack itself and the installers; they do not build a DayZ mod, start DayZ, contact Steam, use Blender, or connect to a remote server.

## Commands

Run from the pack directory (the directory containing `install.ps1`).

```powershell
# 1. Structure, frontmatter, links, duplicates, CLI parity, helper syntax
python tests/validate_skills.py

# 2. Unit tests (includes validator fixtures and the manifest helper)
python -m unittest discover -s tests -v

# 3. Windows installer integration tests (copy/link/update/uninstall/refusal/dry-run)
pwsh -NoProfile -File tests/test_installers.ps1
```

On Linux, the Bash scripts can be checked with `bash -n install.sh uninstall.sh update.sh` when Bash is available.

## What is covered

| Area | Test |
|---|---|
| Agent Skills frontmatter | YAML parses; `name` is lowercase kebab-case, <=64 characters, has no `--`, and matches its directory; `description` <=1024; `compatibility` <=500; `metadata` is string-to-string |
| Pack structure | Exactly 11 expected skills; every skill has `references/`; the router names every skill |
| Links | Every relative Markdown link in every pack document resolves; code spans and fenced blocks are ignored |
| Duplication | No duplicate level-2 headings or repeated multi-line code blocks inside one Markdown file |
| CLI parity | Parses the `ACTIONS` map in the real `backend/console.py`; every action plus `textures` appears in the router and CLI contract; `test` alias and global flags are documented |
| Helper syntax | Every Python helper compiles; `studio.py`, `find_studio.py`, and `triage_logs.py` answer `--help` |
| Manifest helper | Add, get, list, version, duplicate suppression, and remove round trip |
| Negative fixtures | A bad skill name and a broken relative link are rejected |
| Windows installers | Copy and junction installs, `update.ps1`, uninstall, third-party preservation, unowned-target refusal, and dry-run writes nothing |
| Bash scripts | `bash -n` when Bash is usable |

## Recorded results

Audit host: Windows, Python 3.10.0, PyYAML 6.0.3, PowerShell 7.6.10.

| Command | Result |
|---|---|
| `python tests/validate_skills.py` | `OK: 11 skills validated` |
| `python -m unittest discover -s tests -v` | `Ran 14 tests ... OK (skipped=1)` |
| `pwsh -NoProfile -File tests/test_installers.ps1` | `Installer tests: PASS (copy, link, update, uninstall, refusal, dry-run)` |

The one skipped unit test is `ShellSyntaxTests`. Git Bash on this host fails with `couldn't create signal pipe, Win32 error 5` and WSL returns `Access is denied`, so `bash -n` could not run. The three Bash scripts were reviewed statically; this is recorded as not executed, not as a pass.

## Not run (no suitable environment)

| Area | Why |
|---|---|
| Real `AddonBuilder`, `DSSignFile`, `DSCheckSignatures` | DayZ Tools is not installed on the audit host |
| Local server readiness, CE/Hive, UDP, client launch | DayZ Server/client is not installed |
| Workshop checks and publication | Steam and a signed-in DayZ client are unavailable; publishing was never performed |
| P3D preview, GLB export, P3D validation | Blender, ImageToPAA, and the GUI are unavailable |
| Remote SSH/SFTP/systemd deployment | No Linux DayZ host, SSH key, or systemd service |
| Actual Codex/OpenCode/Claude Code/Hermes discovery | The hosts are not installed; target roots were tested with temporary project directories only |
| macOS Bash installer | Not claimed; the scripts use Linux/GNU utilities |

## Safety of the tests

- Installer tests use a fresh temporary directory under `tests/` and a private `LOCALAPPDATA`; they do not touch real agent skill directories.
- The tests never delete a non-owned target; the unowned-target case must exit 1 and leave the target unchanged.
- The dry-run case asserts that neither a skill target nor `install.json` is created.
- Test fixtures are temporary and removed in a `finally` block unless `-Keep` is passed to the installer test.
