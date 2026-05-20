"use client";

import { useState } from "react";

type ResultLogEntry = {
  label: string;
  status: "pending" | "ok" | "error";
  message: string;
  timestamp: number;
};

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const NATIVE_TRANSFER = {
  label: "Native transfer (no data)",
  build: (from: string) => ({
    from,
    to: "0x000000000000000000000000000000000000dEaD",
    value: "0x16345785d8a0000",
  }),
};

const ERC20_APPROVE = {
  label: "ERC-20 approve(spender, max)",
  build: (from: string) => ({
    from,
    to: "0x111111111111111111111111111111111111dEaD",
    data:
      "0x095ea7b3" +
      "0".repeat(24) + "2222222222222222222222222222222222222222" +
      "f".repeat(64),
    value: "0x0",
  }),
};

const UNKNOWN_SELECTOR = {
  label: "Unknown selector",
  build: (from: string) => ({
    from,
    to: "0x333333333333333333333333333333333333dEaD",
    data: "0xdeadbeef" + "00".repeat(32),
    value: "0x0",
  }),
};

const SCENARIOS = [NATIVE_TRANSFER, ERC20_APPROVE, UNKNOWN_SELECTOR] as const;

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return candidate ?? null;
}

export default function ExtensionHarnessPage() {
  const [log, setLog] = useState<ResultLogEntry[]>([]);

  if (process.env.NODE_ENV === "production") {
    return (
      <main style={{ padding: 24 }}>
        <p>This route is only available in development.</p>
      </main>
    );
  }

  function appendLog(entry: ResultLogEntry) {
    setLog((prev) => [entry, ...prev].slice(0, 20));
  }

  async function runScenario(scenario: (typeof SCENARIOS)[number]) {
    const provider = getProvider();
    if (!provider) {
      appendLog({
        label: scenario.label,
        status: "error",
        message: "window.ethereum not present.",
        timestamp: Date.now(),
      });
      return;
    }

    appendLog({ label: scenario.label, status: "pending", message: "Sending...", timestamp: Date.now() });

    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts[0];
      if (!from) throw new Error("no account");
      const params = scenario.build(from);
      const result = await provider.request({ method: "eth_sendTransaction", params: [params] });
      appendLog({
        label: scenario.label,
        status: "ok",
        message: `Resolved: ${String(result)}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      const err = error as { code?: number; message?: string };
      appendLog({
        label: scenario.label,
        status: "error",
        message: `Rejected: code=${err?.code ?? "?"} msg=${err?.message ?? String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "Inter, system-ui", color: "#e7eefb", background: "#08111f", minHeight: "100vh" }}>
      <h1>Extension Harness — Phase C-2</h1>
      <p>Each button calls <code>window.ethereum.request</code> with a different shape.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBlock: 16 }}>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.label}
            type="button"
            onClick={() => runScenario(scenario)}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #334155", background: "#0f172a", color: "#e7eefb", cursor: "pointer" }}
          >
            {scenario.label}
          </button>
        ))}
      </div>
      <h2>Log</h2>
      <ul style={{ display: "grid", gap: 8 }}>
        {log.map((entry) => (
          <li key={entry.timestamp + entry.label} style={{ padding: 12, border: "1px solid #1e293b", borderRadius: 12 }}>
            <strong>{entry.label}</strong> — {entry.status} — {entry.message}
          </li>
        ))}
      </ul>
    </main>
  );
}
