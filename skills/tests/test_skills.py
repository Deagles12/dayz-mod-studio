#!/usr/bin/env python3
"""Offline tests for the skill pack, CLI parity, helpers, and install manifest."""
from __future__ import annotations

import ast
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
PACK = HERE.parent
REPO = PACK.parent
sys.path.insert(0, str(HERE))
import validate_skills  # noqa: E402

EXPECTED = {
    "dayz-mod-studio",
    "dayz-mod-studio-automation",
    "dayz-mod-studio-build",
    "dayz-mod-studio-debugging",
    "dayz-mod-studio-deploy",
    "dayz-mod-studio-environment",
    "dayz-mod-studio-models",
    "dayz-mod-studio-remote",
    "dayz-mod-studio-testing",
    "dayz-mod-studio-textures",
    "dayz-mod-studio-workshop",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class PackTests(unittest.TestCase):
    def test_pack_validates(self):
        errors = validate_skills.validate_pack(PACK)
        self.assertEqual([], errors)

    def test_expected_skill_set(self):
        found = {path.name for path in validate_skills.skill_dirs(PACK)}
        self.assertEqual(EXPECTED, found)

    def test_frontmatter_metadata(self):
        for directory in validate_skills.skill_dirs(PACK):
            data, _, _ = validate_skills.frontmatter(directory / "SKILL.md")
            self.assertEqual("1.0.0", data.get("metadata", {}).get("version"))
            self.assertEqual("https://github.com/Deagles12/dayz-mod-studio", data.get("metadata", {}).get("upstream"))
            self.assertNotIn("license", data)
            self.assertRegex(data["description"], r"Use (when|for|before|after|to)")

    def test_router_mentions_every_skill(self):
        router = read(PACK / "dayz-mod-studio" / "SKILL.md")
        for name in EXPECTED - {"dayz-mod-studio"}:
            self.assertIn(name, router)

    def test_every_skill_has_reference(self):
        for directory in validate_skills.skill_dirs(PACK):
            references = list((directory / "references").glob("*.md"))
            self.assertTrue(references, f"{directory.name} has no references")
            self.assertGreater(sum(path.stat().st_size for path in references), 500)

    def test_cli_parity(self):
        console = REPO / "backend" / "console.py"
        if not console.is_file():
            self.skipTest("backend/console.py is not available in this export")
        tree = ast.parse(read(console))
        actions = None
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "ACTIONS" for target in node.targets
            ):
                actions = ast.literal_eval(node.value)
        self.assertIsInstance(actions, dict)
        commands = set(actions) | {"textures"}
        contract = read(PACK / "dayz-mod-studio" / "references" / "cli-contract.md")
        router = read(PACK / "dayz-mod-studio" / "SKILL.md")
        tick = chr(96)
        for command in commands:
            self.assertIn(tick + command + tick, contract, command)
            self.assertIn(tick + command + tick, router, command)
        self.assertIn("test", contract)
        for flag in ("--project", "--recent", "--json", "--verbose", "--language"):
            self.assertIn(flag, contract)

    def test_no_unresolved_placeholders(self):
        for path in PACK.rglob("*"):
            if not path.is_file() or path.suffix not in {".md", ".py", ".ps1", ".sh", ".json"}:
                continue
            if ".tmp-" in str(path) or PACK / "tests" in path.parents:
                continue
            text = read(path)
            self.assertNotIn("@@", text, f"placeholder left in {path}")
            self.assertNotIn("TODO", text, f"TODO left in {path}")

    def test_python_helpers_compile(self):
        for path in PACK.rglob("*.py"):
            if ".tmp-" in str(path):
                continue
            with self.subTest(path=str(path)):
                compile(read(path), str(path), "exec")

    def test_python_helpers_help(self):
        for relative in (
            "dayz-mod-studio/scripts/studio.py",
            "dayz-mod-studio-environment/scripts/find_studio.py",
            "dayz-mod-studio-debugging/scripts/triage_logs.py",
        ):
            with self.subTest(script=relative):
                result = subprocess.run(
                    [sys.executable, str(PACK / relative), "--help"],
                    capture_output=True, text=True, timeout=30,
                )
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertIn("usage", result.stdout.lower())

    def test_no_duplicate_markdown_blocks(self):
        for path in sorted(PACK.rglob("*.md")):
            if ".tmp-" in str(path):
                continue
            with self.subTest(path=str(path)):
                self.assertEqual([], validate_skills.duplicate_markdown_blocks(path))

    def test_bad_name_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / "dayz-mod-studio-bad"
            (directory / "references").mkdir(parents=True)
            (directory / "SKILL.md").write_text(
                "---\nname: Bad--Name\ndescription: Use when testing.\n---\nBody\n",
                encoding="utf-8",
            )
            errors = validate_skills.validate_pack(root)
            self.assertTrue(any("lowercase kebab-case" in error for error in errors), errors)

    def test_broken_link_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / "dayz-mod-studio"
            (directory / "references").mkdir(parents=True)
            (directory / "SKILL.md").write_text(
                "---\nname: dayz-mod-studio\ndescription: Use when testing.\n---\nSee [missing](references/nope.md).\n",
                encoding="utf-8",
            )
            errors = validate_skills.validate_pack(root)
            self.assertTrue(any("broken link" in error for error in errors), errors)


class ManifestTests(unittest.TestCase):
    def run_helper(self, *arguments: str):
        return subprocess.run(
            [sys.executable, str(PACK / "install_manifest.py"), *arguments],
            capture_output=True, text=True, timeout=30,
        )

    def test_manifest_roundtrip(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest = Path(temporary) / "state" / "install.json"
            target = Path(temporary) / "skills" / "dayz-mod-studio"
            add = self.run_helper(
                "add", "--manifest", str(manifest), "--name", "dayz-mod-studio",
                "--agent", "codex", "--scope", "user", "--root", str(target.parent),
                "--path", str(target), "--source", str(PACK / "dayz-mod-studio"),
                "--mode", "copy", "--version", "1.0.0",
            )
            self.assertEqual(0, add.returncode, add.stderr)
            self.assertEqual(0, self.run_helper("get", "--manifest", str(manifest), "--path", str(target)).returncode)
            data = json.loads(read(manifest))
            self.assertEqual("dayz-mod-studio-agent-skills", data["pack"])
            self.assertEqual(1, len(data["installs"]))
            self.assertEqual("1.0.0", data["installs"][0]["version"])

            self.run_helper(
                "add", "--manifest", str(manifest), "--name", "dayz-mod-studio",
                "--agent", "codex", "--scope", "user", "--root", str(target.parent),
                "--path", str(target), "--source", str(PACK / "dayz-mod-studio"),
                "--mode", "copy", "--version", "1.0.0",
            )
            self.assertEqual(1, len(json.loads(read(manifest))["installs"]))

            listing = self.run_helper("list", "--manifest", str(manifest), "--tsv")
            self.assertEqual(0, listing.returncode, listing.stderr)
            self.assertIn("codex\tuser", listing.stdout)

            version = self.run_helper("version", "--manifest", str(manifest), "--version", "1.0.1")
            self.assertEqual(0, version.returncode, version.stderr)
            self.assertEqual("1.0.1", json.loads(read(manifest))["version"])

            remove = self.run_helper("remove", "--manifest", str(manifest), "--path", str(target))
            self.assertEqual(0, remove.returncode, remove.stderr)
            self.assertEqual([], json.loads(read(manifest))["installs"])


@unittest.skipUnless(shutil.which("bash") and sys.platform != "win32", "Bash is unavailable or blocked on this host")
class ShellSyntaxTests(unittest.TestCase):
    def test_shell_syntax(self):
        for name in ("install.sh", "uninstall.sh", "update.sh"):
            with self.subTest(script=name):
                result = subprocess.run(["bash", "-n", str(PACK / name)], capture_output=True, text=True)
                self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
