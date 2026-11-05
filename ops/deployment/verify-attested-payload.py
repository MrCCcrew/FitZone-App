#!/usr/bin/env python3
"""Verify an attested FitZone archive against its full Manifest v2.

This is a payload integrity check, NOT a replacement for GitHub
cryptographic attestation verification or deployment approval.
"""
import argparse
import importlib.util
import os
import re
import stat
import sys
import tarfile
import tempfile
from pathlib import Path

EXPECTED_COMMIT = "0ca9650c0a9b80af1d8ae1a8208f273da06a1785"
MAX_MEMBERS = 1000000
MAX_UNPACKED_BYTES = 8 * 1024**3
MAX_MANIFEST_BYTES = 64 * 1024**2

ALLOWED_ROOTS = frozenset({
    ".next", "node_modules", "public", "prisma", "src",
    "scripts", "ops", "package.json", "package-lock.json",
    "next.config.ts", "prisma.config.ts", "tsconfig.json",
    "postcss.config.mjs", "tailwind.config.ts",
    "middleware.ts", "ecosystem.config.js",
    "release-metadata.txt",
})

def reject(reason):
    raise ValueError(reason)

def check_members(members):
    seen = set()
    unpacked_bytes = 0

    for member in members:
        raw = member.name
        name = raw.removeprefix("./").rstrip("/")
        parts = name.split("/")

        if (
            not name
            or raw.startswith("/")
            or "\\" in raw
            or any(part in ("", ".", "..") for part in parts)
            or parts[0] not in ALLOWED_ROOTS
            or name in seen
        ):
            reject("UNSAFE_OR_DUPLICATE_ARCHIVE_ENTRY")

        if not (member.isfile() or member.isdir() or member.issym()):
            reject("UNSAFE_ARCHIVE_ENTRY_TYPE")

        if member.isfile():
            unpacked_bytes += member.size
            if unpacked_bytes > MAX_UNPACKED_BYTES:
                reject("ARCHIVE_UNPACKED_SIZE_LIMIT")

        seen.add(name)

def read_plain_file(root, relative):
    path = root / relative
    if path.is_symlink() or not path.is_file():
        reject("ARCHIVED_REQUIRED_FILE_INVALID")
    return path.read_text(encoding="utf-8")

def verify(archive, manifest, tool_path):
    for path in (archive, manifest, tool_path):
        if path.is_symlink() or not path.is_file():
            reject("REQUIRED_INPUT_MISSING_OR_SYMLINK")

    if manifest.stat().st_size > MAX_MANIFEST_BYTES:
        reject("MANIFEST_TOO_LARGE")

    spec = importlib.util.spec_from_file_location(
        "fitzone_trusted_manifest_v2", tool_path
    )
    if spec is None or spec.loader is None:
        reject("MANIFEST_TOOL_LOAD_FAILED")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with tempfile.TemporaryDirectory(
        prefix="fitzone-payload-verification-"
    ) as temporary:
        extracted = Path(temporary) / "release"
        extracted.mkdir(mode=0o700)

        with tarfile.open(archive, "r:gz") as stream:
            members = stream.getmembers()
            if len(members) > MAX_MEMBERS:
                reject("ARCHIVE_ENTRY_LIMIT_EXCEEDED")

            check_members(members)

            # Refuse runtimes without Python's safe extraction filter.
            stream.extractall(extracted, filter="data")

        build_id = read_plain_file(extracted, ".next/BUILD_ID").strip()
        if not build_id or len(build_id) > 128:
            reject("INVALID_ARCHIVED_BUILD_ID")

        metadata = read_plain_file(
            extracted, "release-metadata.txt"
        ).splitlines()

        if (
            "SOURCE_COMMIT=" + EXPECTED_COMMIT not in metadata
            or "BUILD_ID=" + build_id not in metadata
        ):
            reject("ARCHIVED_SOURCE_METADATA_MISMATCH")

        result = module.verify_manifest(
            extracted, manifest, EXPECTED_COMMIT, build_id
        )
        if result is False:
            reject("MANIFEST_V2_VERIFICATION_FAILED")

    print("ATTESTED_PAYLOAD_MANIFEST_V2=PASS")
    print("APPLICATION_SOURCE_COMMIT=" + EXPECTED_COMMIT)
    print("ARCHIVED_BUILD_ID=" + build_id)
    print("PAYLOAD_INTEGRITY=PASS")
    print("CRYPTOGRAPHIC_ATTESTATION=SEPARATE_REQUIRED_GATE")
    print("DEPLOYMENT=NONE")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--manifest-tool", required=True, type=Path)
    args = parser.parse_args()

    try:
        verify(args.archive, args.manifest, args.manifest_tool)
    except Exception as exc:
        print("ATTESTED_PAYLOAD_VERIFICATION=BLOCKED")
        print("REASON=" + str(exc), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
