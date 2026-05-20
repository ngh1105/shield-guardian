import { test } from "node:test";
import assert from "node:assert/strict";

import { isAcceptableMessage, MESSAGE_TYPES } from "./sg-bridge-core.mjs";

test("rejects messages from a different window source", () => {
  const fakeWindow = {};
  const event = { source: fakeWindow, origin: "https://example.com", data: { type: MESSAGE_TYPES.INTERCEPT_REQ } };
  assert.equal(isAcceptableMessage(event, { window: {}, origin: "https://example.com" }), false);
});

test("rejects messages from a different origin", () => {
  const win = {};
  const event = { source: win, origin: "https://attacker.test", data: { type: MESSAGE_TYPES.INTERCEPT_REQ } };
  assert.equal(isAcceptableMessage(event, { window: win, origin: "https://example.com" }), false);
});

test("rejects messages with an unknown type", () => {
  const win = {};
  const event = { source: win, origin: "https://example.com", data: { type: "SG_UNKNOWN" } };
  assert.equal(isAcceptableMessage(event, { window: win, origin: "https://example.com" }), false);
});

test("accepts a well-formed intercept request", () => {
  const win = {};
  const event = {
    source: win,
    origin: "https://example.com",
    data: { type: MESSAGE_TYPES.INTERCEPT_REQ, nonce: "abc", packet: {} },
  };
  assert.equal(isAcceptableMessage(event, { window: win, origin: "https://example.com" }), true);
});
