/**
 * Configuration loaded from the `cmux` key in pi's settings.json.
 *
 * Example settings.json:
 * ```json
 * {
 *   "cmux": {
 *     "notifyLevel": "medium",
 *     "thresholdMs": 10000,
 *     "title": "Pi"
 *   }
 * }
 * ```
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotifyLevel = "all" | "medium" | "low" | "disabled";

export interface Config {
  readonly notifyLevel: NotifyLevel;
  /** Duration in ms above which elapsed time is appended to the body. */
  readonly thresholdMs: number;
  /** Notification title shown in the cmux notification. */
  readonly title: string;
  /** Path to the cmux binary — set via CMUX_BINARY env var. */
  readonly cmuxBinary: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  notifyLevel: "all",
  thresholdMs: 15_000,
  title: "Pi",
  cmuxBinary: "cmux",
} satisfies Config;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const NOTIFY_LEVELS: readonly NotifyLevel[] = ["all", "medium", "low", "disabled"];

function isNotifyLevel(v: unknown): v is NotifyLevel {
  return NOTIFY_LEVELS.includes(v as NotifyLevel);
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Settings file reader
// ---------------------------------------------------------------------------

function readCmuxSettings(): Record<string, unknown> {
  const agentDir = process.env["PI_CODING_AGENT_DIR"] ?? path.join(os.homedir(), ".pi", "agent");
  const settingsPath = path.join(agentDir, "settings.json");

  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as unknown;
    if (typeof raw !== "object" || raw === null) return {};
    const cmux = (raw as Record<string, unknown>)["cmux"];
    if (typeof cmux !== "object" || cmux === null) return {};
    return cmux as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadConfig(): Config {
  const s = readCmuxSettings();

  return {
    notifyLevel: isNotifyLevel(s["notifyLevel"]) ? s["notifyLevel"] : DEFAULTS.notifyLevel,
    thresholdMs: isPositiveNumber(s["thresholdMs"]) ? s["thresholdMs"] : DEFAULTS.thresholdMs,
    title: isNonEmptyString(s["title"]) ? s["title"] : DEFAULTS.title,
    cmuxBinary: isNonEmptyString(process.env["CMUX_BINARY"])
      ? (process.env["CMUX_BINARY"] as string)
      : DEFAULTS.cmuxBinary,
  };
}
