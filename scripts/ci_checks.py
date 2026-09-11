"""The blocking frontend CI checks, shared by GitHub Actions and the local green gate."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def load_checks(root: Path = ROOT) -> dict:
    groups = json.loads((root / "ci-checks.json").read_text(encoding="utf-8"))["groups"]
    if set(groups) != {"frontend", "python"} or any(not checks for checks in groups.values()):
        raise ValueError("CI requires nonempty frontend and python groups")
    ids = [check["id"] for checks in groups.values() for check in checks]
    if len(ids) != len(set(ids)):
        raise ValueError("CI check ids must be unique")
    return groups


def node_errors(root: Path) -> list[str]:
    expected = (root / ".node-version").read_text().strip()
    try:
        result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, timeout=10, check=False
        )
        actual = result.stdout.strip().removeprefix("v")
        if result.returncode != 0 or actual != expected:
            return [f"Node {expected} required on PATH; found {actual!r}"]
    except (OSError, subprocess.TimeoutExpired) as exc:
        return [f"Node {expected} unavailable: {exc}"]
    return []


def dependency_errors(root: Path) -> list[str]:
    errors = []
    for line in (root / "requirements-ci.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        name, expected = line.split("==")
        try:
            actual = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            actual = "missing"
        if actual != expected:
            errors.append(f"{name}=={expected} required; found {actual}")
    return errors


def runtime_errors(group: str, root: Path = ROOT) -> list[str]:
    errors = []
    expected_python = (root / ".python-version").read_text().strip()
    actual_python = f"{sys.version_info.major}.{sys.version_info.minor}"
    if actual_python != expected_python:
        errors.append(f"Python {expected_python} required; found {actual_python}")
    if group in ("frontend", "all"):
        errors.extend(node_errors(root))
    if group in ("python", "all"):
        errors.extend(dependency_errors(root))
    return errors


def command_for(check: dict) -> list[str]:
    command = list(check["argv"])
    if command[0] == "python":
        command[0] = sys.executable
    elif command[0] == "npm":
        # Windows npm.cmd prefers its adjacent node.exe over PATH. Invoke the
        # npm entrypoint with the selected Node so a second installation cannot
        # silently change the runtime after the prerequisite check passed.
        npm = shutil.which("npm")
        if npm is None:
            raise FileNotFoundError("npm is missing from PATH")
        resolved = Path(npm).resolve()
        cli = (
            resolved if resolved.name == "npm-cli.js"
            else resolved.parent / "node_modules/npm/bin/npm-cli.js"
        )
        if not cli.is_file():
            raise FileNotFoundError(f"npm entrypoint not found: {cli}")
        command = [shutil.which("node") or "node", str(cli), *command[1:]]
    else:
        command[0] = shutil.which(command[0]) or command[0]
    return command


def stop_owned_process(proc: subprocess.Popen) -> None:
    # Only the process group/tree created by this runner is terminated.
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False,
        )
    else:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    proc.wait(timeout=10)


def exit_is_success(check: dict, code: int) -> bool:
    # pytest's "no tests collected" is the only explicitly accepted nonzero result.
    return code == 0 or (
        code == 5 and check.get("allowNoTests") is True
        and check["argv"][:3] == ["python", "-m", "pytest"]
    )


def run_check(check: dict, root: Path = ROOT) -> int:
    options = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if os.name == "nt" else {"start_new_session": True}
    )
    try:
        command = command_for(check)
        print(f"CI-CHECK START {check['id']}: {' '.join(command)}", flush=True)
        proc = subprocess.Popen(command, cwd=root / check["cwd"], **options)
    except OSError as exc:
        print(f"CI-CHECK FAIL {check['id']}: {exc}", flush=True)
        return 127
    try:
        return proc.wait(timeout=check["timeoutSeconds"])
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        stop_owned_process(proc)
        print(f"CI-CHECK TIMEOUT/INTERRUPTED {check['id']}", flush=True)
        return 124


def run_group(checks: list[dict], root: Path = ROOT) -> int:
    results = []
    for check in checks:
        code = run_check(check, root)
        passed = exit_is_success(check, code)
        results.append((check["id"], passed, code))
    print("CI-CHECKS SUMMARY", flush=True)
    for name, passed, code in results:
        print(f"  {'PASS' if passed else 'FAIL'} {name} (exit {code})", flush=True)
    return 0 if all(passed for _, passed, _ in results) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", choices=("frontend", "python", "all"), default="all")
    parser.add_argument(
        "--list", action="store_true", help="Print the shared plan without running it"
    )
    args = parser.parse_args(argv)
    groups = load_checks()
    checks = (
        [check for group in groups.values() for check in group]
        if args.group == "all" else groups[args.group]
    )
    if args.list:
        print(json.dumps(checks, indent=2))
        return 0
    errors = runtime_errors(args.group)
    if errors:
        for error in errors:
            print(f"CI-CHECKS PREREQUISITE: {error}", flush=True)
        print(
            "Use .node-version/.python-version and pip install -r requirements-ci.txt.", flush=True
        )
        return 1
    return run_group(checks)


if __name__ == "__main__":
    raise SystemExit(main())
