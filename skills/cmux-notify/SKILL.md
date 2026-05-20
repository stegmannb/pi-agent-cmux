---
name: cmux-notify
description: >
  PASSIVE: Automatically use cmux notifications, sidebar status, progress bars, and log entries
  when running inside cmux. Use this whenever completing long-running tasks (builds, tests, deploys),
  reporting errors, or tracking multi-step progress. Detects cmux automatically — degrades gracefully
  when not in cmux.
---

# cmux Notifications & Sidebar Status

You are running inside cmux — a terminal multiplexer for AI coding agents. Use its notification
and sidebar metadata APIs to keep the user informed without them watching the terminal.

## Detection

```bash
# Check if we're in cmux (env vars are auto-set per surface)
[ -n "${CMUX_WORKSPACE_ID:-}" ] && echo "in cmux"
```

**Always check before calling cmux commands.** If not in cmux, skip silently — never error.

## When to Use (PASSIVE — do this automatically)

### Notifications — for completed/failed tasks
Send a desktop notification when:
- A build, test suite, or deploy finishes
- An error occurs that needs user attention
- A long-running operation (>30s) completes
- You need user input and they may not be watching

```bash
# Success
cmux notify --title "✓ Tests Passed" --body "42/42 green in 2m14s"

# Failure
cmux notify --title "✗ Build Failed" --body "TypeScript errors in src/api.ts"

# Needs attention
cmux notify --title "⏳ Input Needed" --body "Which migration strategy?"
```

### Status pills — for current state
Set a status pill in the sidebar to show what this workspace is doing right now.
Use a consistent key (e.g., `pi`) so it updates in place.

```bash
# Show current activity
cmux set-status pi "Running tests" --color "#3b82f6"
cmux set-status pi "Building" --color "#f59e0b"
cmux set-status pi "Done ✓" --color "#22c55e"
cmux set-status pi "Error ✗" --color "#ef4444"

# Clear when idle
cmux clear-status pi
```

### Progress bars — for multi-step operations
Show progress for operations with known step counts.

```bash
cmux set-progress 0.0 --label "Starting migration..."
cmux set-progress 0.25 --label "Step 1/4: Schema"
cmux set-progress 0.5 --label "Step 2/4: Data"
cmux set-progress 0.75 --label "Step 3/4: Indexes"
cmux set-progress 1.0 --label "Done"
cmux clear-progress
```

### Log entries — for audit trail
Append structured log entries to the sidebar for visibility.

```bash
cmux log "Build started"
cmux log --level success -- "All tests passed"
cmux log --level error --source build "Compilation failed: 3 errors"
cmux log --level warning --source deploy "Using fallback config"
```

Log levels: `info`, `progress`, `success`, `warning`, `error`

## Patterns

### Wrap a build/test command
```bash
cmux set-status pi "Running tests" --color "#3b82f6"
npm test
if [ $? -eq 0 ]; then
  cmux set-status pi "Tests ✓" --color "#22c55e"
  cmux notify --title "✓ Tests Passed" --body "All green"
  cmux log --level success -- "Tests passed"
else
  cmux set-status pi "Tests ✗" --color "#ef4444"
  cmux notify --title "✗ Tests Failed" --body "Check output"
  cmux log --level error --source test "Tests failed"
fi
```

### Clean up when done
Always clear status/progress at the end of a conversation or when going idle:
```bash
cmux clear-status pi
cmux clear-progress
```

## Rules
1. **Always guard** with `[ -n "${CMUX_WORKSPACE_ID:-}" ]` before any cmux call
2. **Use key `pi`** for set-status so multiple calls update the same pill
3. **Don't spam** — one notification per completed task, not per step
4. **Clear state** when done — don't leave stale pills/progress
5. **Keep messages short** — title ≤30 chars, body ≤80 chars
