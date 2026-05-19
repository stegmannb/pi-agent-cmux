/**
 * Pure functions for building cmux notification content.
 * No side effects — all inputs are explicit parameters.
 */

import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";
import type { Config, NotifyLevel } from "./config.ts";
import type { RunStats } from "./tracker.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Subtitle = "Task Complete" | "Waiting" | "Error";

export interface Notification {
  readonly subtitle: Subtitle;
  readonly body: string;
}

// ---------------------------------------------------------------------------
// Notify level filter
// ---------------------------------------------------------------------------

export function isNotifiable(level: NotifyLevel, subtitle: Subtitle): boolean {
  switch (level) {
    case "disabled":
      return false;
    case "all":
      return true;
    case "medium":
      return subtitle !== "Waiting";
    case "low":
      return subtitle === "Error";
  }
}

// ---------------------------------------------------------------------------
// Body builders
// ---------------------------------------------------------------------------

function plural(n: number, word: string, pluralForm = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralForm}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${totalSeconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function withDuration(text: string, durationMs: number, thresholdMs: number): string {
  return durationMs >= thresholdMs ? `${text} in ${formatDuration(durationMs)}` : text;
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

function buildSuccessBody(stats: RunStats, durationMs: number, thresholdMs: number): string {
  const { changedFiles, readFiles, bashCount, searchCount } = stats;

  if (changedFiles.size === 1) {
    const [file] = changedFiles;
    return withDuration(`Updated ${basename(file!)}`, durationMs, thresholdMs);
  }
  if (changedFiles.size > 1) {
    return withDuration(`Updated ${plural(changedFiles.size, "file")}`, durationMs, thresholdMs);
  }
  if (readFiles.size === 1) {
    const [file] = readFiles;
    return withDuration(`Reviewed ${basename(file!)}`, durationMs, thresholdMs);
  }
  if (readFiles.size > 1) {
    return withDuration(`Reviewed ${plural(readFiles.size, "file")}`, durationMs, thresholdMs);
  }
  if (searchCount > 0 && bashCount > 0) {
    const searches = plural(searchCount, "search", "searches");
    const commands = plural(bashCount, "shell command");
    return withDuration(`Ran ${searches} and ${commands}`, durationMs, thresholdMs);
  }
  if (searchCount > 0) {
    const text =
      searchCount === 1
        ? "Searched the codebase"
        : `Ran ${plural(searchCount, "search", "searches")}`;
    return withDuration(text, durationMs, thresholdMs);
  }
  if (bashCount > 0) {
    return withDuration(`Ran ${plural(bashCount, "shell command")}`, durationMs, thresholdMs);
  }
  return durationMs >= thresholdMs
    ? `Finished in ${formatDuration(durationMs)}`
    : "Finished and waiting for input";
}

// ---------------------------------------------------------------------------
// Run error extractor
// ---------------------------------------------------------------------------

/**
 * Returns the error message from the last assistant message if the run ended
 * with stopReason "error" or "aborted", otherwise undefined.
 */
function extractRunError(messages: AgentEndEvent["messages"]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as unknown as Record<string, unknown>;
    if (m["role"] !== "assistant") continue;
    const stopReason = m["stopReason"];
    if (stopReason !== "error" && stopReason !== "aborted") return undefined;
    const msg = typeof m["errorMessage"] === "string" ? m["errorMessage"].trim() : undefined;
    return msg || undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildNotification(
  stats: RunStats,
  messages: AgentEndEvent["messages"],
  config: Config,
): Notification {
  const durationMs = Date.now() - stats.startedAt;
  const runError = extractRunError(messages) ?? stats.firstError;

  if (runError) {
    return { subtitle: "Error", body: truncate(runError) };
  }

  const subtitle: Subtitle =
    stats.changedFiles.size > 0 || durationMs >= config.thresholdMs ? "Task Complete" : "Waiting";

  return { subtitle, body: buildSuccessBody(stats, durationMs, config.thresholdMs) };
}
