/**
 * subagent-sidebar.ts — Tracks subagent lifecycle events and surfaces them
 * as cmux status pills, log entries, and desktop notifications.
 *
 * Listens for events emitted by pi-agent-subagents:
 *   subagents:started   → status pill + log
 *   subagents:completed → clear pill, success log, notification
 *   subagents:failed    → clear pill, error log, notification
 */

import type { ExecResult } from "@mariozechner/pi-coding-agent";
import type { Config } from "./config.ts";

type Exec = (
  bin: string,
  args: string[],
  opts?: { timeout?: number },
) => Promise<ExecResult>;

type Events = {
  on(event: string, handler: (payload: any) => void): () => void;
};

interface SubagentEvent {
  id: string;
  type: string;
  description: string;
  status?: string;
  error?: string;
  toolUses?: number;
  durationMs?: number;
  tokens?: { total: number };
}

const EXEC_TIMEOUT_MS = 3_000;

function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1_000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s}s`;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

export class SubagentSidebar {
  private readonly exec: Exec;
  private readonly config: Config;
  private readonly unsubscribers: (() => void)[] = [];
  private cmuxMissing = false;
  private readonly runningAgents = new Map<
    string,
    { description: string; type: string; startedAt: number }
  >();

  /** Namespaced key for the aggregated subagent status pill. */
  private readonly statusKey: string;

  constructor(
    exec: Exec,
    config: Config,
    private readonly sendNotification: (
      subtitle: string,
      body: string,
    ) => Promise<void>,
  ) {
    this.exec = exec;
    this.config = config;
    // Unique instance ID to avoid collisions with other pi instances.
    const instanceId = Math.random().toString(36).slice(2, 6);
    this.statusKey = `pi-agents-${instanceId}`;
  }

  /**
   * Subscribe to pi-agent-subagents lifecycle events.
   * Call once during extension init.
   */
  bind(events: Events): void {
    this.unsubscribers.push(
      events.on("subagents:started", (e: SubagentEvent) =>
        this.onStarted(e),
      ),
      events.on("subagents:completed", (e: SubagentEvent) =>
        this.onCompleted(e),
      ),
      events.on("subagents:failed", (e: SubagentEvent) =>
        this.onFailed(e),
      ),
    );
  }

  /** Clean up event subscriptions. */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    }
    this.unsubscribers.length = 0;
    this.runningAgents.clear();
    void this.cmuxClearStatus(this.statusKey);
  }

  markMissing(): void {
    this.cmuxMissing = true;
  }

  // ---- Event handlers ----

  private onStarted(e: SubagentEvent): void {
    if (!this.config.sidebarEnabled) return;

    this.runningAgents.set(e.id, {
      description: e.description,
      type: e.type,
      startedAt: Date.now(),
    });

    this.updateStatusPill();
    void this.cmuxLog(
      "progress",
      "agent",
      `▸ ${e.description} (${e.type})`,
    );
  }

  private onCompleted(e: SubagentEvent): void {
    const info = this.runningAgents.get(e.id);
    this.runningAgents.delete(e.id);
    this.updateStatusPill();

    const duration = e.durationMs
      ? formatDuration(e.durationMs)
      : info
        ? formatDuration(Date.now() - info.startedAt)
        : "";
    const desc = info?.description ?? e.description;
    const durationSuffix = duration ? ` (${duration})` : "";

    void this.cmuxLog("success", "agent", `✓ ${desc}${durationSuffix}`);
    void this.sendNotification(
      "✓ Agent Done",
      `${desc}${durationSuffix}`,
    );
  }

  private onFailed(e: SubagentEvent): void {
    const info = this.runningAgents.get(e.id);
    this.runningAgents.delete(e.id);
    this.updateStatusPill();

    const desc = info?.description ?? e.description;
    const errorMsg = e.error ? `: ${e.error.slice(0, 60)}` : "";

    void this.cmuxLog("error", "agent", `✗ ${desc}${errorMsg}`);
    void this.sendNotification("✗ Agent Failed", `${desc}${errorMsg}`);
  }

  // ---- Sidebar helpers ----

  private updateStatusPill(): void {
    const count = this.runningAgents.size;
    if (count === 0) {
      void this.cmuxClearStatus(this.statusKey);
    } else {
      const label = `🤖 ${count} agent${count === 1 ? "" : "s"}`;
      void this.cmuxSetStatus(this.statusKey, label, "#3b82f6");
    }
  }

  private async cmuxSetStatus(
    key: string,
    label: string,
    color: string,
  ): Promise<void> {
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
