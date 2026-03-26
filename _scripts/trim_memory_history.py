#!/usr/bin/env python3
"""
Trim session history blocks in MEMORY.md to one-liners.
Run before compaction or as a periodic maintenance task.

Finds blocks like:
  ## Session N Work (date) — description
  - item 1
  - item 2
  ... (20+ lines)

Replaces with:
  ## Session N Work (date) — see _devlog/YYYY-MM-DD.md

Zero LLM tokens. Pure regex.
"""
import re
import sys
from pathlib import Path

MEMORY_PATH = Path.home() / '.claude' / 'projects' / 'D--GitHub-hal-o' / 'memory' / 'MEMORY.md'

def trim():
    if not MEMORY_PATH.exists():
        print(f'MEMORY.md not found at {MEMORY_PATH}')
        return

    text = MEMORY_PATH.read_text(encoding='utf-8')
    original_lines = len(text.splitlines())

    # Match session history blocks: ## Session N Work ... followed by bullet lines
    # Replace multi-line blocks with a one-liner
    def replace_session_block(m):
        header = m.group(1).strip()
        # Extract date if present
        date_match = re.search(r'20\d{2}-\d{2}-\d{2}', header)
        date_ref = f' — see _devlog/{date_match.group()}.md' if date_match else ' — see _devlog/'
        # Keep first line, replace rest with reference
        return f'{header}{date_ref}\n'

    # Pattern: ## Session N ... (header) followed by - bullet lines
    trimmed = re.sub(
        r'(## Session \d+ Work.*?)\n((?:- .*\n)+)',
        replace_session_block,
        text
    )

    # Also trim "## Recent Session Work" blocks
    trimmed = re.sub(
        r'(## Recent Session Work.*?)\n((?:- .*\n)+)',
        replace_session_block,
        trimmed
    )

    new_lines = len(trimmed.splitlines())
    saved = original_lines - new_lines

    if saved > 0:
        MEMORY_PATH.write_text(trimmed, encoding='utf-8')
        tokens_saved = saved * 15  # ~15 tokens per line average
        print(f'Trimmed {saved} lines (~{tokens_saved} tokens saved)')
        print(f'MEMORY.md: {original_lines} → {new_lines} lines')
    else:
        print(f'MEMORY.md is already lean ({original_lines} lines)')

if __name__ == '__main__':
    trim()
