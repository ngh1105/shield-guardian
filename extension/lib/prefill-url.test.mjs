// extension/lib/prefill-url.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPrefillUrl } from "./prefill-url.js";

test("encodes the packet as base64url JSON in ?prefill=", () => {
  const url = buildPrefillUrl({
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: 0,
    gasCostUsd: 0,
  }, "http://localhost:3000");

  const parsed = new URL(url);
  assert.equal(parsed.origin, "http://localhost:3000");
  assert.ok(parsed.searchParams.get("prefill"), "prefill param missing");
});

test("decoded payload round-trips", () => {
  const packet = {
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: 0,
    gasCostUsd: 0,
  };
  const url = buildPrefillUrl(packet, "http://localhost:3000");
  const param = new URL(url).searchParams.get("prefill");
  const padded = param + "=".repeat((4 - (param.length % 4)) % 4);
  const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const decoded = JSON.parse(json);
  assert.deepEqual(decoded, packet);
});

test("returns base URL only when payload would exceed 4 KiB", () => {
  const oversized = "x".repeat(8000);
  const url = buildPrefillUrl({ summary: oversized }, "http://localhost:3000");
  assert.equal(url, "http://localhost:3000/");
});
