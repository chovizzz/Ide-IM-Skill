#!/usr/bin/env bash
#
# Initialise workspace & identity directories for the bridge.
# Called by the setup wizard after CLI check, and also by daemon.sh start as a safety net.
#
# Usage: init-workspace.sh <runtime> [--identity-dir <path>] [--work-dir <path>]
#
# Defaults (when flags are omitted):
#   cursor  → workDir=~/.workspace, identityDir=~/.workspace
#   others  → workDir=$PWD,         identityDir=(skip)
#
# What it creates:
#   1. CTI_HOME dirs:       data, logs, runtime, data/messages
#   2. Working directory:   mkdir -p <workDir>
#   3. Identity directory:  mkdir -p <identityDir>/memory
#      + seed from templates/identity-default/*.md if AGENTS.md is missing
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CTI_HOME="${CTI_HOME:-$HOME/.ide-im}"

RUNTIME="${1:-cursor}"
shift || true

WORK_DIR=""
IDENTITY_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --identity-dir) IDENTITY_DIR="$2"; shift 2 ;;
    --work-dir)     WORK_DIR="$2";     shift 2 ;;
    *) shift ;;
  esac
done

# Resolve defaults per runtime
if [ -z "$WORK_DIR" ]; then
  case "$RUNTIME" in
    cursor) WORK_DIR="$HOME/.workspace" ;;
    *)      WORK_DIR="$(pwd)" ;;
  esac
fi

if [ -z "$IDENTITY_DIR" ]; then
  case "$RUNTIME" in
    cursor) IDENTITY_DIR="$HOME/.workspace" ;;
  esac
fi

# 1. CTI_HOME structure
echo "Creating CTI_HOME directories ($CTI_HOME)..."
mkdir -p "$CTI_HOME"/{data,logs,runtime,data/messages}

# 2. Working directory
echo "Creating working directory ($WORK_DIR)..."
mkdir -p "$WORK_DIR"

# 3. Identity directory + seed templates
if [ -n "$IDENTITY_DIR" ]; then
  echo "Creating identity directory ($IDENTITY_DIR)..."
  mkdir -p "$IDENTITY_DIR/memory"

  TEMPLATES_DIR="$SKILL_DIR/templates/identity-default"
  if [ ! -f "$IDENTITY_DIR/AGENTS.md" ] && [ -d "$TEMPLATES_DIR" ]; then
    echo "Seeding identity templates from $TEMPLATES_DIR..."
    cp "$TEMPLATES_DIR"/*.md "$IDENTITY_DIR/" 2>/dev/null || true
    echo "Done. Edit USER.md and MEMORY.md to personalise your agent."
  else
    echo "Identity files already exist, skipping seed."
  fi
else
  echo "No identity directory configured for runtime '$RUNTIME' (will use session working directory)."
fi

echo ""
echo "Workspace initialised:"
echo "  CTI_HOME:      $CTI_HOME"
echo "  Working dir:   $WORK_DIR"
[ -n "$IDENTITY_DIR" ] && echo "  Identity dir:  $IDENTITY_DIR"
echo ""
