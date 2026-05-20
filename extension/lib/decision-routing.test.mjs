// extension/lib/decision-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { pendingToSendTarget, validateDecisionChoice } from "./decision-routing.mjs";

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
