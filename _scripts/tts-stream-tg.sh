#!/usr/bin/env bash
# tts-stream-tg.sh — Generate TTS and stream each chunk to Telegram as it's produced.
#
# Usage:
#   bash _scripts/tts-stream-tg.sh "Text to speak" /tmp/voice.ogg butler en 5080630646
#   bash _scripts/tts-stream-tg.sh "Text to speak" /tmp/voice.ogg auto en          # uses default TELEGRAM_CHAT_ID
#   bash _scripts/tts-stream-tg.sh "Text to speak" /tmp/voice.ogg auto en CHAT_ID --dry-run
#
# The script calls tts.py, reads chunk paths from stdout line by line, and sends
# each .ogg to Telegram via sendVoice as soon as it appears. No chunks are forgotten.

set -euo pipefail

# --- Args ---
TEXT="${1:?Usage: tts-stream-tg.sh <text> <output.ogg> [profile] [lang] [chat_id] [--dry-run]}"
OUTPUT="${2:?Usage: tts-stream-tg.sh <text> <output.ogg> [profile] [lang] [chat_id] [--dry-run]}"
PROFILE="${3:-auto}"
LANG="${4:-en}"
CHAT_ID="${5:-}"
DRY_RUN=false

# Check for --dry-run in any position
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
  fi
done

# --- Credentials ---
CREDS="$HOME/.claude_credentials"
if [[ ! -f "$CREDS" ]]; then
  echo "[tts-stream-tg] ERROR: credentials file not found at $CREDS" >&2
  exit 1
fi
source "$CREDS"

# --- Determine bot token ---
# Clone instances have instance.json and use TELEGRAM_MAIN_BOT_TOKEN.
# Main instance uses TELEGRAM_BOT_TOKEN.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

BOT_TOKEN=""
if [[ -f "$REPO_ROOT/instance.json" ]]; then
  # Clone instance — use main bot token (or instance-specific if defined)
  INSTANCE_ID=$(python3 -c "import json; print(json.load(open('$REPO_ROOT/instance.json'))['id'])" 2>/dev/null || echo "")
  # Check for instance-specific token first (e.g. TELEGRAM_CLAUDETTE_BOT_TOKEN)
  INSTANCE_VAR="TELEGRAM_${INSTANCE_ID^^}_BOT_TOKEN"
  INSTANCE_VAR="${INSTANCE_VAR//-/_}"  # Replace hyphens with underscores
  if [[ -n "${!INSTANCE_VAR:-}" ]]; then
    BOT_TOKEN="${!INSTANCE_VAR}"
  elif [[ -n "${TELEGRAM_MAIN_BOT_TOKEN:-}" ]]; then
    BOT_TOKEN="$TELEGRAM_MAIN_BOT_TOKEN"
  fi
fi

# Fallback to default bot token
if [[ -z "$BOT_TOKEN" ]]; then
  BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?ERROR: No TELEGRAM_BOT_TOKEN in credentials}"
fi

# Default chat ID from credentials if not provided
if [[ -z "$CHAT_ID" ]]; then
  CHAT_ID="${TELEGRAM_CHAT_ID:?ERROR: No chat_id argument and no TELEGRAM_CHAT_ID in credentials}"
fi

# --- TTS Script ---
TTS_SCRIPT="$HOME/.claude/scripts/tts.py"
if [[ ! -f "$TTS_SCRIPT" ]]; then
  echo "[tts-stream-tg] ERROR: tts.py not found at $TTS_SCRIPT" >&2
  exit 1
fi

# --- Generate and stream ---
SENT=0
TOTAL=0
FAILED=0

echo "[tts-stream-tg] Generating TTS: profile=$PROFILE lang=$LANG chat=$CHAT_ID" >&2
if $DRY_RUN; then
  echo "[tts-stream-tg] DRY RUN — will not actually send to Telegram" >&2
fi

# Run tts.py: chunk paths appear on stdout, diagnostics on stderr
# We read stdout line by line and send each chunk immediately
while IFS= read -r line; do
  # tts.py prints only file paths to stdout (all other output goes to stderr)
  # Validate it looks like a file path ending in .ogg
  if [[ "$line" == *.ogg ]]; then
    TOTAL=$((TOTAL + 1))

    if [[ ! -f "$line" ]]; then
      echo "[tts-stream-tg] WARNING: chunk file not found: $line" >&2
      FAILED=$((FAILED + 1))
      continue
    fi

    if $DRY_RUN; then
      echo "[tts-stream-tg] DRY RUN would send: $line" >&2
      SENT=$((SENT + 1))
    else
      echo "[tts-stream-tg] Sending chunk $TOTAL: $line" >&2
      RESPONSE=$(curl -s -X POST \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendVoice" \
        -F "chat_id=${CHAT_ID}" \
        -F "voice=@${line}" \
        2>&1)

      if echo "$RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin); sys.exit(0 if r.get('ok') else 1)" 2>/dev/null; then
        SENT=$((SENT + 1))
        echo "[tts-stream-tg] Chunk $TOTAL sent OK" >&2
      else
        FAILED=$((FAILED + 1))
        echo "[tts-stream-tg] ERROR sending chunk $TOTAL: $RESPONSE" >&2
      fi
    fi
  fi
done < <(python3 "$TTS_SCRIPT" "$TEXT" "$OUTPUT" "$PROFILE" "$LANG")
# tts.py stderr passes through to our stderr naturally

# --- Summary ---
echo "[tts-stream-tg] Done: sent $SENT/$TOTAL chunks to chat $CHAT_ID (failed: $FAILED)"
if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
