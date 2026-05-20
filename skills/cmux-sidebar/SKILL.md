---
name: cmux-sidebar
description: >
  PASSIVE: Use cmux sidebar metadata to display rich status information — status pills,
  progress bars, and structured log entries — visible at a glance in the workspace sidebar.
  Use automatically during multi-step tasks, builds, deploys, and any operation where
  progress visibility helps. Requires cmux.
---

# cmux Sidebar Dashboard

The cmux sidebar shows metadata per workspace: git branch, ports, and custom entries you control.
Use this to surface task state, build progress, and structured logs without the user switching tabs.

## Status Pills

Small colored badges in the sidebar. Use a unique key per concern so they don't overwrite each other.

```bash
# Set a status pill (key, label, optional icon and color)
cmux set-status pi "Building" --color "#f59e0b"
cmux set-status pi "Tests ✓" --color "#22c55e"
cmux set-status pi "Error" --color "#ef4444"
cmux set-status deploy "v2.1.0" --color "#8b5cf6"

# Clear a specific pill
cmux clear-status pi

# List all status entries for the current workspace
cmux list-status
```

**Keys to use:**
- `pi` — current agent activity
- `build` — build state
- `test` — test results
- `deploy` — deployment state
- Use other descriptive keys as needed

## Progress Bars

A single progress bar per workspace, shown in the sidebar. Value 0.0–1.0.

```bash
cmux set-progress 0.0 --label "Starting..."
cmux set-progress 0.25 --label "Step 1/4: Schema migration"
cmux set-progress 0.5 --label "Step 2/4: Data backfill"
cmux set-progress 0.75 --label "Step 3/4: Index rebuild"
cmux set-progress 1.0 --label "Complete"

# Always clear when done
cmux clear-progress
```

## Log Entries

Structured log lines appended to the sidebar. Each has a level, optional source, and message.

```bash
# Levels: info, progress, success, warning, error
cmux log "Starting deployment"
cmux log --level progress --source deploy "Uploading artifacts"
cmux log --level success --source deploy "Deployed to staging"
cmux log --level warning --source deploy "Slow DNS propagation"
cmux log --level error --source build "3 TypeScript errors"

# List recent entries
cmux list-log
cmux list-log --limit 5

# Clear all logs
cmux clear-log
```

## Full State Dump

Get everything at once — cwd, git branch, ports, status pills, progress, logs:

```bash
cmux sidebar-state
cmux sidebar-state --workspace workspace:2
```

## When to Use (PASSIVE — do this automatically)

### During multi-step tasks
```bash
cmux set-progress 0.0 --label "Migration: starting"
# step 1...
cmux set-progress 0.33 --label "Migration: schema"
cmux log --level progress --source migrate "Schema updated"
# step 2...
cmux set-progress 0.66 --label "Migration: data"
cmux log --level progress --source migrate "Data backfilled"
# step 3...
cmux set-progress 1.0 --label "Migration: complete"
cmux log --level success --source migrate "All done"
cmux clear-progress
```

### During builds/tests
```bash
cmux set-status pi "Building" --color "#f59e0b"
cmux log "Build started"
# ... build runs ...
cmux set-status pi "Build ✓" --color "#22c55e"
cmux log --level success -- "Build completed in 45s"
```

### Tracking multiple concerns
```bash
cmux set-status api "Healthy" --color "#22c55e"
cmux set-status db "Migrating" --color "#f59e0b"
cmux set-status cache "Warming" --color "#3b82f6"
```

## Rules
1. **Guard all calls** — only run if `CMUX_WORKSPACE_ID` is set
2. **Always clear progress** when a multi-step operation finishes
3. **Use consistent keys** for status pills so they update in place
4. **Don't over-log** — one entry per meaningful step, not per line of output
5. **Keep labels short** — they render in a narrow sidebar
6. **Clear stale state** at conversation end: `cmux clear-status pi && cmux clear-progress`
