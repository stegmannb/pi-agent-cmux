/**
 * Immutable run statistics collected during a single agent turn.
 * Each tool result produces a new RunStats value — no mutation.
 */

import {
  isBashToolResult,
  isEditToolResult,
  isFindToolResult,
  isGrepToolResult,
  isReadToolResult,
  isWriteToolResult,
  type ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunStats {
  readonly startedAt: number;
  readonly changedFiles: ReadonlySet<string>;
  readonly readFiles: ReadonlySet<string>;
  readonly bashCount: number;
  readonly searchCount: number;
  /** Description of the first tool error that occurred, if any. */
  readonly firstError: string | undefined;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

export function emptyStats(): RunStats {
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
// Helpers
// ---------------------------------------------------------------------------

function filePath(event: ToolResultEvent): string | undefined {
  const p = event.input["path"];
  return typeof p === "string" && p.length > 0 ? p : undefined;
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

function describeToolError(event: ToolResultEvent): string {
  const p = filePath(event);
  if (p) return truncate(`${event.toolName} failed for ${basename(p)}`);
  if (isBashToolResult(event)) return "bash command failed";
  const text = event.content.find((c) => c.type === "text");
  const raw = text?.type === "text" ? text.text.trim() : "";
  return truncate(raw || `${event.toolName} failed`);
}

function addToSet<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  return new Set([...set, value]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns an updated RunStats after processing a tool result. Pure function. */
export function applyToolResult(stats: RunStats, event: ToolResultEvent): RunStats {
  const firstError = stats.firstError ?? (event.isError ? describeToolError(event) : undefined);
  const base = { ...stats, firstError };
  const p = filePath(event);

  if (isReadToolResult(event)) {
    return p ? { ...base, readFiles: addToSet(base.readFiles, p) } : base;
  }

  if ((isEditToolResult(event) || isWriteToolResult(event)) && !event.isError) {
    return p ? { ...base, changedFiles: addToSet(base.changedFiles, p) } : base;
  }

  if ((isGrepToolResult(event) || isFindToolResult(event)) && !event.isError) {
    return { ...base, searchCount: base.searchCount + 1 };
  }

  if (isBashToolResult(event) && !event.isError) {
    return { ...base, bashCount: base.bashCount + 1 };
  }

  return base;
}
