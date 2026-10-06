import assert from "node:assert/strict";
import { test } from "node:test";
import { isNotifiable } from "./notify.ts";

test("disabled notifications suppress failures and completion", () => {
  assert.equal(isNotifiable("disabled", "Error"), false);
  assert.equal(isNotifiable("disabled", "Task Complete"), false);
});

test("quiet notification levels preserve errors", () => {
  assert.equal(isNotifiable("low", "Error"), true);
  assert.equal(isNotifiable("low", "Waiting"), false);
  assert.equal(isNotifiable("medium", "Task Complete"), true);
  assert.equal(isNotifiable("medium", "Waiting"), false);
});
