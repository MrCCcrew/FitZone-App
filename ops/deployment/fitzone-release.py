#!/usr/bin/env python3
"""FitZone release controller: read-only planning and artifact inspection."""

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent
PLAN = BASE / "release-plan.json"


def load_plan():
    plan = json.loads(PLAN.read_text(encoding="utf-8"))

    if (
        plan.get("schemaVersion") != 1
        or plan.get("project") != "fitzone"
        or plan.get("mode") != "planning-only"
        or plan.get("approvedForProduction") is not False
    ):
        raise ValueError("INVALID_OR_UNAPPROVED_RELEASE_PLAN")

    for section in ("gates", "actions"):
        values = plan.get(section)
        if not isinstance(values, dict) or not values:
            raise ValueError(f"INVALID_{section.upper()}")
        if any(value is not False for value in values.values()):
            raise ValueError(f"{section.upper()}_NOT_CLOSED")

    return plan


def inspect_artifact(directory):
    root = Path(directory).absolute()

    if not root.is_dir() or root.is_symlink():
        raise ValueError("INVALID_RELEASE_DIRECTORY")

    required = (
        ".next/BUILD_ID",
        "package.json",
        "node_modules/next/package.json",
        "prisma/schema.prisma",
    )

    for relative in required:
        target = root / relative
        if not target.is_file():
            raise ValueError(f"MISSING_RELEASE_FILE: {relative}")

    dependencies = root / "node_modules"
    if dependencies.is_symlink():
        raise ValueError("EXTERNAL_DEPENDENCY_LINK_BLOCKED")

    build_id = (root / ".next/BUILD_ID").read_text(
        encoding="utf-8"
    ).strip()

    if not build_id or len(build_id) > 128:
        raise ValueError("INVALID_BUILD_ID")

    print("ARTIFACT_STRUCTURE=PASS")
    print(f"BUILD_ID={build_id}")
    print("RUNTIME_READINESS=NOT_VERIFIED")
    print("PAYMENT_SAFETY=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")


def verify_manifest(directory, manifest_path):
    """Verify the exact v2 inventory pinned to the release plan."""
    import importlib.util

    plan = load_plan()
    expected_commit = plan["source"]["candidateCommit"]
    expected_build_id = plan["source"]["buildId"]

    if (
        not isinstance(expected_commit, str)
        or not expected_commit
        or not isinstance(expected_build_id, str)
        or not expected_build_id
    ):
        raise ValueError("UNPINNED_RELEASE_SOURCE")

    tool_path = (
        Path(__file__).resolve().parent
        / "fitzone-artifact-manifest.py"
    )

    spec = importlib.util.spec_from_file_location(
        "fitzone_full_manifest_v2", tool_path
    )

    if spec is None or spec.loader is None:
        raise ValueError("MANIFEST_V2_VERIFIER_UNAVAILABLE")

    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)

    tool.verify_manifest(
        directory,
        manifest_path,
        expected_commit,
        expected_build_id,
    )

    print("RELEASE_MANAGER_MANIFEST_VERSION=2")
    print("RELEASE_PLAN_SOURCE_PIN=PASS")
    print("RELEASE_MANAGER_FULL_INVENTORY=PASS")
    print("PROVENANCE_TRUST=NOT_VERIFIED")
    print("RUNTIME_READINESS=NOT_VERIFIED")
    print("PAYMENT_SAFETY=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")


def prepare_artifact(directory):
    """Read-only preflight; never stages or launches a release."""
    root = Path(directory).absolute()

    if root.is_symlink() or not root.is_dir():
        raise ValueError("INVALID_RELEASE_DIRECTORY")

    for parent in root.parents:
        if parent.is_symlink():
            raise ValueError("SYMLINKED_RELEASE_PARENT")

    forbidden = (
        ".env",
        ".env.local",
        ".env.production",
        ".env.production.local",
        ".paymob-green-runtime.env",
    )
    if any((root / name).exists() or (root / name).is_symlink() for name in forbidden):
        raise ValueError("RELEASE_CONTAINS_RUNTIME_SECRETS")

    for current, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            if name in forbidden:
                raise ValueError("RELEASE_CONTAINS_RUNTIME_SECRETS")

            candidate = Path(current) / name
            if not candidate.is_symlink():
                continue

            target = os.readlink(candidate)
            if os.path.isabs(target):
                raise ValueError("RELEASE_ABSOLUTE_SYMLINK_BLOCKED")

            lexical = Path(
                os.path.normpath(os.path.join(current, target))
            )
            if not lexical.is_relative_to(root):
                raise ValueError("RELEASE_SYMLINK_ESCAPE_BLOCKED")

            try:
                resolved = candidate.resolve(strict=True)
            except (OSError, RuntimeError) as exc:
                raise ValueError(
                    "RELEASE_BROKEN_OR_CYCLIC_SYMLINK"
                ) from exc

            if not resolved.is_relative_to(root):
                raise ValueError("RELEASE_SYMLINK_ESCAPE_BLOCKED")

    usage = shutil.disk_usage(root)
    if usage.free < 2 * 1024 * 1024 * 1024:
        raise ValueError("LOW_AVAILABLE_DISK_SPACE")

    print("PREPARE_ARTIFACT_STRUCTURE=PASS")
    print("PREPARE_EXTERNAL_LINKS=NONE")
    print("PREPARE_RUNTIME_SECRET_FILES=NONE")
    print("PREPARE_DISK_RESERVE=PASS")
    print("PREPARE_OPERATION=READ_ONLY")
    print("BUILD_CONFIGURATION=NOT_PRODUCTION_APPROVED")
    print("FINANCIAL_REGRESSION=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")


def stage_local_artifact(release, manifest, destination, commit, build_id, plan):
    """Isolated developer staging only; never operates on the VPS."""
    if (
        plan["mode"] != "planning-only"
        or plan["approvedForProduction"] is not False
    ):
        raise ValueError("LOCAL_STAGE_REQUIRES_UNAPPROVED_PLAN")

    if os.name != "posix" or not Path("/proc/sys/kernel/osrelease").is_file():
        raise ValueError("LOCAL_STAGE_REQUIRES_WSL")

    kernel = Path("/proc/sys/kernel/osrelease").read_text(
        encoding="utf-8"
    ).lower()

    if "microsoft" not in kernel and "wsl" not in kernel:
        raise ValueError("LOCAL_STAGE_REQUIRES_WSL")

    if hasattr(os, "geteuid") and os.geteuid() == 0:
        raise ValueError("ROOT_EXECUTION_BLOCKED")

    if not all((release, manifest, destination, commit, build_id)):
        raise ValueError("LOCAL_STAGE_ARGUMENTS_REQUIRED")

    home = Path.home().absolute()

    for label, raw in (
        ("SOURCE", release),
        ("MANIFEST", manifest),
        ("DESTINATION", destination),
    ):
        path = Path(os.path.abspath(raw))
        if not path.is_relative_to(home) or path == home:
            raise ValueError(f"{label}_OUTSIDE_ISOLATED_HOME")

        if not path.name.startswith("fitzone-unified-"):
            raise ValueError(f"{label}_NOT_AN_ISOLATED_ARTIFACT")

    if commit != plan["source"]["candidateCommit"]:
        raise ValueError("CANDIDATE_COMMIT_MISMATCH")

    tool = BASE / "fitzone-green-stage.py"
    spec = importlib.util.spec_from_file_location(
        "fitzone_green_stage_integration", tool
    )

    if spec is None or spec.loader is None:
        raise ValueError("GREEN_STAGE_TOOL_UNAVAILABLE")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    print("RELEASE_MANAGER_LOCAL_STAGE=STARTED", flush=True)

    module.stage_artifact(
        release, manifest, destination, commit, build_id
    )

    print("RELEASE_MANAGER_LOCAL_STAGE=PASS", flush=True)
    print("PRODUCTION_APPROVAL=FALSE", flush=True)
    print("DEPLOYMENT=DISABLED", flush=True)


def preview_cutover(config_path, direction, plan):
    """Read-only cutover preview for a local WSL fixture."""
    if plan["mode"] != "planning-only":
        raise ValueError("PREVIEW_REQUIRES_PLANNING_MODE")
    if plan["approvedForProduction"] is not False:
        raise ValueError("PRODUCTION_APPROVAL_STATE_INVALID")

    kernel_path = Path("/proc/sys/kernel/osrelease")
    if os.name != "posix" or not kernel_path.is_file():
        raise ValueError("WSL_ONLY")

    kernel = kernel_path.read_text(encoding="utf-8").lower()
    if "microsoft" not in kernel and "wsl" not in kernel:
        raise ValueError("WSL_ONLY")

    if os.geteuid() == 0:
        raise ValueError("ROOT_EXECUTION_BLOCKED")

    if not config_path:
        raise ValueError("NGINX_CONFIG_REQUIRED")

    if direction == "blue-to-green":
        source_port, target_port = 3120, 3121
    elif direction == "green-to-blue":
        source_port, target_port = 3121, 3120
    else:
        raise ValueError("INVALID_CUTOVER_DIRECTION")

    home = Path.home().absolute()
    config = Path(os.path.abspath(config_path))

    if not config.is_relative_to(home) or config == home:
        raise ValueError("CONFIG_OUTSIDE_ISOLATED_HOME")

    if config.name != "fitzone-unified-nginx-preview.conf":
        raise ValueError("INVALID_PREVIEW_CONFIG_NAME")

    if any(path.is_symlink() for path in (config, *config.parents)):
        raise ValueError("SYMLINKED_PREVIEW_PATH_BLOCKED")

    if not config.is_file() or config.stat().st_size > 1048576:
        raise ValueError("INVALID_PREVIEW_CONFIG")

    cutover_file = BASE / "fitzone-nginx-cutover.py"
    spec = importlib.util.spec_from_file_location(
        "fitzone_cutover_preview", cutover_file
    )

    if spec is None or spec.loader is None:
        raise ValueError("CUTOVER_RENDERER_MISSING")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    before = config.read_text(encoding="utf-8")
    after = module.render_cutover(
        before, source_port, target_port
    )

    print("CUTOVER_PREVIEW=PASS")
    print(f"PREVIEW_DIRECTION={direction}")
    print(f"FROM_PORT={source_port}")
    print(f"TO_PORT={target_port}")
    print("ORIGINAL_SHA256=" + hashlib.sha256(
        before.encode("utf-8")
    ).hexdigest())
    print("CANDIDATE_SHA256=" + hashlib.sha256(
        after.encode("utf-8")
    ).hexdigest())
    print("CANDIDATE_CONFIG_WRITTEN=NO")
    print("NGINX_SYNTAX_TEST=NOT_PERFORMED")
    print("PRODUCTION_CUTOVER=DISABLED")
    print("DEPLOYMENT=DISABLED")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=("plan", "inspect", "verify", "prepare", "stage-local", "cutover-preview", "deploy", "rollback"),
    )
    parser.add_argument("--release")
    parser.add_argument("--manifest")
    parser.add_argument("--destination")
    parser.add_argument("--commit")
    parser.add_argument("--build-id")
    parser.add_argument("--nginx-config")
    parser.add_argument("--direction")
    args = parser.parse_args()

    if args.command in ("deploy", "rollback"):
        raise ValueError("PRODUCTION_OPERATIONS_NOT_IMPLEMENTED")

    plan = load_plan()

    if args.command == "stage-local":
        stage_local_artifact(
            args.release,
            args.manifest,
            args.destination,
            args.commit,
            args.build_id,
            plan,
        )
        return

    if args.command == "cutover-preview":
        preview_cutover(args.nginx_config, args.direction, plan)
        return

    if args.command == "plan":
        print("RELEASE_PLAN=VALID")
        print(f"BASELINE={plan['source']['baselineCommit']}")
        print(f"CANDIDATE={plan['source']['candidateCommit']}")
        print("ALL_RELEASE_GATES=CLOSED")
        print("DEPLOYMENT=DISABLED")
    elif args.command == "inspect":
        if not args.release:
            raise ValueError("RELEASE_PATH_REQUIRED")
        inspect_artifact(args.release)
    elif args.command in ("verify", "prepare"):
        if not args.release or not args.manifest:
            raise ValueError("RELEASE_AND_MANIFEST_REQUIRED")
        inspect_artifact(args.release)
        verify_manifest(args.release, args.manifest)
        if args.command == "prepare":
            prepare_artifact(args.release)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as exc:
        print(f"RELEASE_BLOCKED={exc}")
        raise SystemExit(1)