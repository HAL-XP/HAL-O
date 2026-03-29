#!/usr/bin/env bash
# send-all-chunks.sh — Find all TTS chunks for a base path and send them all to Telegram.
#
# Usage:
#   bash _scripts/send-all-chunks.sh /tmp/voice 5080630646
#   bash _scripts/send-all-chunks.sh /tmp/voice.ogg 5080630646    # .ogg extension is stripped
#   bash _scripts/send-all-chunks.sh /tmp/voice                    # uses default TELEGRAM_CHAT_ID
#   bash _scripts/send-all-chunks.sh /tmp/voice 5080630646 --dry-run
#
# Chunk naming convention (from tts.py):
#   voice.ogg, voice_2.ogg, voice_3.ogg, ...
#
# This script finds all matching chunks, sorts them in order, and sends each one.

set -euo pipefail

# --- Args ---
BASE_PATH="${1:?Usage: send-all-chunks.sh <base_path> [chat_id] [--dry-run]}"
CHAT_ID="${2:-}"
DRY_RUN=false

# Check for --dry-run in any position
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
    # If --dry-run was in position 2, clear CHAT_ID
    if [[ "$CHAT_ID" == "--dry-run" ]]; then
      CHAT_ID=""
    fi
  fi
done

# --- Credentials ---
CREDS="$HOME/.claude_credentials"
if [[ ! -f "$CREDS" ]]; then
  echo "[send-all-chunks] ERROR: credentials file not found at $CREDS" >&2
  exit 1
fi
source "$CREDS"

# --- Determine bot token ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

BOT_TOKEN=""
if [[ -f "$REPO_ROOT/instance.json" ]]; then
  INSTANCE_ID=$(python3 -c "import json; print(json.load(open('$REPO_ROOT/instance.json'))['id'])" 2>/dev/null || echo "")
  INSTANCE_VAR="TELEGRAM_${INSTANCE_ID^^}_BOT_TOKEN"
  INSTANCE_VAR="${INSTANCE_VAR//-/_}"
  if [[ -n "${!INSTANCE_VAR:-}" ]]; then
    BOT_TOKEN="${!INSTANCE_VAR}"
  elif [[ -n "${TELEGRAM_MAIN_BOT_TOKEN:-}" ]]; then
    BOT_TOKEN="$TELEGRAM_MAIN_BOT_TOKEN"
  fi
fi

if [[ -z "$BOT_TOKEN" ]]; then
  BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?ERROR: No TELEGRAM_BOT_TOKEN in credentials}"
fi

if [[ -z "$CHAT_ID" ]]; then
  CHAT_ID="${TELEGRAM_CHAT_ID:?ERROR: No chat_id argument and no TELEGRAM_CHAT_ID in credentials}"
fi

# --- Strip .ogg extension if present ---
BASE="${BASE_PATH%.ogg}"
EXT=".ogg"

# --- Find all chunks ---
# Pattern: base.ogg, base_2.ogg, base_3.ogg, ...
CHUNKS=()

# First chunk: base.ogg
if [[ -f "${BASE}${EXT}" ]]; then
  CHUNKS+=("${BASE}${EXT}")
fi

# Numbered chunks: base_2.ogg, base_3.ogg, ...
# Sort numerically to ensure correct order
N=2
while true; do
  CHUNK_PATH="${BASE}_${N}${EXT}"
  if [[ -f "$CHUNK_PATH" ]]; then
    CHUNKS+=("$CHUNK_PATH")
    N=$((N + 1))
  else
    break
  fi
done

if [[ ${#CHUNKS[@]} -eq 0 ]]; then
  echo "[send-all-chunks] ERROR: No chunks found for base path: $BASE" >&2
  echo "[send-all-chunks] Looked for: ${BASE}${EXT}, ${BASE}_2${EXT}, ..." >&2
  exit 1
fi

echo "[send-all-chunks] Found ${#CHUNKS[@]} chunk(s) for $BASE" >&2

# --- Send each chunk ---
SENT=0
FAILED=0
TOTAL=${#CHUNKS[@]}

for CHUNK in "${CHUNKS[@]}"; do
  IDX=$((SENT + FAILED + 1))

  if $DRY_RUN; then
    echo "[send-all-chunks] DRY RUN [$IDX/$TOTAL]: $CHUNK" >&2
    SENT=$((SENT + 1))
    continue
  fi

  echo "[send-all-chunks] Sending [$IDX/$TOTAL]: $CHUNK" >&2
  RESPONSE=$(curl -s -X POST \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendVoice" \
    -F "chat_id=${CHAT_ID}" \
    -F "voice=@${CHUNK}" \
    2>&1)

  if echo "$RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); sys.exit(0 if r.get('ok') else 1)" 2>/dev/null; then
    SENT=$((SENT + 1))
    echo "[send-all-chunks] Chunk $IDX sent OK" >&2
  else
    FAILED=$((FAILED + 1))
    echo "[send-all-chunks] ERROR sending chunk $IDX: $RESPONSE" >&2
  fi
done

# --- Summary ---
echo "[send-all-chunks] Done: sent $SENT/$TOTAL chunks to chat $CHAT_ID (failed: $FAILED)"
if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
