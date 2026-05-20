import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseLeaderReceiptResult,
  parseReturnedCheckId,
} from "./browser-sdk-helpers.mjs";

test("parseLeaderReceiptResult returns string result as-is", () => {
  assert.equal(parseLeaderReceiptResult("42"), "42");
});

test("parseLeaderReceiptResult unwraps payload.readable", () => {
  assert.equal(parseLeaderReceiptResult({ payload: { readable: "17" } }), "17");
});

test("parseLeaderReceiptResult returns undefined for missing payload", () => {
  assert.equal(parseLeaderReceiptResult({ payload: {} }), undefined);
});

test("parseLeaderReceiptResult returns undefined for null", () => {
  assert.equal(parseLeaderReceiptResult(undefined), undefined);
});

test("parseReturnedCheckId reads first non-empty leader receipt readable", () => {
  const receipt = {
    hash: "0xabc",
    consensus_data: {
      leader_receipt: [
        { result: { payload: { readable: "5" } } },
      ],
    },
  };
  assert.equal(parseReturnedCheckId(receipt), 5);
});

test("parseReturnedCheckId returns null when readable is not numeric", () => {
  const receipt = {
    hash: "0xabc",
    consensus_data: {
      leader_receipt: [{ result: { payload: { readable: "not-a-number" } } }],
    },
  };
  assert.equal(parseReturnedCheckId(receipt), null);
});

test("parseReturnedCheckId returns null for non-positive integers", () => {
  const receipt = {
    hash: "0xabc",
    consensus_data: {
      leader_receipt: [{ result: { payload: { readable: "0" } } }],
    },
  };
  assert.equal(parseReturnedCheckId(receipt), null);
});

test("parseReturnedCheckId returns null when leader_receipt is missing", () => {
  assert.equal(parseReturnedCheckId({ hash: "0xabc" }), null);
});

test("parseReturnedCheckId returns null when leader_receipt is empty array", () => {
  assert.equal(
    parseReturnedCheckId({ hash: "0xabc", consensus_data: { leader_receipt: [] } }),
    null,
  );
});
