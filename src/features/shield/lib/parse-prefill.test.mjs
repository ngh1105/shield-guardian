// src/features/shield/lib/parse-prefill.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePrefill } from "./parse-prefill.mjs";

function encode(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("returns null for missing or empty input", () => {
  assert.equal(parsePrefill(null), null);
  assert.equal(parsePrefill(""), null);
});

test("returns null for invalid base64url", () => {
  assert.equal(parsePrefill("!@#$"), null);
});

test("returns null for non-object JSON", () => {
  const encoded = Buffer.from("\"hi\"", "utf8").toString("base64").replace(/=+$/, "");
  assert.equal(parsePrefill(encoded), null);
});

test("returns null when actionType is unsupported", () => {
  const encoded = encode({ actionType: "destroy", website: "https://x.test" });
  assert.equal(parsePrefill(encoded), null);
});

test("normalizes a valid packet to ShieldFormState", () => {
  const encoded = encode({
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: 240,
    gasCostUsd: 3.5,
  });
  const result = parsePrefill(encoded);
  assert.deepEqual(result, {
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: "240",
    gasCostUsd: "3.5",
  });
});

test("returns null when payload exceeds 4 KiB", () => {
  const big = encode({ actionType: "sign", website: "https://x.test", summary: "x".repeat(8000) });
  assert.equal(parsePrefill(big), null);
});
