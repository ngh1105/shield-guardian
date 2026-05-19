# Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all GenLayer state-changing transactions from the server's `GENLAYER_PRIVATE_KEY` adapter into the browser via MetaMask / EIP-1193, then remove the server-side signing key entirely.

**Architecture:** Build a browser-mode `genlayer-js` adapter that constructs `createClient` with a bare `Address` string and `provider: window.ethereum` (the canonical shape proved in the §3.1 of the feasibility report). Drive it from a new `useShieldVerdict` hook that runs a chain pre-flight (`wallet_switchEthereumChain` / `wallet_addEthereumChain`) and shows a "you are about to" confirmation panel before calling `client.writeContract`. After the browser path is green, delete the server-side SDK and CLI adapters and remove `GENLAYER_PRIVATE_KEY` from the project. Server reads (`/api/overview`, `/api/checks`) continue to work using a provider-less `createClient` (no account required for read calls).

**Tech Stack:** `genlayer-js@1.1.8`, viem 2.48.x (transitive), Next.js 16 / React 19, MetaMask via `window.ethereum`. studionet chain id `61999` / `0xf22f`, RPC `https://studio.genlayer.com/api`, native currency `GEN` (18 decimals), block explorer `https://studionet.genlayer.com/explorer/` (per `studionet.blockExplorers.default.url` in `genlayer-js`).

**Test reality:** No automated test framework in the repo (same as Phase A). Verification is `npm run lint` + `npm run build` + the existing `npm run smoke:checks` / `smoke:overview` after each task that touches reads, plus a final manual MetaMask smoke from `src/app/phase-b-poc/page.tsx` (the PoC route is the harness for the §4.2 open UX questions and stays until the production flow lands).

**Phase A artefacts available (do not duplicate):**
- Deployed contract: `0x878b7E60d9b6afD46d7B2981003dd5f2a6871286` on studionet.
- Wallet identity: `src/features/wallet/wallet-context.tsx` (`useWallet()` exposes `address`, `status`, `connect`, `disconnect`, `bumpInvalidation`).
- `claimedRequester` plumbing in `submit_action_check_for` is no longer needed in the browser path — when the user signs, the contract's `msg.sender` IS the wallet, so we call the plain `submit_action_check` and drop `claimedRequester` from the request payload.

---

## File map

**New files:**
- `src/lib/genlayer/studionet-params.ts` — chain constants for `wallet_addEthereumChain` (id, RPC, currency, explorer).
- `src/lib/genlayer/chain-preflight.ts` — `ensureStudionet(provider)`: switch / add / re-switch.
- `src/lib/genlayer/browser-sdk-adapter.ts` — provider-mode `submitVerdictRequest` builder.
- `src/features/shield/components/confirmation-panel.tsx` — "you are about to..." pre-sign UI.
- `src/features/shield/lib/use-shield-verdict.ts` — orchestrating hook (state machine: idle → preflight → confirm → signing → polling → done/error).

**Modified files:**
- `src/lib/genlayer-client.ts` — remove `GENLAYER_PRIVATE_KEY` requirement from `getReadOnlyClient` (account-less reads); drop `submitVerdictRequest` server export.
- `src/features/shield/components/shield-page.tsx` — replace `requestShieldVerdict` call with the new hook; render confirmation panel; keep demo mode using the existing `/api/verdict` endpoint.
- `src/app/api/verdict/route.ts` — gate the route to demo mode only; reject non-demo requests with `410 Gone` and a body pointing callers to the browser path.
- `src/features/shield/lib/request-verdict.ts` — keep, but it now only feeds demo mode.
- `.env.local` — remove `GENLAYER_PRIVATE_KEY`, `GENLAYER_ACCOUNT_NAME`, `GENLAYER_CLIENT_MODE` once unused.

**Deleted files:**
- `src/lib/genlayer/sdk-adapter.ts` (server LocalAccount write path).
- `src/lib/genlayer/cli-adapter.ts` (CLI write path).
- `src/app/phase-b-poc/page.tsx` (after final manual smoke is captured).
- `scripts/phase-b-rpc-probe.mjs` (after final manual smoke is captured — feasibility evidence is already cited in the report).

---

## Task 1: Studionet wallet params

**Files:**
- Create: `src/lib/genlayer/studionet-params.ts`

- [ ] **Step 1: Write the constants module**

```ts
// src/lib/genlayer/studionet-params.ts
import { studionet } from "genlayer-js/chains";

export const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}` as const;

export const STUDIONET_ADD_CHAIN_PARAMS = {
  chainId: STUDIONET_CHAIN_ID_HEX,
  chainName: studionet.name,
  nativeCurrency: {
    name: studionet.nativeCurrency.name,
    symbol: studionet.nativeCurrency.symbol,
    decimals: studionet.nativeCurrency.decimals,
  },
  rpcUrls: [studionet.rpcUrls.default.http[0]],
  blockExplorerUrls: studionet.blockExplorers?.default.url
    ? [studionet.blockExplorers.default.url]
    : [],
} as const;
```

The values are sourced from the SDK chain definition so they cannot drift; if `genlayer-js` ships an updated studionet RPC or rename, this file picks it up automatically.

- [ ] **Step 2: Verify build is clean**

Run: `npm run build`
Expected: pass — no TS errors. The file is leaf-level so it can't break anything else yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/genlayer/studionet-params.ts
git commit -m "feat(phase-b): add studionet wallet_addEthereumChain params"
```

---

## Task 2: Chain pre-flight helper

**Files:**
- Create: `src/lib/genlayer/chain-preflight.ts`

`assertChainMatch` short-circuits on `isStudio` (per §3.3 of the feasibility report), so the dapp must enforce the chain itself before any write.

- [ ] **Step 1: Write the helper**

```ts
// src/lib/genlayer/chain-preflight.ts
import {
  STUDIONET_ADD_CHAIN_PARAMS,
  STUDIONET_CHAIN_ID_HEX,
} from "./studionet-params";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const CHAIN_NOT_ADDED_CODE = 4902;

function getErrorCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

export async function ensureStudionet(provider: Eip1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === STUDIONET_CHAIN_ID_HEX.toLowerCase()) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
    return;
  } catch (error) {
    if (getErrorCode(error) !== CHAIN_NOT_ADDED_CODE) {
      throw error;
    }
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [STUDIONET_ADD_CHAIN_PARAMS],
  });
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
  });
}
```

Behaviour: read `eth_chainId` first to short-circuit; on switch failure with code 4902 (chain unknown), add then re-switch; any other error (including user rejection 4001) bubbles up so the hook can surface it to the user.

- [ ] **Step 2: Verify build is clean**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/genlayer/chain-preflight.ts
git commit -m "feat(phase-b): add ensureStudionet pre-flight helper"
```

---

## Task 3: Account-less server read client

The current `getReadOnlyClient()` in `src/lib/genlayer-client.ts:39-51` requires `GENLAYER_PRIVATE_KEY`, which Phase B is removing. Reads do not need to sign — `client.readContract` falls through to the JSON-RPC fetch branch in `getCustomTransportConfig` (`node_modules/genlayer-js/dist/index.js:2395-2417`) without touching `PROVIDER_METHODS`.

**Files:**
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Replace `getReadOnlyClient` with an account-less variant**

In `src/lib/genlayer-client.ts`, delete the existing `getReadOnlyClient` and replace with:

```ts
function getReadOnlyClient() {
  return createClient({ chain: studionet });
}
```

Remove the now-unused imports `createAccount` and the private-key normalisation code in that file. Keep `createClient`, `studionet`, `CalldataAddress`, `hexToBytes` — they are still used by `readChecksFor`.

- [ ] **Step 2: Smoke server reads**

Make sure dev or smoke server is running, then:

```bash
npm run smoke:overview
npm run smoke:checks
```

Expected: both return live data the way they did before. If genlayer-js refuses to construct a client without `account`, fall back to a fixed throwaway address:

```ts
const READ_ONLY_PROBE_ADDRESS = "0x0000000000000000000000000000000000000001" as const;
function getReadOnlyClient() {
  return createClient({ account: READ_ONLY_PROBE_ADDRESS, chain: studionet });
}
```

…and re-run the smokes.

- [ ] **Step 3: Verify build is clean**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/genlayer-client.ts
git commit -m "refactor(genlayer): make read client account-less"
```

---

## Task 4: Browser SDK adapter

**Files:**
- Create: `src/lib/genlayer/browser-sdk-adapter.ts`

Mirrors `src/lib/genlayer/sdk-adapter.ts` but in provider mode. Key differences from the server adapter, derived from §3.1 of the feasibility report:

- `account: walletAddress` (bare 0x string), NOT `{address, type: "json-rpc"}` — the object form skips the provider routing branch.
- `writeContract({ ... })` omits `account` entirely so the SDK uses `client.account` (viem-normalized).
- Always calls `submit_action_check` (no `_for` variant) — `claimedRequester` is implicit because the wallet IS the sender.

- [ ] **Step 1: Write the adapter**

```ts
// src/lib/genlayer/browser-sdk-adapter.ts
"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Address } from "viem";

import type { ShieldVerdictRequest, ShieldVerdictResponse } from "@/features/shield/types";

import { getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type { GenLayerCheck } from "./types";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type GenLayerOverview = { check_count?: number };

type LeaderReceiptResult = string | { payload?: { readable?: string } };

type SdkReceipt = {
  hash?: string;
  result?: unknown;
  txExecutionResultName?: unknown;
  consensus_data?: {
    leader_receipt?: Array<{ result?: LeaderReceiptResult }>;
  };
};

function parseLeaderReceiptResult(result: LeaderReceiptResult | undefined) {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  return result.payload?.readable;
}

function parseReturnedCheckId(receipt: SdkReceipt) {
  const readable = receipt.consensus_data?.leader_receipt
    ?.map((entry) => parseLeaderReceiptResult(entry.result))
    .find((value) => value);
  const parsed = Number(readable);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  if (
    !receipt.hash &&
    typeof receipt.result === "number" &&
    Number.isInteger(receipt.result) &&
    receipt.result > 0
  ) {
    return receipt.result;
  }
  return null;
}

function parseNextCheckId(overview: GenLayerOverview) {
  const count = Number(overview.check_count);
  return Number.isInteger(count) && count >= 0 ? count + 1 : null;
}

function isFinishedWithReturn(receipt: SdkReceipt) {
  return receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN;
}

export type BrowserAdapterDeps = {
  walletAddress: Address;
  provider: Eip1193Provider;
};

export async function submitBrowserVerdictRequest(
  request: ShieldVerdictRequest,
  deps: BrowserAdapterDeps,
): Promise<ShieldVerdictResponse> {
  const contractAddress = getContractAddress() as Address;

  const client = createClient({
    account: deps.walletAddress,
    chain: studionet,
    provider: deps.provider as never,
  });

  const overview = (await client.readContract({
    address: contractAddress,
    functionName: "get_overview",
    args: [],
  })) as GenLayerOverview;
  const expectedCheckId = parseNextCheckId(overview);

  const transactionHash = await client.writeContract({
    address: contractAddress,
    functionName: "submit_action_check",
    args: [
      request.actionType,
      request.protocol,
      request.website,
      request.summary,
      request.rawSignals,
    ],
    value: BigInt(0),
  });

  const receipt = (await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  })) as SdkReceipt;

  const checkId = isFinishedWithReturn(receipt)
    ? parseReturnedCheckId(receipt)
    : expectedCheckId;
  if (!checkId) {
    throw new Error("GenLayer SDK did not determine an action check id.");
  }

  const check = (await client.readContract({
    address: contractAddress,
    functionName: "get_check",
    args: [checkId],
  })) as GenLayerCheck;

  return mapCheckToVerdict(check, request, {
    contractAddress,
    transactionHash,
  });
}
```

- [ ] **Step 2: Verify build is clean**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/genlayer/browser-sdk-adapter.ts
git commit -m "feat(phase-b): add browser-mode genlayer-js adapter"
```

---

## Task 5: Confirmation panel component

The wallet's "Contract interaction" view shows a hex blob to the user (per §3.3 of the feasibility report). This panel is the dapp-side counterweight: a human-readable summary that tells the user what they are about to sign, anchored next to the MetaMask popup.

**Files:**
- Create: `src/features/shield/components/confirmation-panel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/features/shield/components/confirmation-panel.tsx
"use client";

import styles from "@/features/shield/shield-page.module.css";
import type { ShieldVerdictRequest } from "@/features/shield/types";

const CONSENSUS_CONTRACT_ADDRESS = "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575";

type ConfirmationPanelProps = {
  walletAddress: string;
  contractAddress: string;
  request: ShieldVerdictRequest;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationPanel({
  walletAddress,
  contractAddress,
  request,
  busy,
  onConfirm,
  onCancel,
}: ConfirmationPanelProps) {
  return (
    <div className={styles.confirmationCard} role="dialog" aria-modal="false">
      <span className={styles.metricLabel}>Confirm signature</span>
      <h3>You are about to ask the policy court for a verdict.</h3>
      <ul className={styles.confirmationList}>
        <li><strong>Action:</strong> {request.actionType}</li>
        <li><strong>Protocol:</strong> {request.protocol || "(not specified)"}</li>
        <li><strong>Website:</strong> {request.website}</li>
        <li><strong>Summary:</strong> {request.summary}</li>
        <li><strong>Wallet:</strong> {walletAddress}</li>
        <li>
          <strong>Policy contract:</strong> {contractAddress}
        </li>
        <li>
          <strong>Consensus contract:</strong> {CONSENSUS_CONTRACT_ADDRESS}
          <span className={styles.confirmationHint}>
            (this is the address MetaMask will show. The policy contract above
            is invoked inside the call data.)
          </span>
        </li>
      </ul>
      <div className={styles.formActions}>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Awaiting wallet..." : "Sign with wallet"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal CSS rules used by the component**

Append to `src/features/shield/shield-page.module.css`:

```css
.confirmationCard {
  border: 1px solid var(--surface-border, rgba(255, 255, 255, 0.08));
  background: var(--surface-elevated, rgba(20, 20, 26, 0.92));
  padding: 1rem;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.confirmationList {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.confirmationList strong {
  color: var(--text-primary, #f6f6fa);
  margin-right: 0.4rem;
}

.confirmationHint {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted, rgba(246, 246, 250, 0.5));
  margin-top: 0.2rem;
}
```

If the existing module already declares any of those CSS variables differently, mirror the style of the surrounding rules and drop the `var(...)` fallbacks.

- [ ] **Step 3: Verify build is clean**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/shield/components/confirmation-panel.tsx src/features/shield/shield-page.module.css
git commit -m "feat(phase-b): add pre-sign confirmation panel"
```

---

## Task 6: useShieldVerdict orchestration hook

**Files:**
- Create: `src/features/shield/lib/use-shield-verdict.ts`

State machine:

```
idle ──submit──▶ preflight ──ok──▶ awaiting-confirm ──confirm──▶ signing
                    │                       │                       │
                    └─error─▶ error         └─cancel─▶ idle         ├─error─▶ error
                                                                    └─ok──▶ polling ──ok──▶ done
                                                                                 └─error─▶ error
```

- [ ] **Step 1: Write the hook**

```ts
// src/features/shield/lib/use-shield-verdict.ts
"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";

import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
} from "@/features/shield/types";
import { submitBrowserVerdictRequest } from "@/lib/genlayer/browser-sdk-adapter";
import { ensureStudionet } from "@/lib/genlayer/chain-preflight";

type ShieldVerdictPhase =
  | "idle"
  | "preflight"
  | "awaiting-confirm"
  | "signing"
  | "done"
  | "error";

type ShieldVerdictState = {
  phase: ShieldVerdictPhase;
  request: ShieldVerdictRequest | null;
  result: ShieldVerdictResponse | null;
  error: string | null;
};

const INITIAL: ShieldVerdictState = {
  phase: "idle",
  request: null,
  result: null,
  error: null,
};

function pickError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function useShieldVerdict() {
  const [state, setState] = useState<ShieldVerdictState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  const beginVerdict = useCallback(
    async (request: ShieldVerdictRequest) => {
      if (typeof window === "undefined" || !window.ethereum) {
        setState({
          phase: "error",
          request,
          result: null,
          error: "MetaMask is not available in this browser.",
        });
        return;
      }

      setState({ phase: "preflight", request, result: null, error: null });

      try {
        await ensureStudionet(window.ethereum);
        setState((prev) => ({ ...prev, phase: "awaiting-confirm" }));
      } catch (error) {
        setState({
          phase: "error",
          request,
          result: null,
          error: pickError(error),
        });
      }
    },
    [],
  );

  const confirmVerdict = useCallback(
    async (walletAddress: Address) => {
      const request = state.request;
      if (!request) return;
      if (typeof window === "undefined" || !window.ethereum) return;

      setState((prev) => ({ ...prev, phase: "signing", error: null }));

      try {
        const result = await submitBrowserVerdictRequest(request, {
          walletAddress,
          provider: window.ethereum,
        });
        setState({ phase: "done", request, result, error: null });
      } catch (error) {
        setState({
          phase: "error",
          request,
          result: null,
          error: pickError(error),
        });
      }
    },
    [state.request],
  );

  const cancelVerdict = useCallback(() => {
    setState((prev) => ({ ...INITIAL, request: prev.request }));
  }, []);

  return {
    state,
    beginVerdict,
    confirmVerdict,
    cancelVerdict,
    reset,
  };
}
```

- [ ] **Step 2: Verify build is clean**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/shield/lib/use-shield-verdict.ts
git commit -m "feat(phase-b): add useShieldVerdict orchestration hook"
```

---

## Task 7: Wire shield-page.tsx to the new hook

**Files:**
- Modify: `src/features/shield/components/shield-page.tsx`

The browser path is the default. Demo mode keeps using `requestShieldVerdict()` against `/api/verdict` (Task 8 will gate that route to demo only).

- [ ] **Step 1: Replace the submit handler with the new flow**

In `src/features/shield/components/shield-page.tsx`, add imports near the top:

```tsx
import { ConfirmationPanel } from "@/features/shield/components/confirmation-panel";
import { useShieldVerdict } from "@/features/shield/lib/use-shield-verdict";
import { getContractAddress } from "@/lib/genlayer/config";
```

Inside `ShieldPage`, replace the `handleSubmit` function and add a new `handleConfirm` next to it:

```tsx
const verdict = useShieldVerdict();

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setError("");

  const payload: ShieldVerdictRequest = {
    actionType: form.actionType,
    protocol: form.protocol,
    website: form.website,
    summary: form.summary,
    rawSignals: form.rawSignals,
    assetValueUsd: Number(form.assetValueUsd || 0),
    gasCostUsd: Number(form.gasCostUsd || 0),
  };

  if (demoMode) {
    startTransition(async () => {
      try {
        const response = await requestShieldVerdict(payload, { demoMode: true });
        setResult(response);
        wallet.bumpInvalidation();
      } catch {
        setError(
          "Demo analysis unavailable. Confirm SHIELD_ENABLE_DEMO_MODE=1 on the server.",
        );
      }
    });
    return;
  }

  if (!wallet.address || wallet.status !== "connected") {
    setError("Connect your wallet to run a live verdict.");
    return;
  }

  await verdict.beginVerdict(payload);
}

async function handleConfirm() {
  if (!wallet.address) return;
  await verdict.confirmVerdict(wallet.address as Address);
}
```

Add the `Address` import near the existing viem-shaped imports. (`import type { Address } from "viem";`)

Render the confirmation panel (and the result-from-hook path) by replacing the existing canvas branch that currently renders only `result`. The new render order in `analysisCanvas` should be:

```tsx
{verdict.state.phase === "preflight" ? (
  <p className={styles.metricLabel}>Confirming chain in your wallet...</p>
) : null}

{verdict.state.phase === "awaiting-confirm" && verdict.state.request ? (
  <ConfirmationPanel
    walletAddress={wallet.address ?? ""}
    contractAddress={getContractAddress()}
    request={verdict.state.request}
    busy={false}
    onConfirm={handleConfirm}
    onCancel={verdict.cancelVerdict}
  />
) : null}

{verdict.state.phase === "signing" && verdict.state.request ? (
  <ConfirmationPanel
    walletAddress={wallet.address ?? ""}
    contractAddress={getContractAddress()}
    request={verdict.state.request}
    busy
    onConfirm={() => undefined}
    onCancel={verdict.cancelVerdict}
  />
) : null}

{verdict.state.phase === "error" ? (
  <p className={styles.errorText}>
    {verdict.state.error ?? "Verdict failed."}
  </p>
) : null}
```

When `verdict.state.phase === "done"` and `verdict.state.result` is set, mirror it into the existing `result` state so the rest of the canvas (`verdictHero`, `provenanceGrid`, `reasonBlock`, etc.) renders unchanged. The simplest hook for this is `useEffect`:

```tsx
useEffect(() => {
  if (verdict.state.phase === "done" && verdict.state.result) {
    setResult(verdict.state.result);
    wallet.bumpInvalidation();
  }
}, [verdict.state.phase, verdict.state.result, wallet]);
```

If the React 19 lint flags `set-state-in-effect`, mirror the existing project convention from `src/features/shield/components/activity-history.tsx` and add a per-line eslint-disable comment with a short rationale.

Update the submit-button label to reflect the new pending source — `disabled={isPending || verdict.state.phase === "preflight" || verdict.state.phase === "signing"}` and label it `"Run Analysis"` / `"Working with wallet..."` accordingly.

- [ ] **Step 2: Verify build and lint are clean**

Run: `npm run lint && npm run build`
Expected: pass. Fix any unused-import warnings the refactor introduces.

- [ ] **Step 3: Commit**

```bash
git add src/features/shield/components/shield-page.tsx
git commit -m "feat(phase-b): wire shield page to browser verdict flow"
```

---

## Task 8: Gate /api/verdict to demo mode only

**Files:**
- Modify: `src/app/api/verdict/route.ts`

The non-demo branch of `/api/verdict` is now obsolete. Reject it explicitly so that any client still hitting it fails loudly during the rollout.

- [ ] **Step 1: Replace the POST handler**

In `src/app/api/verdict/route.ts`, after parsing the payload and validating the basic fields (`actionType`, `summary`, hostname, USD numbers), replace the verdict-resolution block with:

```ts
const useDemo = shouldUseDemoMode(request);

if (!useDemo) {
  return NextResponse.json(
    {
      error:
        "Live verdicts now sign in the browser via the wallet. Send the demo header for mock verdicts, or run the new browser flow.",
    },
    { status: 410 },
  );
}

const verdict = getShieldVerdict(normalizedPayload);

return NextResponse.json({
  request: normalizedPayload,
  verdict,
});
```

Drop the `submitVerdictRequest` import and the `claimedRequester` parsing — neither is needed anymore. Keep the `ETH_ADDRESS_REGEX` constant only if the `assetValueUsd`/`gasCostUsd` validation uses it (it does not; remove if unused). Keep the `ALLOWED_ACTION_TYPES`, `parseUsdNumber`, `shouldUseDemoMode` helpers.

- [ ] **Step 2: Smoke the endpoint locally**

```bash
curl -i -X POST http://localhost:3000/api/verdict \
  -H "Content-Type: application/json" \
  -d '{"actionType":"approve","summary":"x","website":"https://example.test"}'
```

Expected: HTTP 410 with the body described above.

```bash
curl -i -X POST http://localhost:3000/api/verdict \
  -H "Content-Type: application/json" \
  -H "x-shield-demo-mode: 1" \
  -d '{"actionType":"approve","summary":"x","website":"https://example.test"}'
```

(Run with `SHIELD_ENABLE_DEMO_MODE=1` set.) Expected: HTTP 200 with a mock verdict.

- [ ] **Step 3: Verify build is clean**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/verdict/route.ts
git commit -m "feat(phase-b): /api/verdict serves demo mode only"
```

---

## Task 9: Drop server-side write paths

**Files:**
- Delete: `src/lib/genlayer/sdk-adapter.ts`
- Delete: `src/lib/genlayer/cli-adapter.ts`
- Modify: `src/lib/genlayer-client.ts`
- Modify: `src/lib/genlayer/config.ts`

`/api/verdict` no longer calls `submitVerdictRequest`. The two server adapters are dead code — delete them.

- [ ] **Step 1: Confirm there are no other callers**

Run: search the project (excluding `node_modules`, `docs/`, `.next/`) for `submitVerdictRequest`, `createSdkGenLayerAdapter`, and `createCliGenLayerAdapter`.

Expected: only `src/lib/genlayer-client.ts` and the two adapter files reference them. If anything else does (a script, a test, a fixture), update it as part of this task or reopen the plan.

- [ ] **Step 2: Delete the adapters and the orchestrator export**

```bash
rm src/lib/genlayer/sdk-adapter.ts src/lib/genlayer/cli-adapter.ts
```

In `src/lib/genlayer-client.ts`, remove:
- `import { createCliGenLayerAdapter } from "./genlayer/cli-adapter";`
- `import { createSdkGenLayerAdapter } from "./genlayer/sdk-adapter";`
- `import type { GenLayerVerdictAdapter } from "./genlayer/types";` (only if no longer needed)
- The `createGenLayerAdapter()` function and the `submitVerdictRequest` export (lines that orchestrate cli vs sdk).

Keep `readOverview`, `readChecksFor`, `ContractOverview`, and the imports they need.

- [ ] **Step 3: Trim `config.ts` to what reads still need**

In `src/lib/genlayer/config.ts`:
- Keep `getContractAddress()` (browser adapter still uses it).
- Drop `getAccountName()` if no remaining caller imports it. Run `grep -R "getAccountName" src/` to check.
- Drop `getClientMode()` and `hasSdkConfig()` if no remaining caller imports them.

If any of those exports turn out to still be referenced (e.g. by the deleted cli-adapter that you just removed), the dead-import error catches it on the next build.

- [ ] **Step 4: Verify build and lint are clean**

```bash
npm run lint
npm run build
```

Expected: pass. Fix any unused imports flagged.

- [ ] **Step 5: Smoke server reads still work**

```bash
npm run smoke:overview
npm run smoke:checks
```

Expected: live data returned.

- [ ] **Step 6: Commit**

```bash
git add src/lib/genlayer-client.ts src/lib/genlayer/config.ts
git rm src/lib/genlayer/sdk-adapter.ts src/lib/genlayer/cli-adapter.ts
git commit -m "refactor(phase-b): drop server-side genlayer write adapters"
```

---

## Task 10: Drop GENLAYER_PRIVATE_KEY and friends

`GENLAYER_PRIVATE_KEY`, `GENLAYER_ACCOUNT_PRIVATE_KEY`, `GENLAYER_ACCOUNT_NAME`, `GENLAYER_CLIENT_MODE` should all be unused after Task 9.

**Files:**
- Modify: `.env.local`
- Modify: `.env.example` (if present)
- Modify: any `README.md` / `docs/` reference still mentioning the keys

- [ ] **Step 1: Confirm none of the env vars are read anywhere in src/**

```bash
grep -RE "GENLAYER_PRIVATE_KEY|GENLAYER_ACCOUNT_PRIVATE_KEY|GENLAYER_ACCOUNT_NAME|GENLAYER_CLIENT_MODE" src/ scripts/ next.config.* package.json
```

Expected: zero hits in `src/`. Hits in `scripts/` are scaffolding for the local probe — leave those alone if the script is still present (Task 12 deletes the probe; this command is a sanity check, not a hard gate). Hits in `package.json` (smoke commands that pass the env into a subprocess) are fine as long as the env var is not actually consumed by the test target.

If any hit in `src/` survives, fix it before continuing. Re-run the grep until clean.

- [ ] **Step 2: Remove the env vars from `.env.local`**

In `.env.local`, delete the lines:

```
GENLAYER_PRIVATE_KEY=...
GENLAYER_ACCOUNT_NAME=...
```

If `GENLAYER_CLIENT_MODE` or `GENLAYER_ACCOUNT_PRIVATE_KEY` are present, delete those too.

Keep:
- `GENLAYER_RPC_URL`
- `GENLAYER_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_PHASE_B_CONTRACT`

- [ ] **Step 3: Update `.env.example` if it exists**

If a `.env.example` is checked in, mirror the change. If no such file exists, skip this step.

- [ ] **Step 4: Update docs**

```bash
grep -R "GENLAYER_PRIVATE_KEY" README.md docs/ 2>/dev/null
```

For each hit, decide:
- README sections describing the dev setup: replace the "set GENLAYER_PRIVATE_KEY" instruction with "connect a MetaMask wallet on studionet (chain id 61999); the dapp will sign transactions in the browser."
- Spec docs (`docs/superpowers/specs/...`) and plan docs that recorded historical state: leave as historical record, do not rewrite.

- [ ] **Step 5: Verify build is clean**

```bash
npm run build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add .env.local .env.example README.md docs/
git commit -m "chore(phase-b): drop GENLAYER_PRIVATE_KEY from environment"
```

(Skip files in the add list that did not change.)

---

## Task 11: Manual MetaMask smoke + capture §4.2 evidence

The §4.2 open UX questions in the feasibility report (network mismatch behaviour, add-chain UX, confirmation copy, receipt timing) need a human in front of MetaMask. The PoC route at `src/app/phase-b-poc/page.tsx` is the harness.

This task is the **manual checkpoint** — there is no code to write, only evidence to record.

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Walk the four scenarios on /phase-b-poc**

For each, capture: the exact MetaMask prompt copy / state, what the user can/can't do, whether the dapp surface shows the right error string.

1. **Wrong chain.** MetaMask on Sepolia (or any non-studionet). Click "Attempt user-signed write." Record what happens.
2. **Chain not yet added.** Reset MetaMask custom networks to a state where 61999 is not present, click "Attempt user-signed write." Record the add-chain flow.
3. **Confirmation copy.** MetaMask on studionet, click "Attempt user-signed write." Take a screenshot of the MetaMask review screen — the "Interacting with" address, the data preview, the network label.
4. **Receipt timing.** Click "Attempt user-signed write" on studionet, time the gap between MetaMask broadcast and the verdict resolving on-page.

- [ ] **Step 3: Walk the same four scenarios on the production form (`/`)**

This is the real Phase B surface. Run with `demoMode` off, wallet connected, on studionet. The "you are about to" panel must render before the wallet prompt; if it does not, file the gap and fix in a hotfix commit before continuing.

- [ ] **Step 4: Append findings to the feasibility report**

In `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md`, add a new `## 5. Manual MetaMask findings (post-implementation)` section that resolves each of §4.2's open questions with what was actually observed. One short paragraph per question.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-19-phase-b-feasibility.md
git commit -m "docs(phase-b): record manual MetaMask findings (§5)"
```

---

## Task 12: Cleanup throwaways

After Task 11 has captured every §4.2 answer, the PoC route and the Node probe have served their purpose. Delete them.

**Files:**
- Delete: `src/app/phase-b-poc/page.tsx`
- Delete: `scripts/phase-b-rpc-probe.mjs`

- [ ] **Step 1: Delete the PoC route**

```bash
rm src/app/phase-b-poc/page.tsx
```

If `src/app/phase-b-poc/` becomes an empty directory, remove it too.

- [ ] **Step 2: Delete the probe**

```bash
rm scripts/phase-b-rpc-probe.mjs
```

Confirm `package.json` has no script that invokes it; if it does, drop that script entry.

- [ ] **Step 3: Verify build is clean and the route is gone**

```bash
npm run build
```

Expected: pass. The build manifest should NOT list `/phase-b-poc` as a route anymore (compare against the build output captured in commit `2710265`, which still listed it).

- [ ] **Step 4: Commit**

```bash
git add src/app/phase-b-poc/ scripts/phase-b-rpc-probe.mjs package.json
git commit -m "chore(phase-b): drop feasibility PoC and probe"
```

---

## Self-review

**Spec coverage** (against feasibility report §4.1 + §4.2):
- "A second SDK adapter alongside `src/lib/genlayer/sdk-adapter.ts`" → Task 4 (`browser-sdk-adapter.ts`).
- "Connect-wallet UI surface that obtains the Address from `eth_requestAccounts`" → already exists in `src/features/wallet/wallet-context.tsx`; Task 7 wires it through.
- "Pre-flight chain check" → Tasks 1 + 2.
- "Hex-blob mitigation" → Task 5.
- "Remove `GENLAYER_PRIVATE_KEY` from server adapters once browser path is green" → Tasks 9 + 10.
- §4.2 open UX questions → Task 11.

**Placeholder scan:** every code step contains complete code. The only "judgement" steps are 11 (manual smoke, by design) and 9 step 1 / 10 step 1 (greps to confirm dead-code claims), where the resolution is to delete or update what the grep finds.

**Type consistency:**
- `ShieldVerdictRequest`, `ShieldVerdictResponse` references match `src/features/shield/types.ts`.
- `GenLayerCheck` references match `src/lib/genlayer/types.ts`.
- `Address`, `BrowserAdapterDeps`, `Eip1193Provider` shapes are consistent across Task 2/3/4/6.
- `submitBrowserVerdictRequest` signature in Task 4 matches the call site in Task 6.
- `useShieldVerdict()` return shape (Task 6) matches the caller in Task 7 (`state.phase`, `state.request`, `state.result`, `state.error`, `beginVerdict`, `confirmVerdict`, `cancelVerdict`, `reset`).
- `ensureStudionet` accepts the same `Eip1193Provider` shape it's called with from `window.ethereum`.

**Out of scope (intentionally):**
- Wallet-other-than-MetaMask compatibility (e.g. WalletConnect, Coinbase Wallet) — single-provider scope per feasibility report.
- A GenLayer calldata humanizer that decodes the wrapped payload into a human-readable function call inside MetaMask — feasibility report §4.1 explicitly classifies that as a non-blocking enhancement.
- Any change to the appeal / challenge flow (still server-driven if it exists in the codebase).
- Migration of read endpoints into the browser. The two API routes (`/api/overview`, `/api/checks`) stay server-side because they don't need a wallet and they're useful for any non-wallet visitor.
