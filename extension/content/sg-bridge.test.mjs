import { test } from "node:test";
import assert from "node:assert/strict";

import { isAcceptableMessage, MESSAGE_TYPES, buildOverlayDecisionResponse } from "./sg-bridge-core.mjs";

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

test("buildOverlayDecisionResponse rejects null", () => {
  assert.equal(buildOverlayDecisionResponse(null), null);
});

test("buildOverlayDecisionResponse rejects wrong message type", () => {
  assert.equal(
    buildOverlayDecisionResponse({ type: "SOME_OTHER", nonce: "n", choice: "proceed" }),
    null,
  );
});

test("buildOverlayDecisionResponse rejects missing nonce", () => {
  assert.equal(
    buildOverlayDecisionResponse({ type: "SHIELD_OVERLAY_DECISION", choice: "proceed" }),
    null,
  );
});

test("buildOverlayDecisionResponse rejects empty-string nonce", () => {
  assert.equal(
    buildOverlayDecisionResponse({ type: "SHIELD_OVERLAY_DECISION", nonce: "", choice: "proceed" }),
    null,
  );
});

test("buildOverlayDecisionResponse rejects non-string nonce", () => {
  assert.equal(
    buildOverlayDecisionResponse({ type: "SHIELD_OVERLAY_DECISION", nonce: 42, choice: "proceed" }),
    null,
  );
});

test("buildOverlayDecisionResponse rejects missing choice", () => {
  assert.equal(
    buildOverlayDecisionResponse({ type: "SHIELD_OVERLAY_DECISION", nonce: "abc" }),
    null,
  );
});

test("buildOverlayDecisionResponse forwards proceed", () => {
  assert.deepEqual(
    buildOverlayDecisionResponse({ type: "SHIELD_OVERLAY_DECISION", nonce: "abc", choice: "proceed" }),
    { type: MESSAGE_TYPES.INTERCEPT_RES, nonce: "abc", choice: "proceed" },
  );
});

test("buildOverlayDecisionResponse forwards cancel", () => {
  assert.deepEqual(
    buildOverlayDecisionResponse({ type: "SHIELD_OVERLAY_DECISION", nonce: "xyz", choice: "cancel" }),
    { type: MESSAGE_TYPES.INTERCEPT_RES, nonce: "xyz", choice: "cancel" },
  );
});
