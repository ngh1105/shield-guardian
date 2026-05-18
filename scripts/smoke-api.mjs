const apiBaseUrl = process.env.SHIELD_API_BASE_URL || "http://localhost:3000";
const demoMode = process.env.SHIELD_SMOKE_DEMO_MODE !== "0";
const endpoint = new URL("/api/verdict", apiBaseUrl).href;

const packets = [
  {
    expected: "SAFE",
    request: {
      actionType: "approve",
      protocol: "Uniswap",
      website: "https://app.uniswap.org",
      summary: "Approve WETH to Uniswap router for a 240 USD swap.",
      rawSignals: "Exact spender is visible, router path is standard, no custom route.",
      assetValueUsd: 240,
      gasCostUsd: 3.5,
    },
  },
  {
    expected: "WEIRD",
    request: {
      actionType: "bridge",
      protocol: "Unknown bridge",
      website: "https://bridge-preview.app",
      summary: "Bridge ETH from Base to Arbitrum through a custom route shared in Discord.",
      rawSignals: "Experimental route, low liquidity, beta status, manual route.",
      assetValueUsd: 500,
      gasCostUsd: 9,
    },
  },
  {
    expected: "DANGEROUS",
    request: {
      actionType: "claim",
      protocol: "Retrodrop portal",
      website: "https://claim-now-bonus.xyz",
      summary: "Claim bonus retrodrop and verify wallet before revealing the amount.",
      rawSignals: "Free mint, verify wallet, claim now, sync wallet, connect first.",
      assetValueUsd: 65,
      gasCostUsd: 14,
    },
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const packet of packets) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (demoMode) {
    headers["x-shield-demo-mode"] = "1";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(packet.request),
  });

  const text = await response.text();
  assert(
    response.ok,
    `API smoke failed with ${response.status} for ${packet.expected}: ${text}`,
  );

  const data = JSON.parse(text);
  const verdict = data.verdict;
  assert(verdict, `Missing verdict for ${packet.expected}.`);
  assert(
    verdict.verdict === packet.expected,
    `Expected ${packet.expected}, got ${verdict.verdict}.`,
  );
  assert(
    verdict.provenance?.source,
    `Missing provenance source for ${packet.expected}.`,
  );

  console.log(
    `${packet.expected}: ${verdict.verdict} risk=${verdict.riskScore} source=${verdict.provenance.source}`,
  );
}

if (!demoMode) {
  const overviewResponse = await fetch(new URL("/api/overview", apiBaseUrl));
  assert(
    overviewResponse.ok,
    `Overview smoke failed with ${overviewResponse.status}`,
  );
  const overviewData = await overviewResponse.json();
  const overview = overviewData.overview;
  assert(overview, "Missing overview in response.");
  for (const key of [
    "current_epoch",
    "check_count",
    "safe",
    "weird",
    "dangerous",
  ]) {
    assert(
      typeof overview[key] === "number",
      `Overview field ${key} is not a number.`,
    );
  }
  console.log(
    `OVERVIEW: count=${overview.check_count} safe=${overview.safe} weird=${overview.weird} dangerous=${overview.dangerous}`,
  );
}

console.log(`API smoke passed against ${endpoint}.`);
