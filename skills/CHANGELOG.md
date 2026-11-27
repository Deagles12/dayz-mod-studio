# Changelog

## 1.0.0 — 2026-11-27

- Initial Agent Skills pack audited against DayZ Mod Studio 2.3.7 (commit `556523f8`).
- Added 11 progressive-disclosure skills: router, environment, build/signing, local deploy, testing, debugging, remote deploy, Workshop, textures, models, automation.
- Added exact CLI/JSONL contract, state layout, settings reference, readiness algorithm, error catalog, Workshop recovery, P3D validation, texture conversion, and 3D-Generator workflow.
- Added deterministic discovery (`find_studio.py`), CLI/JSONL runner (`studio.py`), and read-only log triage (`triage_logs.py`).
- Added safe per-agent install/update/uninstall for Codex, OpenCode, Claude Code, and Hermes on Windows and Linux, with manifest ownership and link/copy modes.
- Publication and production deployment remain approval-gated; functional gameplay verification is explicitly out of scope.
