---
name: hal
description: "HAL-O command center — type /hal for menu, or /hal <command> to run directly"
argument-hint: "[command] [args...]"
user-invocable: true
---

If no args: read `hal-slash-command-menu.txt` from this skill's directory, display it, say "Pick a letter:". User's next message = single letter.

Map: Y=yours M=mine W=wazzup C=ci B=board P=push S=ship N=nuke R=relaunch X=clean T=test Q=qa F=perf D=todo U=queue H=html V=save-state I=silent L=loud Z=zog-zog E=rules G=marketing ?=help. Case-insensitive. `/hal w` = direct exec.

For `?`, `h`, or `help`: read `actions.md` from this skill's directory and display ALL commands with their full descriptions in a formatted list.

On match, read `actions.md` from this skill's directory for the command's full spec, then execute it. Save HTML outputs to `<project-root>/temp/` and open in browser.
