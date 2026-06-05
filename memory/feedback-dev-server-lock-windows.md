---
name: feedback-dev-server-lock-windows
description: Nuxt dev lock + Windows process kill — NUXT_IGNORE_LOCK or PowerShell Stop-Process, never Git Bash taskkill
metadata:
  type: feedback
---

**Rule**: When `npm run dev` reports "Another Nuxt dev server is already
running", use one of:

1. `NUXT_IGNORE_LOCK=1 npm run dev` (quickest — bypasses the lock check).
2. PowerShell: `Stop-Process -Id <PID> -Force` (kills the orphan cleanly).

Do NOT run `taskkill /PID <PID> /F` from Git Bash — Git Bash interprets
`/PID` as a path argument and the command fails with
`ERROR: Invalid argument/option - 'C:/Program Files/Git/PID'`.

**Why**: burned ~5 minutes on this during the initial bootstrap. The
`/PID` flag is fine in cmd.exe and PowerShell but Git Bash's path-translation
layer mangles it.

**How to apply**:
- If running tools from Git Bash (the default Claude Code shell on Windows)
  and you need to kill a Windows process, use the `PowerShell` tool with
  `Stop-Process -Id <PID> -Force`.
- Alternatively `NUXT_IGNORE_LOCK=1 npm run dev` works around the lock
  check without needing to kill anything; safe for dev.
- The lock file lives under `.nuxt/dev.lock` — deleting it is also valid
  but the env-var path is cleaner.

Related: [[project-verification]].
