#!/usr/bin/env python3
"""FitZone immutable artifact manifest v2 controller."""

import argparse
import hashlib
import json
import os
import re
import stat
import tempfile
from pathlib import Path


SCHEMA_VERSION = 2

FORBIDDEN_NAMES = frozenset((
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".paymob-green-runtime.env",
))


def inspect_artifact(directory):
    """Inspect artifact metadata without hashing or changing files."""
    if not directory:
        raise ValueError("RELEASE_PATH_REQUIRED")

    root = Path(directory).absolute()

    if root.is_symlink() or not root.is_dir():
        raise ValueError("INVALID_RELEASE_DIRECTORY")

    if any(parent.is_symlink() for parent in root.parents):
        raise ValueError("SYMLINKED_RELEASE_PARENT")

    counts = {
        "files": 0,
        "directories": 0,
        "symlinks": 0,
    }
    total_bytes = 0

    def walk_error(error):
        raise error

    for current, dirs, files in os.walk(
        root, topdown=True, followlinks=False,
        onerror=walk_error
    ):
        for name in dirs + files:
            if name in FORBIDDEN_NAMES:
                raise ValueError("RELEASE_CONTAINS_RUNTIME_SECRETS")

            candidate = Path(current) / name
            info = candidate.lstat()
            mode = info.st_mode

            if stat.S_ISLNK(mode):
                target = os.readlink(candidate)

                if os.path.isabs(target):
                    raise ValueError("ABSOLUTE_SYMLINK_BLOCKED")

                lexical = Path(os.path.normpath(
                    os.path.join(current, target)
                ))

                if not lexical.is_relative_to(root):
                    raise ValueError("SYMLINK_ESCAPE_BLOCKED")

                try:
                    resolved = candidate.resolve(strict=True)
                except (OSError, RuntimeError) as exc:
                    raise ValueError(
                        "BROKEN_OR_CYCLIC_SYMLINK"
                    ) from exc

                if not resolved.is_relative_to(root):
                    raise ValueError("SYMLINK_ESCAPE_BLOCKED")

                counts["symlinks"] += 1

            elif stat.S_ISREG(mode):
                if info.st_nlink != 1:
                    raise ValueError("HARDLINKED_FILE_BLOCKED")

                counts["files"] += 1
                total_bytes += info.st_size

            elif stat.S_ISDIR(mode):
                counts["directories"] += 1

            else:
                raise ValueError("SPECIAL_FILE_BLOCKED")

    print("MANIFEST_V2_INSPECT=PASS")
    print(f"REGULAR_FILES={counts['files']}")
    print(f"DIRECTORIES={counts['directories']}")
    print(f"SYMLINKS={counts['symlinks']}")
    print(f"REGULAR_FILE_BYTES={total_bytes}")
    print("SPECIAL_FILES=NONE")
    print("RUNTIME_SECRETS=NONE")
    print("INSPECTION=METADATA_ONLY")
    print("INTEGRITY=NOT_VERIFIED")
    print("PROVENANCE_TRUST=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")


def collect_artifact_entries(root):
    """Collect full artifact entries using the existing integrity checks."""
    entries = []


    def assert_anchor(current, parent_fd):
        path_info = os.lstat(current)
        fd_info = os.fstat(parent_fd)

        if (
            not stat.S_ISDIR(path_info.st_mode)
            or not stat.S_ISDIR(fd_info.st_mode)
            or path_info.st_dev != fd_info.st_dev
            or path_info.st_ino != fd_info.st_ino
        ):
            raise ValueError("SOURCE_DIRECTORY_CHANGED")

    def walk_error(error):
        raise error

    for current, dirs, files, parent_fd in os.fwalk(
        root, topdown=True, follow_symlinks=False,
        onerror=walk_error
    ):
        dirs.sort()
        files.sort()
        assert_anchor(current, parent_fd)

        for name in sorted(dirs + files):
            candidate = Path(current) / name
            relative = candidate.relative_to(root).as_posix()
            info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            mode = info.st_mode

            if stat.S_ISREG(mode):
                if info.st_nlink != 1:
                    raise ValueError("HARDLINKED_FILE_BLOCKED")

                digest = hashlib.sha256()

                flags = (
                    os.O_RDONLY
                    | os.O_NOFOLLOW
                    | os.O_NONBLOCK
                    | os.O_CLOEXEC
                )

                fd = os.open(name, flags, dir_fd=parent_fd)

                try:
                    opened = os.fstat(fd)

                    if (
                        not stat.S_ISREG(opened.st_mode)
                        or opened.st_dev != info.st_dev
                        or opened.st_ino != info.st_ino
                        or opened.st_size != info.st_size
                        or opened.st_mtime_ns != info.st_mtime_ns
                        or opened.st_ctime_ns != info.st_ctime_ns
                        or opened.st_nlink != 1
                    ):
                        raise ValueError(
                            "FILE_CHANGED_BEFORE_HASHING"
                        )

                    with os.fdopen(os.dup(fd), "rb") as source:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            digest.update(chunk)

                    completed = os.fstat(fd)

                finally:
                    os.close(fd)

                after = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)

                if (
                    not stat.S_ISREG(completed.st_mode)
                    or completed.st_dev != info.st_dev
                    or completed.st_ino != info.st_ino
                    or completed.st_size != info.st_size
                    or completed.st_mtime_ns != info.st_mtime_ns
                    or completed.st_ctime_ns != info.st_ctime_ns
                    or completed.st_nlink != 1
                    or not stat.S_ISREG(after.st_mode)
                    or after.st_dev != info.st_dev
                    or after.st_ino != info.st_ino
                    or after.st_size != info.st_size
                    or after.st_mtime_ns != info.st_mtime_ns
                    or after.st_ctime_ns != info.st_ctime_ns
                    or after.st_nlink != 1
                ):
                    raise ValueError("FILE_CHANGED_DURING_GENERATION")

                entries.append({
                    "path": relative,
                    "type": "file",
                    "size": info.st_size,
                    "mode": stat.S_IMODE(info.st_mode),
                    "sha256": digest.hexdigest(),
                })

            elif stat.S_ISDIR(mode):
                entries.append({
                    "path": relative,
                    "type": "directory",
                    "mode": stat.S_IMODE(mode),
                })

            elif stat.S_ISLNK(mode):
                target = os.readlink(name, dir_fd=parent_fd)

                if os.path.isabs(target):
                    raise ValueError("ABSOLUTE_SYMLINK_BLOCKED")

                lexical = Path(os.path.normpath(
                    os.path.join(current, target)
                ))

                if not lexical.is_relative_to(root):
                    raise ValueError("SYMLINK_ESCAPE_BLOCKED")

                try:
                    resolved = candidate.resolve(strict=True)
                except (OSError, RuntimeError) as exc:
                    raise ValueError(
                        "BROKEN_OR_CYCLIC_SYMLINK"
                    ) from exc

                if not resolved.is_relative_to(root):
                    raise ValueError("SYMLINK_ESCAPE_BLOCKED")

                entries.append({
                    "path": relative,
                    "type": "symlink",
                    "target": target,
                })

            else:
                raise ValueError("SPECIAL_FILE_BLOCKED")

        assert_anchor(current, parent_fd)

    entries.sort(key=lambda item: item["path"])

    return entries


def generate_manifest(directory, manifest_path, commit, build_id):
    """Generate a full inventory without overwriting an existing manifest."""
    if not directory or not manifest_path:
        raise ValueError("RELEASE_AND_MANIFEST_REQUIRED")

    if not isinstance(commit, str) or not re.fullmatch(
        r"[0-9a-f]{7,40}", commit
    ):
        raise ValueError("INVALID_SOURCE_COMMIT")

    if not isinstance(build_id, str) or not build_id or len(build_id) > 128:
        raise ValueError("INVALID_BUILD_ID")

    root = Path(directory).absolute()
    output = Path(manifest_path).absolute()

    if not root.is_dir() or root.is_symlink():
        raise ValueError("INVALID_RELEASE_DIRECTORY")

    for parent in root.parents:
        if parent.is_symlink():
            raise ValueError("SYMLINKED_RELEASE_PARENT")

    if not output.parent.is_dir():
        raise ValueError("INVALID_MANIFEST_DESTINATION")

    if output.parent.is_symlink() or any(
        parent.is_symlink() for parent in output.parents
    ):
        raise ValueError("SYMLINKED_MANIFEST_DESTINATION")

    if output.is_symlink() or output.exists():
        raise ValueError("MANIFEST_ALREADY_EXISTS")

    if output.is_relative_to(root):
        raise ValueError("MANIFEST_INSIDE_RELEASE_BLOCKED")

    build_id_file = root / ".next" / "BUILD_ID"
    if not build_id_file.is_file() or build_id_file.is_symlink():
        raise ValueError("MISSING_BUILD_ID")

    actual_build_id = build_id_file.read_text(
        encoding="utf-8"
    ).strip()

    if actual_build_id != build_id:
        raise ValueError("BUILD_ID_MISMATCH")

    inspect_artifact(root)

    entries = collect_artifact_entries(root)

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "commit": commit,
        "buildId": build_id,
        "entries": entries,
    }

    payload = (
        json.dumps(
            manifest,
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        ) + "\n"
    ).encode("utf-8")

    temporary = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=".fitzone-manifest-",
            suffix=".tmp",
            dir=output.parent,
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())

        os.link(temporary, output)

    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)

    print("MANIFEST_V2_GENERATE=PASS")
    print(f"MANIFEST_V2_ENTRIES={len(entries)}")
    print("MANIFEST_V2_EXISTING_OVERWRITE=BLOCKED")
    print("MANIFEST_V2_PROVENANCE_TRUST=NOT_VERIFIED")
    print("MANIFEST_V2_STAGING_COPY_SAFETY=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")

def verify_manifest(directory, manifest_path, commit, build_id):
    """Verify exact artifact inventory against a pinned v2 manifest."""
    if not directory or not manifest_path:
        raise ValueError("RELEASE_AND_MANIFEST_REQUIRED")

    if not isinstance(commit, str) or not re.fullmatch(
        r"[0-9a-f]{7,40}", commit
    ):
        raise ValueError("INVALID_SOURCE_COMMIT")

    if not isinstance(build_id, str) or not build_id or len(build_id) > 128:
        raise ValueError("INVALID_BUILD_ID")

    root = Path(directory).absolute()
    manifest_file = Path(manifest_path).absolute()

    if root.is_symlink() or not root.is_dir():
        raise ValueError("INVALID_RELEASE_DIRECTORY")

    if manifest_file.is_symlink() or not manifest_file.is_file():
        raise ValueError("INVALID_MANIFEST_FILE")

    if any(parent.is_symlink() for parent in manifest_file.parents):
        raise ValueError("SYMLINKED_MANIFEST_PARENT")

    if manifest_file.is_relative_to(root):
        raise ValueError("MANIFEST_INSIDE_RELEASE_BLOCKED")

    if manifest_file.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("MANIFEST_TOO_LARGE")

    def reject_duplicates(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("DUPLICATE_MANIFEST_KEY")
            result[key] = value
        return result

    try:
        manifest = json.loads(
            manifest_file.read_text(encoding="utf-8"),
            object_pairs_hook=reject_duplicates,
        )
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("INVALID_MANIFEST_JSON") from exc

    if not isinstance(manifest, dict) or set(manifest) != {
        "schemaVersion", "commit", "buildId", "entries"
    }:
        raise ValueError("INVALID_MANIFEST_STRUCTURE")

    if type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 2:
        raise ValueError("INVALID_MANIFEST_VERSION")

    if manifest["commit"] != commit:
        raise ValueError("COMMIT_MISMATCH")

    if manifest["buildId"] != build_id:
        raise ValueError("BUILD_ID_MISMATCH")

    expected = manifest["entries"]

    if not isinstance(expected, list) or len(expected) > 1000000:
        raise ValueError("INVALID_MANIFEST_ENTRIES")

    build_file = root / ".next" / "BUILD_ID"

    if not build_file.is_file() or build_file.is_symlink():
        raise ValueError("MISSING_BUILD_ID")

    if build_file.read_text(encoding="utf-8").strip() != build_id:
        raise ValueError("BUILD_ID_MISMATCH")

    inspect_artifact(root)
    actual = collect_artifact_entries(root)

    if expected != actual:
        raise ValueError("ARTIFACT_INTEGRITY_MISMATCH")

    print("MANIFEST_V2_VERIFY=PASS")
    print(f"MANIFEST_V2_VERIFIED_ENTRIES={len(actual)}")
    print("MANIFEST_V2_EXACT_INVENTORY=PASS")
    print("PROVENANCE_TRUST=NOT_VERIFIED")
    print("STAGING_COPY_SAFETY=NOT_VERIFIED")
    print("DEPLOYMENT=DISABLED")

def main():
    parser = argparse.ArgumentParser(
        description="FitZone full artifact integrity manifest"
    )
    parser.add_argument(
        "command",
        choices=("inspect", "generate", "verify"),
    )
    parser.add_argument("--release")
    parser.add_argument("--manifest")
    parser.add_argument("--commit")
    parser.add_argument("--build-id")

    args = parser.parse_args()

    if args.command == "inspect":
        inspect_artifact(args.release)
        return

    if args.command == "generate":
        generate_manifest(
            args.release,
            args.manifest,
            args.commit,
            args.build_id,
        )
        return

    if args.command == "verify":
        verify_manifest(
            args.release,
            args.manifest,
            args.commit,
            args.build_id,
        )
        return

    raise ValueError("UNKNOWN_MANIFEST_COMMAND")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(f"MANIFEST_V2_BLOCKED={exc}")
        raise SystemExit(1)
