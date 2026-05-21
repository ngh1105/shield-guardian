import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeExecutionResult,
  getExecutionResultLabel,
  isFinishedWithReturn,
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

test("getExecutionResultLabel reads string txExecutionResultName", () => {
  assert.equal(
    getExecutionResultLabel({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    "FINISHED_WITH_RETURN",
  );
});

test("getExecutionResultLabel falls back to numeric txExecutionResult", () => {
  assert.equal(getExecutionResultLabel({ txExecutionResult: 1 }), "FINISHED_WITH_RETURN");
  assert.equal(getExecutionResultLabel({ txExecutionResult: 2 }), "FINISHED_WITH_ERROR");
  assert.equal(getExecutionResultLabel({ txExecutionResult: 0 }), "NOT_VOTED");
});

test("getExecutionResultLabel prefers string name when both are present", () => {
  assert.equal(
    getExecutionResultLabel({
      txExecutionResultName: "FINISHED_WITH_RETURN",
      txExecutionResult: 2,
    }),
    "FINISHED_WITH_RETURN",
  );
});

test("getExecutionResultLabel returns undefined for empty receipt", () => {
  assert.equal(getExecutionResultLabel({}), undefined);
  assert.equal(getExecutionResultLabel(null), undefined);
});

test("isFinishedWithReturn accepts numeric txExecutionResult=1", () => {
  assert.equal(isFinishedWithReturn({ txExecutionResult: 1 }), true);
});

test("isFinishedWithReturn rejects FINISHED_WITH_ERROR via either form", () => {
  assert.equal(isFinishedWithReturn({ txExecutionResultName: "FINISHED_WITH_ERROR" }), false);
  assert.equal(isFinishedWithReturn({ txExecutionResult: 2 }), false);
});

test("describeExecutionResult includes numeric code when only number is present", () => {
  assert.equal(describeExecutionResult({ txExecutionResult: 1 }), "unknown (code 1)");
});

test("describeExecutionResult prefers string name", () => {
  assert.equal(
    describeExecutionResult({
      txExecutionResultName: "FINISHED_WITH_RETURN",
      txExecutionResult: 1,
    }),
    "FINISHED_WITH_RETURN (code 1)",
  );
});

test("describeExecutionResult returns 'unknown' for empty receipt", () => {
  assert.equal(describeExecutionResult({}), "unknown");
});
