// Programmatic EIP-1193 provider probe for Phase B feasibility.
// Wraps a viem LocalAccount behind a window.ethereum-shaped object,
// then drives genlayer-js' provider-mode createClient (the path Phase B
// would use with MetaMask in the browser) against studionet.

import { readFileSync } from "node:fs";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  createWalletClient,
  http,
  hexToBytes,
  toHex,
} from "viem";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const eq = line.indexOf("=");
      return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
    }),
);

const RPC_URL = env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const RAW_KEY = env.GENLAYER_PRIVATE_KEY;
const CONTRACT = env.GENLAYER_CONTRACT_ADDRESS;

if (!RAW_KEY) throw new Error("GENLAYER_PRIVATE_KEY missing");
if (!CONTRACT) throw new Error("GENLAYER_CONTRACT_ADDRESS missing");

const PRIVATE_KEY = /^0x/.test(RAW_KEY) ? RAW_KEY : `0x${RAW_KEY}`;

const account = privateKeyToAccount(PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: studionet,
  transport: http(RPC_URL),
});

const calls = [];

const fakeProvider = {
  async request({ method, params }) {
    calls.push({ method, paramsLen: Array.isArray(params) ? params.length : 0 });
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return toHex(studionet.id);
      case "eth_sendTransaction": {
        const tx = params[0];
        return walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
      }
      case "eth_signTransaction": {
        const tx = params[0];
        return walletClient.signTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : 0n,
        });
      }
      case "personal_sign": {
        const messageHex = params[0];
        return walletClient.signMessage({
          message: { raw: hexToBytes(messageHex) },
        });
      }
      case "eth_signTypedData_v4":
        return walletClient.signTypedData(JSON.parse(params[1]));
      default:
        throw new Error(`Unhandled method: ${method}`);
    }
  },
};

const client = createClient({
  account: account.address,
  chain: studionet,
  provider: fakeProvider,
});

console.log(`[probe] account=${account.address}`);
console.log(`[probe] contract=${CONTRACT}`);
console.log(`[probe] chain id=${studionet.id} rpc=${RPC_URL}`);

console.log("\n[probe] === READ get_overview ===");
try {
  const overview = await client.readContract({
    address: CONTRACT,
    functionName: "get_overview",
    args: [],
  });
  console.log("READ OK:", JSON.stringify(overview, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ));
} catch (error) {
  console.log("READ ERROR:", error?.message ?? error);
}

console.log("\n[probe] === WRITE submit_action_check ===");
try {
  const txHash = await client.writeContract({
    address: CONTRACT,
    functionName: "submit_action_check",
    args: [
      "approve",
      "PhaseBProbe",
      "https://example.test",
      "Phase B feasibility write probe (Node EIP-1193 fake).",
      "User-signed code path probe.",
    ],
    value: 0n,
  });
  console.log("WRITE OK txHash:", txHash);
} catch (error) {
  console.log("WRITE ERROR:", error?.message ?? error);
}

console.log("\n[probe] === RPC methods invoked ===");
for (const { method, paramsLen } of calls) {
  console.log(`  ${method} (params=${paramsLen})`);
}
