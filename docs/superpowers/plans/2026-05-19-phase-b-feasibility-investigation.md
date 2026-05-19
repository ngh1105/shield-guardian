# Phase B Feasibility Investigation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether `genlayer-js` can sign GenLayer transactions with
an EIP-1193 wallet (MetaMask) in the browser, and document the findings as
input to a Phase B design spec.

**Architecture:** Three investigation passes, each producing a written
artifact — (1) static analysis of `genlayer-js` source to find the
signer/transport/account API surface, (2) a minimal browser PoC at
`src/app/phase-b-poc/page.tsx` that attempts a user-signed read and write
against the deployed studionet contract, (3) a feasibility report
consolidating findings into recommendations for the Phase B spec.

**Tech Stack:** `genlayer-js` 1.1.8 (already installed), Next.js 16 /
React 19, MetaMask via `window.ethereum`, `viem` (transitive via
genlayer-js).

**Test reality:** No automated tests — verification is "the PoC page renders,
the buttons work, the network call succeeds or fails with a captured error
message." The deliverable is a markdown report; the PoC page is throwaway.

**Phase A artefacts available:**
- Deployed contract: `0x878b7E60d9b6afD46d7B2981003dd5f2a6871286` on
  studionet.
- Wallet identity (Connect button, `useWallet`) already mounted.
- Server adapter signs txns with `GENLAYER_PRIVATE_KEY`. Phase B's job is to
  remove that, conditional on the findings here.

---

## File map

**New files:**
- `src/app/phase-b-poc/page.tsx` — client-side PoC, throwaway
- `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md` — final report

**Modified files:** none (PoC is isolated under its own route).

The report is the durable deliverable; the PoC is the tool that produces
the evidence cited in the report.

---

## Task 1: Static analysis of genlayer-js signer API

**Files:**
- Create: `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md`

- [ ] **Step 1: Read `createClient` and `createAccount` sources**

Skim:

```bash
sed -n '500,720p' node_modules/genlayer-js/dist/index.js
```

Capture for the report:
- Exact signature of `createClient({ account, chain })`.
- Exact signature of `createAccount(privateKey)` — does it accept anything
  other than a 0x-prefixed 64-hex private key?
- Whether `createClient` accepts a `transport` option, a `walletClient`, or
  any custom signer hook.

- [ ] **Step 2: Trace `writeContract` and `_sendTransaction`**

```bash
grep -n "_sendTransaction\b" node_modules/genlayer-js/dist/index.js
```

Read the `_sendTransaction` body. Capture for the report:
- Does it call viem's `walletClient.sendTransaction` (which would respect a
  custom EIP-1193 transport), or does it sign locally with the account
  bytes?
- What does it pass as the to/value/data fields?

- [ ] **Step 3: Search for EIP-1193 / wallet hints**

```bash
grep -in "eip1193\|window.ethereum\|injected\|metamask\|wallet_" node_modules/genlayer-js/dist/*.js
```

Capture: any references found. Zero references = browser signing is not
first-class and Phase B will need adapter glue.

- [ ] **Step 4: Capture chain definition for studionet**

```bash
grep -A 30 "studionet =" node_modules/genlayer-js/dist/chains/index.js
```

Capture for the report: chain id, RPC URL, any custom fields.

- [ ] **Step 5: Write Section 1 of the report**

Create `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md` with:

```markdown
# Phase B Feasibility Report

**Date:** 2026-05-19
**Status:** Draft
**Question:** Can `genlayer-js` sign GenLayer transactions with an EIP-1193
(MetaMask) wallet in the browser?

## 1. genlayer-js signer surface

### `createClient`
Signature: [exact, copy-pasted from .d.ts]

### `createAccount`
Signature: [exact]

### Custom transport / signer hooks
[list — or "none found"]

### `_sendTransaction` flow
[one paragraph: where the actual signing happens, who provides the key]

### studionet chain definition
- chain id: [value]
- rpc url: [value]
- custom fields: [list]

### Implications
[2-3 sentences: does the surface allow EIP-1193 signing as-is, only with
adapter glue, or not at all?]
```

Replace each bracketed slot with the literal evidence collected in Steps
1-4. Do not paraphrase — quote types and code where relevant.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-05-19-phase-b-feasibility.md
git commit -m "docs(phase-b): static analysis of genlayer-js signer surface"
```

---

## Task 2: Browser PoC — user-signed read

**Files:**
- Create: `src/app/phase-b-poc/page.tsx`
- Modify: `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md`
  (append Section 2)

- [ ] **Step 1: Scaffold the PoC page**

Create `src/app/phase-b-poc/page.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function PhaseBPoC() {
  const [output, setOutput] = useState<string>("Idle.");

  async function attemptRead() {
    setOutput("Running read...");
    try {
      throw new Error("not implemented");
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
      throw new Error("not implemented");
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
      <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>
        {output}
      </pre>
    </main>
  );
}
```

- [ ] **Step 2: Add the contract address env var**

Append to `.env.local` (gitignored — no commit):

```
NEXT_PUBLIC_PHASE_B_CONTRACT=0x878b7E60d9b6afD46d7B2981003dd5f2a6871286
```

- [ ] **Step 3: Implement `attemptRead` using the API surface from Task 1**

Replace the body of `attemptRead` with code that uses whatever
`createClient` / `createAccount` shape Task 1 documented. As a starting
shape (adjust if Task 1 found a more direct option):

```tsx
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";
import { createWalletClient, custom } from "viem";

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

    const walletClient = createWalletClient({
      account,
      chain: studionet,
      transport: custom(window.ethereum),
    });

    const client = createClient({
      account: walletClient.account,
      chain: studionet,
    });

    const overview = await client.readContract({
      address: process.env.NEXT_PUBLIC_PHASE_B_CONTRACT as Address,
      functionName: "get_overview",
      args: [],
    });

    setOutput(`READ OK: ${JSON.stringify(overview)}`);
  } catch (error) {
    setOutput(
      error instanceof Error ? `READ ERROR: ${error.message}` : String(error),
    );
  }
}
```

If Task 1 documented that `createClient` itself accepts an EIP-1193
transport, prefer that shape. Update only the body — do not change the
function name.

- [ ] **Step 4: Build and serve**

```bash
npm run build
npm run dev
```

Expected: build clean, dev server up. Open
`http://localhost:3000/phase-b-poc` (or whichever port dev assigns) in a
Chromium browser with MetaMask installed.

- [ ] **Step 5: Run the read button, capture the literal output**

Click "Attempt user-signed read". Approve the MetaMask `eth_requestAccounts`
prompt. Note:
- The full output string from the `<pre>` (success or error).
- Whether MetaMask prompts to switch network (it should not for a read).
- Browser dev-tools console: any RPC URL the request actually hit.

- [ ] **Step 6: Append Section 2 to the report**

```markdown
## 2. User-signed read PoC

**Approach used:** [paste the createClient/createWalletClient shape used]

**Output:** [paste the literal `<pre>` text]

**Network behaviour:**
- MetaMask network prompt: [yes/no]
- RPC URL the request hit (from dev tools): [value]

**Conclusion (pick one):**
- ✅ Reads work without a server-held private key — Phase B can drop
  `GENLAYER_PRIVATE_KEY` for the read path.
- ⚠️ Reads work only with caveats: [list].
- ❌ Reads cannot be performed via EIP-1193: [reason].
```

- [ ] **Step 7: Commit**

```bash
git add src/app/phase-b-poc/page.tsx docs/superpowers/specs/2026-05-19-phase-b-feasibility.md
git commit -m "docs(phase-b): browser PoC and findings for user-signed reads"
```

---

## Task 3: Browser PoC — user-signed write

**Files:**
- Modify: `src/app/phase-b-poc/page.tsx`
- Modify: `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md`
  (append Section 3)

- [ ] **Step 1: Implement `attemptWrite`**

Replace the body of `attemptWrite` with a write to `submit_action_check`
(the simplest write surface — no `claimedRequester` flow needed, the user is
already the on-chain sender):

```tsx
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

    const walletClient = createWalletClient({
      account,
      chain: studionet,
      transport: custom(window.ethereum),
    });

    const client = createClient({
      account: walletClient.account,
      chain: studionet,
    });

    const txHash = await client.writeContract({
      account: walletClient.account,
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
      error instanceof Error ? `WRITE ERROR: ${error.message}` : String(error),
    );
  }
}
```

- [ ] **Step 2: Run the write button, capture every step**

```bash
npm run dev
```

Click "Attempt user-signed write". Capture in detail:
1. Whether MetaMask prompts to add or switch the studionet chain. Note its
   exact prompt copy and chain id shown.
2. If a switch is required and MetaMask refuses (it will reject unknown
   chains by default), record the error.
3. If signing proceeds, what the signing prompt actually shows: a readable
   GenLayer calldata, raw hex, "contract interaction," nothing at all.
4. The literal `<pre>` output after the click resolves (`WRITE OK: 0x...`
   or `WRITE ERROR: ...`).
5. If `WRITE OK`, run `genlayer call 0x878b...1286 get_check --args N`
   (where N is `check_count` after) to confirm the validator path actually
   produced an `ActionCheck` row. Record the resulting `requester` field —
   it should match the wallet address.

- [ ] **Step 3: Append Section 3 to the report**

```markdown
## 3. User-signed write PoC

**Approach used:** [paste writeContract call shape]

**MetaMask network prompt:** [exact copy + chain id, or "none"]

**Signing prompt content:** [readable / raw hex / contract interaction /
none]

**Output:** [paste literal `<pre>` text]

**Validator outcome:**
- check_id assigned: [N or n/a]
- on-chain `requester` field: [address or n/a]
- consensus result: [ACCEPTED / UNDETERMINED / failed / n/a]

**Conclusion (pick one):**
- ✅ User-signed writes work end-to-end. Phase B is feasible as scoped.
- ⚠️ Writes work but require [specific workaround, e.g. custom chain
  registration helper, calldata humanizer, gas sponsorship].
- ❌ User-signed writes fail because [reason]. Alternatives:
  [server-relayed user-signed payload / EIP-712 typed data with server
  submission / scope reduction].
```

- [ ] **Step 4: Commit**

```bash
git add src/app/phase-b-poc/page.tsx docs/superpowers/specs/2026-05-19-phase-b-feasibility.md
git commit -m "docs(phase-b): browser PoC and findings for user-signed writes"
```

---

## Task 4: Phase B recommendation

**Files:**
- Modify: `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md`
  (append Section 4)

- [ ] **Step 1: Write the recommendation section**

Append:

```markdown
## 4. Recommendation for Phase B spec

### Feasibility verdict
**[GREEN | YELLOW | RED]** — [one paragraph justifying the colour, citing
specific findings from Sections 1-3.]

### Open questions that the Phase B spec must resolve
1. **Authority model for `challenge_verdict` and `report_loss`.** Current:
   server-signed. Phase B options: keep server-signed, move to user-signed,
   or per-method split. Recommendation here: [...]
2. **`GENLAYER_PRIVATE_KEY` server-side fate.** Current: required for SDK
   adapter reads and writes. Phase B options: drop entirely, keep for
   reads, keep as `submit_action_check_for` fallback for unconnected users.
   Recommendation: [...]
3. **Target chain.** Current PoC: studionet. Phase B options: studionet
   only, testnet rollout, both. Recommendation: [...]
4. **Backward compatibility with `submit_action_check_for`.** Phase A's
   server-attributed flow stays useful for unconnected users. Phase B
   options: deprecate, keep as fallback, remove. Recommendation: [...]
5. **Gas / fees.** Current studionet: free. Phase B options on real chains:
   user pays, sponsored relay, hybrid. Recommendation: [...]
6. **Calldata UX.** If the signing prompt shows raw hex (Section 3),
   Phase B must include a humanizer. If it shows readable Genlayer-style
   calldata, no extra work. Recommendation: [...]

### Suggested next step
- If GREEN: brainstorm Phase B spec using
  `superpowers:brainstorming`, with this report attached as context.
- If YELLOW: brainstorm Phase B spec, but require the workaround(s) named
  in Section 2/3 to be addressed in the spec scope.
- If RED: brainstorm an alternative Phase B that does not require
  user-signed `submit_action_check`. Candidates: server-relayed
  user-signed payload, EIP-712 typed-data attestation submitted via the
  server, or staying with `submit_action_check_for` permanently and
  scoping Phase B to other improvements.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-19-phase-b-feasibility.md
git commit -m "docs(phase-b): recommendation and open questions for Phase B spec"
```

---

## Task 5: Cleanup decision

The PoC route at `src/app/phase-b-poc/page.tsx` is a throwaway tool. It
ships in `npm run build` if not removed. Two acceptable end states:

- [ ] **Option A: Delete now**

```bash
rm src/app/phase-b-poc/page.tsx
git add src/app/phase-b-poc/page.tsx
git commit -m "chore(phase-b): drop feasibility PoC route after report"
```

- [ ] **Option B: Keep until Phase B implementation begins**

Add a banner at the top of `src/app/phase-b-poc/page.tsx`:

```tsx
<p style={{ background: "#592b2b", padding: "0.5rem" }}>
  Internal feasibility tool. Delete before public deploy.
</p>
```

Commit:

```bash
git add src/app/phase-b-poc/page.tsx
git commit -m "chore(phase-b): label feasibility PoC as internal-only"
```

Pick one. Default: **Option A**, because the report has already captured
the evidence and dead routes rot.

---

## Self-review

**Spec coverage:** Phase A spec section "Phase B/C preview" lists
"verifying genlayer-js browser/EIP-1193 signer support, which is the
first task of Phase B's design phase" as the entry condition. This plan
produces that verification + a recommendation, which is the input the
Phase B spec needs.

**Placeholders:** Sections 1-4 of the report contain bracketed slots
(`[paste …]`, `[exact …]`). These are deliberate — the content is
evidence the engineer collects during execution, not content the plan
should fabricate. Each slot states exactly what evidence to collect.

**Type consistency:** PoC code uses `Address` from viem and `studionet`
from `genlayer-js/chains`, both already used in
`src/lib/genlayer/sdk-adapter.ts` and `src/lib/genlayer-client.ts`.
`createWalletClient` + `custom` from viem are standard EIP-1193 wiring;
the imports are valid for the installed viem version.

**Out of scope (intentionally):**
- No production code changes — this is investigation only.
- No removal of `GENLAYER_PRIVATE_KEY` from server adapters; that decision
  belongs to the Phase B spec.
- No Phase B implementation tasks — those belong in a follow-on plan
  written after the report's recommendation lands.
