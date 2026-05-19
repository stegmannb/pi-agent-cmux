# pi-agent-cmux

A [pi coding agent](https://github.com/mariozechner/pi) extension that sends
a native desktop notification via [cmux](https://cmux.app) when the agent
finishes a run and is waiting for input.

## What it does

Tracks each agent run and builds a context-aware notification:

- **Updated 3 files in 2m 30s** — when files were changed
- **Reviewed auth.ts** — when files were only read
- **Ran 5 searches and 2 shell commands** — for exploration runs
- **Finished in 45s** — when the run exceeded the duration threshold
- **Error** — when the agent encountered an error

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PI_CMUX_NOTIFY_LEVEL` | `all` | `all` / `medium` (Task Complete + Error) / `low` (Error only) / `disabled` |
| `PI_CMUX_NOTIFY_THRESHOLD_MS` | `15000` | Duration (ms) above which timing is included in the body |
| `PI_CMUX_NOTIFY_TITLE` | `Pi` | Notification title |
| `CMUX_BINARY` | `cmux` | Path to the cmux binary |

If cmux is not found, the extension disables itself silently.

## Installation

### Via Nix flake

```nix
# flake.nix
inputs.pi-agent-cmux.url = "github:stegmannb/pi-agent-cmux";

# In your pi instance config:
"extensions/cmux/index.ts".text = ''
  export { default } from "${inputs.pi-agent-cmux.packages.${system}.default}/src/index.ts";
'';
```

### Manual

```bash
# In your pi extensions directory
mkdir -p ~/.pi/agent/extensions/cmux
cp src/index.ts ~/.pi/agent/extensions/cmux/
```

## Development

```bash
direnv allow        # or: devenv shell
pnpm install
pnpm run check      # type-check
pnpm run lint       # lint
pnpm run fmt        # format
```
