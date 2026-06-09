#!/usr/bin/env python3
"""Check a codex-workflows skill package and optional local installation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REQUIRED = [
    "SKILL.md",
    "references/routing.md",
    "templates/run-plan.md",
    "evals/trigger_cases.json",
    "scripts/check_skill_install.py",
]


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


def check_skill_dir(skill_dir: Path) -> int:
    for rel in REQUIRED:
        path = skill_dir / rel
        if not path.is_file():
            return fail(f"missing {rel}")

    skill_text = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
    required_text = [
        "sunny_skill_type: library",
        "Output Contract",
        "bounded dynamic workflow",
        "background+heartbeat",
        "cwf-run-plan.mjs",
        "cwf-worker-sdk.mjs",
        "cwf-worker-desktop-thread.mjs",
    ]
    for needle in required_text:
        if needle not in skill_text:
            return fail(f"SKILL.md missing {needle}")

    cases = json.loads((skill_dir / "evals/trigger_cases.json").read_text(encoding="utf-8"))
    for key in ("should_trigger", "should_not_trigger", "near_neighbors"):
        if not isinstance(cases.get(key), list) or not cases[key]:
            return fail(f"trigger_cases.json missing non-empty {key}")

    return 0


def check_install(skill_dir: Path, installed_root: Path) -> int:
    installed = installed_root / "codex-workflows"
    if not installed.exists():
        return fail(f"not installed: {installed}")
    try:
        if installed.resolve() != skill_dir.resolve():
            return fail(f"installed path points to {installed.resolve()}, expected {skill_dir.resolve()}")
    except OSError as exc:
        return fail(f"could not resolve installed path: {exc}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", default=Path(__file__).resolve().parents[1])
    parser.add_argument("--installed-root", default=Path.home() / ".codex" / "skills")
    parser.add_argument("--check-install", action="store_true")
    args = parser.parse_args()

    skill_dir = Path(args.skill_dir).expanduser().resolve()
    installed_root = Path(args.installed_root).expanduser().resolve()

    rc = check_skill_dir(skill_dir)
    if rc:
        return rc
    if args.check_install:
        rc = check_install(skill_dir, installed_root)
        if rc:
            return rc

    print(f"OK: codex-workflows skill package valid at {skill_dir}")
    if args.check_install:
        print(f"OK: installed at {installed_root / 'codex-workflows'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
