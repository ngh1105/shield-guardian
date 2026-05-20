import { test } from "node:test";
import assert from "node:assert/strict";

import { actionTypeForSelector, SELECTORS } from "./selectors.mjs";

test("approve maps to approve", () => {
  assert.equal(actionTypeForSelector("0x095ea7b3"), "approve");
});

test("transfer maps to sign", () => {
  assert.equal(actionTypeForSelector("0xa9059cbb"), "sign");
});

test("transferFrom maps to sign", () => {
  assert.equal(actionTypeForSelector("0x23b872dd"), "sign");
});

test("unknown selector falls back to sign", () => {
  assert.equal(actionTypeForSelector("0xdeadbeef"), "sign");
});

test("at least one bridge and one claim selector are present", () => {
  const values = Object.values(SELECTORS);
  assert.ok(values.includes("bridge"), "expected at least one bridge selector");
  assert.ok(values.includes("claim"), "expected at least one claim selector");
});

test("all selectors are 10-char 0x-hex lowercase", () => {
  for (const sel of Object.keys(SELECTORS)) {
    assert.match(sel, /^0x[0-9a-f]{8}$/, `bad selector format: ${sel}`);
  }
});
