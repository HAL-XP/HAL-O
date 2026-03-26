#!/bin/bash
# Pre-compaction audit — checks that all important repo structures are indexed in MEMORY.md
# Run this before any compaction to catch forgotten systems

MEMORY="$HOME/.claude/projects/D--GitHub-hal-o/memory/MEMORY.md"
REPO="D:/GitHub/hal-o"
MISSING=()

# Key directories that MUST be mentioned in MEMORY.md
check_dir() {
  local dir="$1"
  local keyword="$2"
  if [ -d "$REPO/$dir" ] && ! grep -qi "$keyword" "$MEMORY" 2>/dev/null; then
    MISSING+=("DIR: $dir (keyword: $keyword)")
  fi
}

# Key files that MUST be mentioned
check_file() {
  local file="$1"
  local keyword="$2"
  if [ -f "$REPO/$file" ] && ! grep -qi "$keyword" "$MEMORY" 2>/dev/null; then
    MISSING+=("FILE: $file (keyword: $keyword)")
  fi
}

# Check critical directories
check_dir "_devlog" "devlog"
check_dir "_scripts" "scripts"
check_dir "_concepts" "concepts"
check_dir ".claude/agents" "agents"
check_dir ".claude/skills" "skills"
check_dir "e2e" "playwright\|e2e\|test"
check_dir "temp" "temp"

# Check critical files
check_file ".claude/skills/marketing/demo-locked-spec.json" "locked.spec\|demo.*spec"
check_file "_scripts/detect_teleport.py" "teleport"
check_file "package.json" "package"

# Report
if [ ${#MISSING[@]} -eq 0 ]; then
  echo "AUDIT PASS: All critical structures indexed in MEMORY.md"
else
  echo "AUDIT FAIL: ${#MISSING[@]} items NOT in MEMORY.md:"
  for item in "${MISSING[@]}"; do
    echo "  - $item"
  done
  echo ""
  echo "ACTION: Add these to MEMORY.md before compaction!"
fi
