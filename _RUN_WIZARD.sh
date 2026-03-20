#!/bin/bash
cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Install it from https://nodejs.org"
    echo "        Claude Code CLI requires Node.js 18+, so you likely already have it."
    exit 1
fi

# Auto-install dependencies on first run
if [ ! -d "node_modules" ]; then
    echo "[Claudeborn] First run detected — installing dependencies..."
    npm install || { echo "[ERROR] npm install failed."; exit 1; }
    echo
fi

# Launch
echo "[Claudeborn] Starting wizard..."
npm run dev
