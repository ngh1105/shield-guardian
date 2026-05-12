import { spawn } from "node:child_process";
import path from "node:path";

const port = Number(process.env.SHIELD_DEMO_SMOKE_PORT || 3108);
const apiBaseUrl = `http://localhost:${port}`;
const endpoint = new URL("/api/verdict", apiBaseUrl).href;
const nextBinPath = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(apiBaseUrl);
      if (response.status < 500) {
        return;
      }
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Server did not become ready at ${apiBaseUrl}.`);
}

async function smokePackets() {
  for (const packet of packets) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shield-demo-mode": "1",
      },
      body: JSON.stringify(packet.request),
    });
    const text = await response.text();

    assert(
      response.ok,
      `API returned ${response.status} for ${packet.expected}: ${text}`,
    );

    const data = JSON.parse(text);
    const verdict = data.verdict;
    assert(verdict, `Missing verdict for ${packet.expected}.`);
    assert(
      verdict.verdict === packet.expected,
      `Expected ${packet.expected}, got ${verdict.verdict}.`,
    );
    assert(
      verdict.provenance?.source === "mock",
      `Expected mock provenance for ${packet.expected}.`,
    );

    console.log(
      `${packet.expected}: risk=${verdict.riskScore} confidence=${verdict.confidence} source=${verdict.provenance.source}`,
    );
  }
}

async function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("close", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

const server = spawn(process.execPath, [nextBinPath, "start", "--port", String(port)], {
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    SHIELD_ENABLE_DEMO_MODE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const output = [];
server.stdout.on("data", (chunk) => output.push(chunk.toString()));
server.stderr.on("data", (chunk) => output.push(chunk.toString()));

try {
  await waitForServer();
  await smokePackets();
  console.log(`Demo smoke passed against ${endpoint}.`);
} catch (error) {
  console.error(output.join(""));
  throw error;
} finally {
  await stopServer(server);
}
