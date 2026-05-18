const apiBaseUrl = process.env.SHIELD_API_BASE_URL || "http://localhost:3000";
const verdictEndpoint = new URL("/api/verdict", apiBaseUrl).href;
const checksEndpoint = new URL("/api/checks", apiBaseUrl).href;
const testAddress = "0x000000000000000000000000000000000000abcd";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const submitResponse = await fetch(verdictEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    actionType: "approve",
    protocol: "Uniswap",
    website: "https://app.uniswap.org",
    summary: "Approve WETH to Uniswap router for a 240 USD swap.",
    rawSignals: "Exact spender is visible, router path is standard.",
    assetValueUsd: 240,
    gasCostUsd: 3.5,
    claimedRequester: testAddress,
  }),
});

const submitText = await submitResponse.text();
assert(
  submitResponse.ok,
  `Submit failed ${submitResponse.status}: ${submitText}`,
);
const submitData = JSON.parse(submitText);
const checkId = submitData.verdict?.provenance?.checkId;
assert(checkId, `Missing checkId in verdict provenance.`);
console.log(`Submitted check ${checkId} for ${testAddress}.`);

const checksResponse = await fetch(
  `${checksEndpoint}?address=${testAddress}&limit=10`,
);
const checksText = await checksResponse.text();
assert(
  checksResponse.ok,
  `Checks read failed ${checksResponse.status}: ${checksText}`,
);
const checksData = JSON.parse(checksText);
const found = checksData.checks?.find((entry) => entry.check_id === checkId);
assert(found, `Submitted check ${checkId} not returned for ${testAddress}.`);
assert(
  found.claimed_requester?.toLowerCase() === testAddress.toLowerCase(),
  `claimed_requester mismatch: ${found.claimed_requester}`,
);
console.log(`Round-trip OK: check ${checkId} attributed to ${testAddress}.`);
