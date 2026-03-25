---
name: ascii
description: "Generate ASCII art text — /ascii [text], /ascii -f [font] [text], /ascii list"
argument-hint: "[-f font] <text> | list"
user-invocable: true
---

ASCII art generator using pyfiglet. Run the command and display the output directly.

- `/ascii HAL-O` → generate with default font (slant)
- `/ascii -f banner3 HAL-O` → generate with specific font
- `/ascii list` → run `font-browser.py` from this skill's directory, which generates an interactive HTML font browser and opens it
- `/ascii list [filter]` → filter fonts by name substring

Generate command: `python -c "import pyfiglet; print(pyfiglet.figlet_format('TEXT', font='FONT'))"`

If `-f fontname` is provided, extract the font name and use it. If the font doesn't exist, show error + suggest similar fonts.
