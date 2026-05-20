import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPacket } from "./normalize.mjs";

const ctx = { website: "https://app.example.test/swap", protocol: "Example", chainIdHex: "0xf22f" };

test("native transfer with no data → sign", () => {
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), value: "0x16345785d8a0000" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "sign");
  assert.equal(packet.website, ctx.website);
  assert.match(packet.summary, /sign via Example/);
  assert.equal(packet.assetValueUsd, 0);
  assert.equal(packet.gasCostUsd, 0);
});

test("erc20 approve → approve", () => {
  const data = "0x095ea7b3" + "0".repeat(64) + "0".repeat(64);
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data, value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "approve");
  assert.match(packet.summary, /approve via Example/);
});

test("contract creation (no `to`)", () => {
  const params = { from: "0xaa".padEnd(42, "a"), data: "0x6080604052", value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "sign");
  assert.match(packet.summary, /contract deployment/);
});

test("calldata shorter than 4 bytes", () => {
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data: "0x12", value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "sign");
  assert.match(packet.rawSignals, /selector=0x/);
});

test("oversize calldata is truncated and tagged", () => {
  const huge = "0x" + "ab".repeat(33_000);
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data: huge, value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.match(packet.summary, /oversize calldata/);
  assert.ok(packet.rawSignals.length < 1024, "rawSignals must be capped");
});

test("missing from rejects", () => {
  assert.throws(() => buildPacket({ to: "0xbb".padEnd(42, "b"), value: "0x0" }, ctx), /from/);
});

test("known bridge selector → bridge", () => {
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data: "0xeb672419", value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "bridge");
});
