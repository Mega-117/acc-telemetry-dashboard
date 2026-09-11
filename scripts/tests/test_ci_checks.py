"""Regression tests for the shared CI runner; no cloud or user data."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "ci_checks.py"
SPEC = importlib.util.spec_from_file_location("ci_checks", MODULE_PATH)
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class SharedChecksTests(unittest.TestCase):
    def check(self, code, **extra):
        return {
            "id": "fixture", "cwd": ".", "argv": ["python", "-c", code],
            "timeoutSeconds": 5, **extra,
        }

    def test_runs_real_command_from_declared_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "child").mkdir()
            check = self.check(
                "from pathlib import Path; assert Path.cwd().name == 'child'", cwd="child"
            )
            self.assertEqual(runner.run_check(check, root), 0)

    def test_nonzero_exit_is_preserved_and_group_runs_remaining_checks(self):
        check = self.check("raise SystemExit(7)")
        self.assertEqual(runner.run_check(check), 7)
        with patch.object(runner, "run_check", side_effect=[7, 0]) as run:
            self.assertEqual(runner.run_group([check, check]), 1)
            self.assertEqual(run.call_count, 2)

    def test_only_explicit_pytest_no_collection_is_accepted(self):
        pytest = {"argv": ["python", "-m", "pytest"], "allowNoTests": True}
        self.assertTrue(runner.exit_is_success(pytest, 5))
        self.assertFalse(runner.exit_is_success(pytest, 1))
        self.assertFalse(runner.exit_is_success({"argv": pytest["argv"]}, 5))
        self.assertFalse(runner.exit_is_success(self.check("", allowNoTests=True), 5))

    def test_missing_executable_fails_closed(self):
        check = self.check("")
        check["argv"] = ["pip397-command-that-does-not-exist"]
        self.assertEqual(runner.run_check(check), 127)

    def test_timeout_closes_its_own_real_process(self):
        check = self.check("import time; time.sleep(30)", timeoutSeconds=0.2)
        self.assertEqual(runner.run_check(check), 124)

    def test_python_uses_current_interpreter_not_ambient_alias(self):
        self.assertEqual(runner.command_for(self.check(""))[0], sys.executable)

    def test_npm_uses_selected_node_not_the_node_next_to_npm_cmd(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cli = root / "node_modules/npm/bin/npm-cli.js"
            cli.parent.mkdir(parents=True)
            cli.write_text("// fixture")
            selected = {"npm": str(root / "npm.cmd"), "node": "selected-node"}
            with patch.object(runner.shutil, "which", side_effect=selected.get):
                self.assertEqual(
                    runner.command_for({"argv": ["npm", "run", "test"]}),
                    ["selected-node", str(cli), "run", "test"],
                )

    def test_empty_manifest_cannot_report_a_green_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "ci-checks.json").write_text(json.dumps({"groups": {
                "frontend": [], "python": [],
            }}))
            with self.assertRaisesRegex(ValueError, "nonempty"):
                runner.load_checks(root)

    def test_valid_runtime_and_dependencies_pass(self):
        version = (runner.ROOT / ".node-version").read_text().strip()
        result = subprocess.CompletedProcess(["node"], 0, stdout=f"v{version}\n")
        lines = (runner.ROOT / "requirements-ci.txt").read_text().splitlines()
        dependencies = dict(
            line.split("==") for line in lines
            if line and not line.startswith("#")
        )
        with patch.object(runner.subprocess, "run", return_value=result), patch.object(
            runner.importlib.metadata, "version", side_effect=dependencies.__getitem__,
        ):
            self.assertEqual(runner.runtime_errors("all"), [])

    def test_wrong_node_fails_prerequisites(self):
        result = subprocess.CompletedProcess(["node"], 0, stdout="v25.0.0\n")
        with patch.object(runner.subprocess, "run", return_value=result):
            errors = runner.runtime_errors("frontend")
        self.assertTrue(any("Node 24.20.0 required" in error for error in errors))

    def test_missing_pinned_python_dependency_fails_prerequisites(self):
        with patch.object(
            runner.importlib.metadata, "version",
            side_effect=runner.importlib.metadata.PackageNotFoundError,
        ):
            errors = runner.runtime_errors("python")
        self.assertTrue(any("flake8==7.3.0 required" in error for error in errors))

    def test_list_does_not_execute_commands(self):
        with patch.object(runner, "run_group") as run:
            self.assertEqual(runner.main(["--group", "python", "--list"]), 0)
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
