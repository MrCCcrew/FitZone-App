#!/usr/bin/env bash
set -euo pipefail

T="$(mktemp -d)"
trap 'rm -rf -- "$T"' EXIT

mkdir -p "$T/releases/old" "$T/releases/new"

printf 'old\n' > "$T/releases/old/version"
printf 'new\n' > "$T/releases/new/version"

ln -s "releases/old" "$T/current"

test "$(cat "$T/current/version")" = "old"
echo "INITIAL_RELEASE=PASS"

ln -s "releases/new" "$T/current.next"
mv -Tf "$T/current.next" "$T/current"

test "$(cat "$T/current/version")" = "new"
echo "ATOMIC_SWITCH=PASS"

READINESS=FAIL

if [[ "$READINESS" != "PASS" ]]; then
    ln -s "releases/old" "$T/current.rollback"
    mv -Tf "$T/current.rollback" "$T/current"
fi

test "$(cat "$T/current/version")" = "old"
echo "ROLLBACK=PASS"

echo "ISOLATED_RELEASE_SWITCH_TESTS=PASS"