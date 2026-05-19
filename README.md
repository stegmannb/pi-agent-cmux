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

If cmux is not found in the path, the extension disables itself silently.

## Configuration

Settings are read from the `cmux` key in pi's `settings.json`
(`$PI_CODING_AGENT_DIR/settings.json`):

```json
{
  "cmux": {
    "notifyLevel": "all",
    "thresholdMs": 15000,
    "title": "Pi"
  }
}
```

| Key | Default | Description |
|---|---|---|
| `notifyLevel` | `"all"` | `"all"` / `"medium"` (Task Complete + Error) / `"low"` (Error only) / `"disabled"` |
| `thresholdMs` | `15000` | Duration (ms) above which elapsed time is appended to the body |
| `title` | `"Pi"` | Notification title shown in cmux |

The cmux binary path can be overridden via the `CMUX_BINARY` environment variable.

## Installation

### Via Nix flake

```nix
# flake.nix
inputs.pi-agent-cmux.url = "github:stegmannb/pi-agent-cmux";

# In your pi instance config:
"extensions/cmux/index.ts".text = ''
  export { default } from "${inputs.pi-agent-cmux.packages.${system}.default}/src/index.ts";
'';

# To configure via settings.json:
"settings.json".text = builtins.toJSON {
  cmux = {
    notifyLevel = "medium";
    thresholdMs = 10000;
    title = "Pi";
  };
};
```

### Manual

```bash
# In your pi extensions directory
mkdir -p ~/.pi/agent/extensions/cmux
cp src/*.ts ~/.pi/agent/extensions/cmux/
```

## Development

```bash
direnv allow        # or: devenv shell
pnpm install
pnpm run check      # type-check
pnpm run lint       # lint
pnpm run fmt        # format
```
