import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { buildNotification, isNotifiable } from "./notify.ts";
import { CmuxSidebar } from "./sidebar.ts";
import { applyToolResult, emptyStats } from "./tracker.ts";
import type { RunStats } from "./tracker.ts";

const NOTIFY_TIMEOUT_MS = 5_000;
const DEBOUNCE_MS = 3_000;

export default function (pi: ExtensionAPI): void {
  const config = loadConfig();

  let stats: RunStats = emptyStats();

  // Deduplicate identical notifications fired in quick succession.
  let lastKey = "";
  let lastAt = 0;

  // Permanently disabled once we confirm cmux is not available.
  let cmuxMissing = false;

  const sidebar = new CmuxSidebar(pi.exec.bind(pi), config);

  async function sendNotification(subtitle: string, body: string): Promise<void> {
    if (cmuxMissing) return;

    const key = `${subtitle}\n${body}`;
    const now = Date.now();
    if (key === lastKey && now - lastAt < DEBOUNCE_MS) return;

    const result = await pi.exec(
      config.cmuxBinary,
      ["notify", "--title", config.title, "--subtitle", subtitle, "--body", body],
      { timeout: NOTIFY_TIMEOUT_MS },
    );

    if (result.killed) return;

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      if (stderr.includes("not found") || stderr.includes("ENOENT")) {
        cmuxMissing = true;
        sidebar.markMissing();
      }
      return;
    }

    lastKey = key;
    lastAt = now;
  }

  pi.on("agent_start", () => {
    stats = emptyStats();
    sidebar.clearAll();
  });

  pi.on("message_start", () => {
    sidebar.startMessage();
  });

  pi.on("message_update", (event) => {
    if (event.assistantMessageEvent.type === "thinking_start") {
      sidebar.upgradeToThinking();
    }
  });

  pi.on("message_end", () => {
    sidebar.stopMessage();
  });

  pi.on("tool_execution_start", (event) => {
    sidebar.startTool(event.toolCallId, event.toolName, event.args as Record<string, unknown>);
  });

  pi.on("tool_execution_end", (event) => {
    sidebar.stopTool(event.toolCallId, event.toolName);
  });

  pi.on("turn_end", () => {
    sidebar.clearAll();
  });

  pi.on("tool_result", (event) => {
    stats = applyToolResult(stats, event);
  });

  pi.on("agent_end", async (event) => {
    sidebar.clearAll();
    const notification = buildNotification(stats, event.messages, config);
    if (!isNotifiable(config.notifyLevel, notification.subtitle)) return;
    await sendNotification(notification.subtitle, notification.body);
  });
}
