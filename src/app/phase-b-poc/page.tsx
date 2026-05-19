"use client";

import { useState } from "react";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";

export default function PhaseBPoC() {
  const [output, setOutput] = useState<string>("Idle.");

  async function attemptRead() {
    setOutput("Running read...");
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No window.ethereum (install MetaMask).");
      }
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as Address[];
      const account = accounts[0];
      if (!account) throw new Error("Wallet returned no account.");

      const client = createClient({
        account,
        chain: studionet,
        provider: window.ethereum as never,
      });

      const overview = await client.readContract({
        address: process.env.NEXT_PUBLIC_PHASE_B_CONTRACT as Address,
        functionName: "get_overview",
        args: [],
      });

      setOutput(`READ OK: ${JSON.stringify(overview)}`);
    } catch (error) {
      setOutput(
        error instanceof Error
          ? `READ ERROR: ${error.message}`
          : String(error),
      );
    }
  }

  async function attemptWrite() {
    setOutput("Running write...");
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No window.ethereum (install MetaMask).");
      }
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as Address[];
      const account = accounts[0];
      if (!account) throw new Error("Wallet returned no account.");

      const client = createClient({
        account,
        chain: studionet,
        provider: window.ethereum as never,
      });

      const txHash = await client.writeContract({
        address: process.env.NEXT_PUBLIC_PHASE_B_CONTRACT as Address,
        functionName: "submit_action_check",
        args: [
          "approve",
          "PhaseBPoC",
          "https://example.test",
          "Phase B feasibility write probe.",
          "User-signed via MetaMask.",
        ],
        value: BigInt(0),
      });

      setOutput(`WRITE OK: ${txHash}`);
    } catch (error) {
      setOutput(
        error instanceof Error
          ? `WRITE ERROR: ${error.message}`
          : String(error),
      );
    }
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Phase B Feasibility PoC</h1>
      <p>Tests user-signed reads/writes against the Phase A contract.</p>
      <button onClick={attemptRead} type="button">
        Attempt user-signed read
      </button>{" "}
      <button onClick={attemptWrite} type="button">
        Attempt user-signed write
      </button>
      <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>{output}</pre>
    </main>
  );
}
