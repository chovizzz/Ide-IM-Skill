#!/usr/bin/env bash
#
# Check whether the required CLI for a given runtime is installed.
# Usage: check-cli.sh <runtime> [--install]
#
# Exit codes:
#   0 — CLI found
#   1 — CLI not found (or install failed)
#
# With --install: attempts automatic installation when CLI is missing.
set -euo pipefail

RUNTIME="${1:-}"
AUTO_INSTALL=false
[ "${2:-}" = "--install" ] && AUTO_INSTALL=true

if [ -z "$RUNTIME" ]; then
  echo "Usage: check-cli.sh <claude|codex|cursor|auto> [--install]"
  exit 1
fi

IS_WINDOWS=false
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=true ;;
esac

find_cmd() {
  local cmd="$1"
  if $IS_WINDOWS; then
    where "$cmd" 2>/dev/null | head -1
  else
    which "$cmd" 2>/dev/null
  fi
}

check_claude() {
  local path
  path=$(find_cmd claude) || true
  if [ -n "$path" ]; then
    local ver
    ver=$("$path" --version 2>/dev/null || echo "unknown")
    echo "found: $path (version: $ver)"
    return 0
  fi
  # Check well-known locations
  for candidate in \
    "$HOME/.claude/local/claude" \
    "$HOME/.local/bin/claude" \
    "/usr/local/bin/claude" \
    "/opt/homebrew/bin/claude"; do
    if [ -x "$candidate" ] 2>/dev/null; then
      local ver
      ver=$("$candidate" --version 2>/dev/null || echo "unknown")
      echo "found: $candidate (version: $ver)"
      return 0
    fi
  done
  echo "not_found"
  return 1
}

check_codex() {
  local path
  path=$(find_cmd codex) || true
  if [ -n "$path" ]; then
    echo "found: $path"
    return 0
  fi
  echo "not_found"
  return 1
}

check_cursor() {
  local path
  for cmd in agent cursor; do
    path=$(find_cmd "$cmd") || true
    if [ -n "$path" ]; then
      echo "found: $path"
      return 0
    fi
  done
  # Check well-known locations
  for candidate in \
    "$HOME/.cursor/bin/agent" \
    "$HOME/.local/bin/agent" \
    "/usr/local/bin/agent" \
    "/opt/homebrew/bin/agent"; do
    if [ -x "$candidate" ] 2>/dev/null; then
      echo "found: $candidate"
      return 0
    fi
  done
  echo "not_found"
  return 1
}

install_claude() {
  echo "Installing Claude CLI..."
  if $IS_WINDOWS; then
    powershell.exe -Command "irm https://claude.ai/install.ps1 | iex"
  else
    curl -fsSL https://claude.ai/install.sh | sh
  fi
}

install_codex() {
  echo "Installing Codex CLI..."
  npm install -g @openai/codex
}

install_cursor() {
  echo "Installing Cursor CLI..."
  if $IS_WINDOWS; then
    powershell.exe -Command "irm https://cursor.com/install.ps1 | iex"
  else
    curl -fsSL https://cursor.com/install | sh
  fi
}

try_check_and_install() {
  local name="$1"
  local check_fn="check_$name"
  local install_fn="install_$name"

  local result
  result=$($check_fn 2>/dev/null) && {
    echo "$name: $result"
    return 0
  }

  echo "$name: not found"
  if $AUTO_INSTALL; then
    $install_fn 2>&1
    # Re-check after install
    result=$($check_fn 2>/dev/null) && {
      echo "$name: $result (after install)"
      return 0
    }
    echo "$name: install failed"
    return 1
  fi
  return 1
}

case "$RUNTIME" in
  claude)
    try_check_and_install claude
    ;;
  codex)
    try_check_and_install codex
    ;;
  cursor)
    try_check_and_install cursor
    ;;
  auto)
    CLAUDE_OK=false
    CODEX_OK=false
    try_check_and_install claude && CLAUDE_OK=true
    try_check_and_install codex && CODEX_OK=true
    if $CLAUDE_OK || $CODEX_OK; then
      exit 0
    else
      echo "auto: neither claude nor codex found"
      exit 1
    fi
    ;;
  *)
    echo "Unknown runtime: $RUNTIME"
    exit 1
    ;;
esac
