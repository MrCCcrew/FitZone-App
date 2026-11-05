#!/usr/bin/env python3
"""FitZone isolated Green artifact staging; never switches traffic."""

import argparse
import ctypes
import errno
import importlib.util
import os
import stat
import shutil
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
MANIFEST_TOOL = BASE / "fitzone-artifact-manifest.py"

MIN_RESERVE_BYTES = 2 * 1024 ** 3
RENAME_NOREPLACE = 1
AT_FDCWD = -100


def load_manifest_tool():
    spec = importlib.util.spec_from_file_location(
        "fitzone_artifact_manifest_v2", MANIFEST_TOOL
    )
    if spec is None or spec.loader is None:
        raise ValueError("MANIFEST_V2_TOOL_NOT_FOUND")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def checked_directory(path, must_exist=True):
    directory = Path(os.path.abspath(path))

    for component in (directory, *directory.parents):
        if component.is_symlink():
            raise ValueError("SYMLINKED_DIRECTORY_BLOCKED")

    if must_exist and not directory.is_dir():
        raise ValueError("DIRECTORY_NOT_FOUND")

    return directory


def atomic_no_replace(source, destination):
    """Linux renameat2: never replace an existing destination."""
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)

    if renameat2 is None:
        raise ValueError("ATOMIC_NOREPLACE_UNAVAILABLE")

    renameat2.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    renameat2.restype = ctypes.c_int

    result = renameat2(
        AT_FDCWD, os.fsencode(source),
        AT_FDCWD, os.fsencode(destination),
        RENAME_NOREPLACE,
    )

    if result != 0:
        error = ctypes.get_errno()
        if error == errno.EEXIST:
            raise ValueError("DESTINATION_ALREADY_EXISTS")
        raise OSError(error, os.strerror(error))


def copy_anchored(source, destination):
    """Copy using anchored Linux directory descriptors, without following links."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    original = source.lstat()
    root_fd = os.open(source, flags)

    directories = []

    try:
        root_info = os.fstat(root_fd)
        if (
            not stat.S_ISDIR(root_info.st_mode)
            or root_info.st_dev != original.st_dev
            or root_info.st_ino != original.st_ino
        ):
            raise ValueError("SOURCE_ROOT_CHANGED")

        for current, dirs, files, parent_fd in os.fwalk(
            ".", topdown=True, follow_symlinks=False, dir_fd=root_fd
        ):
            relative = Path(current)
            target_dir = destination / relative

            if current != "." and not target_dir.is_dir():
                raise ValueError("STAGING_DIRECTORY_MISSING")

            directories.append((
                target_dir,
                stat.S_IMODE(os.fstat(parent_fd).st_mode),
            ))

            descend = []

            for name in sorted(dirs + files):
                if name in (".", "..") or "/" in name or "\x00" in name:
                    raise ValueError("INVALID_SOURCE_ENTRY")

                info = os.stat(
                    name, dir_fd=parent_fd, follow_symlinks=False
                )
                target = target_dir / name

                if stat.S_ISDIR(info.st_mode):
                    target.mkdir()
                    descend.append(name)

                elif stat.S_ISLNK(info.st_mode):
                    link = os.readlink(name, dir_fd=parent_fd)
                    target.symlink_to(link)

                elif stat.S_ISREG(info.st_mode):
                    if info.st_nlink != 1:
                        raise ValueError("HARDLINKED_FILE_BLOCKED")

                    file_flags = (
                        os.O_RDONLY | os.O_NOFOLLOW
                        | os.O_NONBLOCK | os.O_CLOEXEC
                    )

                    file_fd = os.open(
                        name, file_flags, dir_fd=parent_fd
                    )

                    try:
                        opened = os.fstat(file_fd)
                        identity = (
                            "st_dev", "st_ino", "st_size",
                            "st_mtime_ns", "st_ctime_ns",
                            "st_mode", "st_nlink",
                        )

                        if (
                            not stat.S_ISREG(opened.st_mode)
                            or opened.st_nlink != 1
                            or any(
                                getattr(opened, key) != getattr(info, key)
                                for key in identity
                            )
                        ):
                            raise ValueError("SOURCE_FILE_CHANGED")

                        with os.fdopen(os.dup(file_fd), "rb") as reader:
                            with target.open("xb") as writer:
                                shutil.copyfileobj(
                                    reader, writer, 1024 * 1024
                                )

                        completed = os.fstat(file_fd)
                        after = os.stat(
                            name, dir_fd=parent_fd,
                            follow_symlinks=False,
                        )

                        if any(
                            getattr(value, key) != getattr(info, key)
                            for value in (completed, after)
                            for key in identity
                        ):
                            raise ValueError("SOURCE_FILE_CHANGED")

                        os.chmod(target, stat.S_IMODE(info.st_mode))
                    finally:
                        os.close(file_fd)

                else:
                    raise ValueError("SPECIAL_FILE_BLOCKED")

            dirs[:] = descend

        for path, mode in reversed(directories):
            os.chmod(path, mode)

    finally:
        os.close(root_fd)

def cleanup_owned_temp(temporary, identity):
    """Delete contents through a verified, pinned Linux directory FD."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    parent_fd = os.open(temporary.parent, flags)

    try:
        try:
            root_fd = os.open(temporary.name, flags, dir_fd=parent_fd)
        except FileNotFoundError as exc:
            raise ValueError("STAGING_TEMP_OWNERSHIP_LOST") from exc

        try:
            opened = os.fstat(root_fd)
            if (
                not stat.S_ISDIR(opened.st_mode)
                or (opened.st_dev, opened.st_ino) != identity
            ):
                raise ValueError("STAGING_TEMP_OWNERSHIP_LOST")

            for current, dirs, files, fd in os.fwalk(
                ".", topdown=False, follow_symlinks=False,
                dir_fd=root_fd
            ):
                for name in files:
                    os.unlink(name, dir_fd=fd)

                for name in dirs:
                    info = os.stat(
                        name, dir_fd=fd, follow_symlinks=False
                    )
                    if stat.S_ISDIR(info.st_mode):
                        os.rmdir(name, dir_fd=fd)
                    elif stat.S_ISLNK(info.st_mode):
                        os.unlink(name, dir_fd=fd)
                    else:
                        raise ValueError("UNSAFE_STAGING_ENTRY")

            try:
                current = os.stat(
                    temporary.name,
                    dir_fd=parent_fd,
                    follow_symlinks=False
                )
            except FileNotFoundError as exc:
                raise ValueError("STAGING_TEMP_OWNERSHIP_LOST") from exc

            if (
                not stat.S_ISDIR(current.st_mode)
                or (current.st_dev, current.st_ino) != identity
            ):
                raise ValueError("STAGING_TEMP_OWNERSHIP_LOST")

            # Fail closed: never unlink the root by a mutable name.
            # The empty, mode-0700 temporary directory is retained.
            print("STAGING_EMPTY_TEMP_RETAINED=" + str(temporary), flush=True)
        finally:
            os.close(root_fd)
    finally:
        os.close(parent_fd)


def stage_artifact(source, manifest, destination, commit, build_id):
    if not all((source, manifest, destination, commit, build_id)):
        raise ValueError("STAGING_ARGUMENTS_REQUIRED")

    source = checked_directory(source)
    destination = Path(os.path.abspath(destination))
    parent = checked_directory(destination.parent)

    if destination.name in ("", ".", ".."):
        raise ValueError("INVALID_DESTINATION")

    if destination.exists() or destination.is_symlink():
        raise ValueError("DESTINATION_ALREADY_EXISTS")

    if (
        source == destination
        or source in destination.parents
        or destination in source.parents
    ):
        raise ValueError("OVERLAPPING_RELEASE_PATHS")

    manifest = Path(os.path.abspath(manifest))

    if manifest.is_symlink() or not manifest.is_file():
        raise ValueError("INVALID_MANIFEST_FILE")

    if any(p.is_symlink() for p in manifest.parents):
        raise ValueError("SYMLINKED_MANIFEST_PARENT")

    if (
        manifest == destination
        or destination in manifest.parents
        or source == manifest
        or source in manifest.parents
    ):
        raise ValueError("UNSAFE_MANIFEST_LOCATION")

    if source.stat().st_dev != parent.stat().st_dev:
        # Cross-filesystem copying is supported, but promotion
        # must remain atomic inside the destination parent.
        print("SOURCE_AND_DESTINATION_FILESYSTEM=DIFFERENT")

    verifier = load_manifest_tool()

    print("=== FITZONE GREEN STAGING ===", flush=True)
    print("SOURCE_INTEGRITY=VERIFYING", flush=True)

    verifier.verify_manifest(
        source, manifest, commit, build_id
    )

    print("SOURCE_INTEGRITY=PASS", flush=True)

    # Estimate physical regular-file data, without following links.
    total_bytes = 0
    for current, dirs, files in os.walk(source, followlinks=False):
        for name in files:
            path = Path(current) / name
            if path.is_file() and not path.is_symlink():
                total_bytes += path.lstat().st_size

    free = shutil.disk_usage(parent).free
    if free < total_bytes + MIN_RESERVE_BYTES:
        raise ValueError("INSUFFICIENT_STAGING_SPACE")

    temporary = None
    temporary_identity = None
    promoted = False

    try:
        temporary = Path(tempfile.mkdtemp(
            prefix=".fitzone-green-stage-",
            dir=parent,
        ))
        created = os.lstat(temporary)
        temporary_identity = (created.st_dev, created.st_ino)

        # Copy into a fresh, private directory.
        # Symlinks are preserved, not dereferenced by copytree.
        copy_anchored(source, temporary)

        print("STAGING_COPY=COMPLETE", flush=True)

        verifier.verify_manifest(
            temporary, manifest, commit, build_id
        )

        print("STAGED_INTEGRITY=PASS", flush=True)

        # Recheck the destination parent and avoid replacement.
        checked_directory(parent)
        if destination.exists() or destination.is_symlink():
            raise ValueError("DESTINATION_ALREADY_EXISTS")

        atomic_no_replace(temporary, destination)
        promoted = True

        print("ATOMIC_STAGE_PROMOTION=PASS", flush=True)
        print("STAGED_RELEASE=" + str(destination), flush=True)
        print("RUNTIME_READINESS=NOT_VERIFIED", flush=True)
        print("PROVENANCE_TRUST=NOT_VERIFIED", flush=True)
        print("PRODUCTION_APPROVAL=NOT_GRANTED", flush=True)
        print("NGINX_SWITCH=NONE", flush=True)
        print("PM2_CHANGES=NONE", flush=True)
        print("DEPLOYMENT=DISABLED", flush=True)

    finally:
        if temporary is not None and not promoted:
            cleanup_owned_temp(temporary, temporary_identity)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("stage",))
    parser.add_argument("--release", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--build-id", required=True)
    args = parser.parse_args()

    if os.name != "posix" or not hasattr(os, "O_NOFOLLOW"):
        raise ValueError("LINUX_RUNTIME_REQUIRED")

    stage_artifact(
        args.release,
        args.manifest,
        args.destination,
        args.commit,
        args.build_id,
    )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(f"GREEN_STAGE_BLOCKED={exc}")
        raise SystemExit(1)
