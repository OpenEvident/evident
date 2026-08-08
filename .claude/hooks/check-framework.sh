#!/bin/bash
# PostToolUse hook: typecheck/lint/test framework/src changes deterministically.
# No-ops until framework/ is scaffolded and defines the relevant package.json
# scripts (typecheck, lint, test) — safe to have active before that exists.
# Exit 2 on failure: PostToolUse specifically needs exit 2 (not 1) for stderr
# to reach Claude as actionable feedback rather than just the debug log.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
FILE_PATH="${FILE_PATH//\\//}"

case "$FILE_PATH" in
  */framework/src/*) ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
FRAMEWORK_DIR="$PROJECT_DIR/framework"
PKG="$FRAMEWORK_DIR/package.json"

[ -f "$PKG" ] || exit 0

cd "$FRAMEWORK_DIR" || exit 0

has_script() {
  jq -e --arg s "$1" '.scripts[$s] // empty' package.json > /dev/null 2>&1
}

FAILED=""
OUTPUT=""

run_check() {
  local name="$1"
  if has_script "$name"; then
    if ! out=$(pnpm run --silent "$name" 2>&1); then
      FAILED="$FAILED $name"
      OUTPUT="$OUTPUT
--- $name ---
$out"
    fi
  fi
}

run_check typecheck
run_check lint
run_check test

if [ -n "$FAILED" ]; then
  echo "framework check(s) failed:$FAILED$OUTPUT" >&2
  exit 2
fi

exit 0
