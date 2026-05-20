/**
 * Live sidebar status updates for the cmux extension.
 *
 * Tracks thinking sessions and tool executions, surfaces them as cmux status
 * pills once they have been running for longer than `thresholdMs`, and logs
 * completions as sidebar log entries.
 *
 * All cmux calls are fire-and-forget — failures are silently swallowed so
 * sidebar errors never interrupt the agent.
 */

import type { ExecResult } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";
import type { Config } from "./config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Exec = (bin: string, args: string[], opts?: { timeout?: number }) => Promise<ExecResult>;

interface ActiveTask {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly startedAt: number;
  /** Timer handle; fires when the threshold elapses and the pill should appear. */
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the pill is currently visible in the cmux sidebar. */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function truncateCmd(s: string, max = 24): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function getPath(args: Record<string, unknown>): string | undefined {
  const p = args["path"];
  return typeof p === "string" && p.length > 0 ? p : undefined;
}

function getPattern(args: Record<string, unknown>): string | undefined {
  const p = args["pattern"] ?? args["regex"] ?? args["glob"];
  return typeof p === "string" && p.length > 0 ? p : undefined;
}

export function formatToolLabel(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "bash": {
      const cmd = typeof args["command"] === "string" ? args["command"].trimStart() : "";
      return `⚡ bash: ${truncateCmd(cmd)}`;
    }
    case "read": {
      const p = getPath(args);
      return p ? `📄 read: ${basename(p)}` : "📄 read";
    }
    case "edit": {
      const p = getPath(args);
      return p ? `✏️  edit: ${basename(p)}` : "✏️  edit";
    }
    case "write": {
      const p = getPath(args);
      return p ? `💾 write: ${basename(p)}` : "💾 write";
    }
    case "grep": {
      const pat = getPattern(args);
      return pat ? `🔍 grep: ${truncateCmd(pat)}` : "🔍 grep";
    }
    case "find": {
      const p = getPath(args);
      return p ? `🔍 find: ${basename(p)}` : "🔍 find";
    }
    default:
      return `🔧 ${toolName}`;
  }
}

function toolColor(toolName: string): string {
  switch (toolName) {
    case "bash":
      return "#3b82f6"; // blue
    case "edit":
    case "write":
      return "#22c55e"; // green
    case "grep":
    case "find":
      return "#8b5cf6"; // purple
    default:
      return "#6b7280"; // gray
  }
}

function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1_000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s}s`;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

// ---------------------------------------------------------------------------
// CmuxSidebar
// ---------------------------------------------------------------------------

const EXEC_TIMEOUT_MS = 3_000;
const THINKING_KEY = "pi-think";

export class CmuxSidebar {
  private readonly exec: Exec;
  private readonly config: Config;
  private readonly tasks = new Map<string, ActiveTask>();
  private cmuxMissing = false;
  private thinkingStartedAt: number | undefined;

  constructor(exec: Exec, config: Config) {
    this.exec = exec;
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  startThinking(): void {
    if (!this.config.sidebarEnabled) return;
    this.thinkingStartedAt = Date.now();
    this.scheduleTask(THINKING_KEY, "🧠 Thinking…", "#f59e0b");
  }

  stopThinking(): void {
    if (!this.config.sidebarEnabled) return;
    const startedAt = this.thinkingStartedAt;
    this.thinkingStartedAt = undefined;

    const task = this.tasks.get(THINKING_KEY);
    if (!task) return;

    const elapsed = startedAt !== undefined ? Date.now() - startedAt : undefined;
    const wasVisible = task.visible;
    this.cancelTask(THINKING_KEY);

    if (wasVisible && elapsed !== undefined) {
      void this.cmuxLog("progress", "think", `Thinking: ${formatDuration(elapsed)}`);
    }
  }

  startTool(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
    if (!this.config.sidebarEnabled) return;
    const key = `pi-tool-${toolCallId}`;
    const label = formatToolLabel(toolName, args);
    const color = toolColor(toolName);
    this.scheduleTask(key, label, color);
  }

  stopTool(toolCallId: string, toolName: string): void {
    if (!this.config.sidebarEnabled) return;
    const key = `pi-tool-${toolCallId}`;
    const task = this.tasks.get(key);
    if (!task) return;

    const elapsed = Date.now() - task.startedAt;
    const wasVisible = task.visible;
    this.cancelTask(key);

    if (wasVisible) {
      const source = toolName === "bash" ? "bash" : "tool";
      void this.cmuxLog("progress", source, `${task.label}: ${formatDuration(elapsed)}`);
    }
  }

  clearAll(): void {
    if (this.cmuxMissing) {
      this.tasks.clear();
      return;
    }
    for (const key of Array.from(this.tasks.keys())) {
      this.cancelTask(key);
    }
    this.thinkingStartedAt = undefined;
  }

  /** Call once a ENOENT/not-found result is detected to permanently disable. */
  markMissing(): void {
    this.cmuxMissing = true;
    this.tasks.clear();
  }

  get missing(): boolean {
    return this.cmuxMissing;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private scheduleTask(key: string, label: string, color: string): void {
    // Cancel any existing task under this key first.
    this.cancelTask(key);

    const task: ActiveTask = {
      key,
      label,
      color,
      startedAt: Date.now(),
      timer: undefined,
      visible: false,
    };

    const thresholdMs = this.config.sidebarThresholdMs;

    if (thresholdMs <= 0) {
      // No threshold — show immediately.
      task.visible = true;
      this.tasks.set(key, task);
      void this.cmuxSetStatus(key, label, color);
    } else {
      task.timer = setTimeout(() => {
        task.timer = undefined;
        task.visible = true;
        void this.cmuxSetStatus(key, label, color);
      }, thresholdMs);
      this.tasks.set(key, task);
    }
  }

  private cancelTask(key: string): void {
    const task = this.tasks.get(key);
    if (!task) return;
    if (task.timer !== undefined) {
      clearTimeout(task.timer);
    }
    this.tasks.delete(key);
    if (task.visible) {
      void this.cmuxClearStatus(key);
    }
  }

  private async cmuxSetStatus(key: string, label: string, color: string): Promise<void> {
    if (this.cmuxMissing) return;
    const result = await this.exec(
      this.config.cmuxBinary,
      ["set-status", key, label, "--color", color],
      { timeout: EXEC_TIMEOUT_MS },
    );
    this.handleResult(result);
  }

  private async cmuxClearStatus(key: string): Promise<void> {
    if (this.cmuxMissing) return;
    const result = await this.exec(
      this.config.cmuxBinary,
      ["clear-status", key],
      { timeout: EXEC_TIMEOUT_MS },
    );
    this.handleResult(result);
  }

  private async cmuxLog(
    level: "info" | "progress" | "success" | "warning" | "error",
    source: string,
    message: string,
  ): Promise<void> {
    if (this.cmuxMissing) return;
    const result = await this.exec(
      this.config.cmuxBinary,
      ["log", "--level", level, "--source", source, message],
      { timeout: EXEC_TIMEOUT_MS },
    );
    this.handleResult(result);
  }

  private handleResult(result: ExecResult): void {
    if (result.killed) return;
    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      if (stderr.includes("not found") || stderr.includes("ENOENT")) {
        this.markMissing();
      }
    }
  }
}
