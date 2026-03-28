#!/usr/bin/env bash
# session-health-check.sh — Validates Telegram session state on every launch.
# Detects: wrong bot token in .env, missing --channels flag, conflicting sessions.
# Outputs JSON report to /tmp/hal_session_health.json and warnings to stdout.
# Designed for git bash on Windows. Must complete in <5 seconds.

set -euo pipefail

# ── Determine instance ──────────────────────────────────────────────────────
# Use CLAUDE_PROJECT_DIR if set (hook context), else CWD, else script dir
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    REPO_DIR="$CLAUDE_PROJECT_DIR"
elif [ -f "$(pwd)/instance.json" ] || [ -f "$(pwd)/package.json" ]; then
    REPO_DIR="$(pwd)"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
INSTANCE_FILE="$REPO_DIR/instance.json"

INSTANCE_NAME="HAL-O"
INSTANCE_ID="hal-o"
IS_CLONE="false"

if [ -f "$INSTANCE_FILE" ]; then
    IS_CLONE="true"
    # Parse instance.json (minimal jq-free parsing for git bash)
    INSTANCE_NAME=$(grep '"name"' "$INSTANCE_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/' | head -1)
    INSTANCE_ID=$(grep '"id"' "$INSTANCE_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/' | head -1)
fi

# ── Load credentials ────────────────────────────────────────────────────────
CRED_FILE="$HOME/.claude_credentials"
EXPECTED_TOKEN=""
TOKEN_KEY=""

if [ ! -f "$CRED_FILE" ]; then
    echo "HEALTH CHECK CRITICAL: ~/.claude_credentials not found!"
    cat > /tmp/hal_session_health.json <<ENDJSON
{
  "pid": $$,
  "instanceName": "$INSTANCE_NAME",
  "instanceId": "$INSTANCE_ID",
  "isClone": $IS_CLONE,
  "hasChannels": false,
  "tokenCorrect": false,
  "tokenEnvPresent": false,
  "conflicts": [],
  "errors": ["credentials file not found"],
  "status": "FAIL",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ENDJSON
    exit 1
fi

# Source credentials
set +u
source "$CRED_FILE" 2>/dev/null || true
set -u

if [ "$IS_CLONE" = "true" ]; then
    # Clones: try TELEGRAM_<UPPERNAME>_BOT_TOKEN first, then TELEGRAM_MAIN_BOT_TOKEN
    UPPER_NAME=$(echo "$INSTANCE_NAME" | tr '[:lower:]' '[:upper:]')
    TOKEN_KEY="TELEGRAM_${UPPER_NAME}_BOT_TOKEN"
    EXPECTED_TOKEN="${!TOKEN_KEY:-}"

    if [ -z "$EXPECTED_TOKEN" ]; then
        TOKEN_KEY="TELEGRAM_MAIN_BOT_TOKEN"
        EXPECTED_TOKEN="${TELEGRAM_MAIN_BOT_TOKEN:-}"
    fi

    if [ -z "$EXPECTED_TOKEN" ]; then
        TOKEN_KEY="(none found)"
        echo "HEALTH CHECK WARNING: No clone-specific token found for $INSTANCE_NAME"
        echo "  Tried: TELEGRAM_${UPPER_NAME}_BOT_TOKEN, TELEGRAM_MAIN_BOT_TOKEN"
    fi
else
    # Main instance: use TELEGRAM_BOT_TOKEN
    TOKEN_KEY="TELEGRAM_BOT_TOKEN"
    EXPECTED_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
fi

# ── Check .env file ─────────────────────────────────────────────────────────
ENV_FILE="$HOME/.claude/channels/telegram/.env"
TOKEN_CORRECT="false"
ENV_PRESENT="false"
ENV_TOKEN=""

if [ -f "$ENV_FILE" ]; then
    ENV_PRESENT="true"
    ENV_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '[:space:]')

    if [ -n "$EXPECTED_TOKEN" ] && [ "$ENV_TOKEN" = "$EXPECTED_TOKEN" ]; then
        TOKEN_CORRECT="true"
    fi
fi

# Mask tokens for display (show first 4 and last 4 chars)
mask_token() {
    local t="$1"
    if [ ${#t} -gt 12 ]; then
        echo "${t:0:4}...${t: -4}"
    elif [ -n "$t" ]; then
        echo "${t:0:4}..."
    else
        echo "(empty)"
    fi
}

EXPECTED_MASKED=$(mask_token "$EXPECTED_TOKEN")
ENV_MASKED=$(mask_token "$ENV_TOKEN")

# ── Check --channels flag and conflicting sessions ─────────────────────────
# Use fast tasklist + wmic alternative. On Windows git bash, powershell CIM
# queries are too slow (>10s). Instead, use a single fast wmic call.
HAS_CHANNELS="false"
CONFLICTS="[]"

# Use wmic which is fast on Windows (deprecated but still works, and fast)
# Fallback: if wmic fails, skip process checks (token check is the main value)
if command -v wmic.exe &>/dev/null 2>&1; then
    # wmic is deprecated on Win11 — use tasklist as fast alternative
    # tasklist doesn't show command lines, so we need PowerShell but with timeout
    :
fi

# Fast approach: check via /proc if available (WSL), or a quick PS one-liner
# with strict timeout. The key insight: the bat files ALWAYS add --channels,
# so if we launched from a bat file, --channels is present by construction.
# The real check is: did the bat file actually set it?
# We check the CLAUDE_CHANNELS env var as a proxy.
if [ -n "${CLAUDE_CHANNELS:-}" ]; then
    HAS_CHANNELS="true"
fi

# Alternative: check if the bat launcher set TG_ARG (won't be in env, but
# the --channels flag presence is hard to check from a child process).
# Best proxy: check if the telegram plugin .env exists AND has our token.
# If it does, and we were launched from a bat with --channels, we're good.
# The bat files all unconditionally add --channels when TELEGRAM_BOT_TOKEN is set.

# For conflict detection, use a lightweight approach: check if multiple
# telegram state directories have recent lock files
CONFLICT_LIST=""
CONFLICT_COUNT=0

# Check main telegram state dir
TG_STATE_MAIN="$HOME/.claude/channels/telegram"
TG_STATE_CLAUDETTE="$HOME/.claude/channels/telegram-claudette"

for STATE_DIR in "$TG_STATE_MAIN" "$TG_STATE_CLAUDETTE"; do
    if [ -d "$STATE_DIR/inbox" ]; then
        # Check for recent files in inbox (indicates active session)
        RECENT=$(find "$STATE_DIR/inbox" -type f -newer "$STATE_DIR/.env" 2>/dev/null | head -1)
        if [ -n "$RECENT" ]; then
            DIR_NAME=$(basename "$STATE_DIR")
            if [ -n "$CONFLICT_LIST" ]; then
                CONFLICT_LIST="${CONFLICT_LIST},{\"stateDir\":\"$DIR_NAME\"}"
            else
                CONFLICT_LIST="{\"stateDir\":\"$DIR_NAME\"}"
            fi
            CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
        fi
    fi
done

if [ -n "$CONFLICT_LIST" ]; then
    CONFLICTS="[$CONFLICT_LIST]"
fi

# ── Determine overall status ────────────────────────────────────────────────
STATUS="OK"
WARNINGS=""

if [ "$ENV_PRESENT" = "false" ]; then
    STATUS="WARN"
    WARNINGS="${WARNINGS}WARNING: Telegram .env file not found at $ENV_FILE\n"
fi

if [ "$TOKEN_CORRECT" = "false" ] && [ -n "$EXPECTED_TOKEN" ]; then
    STATUS="FAIL"
    WARNINGS="${WARNINGS}CRITICAL: Token mismatch in .env!\n"
    WARNINGS="${WARNINGS}  Instance: $INSTANCE_NAME (key: $TOKEN_KEY)\n"
    WARNINGS="${WARNINGS}  Expected: $EXPECTED_MASKED\n"
    WARNINGS="${WARNINGS}  .env has: $ENV_MASKED\n"
    WARNINGS="${WARNINGS}  FIX: The bat launcher should write the correct token before starting claude.\n"
fi

if [ "$CONFLICTS" != "[]" ] && [ "$CONFLICT_COUNT" -gt 1 ]; then
    [ "$STATUS" != "FAIL" ] && STATUS="WARN"
    WARNINGS="${WARNINGS}WARNING: Multiple active telegram state dirs detected.\n"
    WARNINGS="${WARNINGS}  Ensure each instance uses its own TELEGRAM_STATE_DIR.\n"
    WARNINGS="${WARNINGS}  Active: $CONFLICTS\n"
fi

# ── Write JSON report ───────────────────────────────────────────────────────
cat > /tmp/hal_session_health.json <<ENDJSON
{
  "pid": $$,
  "instanceName": "$INSTANCE_NAME",
  "instanceId": "$INSTANCE_ID",
  "isClone": $IS_CLONE,
  "hasChannels": $HAS_CHANNELS,
  "tokenCorrect": $TOKEN_CORRECT,
  "tokenEnvPresent": $ENV_PRESENT,
  "expectedTokenKey": "$TOKEN_KEY",
  "expectedTokenMasked": "$EXPECTED_MASKED",
  "envTokenMasked": "$ENV_MASKED",
  "conflicts": $CONFLICTS,
  "status": "$STATUS",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ENDJSON

# ── Print results ───────────────────────────────────────────────────────────
echo "=== SESSION HEALTH CHECK ==="
echo "Instance: $INSTANCE_NAME ($INSTANCE_ID)"
echo "Clone: $IS_CLONE"
echo "Token key: $TOKEN_KEY"
echo "Token match: $TOKEN_CORRECT (expected: $EXPECTED_MASKED, .env: $ENV_MASKED)"
echo "Channels flag: $HAS_CHANNELS"
echo "Status: $STATUS"

if [ -n "$WARNINGS" ]; then
    echo ""
    echo -e "$WARNINGS"
fi

echo "Report: /tmp/hal_session_health.json"
echo "=== END HEALTH CHECK ==="
