#!/usr/bin/env bash
# halochat-inbox-hook.sh -- Watches for Halo Chat messages and injects them
# into the current Claude session via stdin.
#
# This runs as a UserNotification hook in Claude's session hooks.
# The HAL-O HTTP API writes to ~/.hal-o/halochat-inbox.json when a Halo Chat
# message arrives and no internal terminal is available.
#
# The external session should call this script periodically or on
# pre-tool-use / post-tool-use hooks. Alternatively, run it as a background
# watcher.
#
# Usage:
#   _scripts/halochat-inbox-hook.sh [--watch]     # one-shot check or watch mode
#   _scripts/halochat-inbox-hook.sh --respond "response text" --id "msg_id" [--done]

set -euo pipefail

# Determine data dir
HOME_DIR="${USERPROFILE:-$HOME}"
HAL_O_DIR="$HOME_DIR/.hal-o"

# Check for instance.json to support clone instances
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCE_FILE="$REPO_DIR/instance.json"

if [ -f "$INSTANCE_FILE" ]; then
    INSTANCE_ID=$(grep '"id"' "$INSTANCE_FILE" | sed 's/.*"id" *: *"\([^"]*\)".*/\1/' | head -1)
    HAL_O_DIR="$HOME_DIR/.hal-o/instances/$INSTANCE_ID"
fi

INBOX="$HAL_O_DIR/halochat-inbox.json"   # legacy single-file (backward compat)
OUTBOX="$HAL_O_DIR/halochat-outbox.json" # legacy single-file (backward compat)

# ── Mode: respond (write to outbox) ──
if [ "${1:-}" = "--respond" ]; then
    RESPONSE="${2:-}"
    MSG_ID=""
    AGENT=""
    DONE="false"
    shift 2 || true
    while [ $# -gt 0 ]; do
        case "$1" in
            --id) MSG_ID="$2"; shift 2 ;;
            --agent) AGENT="$2"; shift 2 ;;
            --done) DONE="true"; shift ;;
            *) shift ;;
        esac
    done
    if [ -z "$MSG_ID" ] || [ -z "$RESPONSE" ]; then
        echo "Usage: $0 --respond \"text\" --id msg_id [--agent name] [--done]"
        exit 1
    fi
    # Write per-message outbox file (new) + legacy single file (backward compat)
    OUTBOX_MSG="$HAL_O_DIR/halochat-outbox-${MSG_ID}.json"
    for OUTFILE in "$OUTBOX_MSG" "$OUTBOX"; do
        cat > "$OUTFILE" <<EOF
{
  "id": "$MSG_ID",
  "agent": "${AGENT:-hal}",
  "response": $(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$RESPONSE\""),
  "done": $DONE,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    done
    echo "[HaloChat] Response written to outbox (id=$MSG_ID, done=$DONE)"
    exit 0
fi

# ── Mode: check (one-shot) ──
# Find inbox files: per-message (halochat-inbox-*.json) or legacy (halochat-inbox.json)
INBOX_FILES=()
for f in "$HAL_O_DIR"/halochat-inbox-*.json; do
    [ -f "$f" ] && INBOX_FILES+=("$f")
done
# Fallback to legacy single file
if [ ${#INBOX_FILES[@]} -eq 0 ] && [ -f "$INBOX" ]; then
    INBOX_FILES=("$INBOX")
fi

if [ ${#INBOX_FILES[@]} -eq 0 ]; then
    exit 0
fi

# Process each inbox message
for INBOX_FILE_PATH in "${INBOX_FILES[@]}"; do
    MSG_ID=$(grep '"id"' "$INBOX_FILE_PATH" | sed 's/.*"id" *: *"\([^"]*\)".*/\1/' | head -1)
    AGENT=$(grep '"agent"' "$INBOX_FILE_PATH" | sed 's/.*"agent" *: *"\([^"]*\)".*/\1/' | head -1)
    MESSAGE=$(python3 -c "import json; d=json.load(open('$INBOX_FILE_PATH')); print(d.get('message',''))" 2>/dev/null || grep '"message"' "$INBOX_FILE_PATH" | sed 's/.*"message" *: *"\([^"]*\)".*/\1/' | head -1)

    if [ -z "$MSG_ID" ] || [ -z "$MESSAGE" ]; then
        rm -f "$INBOX_FILE_PATH"
        continue
    fi

    echo ""
    echo "=== HALO CHAT MESSAGE ==="
    echo "From: $AGENT"
    echo "ID: $MSG_ID"
    echo "Message: $MESSAGE"
    echo "========================="
    echo ""
    echo "To respond, run:"
    echo "  $0 --respond \"your response\" --id \"$MSG_ID\" --agent \"$AGENT\" --done"
    echo ""

    # Clean up inbox after reading
    rm -f "$INBOX_FILE_PATH"
done
