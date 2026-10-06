import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "./config.ts";

test("invalid configuration values retain safe defaults", () => {
  const directory = mkdtempSync(join(tmpdir(), "cmux-config-"));
  const original = process.env["PI_CODING_AGENT_DIR"];
  try {
    process.env["PI_CODING_AGENT_DIR"] = directory;
    writeFileSync(
      join(directory, "settings.json"),
      JSON.stringify({
        cmux: {
          notifyLevel: "unknown",
          thresholdMs: -1,
          sidebarThresholdMs: "soon",
          title: "   ",
        },
      }),
    );
    const config = loadConfig();
    assert.equal(config.notifyLevel, "all");
    assert.equal(config.thresholdMs, 15000);
    assert.equal(config.sidebarThresholdMs, 2000);
    assert.equal(config.title, "Pi");
    writeFileSync(join(directory, "settings.json"), "broken JSON");
    assert.equal(loadConfig().notifyLevel, "all");
  } finally {
    if (original === undefined) delete process.env["PI_CODING_AGENT_DIR"];
    else process.env["PI_CODING_AGENT_DIR"] = original;
    rmSync(directory, { recursive: true, force: true });
  }
});
