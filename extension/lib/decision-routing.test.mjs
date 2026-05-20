// extension/lib/decision-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pendingToSendTarget,
  resolveDecisionTarget,
  senderToSendTarget,
  validateDecisionChoice,
} from "./decision-routing.mjs";

test("validateDecisionChoice accepts proceed", () => {
  assert.equal(validateDecisionChoice("proceed"), true);
});

test("validateDecisionChoice accepts cancel", () => {
  assert.equal(validateDecisionChoice("cancel"), true);
});

test("validateDecisionChoice rejects empty string", () => {
  assert.equal(validateDecisionChoice(""), false);
});

test("validateDecisionChoice rejects undefined", () => {
  assert.equal(validateDecisionChoice(undefined), false);
});

test("validateDecisionChoice rejects unrelated string", () => {
  assert.equal(validateDecisionChoice("approve"), false);
});

test("validateDecisionChoice rejects non-string", () => {
  assert.equal(validateDecisionChoice(1), false);
  assert.equal(validateDecisionChoice(null), false);
  assert.equal(validateDecisionChoice({ choice: "proceed" }), false);
});

test("pendingToSendTarget returns null for null entry", () => {
  assert.equal(pendingToSendTarget(null), null);
});

test("pendingToSendTarget returns null for entry without tabId", () => {
  assert.equal(pendingToSendTarget({ packet: {}, verdict: null }), null);
});

test("pendingToSendTarget returns null when tabId is not a number", () => {
  assert.equal(pendingToSendTarget({ tabId: "42" }), null);
});

test("pendingToSendTarget returns {tabId} when frameId is missing", () => {
  assert.deepEqual(pendingToSendTarget({ tabId: 7 }), { tabId: 7 });
});

test("pendingToSendTarget drops non-numeric frameId", () => {
  assert.deepEqual(pendingToSendTarget({ tabId: 7, frameId: "0" }), { tabId: 7 });
});

test("pendingToSendTarget returns {tabId, frameId} when both numbers", () => {
  assert.deepEqual(pendingToSendTarget({ tabId: 7, frameId: 0 }), { tabId: 7, frameId: 0 });
});

test("pendingToSendTarget preserves nested frameId 3", () => {
  assert.deepEqual(pendingToSendTarget({ tabId: 99, frameId: 3, packet: {} }), { tabId: 99, frameId: 3 });
});

test("senderToSendTarget returns null without sender", () => {
  assert.equal(senderToSendTarget(null), null);
  assert.equal(senderToSendTarget(undefined), null);
});

test("senderToSendTarget returns null when sender.tab is missing", () => {
  assert.equal(senderToSendTarget({ frameId: 0 }), null);
});

test("senderToSendTarget returns null when tabId is not a number", () => {
  assert.equal(senderToSendTarget({ tab: { id: "12" }, frameId: 0 }), null);
});

test("senderToSendTarget keeps numeric frameId", () => {
  assert.deepEqual(
    senderToSendTarget({ tab: { id: 5 }, frameId: 0 }),
    { tabId: 5, frameId: 0 },
  );
});

test("senderToSendTarget drops non-numeric frameId", () => {
  assert.deepEqual(
    senderToSendTarget({ tab: { id: 5 }, frameId: "0" }),
    { tabId: 5 },
  );
});

test("resolveDecisionTarget prefers pending entry over sender", () => {
  assert.deepEqual(
    resolveDecisionTarget({ tabId: 7, frameId: 1 }, { tab: { id: 99 }, frameId: 9 }),
    { tabId: 7, frameId: 1 },
  );
});

test("resolveDecisionTarget falls back to sender when entry is missing", () => {
  assert.deepEqual(
    resolveDecisionTarget(null, { tab: { id: 5 }, frameId: 0 }),
    { tabId: 5, frameId: 0 },
  );
});

test("resolveDecisionTarget falls back to sender when entry has no tabId", () => {
  assert.deepEqual(
    resolveDecisionTarget({ packet: {} }, { tab: { id: 8 } }),
    { tabId: 8 },
  );
});

test("resolveDecisionTarget returns null when both miss", () => {
  assert.equal(resolveDecisionTarget(null, { frameId: 0 }), null);
  assert.equal(resolveDecisionTarget({}, null), null);
});
