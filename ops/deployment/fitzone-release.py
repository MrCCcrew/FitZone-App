#!/usr/bin/env python3
"""FitZone release controller: read-only planning and artifact inspection."""

import argparse
import json
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
    import hashlib

    root = Path(directory).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("INVALID_RELEASE_DIRECTORY")

    manifest_file = Path(manifest_path).resolve(strict=True)
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    plan = load_plan()

    if manifest.get("schemaVersion") != 1:
        raise ValueError("INVALID_MANIFEST_VERSION")

    if manifest.get("commit") != plan["source"]["candidateCommit"]:
        raise ValueError("COMMIT_MISMATCH")

    actual_build_id = (root / ".next/BUILD_ID").read_text(
        encoding="utf-8"
    ).strip()

    if manifest.get("buildId") != actual_build_id:
        raise ValueError("BUILD_ID_MISMATCH")

    files = manifest.get("files")
    required = {
        ".next/BUILD_ID",
        "package.json",
        "package-lock.json",
        "prisma/schema.prisma",
    }

    if not isinstance(files, dict) or not required.issubset(files):
        raise ValueError("INCOMPLETE_MANIFEST")

    if len(files) > 10000:
        raise ValueError("MANIFEST_TOO_LARGE")

    for relative, expected_hash in files.items():
        if not isinstance(relative, str):
            raise ValueError("INVALID_FILE_PATH")

        path = Path(relative)

        if (
            path.is_absolute()
            or not path.parts
            or any(part in (".", "..") for part in path.parts)
            or "\\" in relative
        ):
            raise ValueError("UNSAFE_FILE_PATH")

        candidate = root / path

        if not candidate.resolve().is_relative_to(root):
            raise ValueError("FILE_OUTSIDE_RELEASE")

        if not candidate.is_file() or candidate.is_symlink():
            raise ValueError("INVALID_MANIFEST_FILE")

        if (
            not isinstance(expected_hash, str)
            or len(expected_hash) != 64
            or any(c not in "0123456789abcdef" for c in expected_hash)
        ):
            raise ValueError("INVALID_SHA256")

        digest = hashlib.sha256(candidate.read_bytes()).hexdigest()

        if digest != expected_hash:
            raise ValueError(f"FILE_HASH_MISMATCH: {relative}")

    print("MANIFEST_INTEGRITY=PASS")
    print("COMMIT_REFERENCE=PASS")
    print("BUILD_ID_MATCH=PASS")
    print("PROVENANCE_TRUST=NOT_VERIFIED")
    print("RUNTIME_READINESS=NOT_VERIFIED")
    print("PAYMENT_SAFETY=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=("plan", "inspect", "verify", "deploy", "rollback"),
    )
    parser.add_argument("--release")
    parser.add_argument("--manifest")
    args = parser.parse_args()

    if args.command in ("deploy", "rollback"):
        raise ValueError("PRODUCTION_OPERATIONS_NOT_IMPLEMENTED")

    plan = load_plan()

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
    elif args.command == "verify":
        if not args.release or not args.manifest:
            raise ValueError("RELEASE_AND_MANIFEST_REQUIRED")
        inspect_artifact(args.release)
        verify_manifest(args.release, args.manifest)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as exc:
        print(f"RELEASE_BLOCKED={exc}")
        raise SystemExit(1)