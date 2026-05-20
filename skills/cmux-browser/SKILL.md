---
name: cmux-browser
description: >
  Open and control embedded browser panes inside cmux for web preview, visual inspection,
  form testing, and screenshots. Use when doing frontend development, testing web UIs,
  verifying deployed pages, or when you need to see/interact with a web page. Requires cmux.
---

# cmux Browser Automation

cmux has an embedded WebKit browser you can control from the terminal. Use it for previewing
local dev servers, visual verification, form testing, and capturing screenshots.

## Opening a Browser

```bash
# Open in a new split (most common — keeps terminal visible)
cmux browser open-split http://localhost:3000

# Open in the current surface
cmux browser open http://localhost:3000
```

After opening, identify the surface to get its ID for subsequent commands:
```bash
cmux browser identify
# Returns surface ID, URL, title, etc.
```

## Core Workflow

### 1. Navigate and wait for load
```bash
cmux browser <surface> navigate https://example.com --snapshot-after
cmux browser <surface> wait --load-state complete --timeout-ms 15000
```

### 2. Inspect the page
```bash
# Get accessible DOM tree (best for understanding page structure)
cmux browser <surface> snapshot --interactive --compact

# Get specific content
cmux browser <surface> get title
cmux browser <surface> get text "h1"
cmux browser <surface> get html "main"
cmux browser <surface> get value "#email"
cmux browser <surface> get attr "a.primary" --attr href
cmux browser <surface> get count ".row"

# Screenshot for visual check
cmux browser <surface> screenshot --out /tmp/preview.png

# Check element state
cmux browser <surface> is visible "#checkout"
cmux browser <surface> is enabled "button[type='submit']"
```

### 3. Interact with the page
```bash
# Click, type, fill forms
cmux browser <surface> click "button[type='submit']" --snapshot-after
cmux browser <surface> fill "#email" --text "test@example.com"
cmux browser <surface> type "#search" "query"
cmux browser <surface> press Enter
cmux browser <surface> select "#region" "us-east"
cmux browser <surface> check "#terms"
cmux browser <surface> scroll --dy 800

# Wait for results
cmux browser <surface> wait --text "Success"
cmux browser <surface> wait --selector "#results" --timeout-ms 10000
cmux browser <surface> wait --url-contains "/dashboard"
```

### 4. Debug failures
```bash
cmux browser <surface> console list
cmux browser <surface> errors list
cmux browser <surface> screenshot --out /tmp/failure.png
```

## Finding Elements

```bash
cmux browser <surface> find role button --name "Continue"
cmux browser <surface> find text "Order confirmed"
cmux browser <surface> find label "Email"
cmux browser <surface> find placeholder "Search"
cmux browser <surface> find testid "save-btn"
```

## JavaScript Execution

```bash
cmux browser <surface> eval "document.title"
cmux browser <surface> eval --script "window.location.href"
cmux browser <surface> addstyle "#banner { display: none !important; }"
```

## Session/Cookie Management

```bash
cmux browser <surface> cookies get
cmux browser <surface> cookies set session_id abc123 --domain localhost --path /
cmux browser <surface> storage local set theme dark
cmux browser <surface> state save /tmp/session.json
cmux browser <surface> state load /tmp/session.json
```

## Common Patterns

### Preview local dev server
```bash
cmux browser open-split http://localhost:3000
SURF=$(cmux browser identify --json | jq -r '.surface_id')
cmux browser $SURF wait --load-state complete --timeout-ms 15000
cmux browser $SURF snapshot --interactive --compact
```

### Visual regression check
```bash
cmux browser $SURF screenshot --out /tmp/before.png
# ... make changes, reload ...
cmux browser $SURF reload --snapshot-after
cmux browser $SURF screenshot --out /tmp/after.png
```

### Fill and submit a form
```bash
cmux browser $SURF fill "#email" --text "user@test.com"
cmux browser $SURF fill "#password" --text "test123"
cmux browser $SURF click "button[type='submit']" --snapshot-after
cmux browser $SURF wait --text "Welcome"
```

## Rules
1. **Always `open-split`** to keep the terminal visible alongside the browser
2. **Use `identify`** after opening to get the surface ID
3. **Wait for load** before interacting — pages need time to render
4. **Use `snapshot --interactive --compact`** as the primary inspection tool (structured, not visual)
5. **Screenshots** are for visual verification — save to `/tmp/` with descriptive names
6. **`--snapshot-after`** on mutations gives you immediate feedback without a separate call
