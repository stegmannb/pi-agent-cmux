/**
 * pi-cmux-notify
 *
 * Sends a native desktop notification via cmux when the pi agent finishes a
 * run and is waiting for input. Tracks files changed/read, shell commands, and
 * searches during each agent run to build a meaningful notification body.
 *
 * Configuration via environment variables:
 *   PI_CMUX_NOTIFY_LEVEL        - "all" | "medium" | "low" | "disabled" (default: "all")
 *   PI_CMUX_NOTIFY_THRESHOLD_MS - ms above which duration is included in body (default: 15000)
 *   PI_CMUX_NOTIFY_TITLE        - notification title (default: "Pi")
 *   CMUX_BINARY                 - path to the cmux binary (default: "cmux")
 */

import type { AgentEndEvent, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  isBashToolResult,
  isEditToolResult,
  isFindToolResult,
  isGrepToolResult,
  isReadToolResult,
  isWriteToolResult,
} from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NOTIFY_TIMEOUT_MS = 5_000;
const DEFAULT_THRESHOLD_MS = 15_000;
const DEFAULT_DEBOUNCE_MS = 3_000;

type NotifyLevel = "all" | "medium" | "low" | "disabled";
type Subtitle = "Task Complete" | "Waiting" | "Error";

function readEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readNotifyLevel(): NotifyLevel {
  const raw = process.env["PI_CMUX_NOTIFY_LEVEL"]?.trim().toLowerCase();
  const valid: NotifyLevel[] = ["all", "medium", "low", "disabled"];
  return valid.includes(raw as NotifyLevel) ? (raw as NotifyLevel) : "all";
}

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

interface RunState {
  startedAt: number;
  changedFiles: Set<string>;
  readFiles: Set<string>;
  bashCount: number;
  searchCount: number;
  firstError: string | undefined;
}

function freshState(): RunState {
  return {
    startedAt: Date.now(),
    changedFiles: new Set(),
    readFiles: new Set(),
    bashCount: 0,
    searchCount: 0,
    firstError: undefined,
  };
}

// ---------------------------------------------------------------------------
// Notification content
// ---------------------------------------------------------------------------

function plural(n: number, word: string, pluralForm = `${word}s`): string {
  return n === 1 ? word : pluralForm;
}

function fmtDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1_000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s}s`;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function clamp(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function buildBody(state: RunState, durationMs: number, thresholdMs: number): string {
  const appendDuration = (base: string): string =>
    durationMs >= thresholdMs ? `${base} in ${fmtDuration(durationMs)}` : base;

  const { changedFiles, readFiles, bashCount, searchCount } = state;

  if (changedFiles.size === 1) {
    const [f] = changedFiles;
    return appendDuration(`Updated ${basename(f!)}`);
  }
  if (changedFiles.size > 1) {
    return appendDuration(`Updated ${changedFiles.size} ${plural(changedFiles.size, "file")}`);
  }
  if (readFiles.size === 1) {
    const [f] = readFiles;
    return appendDuration(`Reviewed ${basename(f!)}`);
  }
  if (readFiles.size > 1) {
    return appendDuration(`Reviewed ${readFiles.size} ${plural(readFiles.size, "file")}`);
  }
  if (searchCount > 0 && bashCount > 0) {
    const searches = `${searchCount} ${plural(searchCount, "search", "searches")}`;
    const commands = `${bashCount} ${plural(bashCount, "shell command")}`;
    return appendDuration(`Ran ${searches} and ${commands}`);
  }
  if (searchCount > 0) {
    return appendDuration(
      searchCount === 1 ? "Searched the codebase" : `Ran ${searchCount} searches`,
    );
  }
  if (bashCount > 0) {
    return appendDuration(`Ran ${bashCount} ${plural(bashCount, "shell command")}`);
  }
  return durationMs >= thresholdMs
    ? `Finished in ${fmtDuration(durationMs)}`
    : "Finished and waiting for input";
}

function resolveSubtitle(
  state: RunState,
  durationMs: number,
  thresholdMs: number,
  hasError: boolean,
): Subtitle {
  if (hasError) return "Error";
  if (state.changedFiles.size > 0 || durationMs >= thresholdMs) return "Task Complete";
  return "Waiting";
}

function shouldNotify(level: NotifyLevel, subtitle: Subtitle): boolean {
  if (level === "disabled") return false;
  if (level === "all") return true;
  if (level === "medium") return subtitle !== "Waiting";
  // level === "low"
  return subtitle === "Error";
}

// Extract error info from the final assistant message, if the run failed.
function extractRunError(
  messages: AgentEndEvent["messages"],
  fallback: string | undefined,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as unknown as Record<string, unknown>;
    if (m["role"] !== "assistant") continue;
    const stop = m["stopReason"];
    if (stop !== "error" && stop !== "aborted") return undefined;
    const msg = typeof m["errorMessage"] === "string" ? m["errorMessage"].trim() : undefined;
    return clamp(msg || fallback || "Agent run failed");
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  const thresholdMs = readEnvMs("PI_CMUX_NOTIFY_THRESHOLD_MS", DEFAULT_THRESHOLD_MS);
  const debounceMs = readEnvMs("PI_CMUX_NOTIFY_DEBOUNCE_MS", DEFAULT_DEBOUNCE_MS);
  const level = readNotifyLevel();
  const title = process.env["PI_CMUX_NOTIFY_TITLE"] ?? "Pi";
  const cmuxBinary = process.env["CMUX_BINARY"] ?? "cmux";

  let state = freshState();
  let lastKey = "";
  let lastAt = 0;
  let cmuxMissing = false;

  async function sendNotification(subtitle: Subtitle, body: string): Promise<void> {
    if (cmuxMissing || !shouldNotify(level, subtitle)) return;

    const key = `${subtitle}\n${body}`;
    const now = Date.now();
    if (key === lastKey && now - lastAt < debounceMs) return;

    const result = await pi.exec(
      cmuxBinary,
      ["notify", "--title", title, "--subtitle", subtitle, "--body", body],
      {
        timeout: NOTIFY_TIMEOUT_MS,
      },
    );

    if (result.killed) return;

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      if (stderr.includes("not found") || stderr.includes("ENOENT")) {
        cmuxMissing = true;
      }
      return;
    }

    lastAt = now;
    lastKey = key;
  }

  pi.on("agent_start", () => {
    state = freshState();
  });

  pi.on("tool_result", (event) => {
    const path =
      typeof event.input["path"] === "string" && event.input["path"].length > 0
        ? event.input["path"]
        : undefined;

    if (event.isError && !state.firstError) {
      if (path) {
        state.firstError = clamp(`${event.toolName} failed for ${basename(path)}`);
      } else if (isBashToolResult(event)) {
        state.firstError = "bash command failed";
      } else {
        const text = event.content.find((p) => p.type === "text");
        state.firstError = clamp(
          text?.type === "text" ? text.text.trim() : `${event.toolName} failed`,
        );
      }
    }

    if (isReadToolResult(event)) {
      if (path) state.readFiles.add(path);
    } else if ((isEditToolResult(event) || isWriteToolResult(event)) && !event.isError) {
      if (path) state.changedFiles.add(path);
    } else if ((isGrepToolResult(event) || isFindToolResult(event)) && !event.isError) {
      state.searchCount += 1;
    } else if (isBashToolResult(event) && !event.isError) {
      state.bashCount += 1;
    }
  });

  pi.on("agent_end", async (event) => {
    const durationMs = Date.now() - state.startedAt;
    const runError = extractRunError(event.messages, state.firstError);
    const subtitle = resolveSubtitle(state, durationMs, thresholdMs, runError !== undefined);
    const body = runError ?? buildBody(state, durationMs, thresholdMs);
    await sendNotification(subtitle, body);
  });
}
