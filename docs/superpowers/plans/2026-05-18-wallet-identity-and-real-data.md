# Phase A — Wallet Identity & Real On-Chain Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MetaMask-only wallet identity to the dashboard and replace
hardcoded fixtures (`HISTORY_ROWS`, stats, capacity, `DEFAULT_VERDICT`) with
real on-chain reads, while server signing of GenLayer txns is preserved.

**Architecture:** Three layers in dependency order — (1) GenLayer contract
gains a `claimed_requester: Address` field plus `submit_action_check_for` and
`get_checks_for` methods, (2) Next.js server adapters and two new GET routes
(`/api/overview`, `/api/checks`) bridge contract reads to the client, (3) a
new `src/features/wallet/` module exposes a React context over EIP-1193 and
new dashboard components consume it. The freshly deployed contract replaces
the existing one — `GENLAYER_CONTRACT_ADDRESS` env var is updated.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, `genlayer-js` 1.1.8 (SDK
mode), `genlayer` Python contract framework, viem (transitive via genlayer-js),
EIP-1193 `window.ethereum` for wallet.

**Test reality:** This repo has no unit test runner; verification is
`npm run lint`, `npm run build`, the existing `scripts/smoke-api.mjs`, and a
new `scripts/smoke-checks.mjs`. Tasks below use those as the "test" steps.
UI changes are verified by build + manual MetaMask check.

**Hard prerequisite:** Before Task 6 the user MUST redeploy the contract via
the `genlayer` CLI — that step is documented inline but cannot be automated
from here.

---

## File map

**New files:**
- `src/features/wallet/types.ts` — wallet status & address types
- `src/features/wallet/wallet-context.tsx` — EIP-1193 provider/hook
- `src/features/wallet/connect-button.tsx` — topbar component
- `src/features/wallet/wallet.module.css` — connect button styles
- `src/features/shield/lib/dashboard-data.ts` — fetchers + hooks
- `src/features/shield/components/activity-history.tsx`
- `src/features/shield/components/overview-stats.tsx`
- `src/app/api/checks/route.ts`
- `src/app/api/overview/route.ts`
- `scripts/smoke-checks.mjs`

**Modified files:**
- `contracts/shield_policy_court.py`
- `src/lib/genlayer/types.ts`
- `src/lib/genlayer/sdk-adapter.ts`
- `src/lib/genlayer/cli-adapter.ts`
- `src/lib/genlayer-client.ts`
- `src/features/shield/types.ts`
- `src/features/shield/lib/request-verdict.ts`
- `src/app/api/verdict/route.ts`
- `src/app/layout.tsx`
- `src/features/shield/components/shield-page.tsx`
- `scripts/smoke-api.mjs`
- `package.json`
- `docs/ARCHITECTURE.md`, `DEMO.md`, `README.md`

---

## Task 1: Contract — add `claimed_requester` and helpers

**Files:**
- Modify: `contracts/shield_policy_court.py`

- [ ] **Step 1: Add `claimed_requester` field to `ActionCheck` dataclass**

In `contracts/shield_policy_court.py`, inside the `@dataclass class ActionCheck`
block, add the field directly after `requester: Address`:

```python
    requester: Address
    claimed_requester: Address
    action_type: str
```

- [ ] **Step 2: Update `submit_action_check` to set claimed_requester to sender**

In the `submit_action_check` method, update the `ActionCheck(...)` construction
so that `claimed_requester` defaults to the message sender (preserving today's
semantic):

```python
        action_check = ActionCheck(
            check_id=self.next_check_id,
            requester=gl.message.sender_address,
            claimed_requester=gl.message.sender_address,
            action_type=action_type,
            protocol=protocol,
            website=website,
            summary=summary,
            raw_signals=raw_signals,
            verdict="pending",
            risk_score_bps=u32(0),
            confidence_bps=u32(0),
            created_epoch=self.current_epoch,
            last_review_epoch=self.current_epoch,
            coverage_status="none",
            loss_report_tx_hash="",
            note="Check submitted.",
            challenge_count=u32(0),
        )
```

- [ ] **Step 3: Add `submit_action_check_for` method**

Place this method directly below `submit_action_check`:

```python
    @gl.public.write
    def submit_action_check_for(
        self,
        claimed_requester: Address,
        action_type: str,
        protocol: str,
        website: str,
        summary: str,
        raw_signals: str,
    ) -> u32:
        action_check = ActionCheck(
            check_id=self.next_check_id,
            requester=gl.message.sender_address,
            claimed_requester=claimed_requester,
            action_type=action_type,
            protocol=protocol,
            website=website,
            summary=summary,
            raw_signals=raw_signals,
            verdict="pending",
            risk_score_bps=u32(0),
            confidence_bps=u32(0),
            created_epoch=self.current_epoch,
            last_review_epoch=self.current_epoch,
            coverage_status="none",
            loss_report_tx_hash="",
            note="Check submitted.",
            challenge_count=u32(0),
        )
        self.checks.append(action_check)

        check_id = self.next_check_id
        self.next_check_id += u32(1)
        self._resolve_check(len(self.checks) - 1)
        return check_id
```

- [ ] **Step 4: Add `get_checks_for` view method**

Place this directly above the existing `get_overview` method:

```python
    @gl.public.view
    def get_checks_for(self, claimed_requester: Address, limit: u32) -> typing.Any:
        results = []
        capped_limit = int(limit)
        if capped_limit <= 0:
            return results
        if capped_limit > 100:
            capped_limit = 100

        for index in range(len(self.checks) - 1, -1, -1):
            if len(results) >= capped_limit:
                break
            check = self.checks[index]
            if check.claimed_requester == claimed_requester:
                results.append(self._check_to_dict(check))

        return results
```

- [ ] **Step 5: Update `_check_to_dict` to surface the new field**

Add the `claimed_requester` line to the dict literal in `_check_to_dict`:

```python
    def _check_to_dict(self, check: ActionCheck) -> typing.Any:
        return {
            "check_id": int(check.check_id),
            "requester": str(check.requester),
            "claimed_requester": str(check.claimed_requester),
            "action_type": check.action_type,
            ...
```

(Keep the rest of the existing dict body unchanged.)

- [ ] **Step 6: Commit**

```bash
git add contracts/shield_policy_court.py
git commit -m "feat(contract): add claimed_requester field and per-address queries"
```

---

## Task 2: Redeploy contract and update env

**Files:** none in repo — this is a manual deploy step using the `genlayer` CLI.

- [ ] **Step 1: Deploy the updated contract**

Run from project root:

```bash
genlayer account use shieldtest
genlayer deploy contracts/shield_policy_court.py
```

Expected: a `Result:` block including the new contract address (40-hex,
0x-prefixed). Copy that address.

- [ ] **Step 2: Update `.env.local` with the new contract address**

Edit `.env.local` (do NOT commit secrets). Replace the value of
`GENLAYER_CONTRACT_ADDRESS` with the address from Step 1. Keep
`GENLAYER_RPC_URL` and `GENLAYER_ACCOUNT_NAME` as-is.

- [ ] **Step 3: Manual verification of the new view**

```bash
genlayer call <NEW_ADDR> get_checks_for --args 0x0000000000000000000000000000000000000000 5
```

Expected: `Result: []` (no checks for the zero address yet).

- [ ] **Step 4: Note the new address in plan progress**

No commit needed — `.env.local` is gitignored. Record the new address in
your scratch notes for Task 6 verification.

---

## Task 3: Extend `GenLayerCheck` type

**Files:**
- Modify: `src/lib/genlayer/types.ts`

- [ ] **Step 1: Add `claimed_requester` to `GenLayerCheck`**

Replace the existing `GenLayerCheck` type with:

```typescript
export type GenLayerCheck = {
  action_type: string;
  challenge_count: number;
  check_id: number;
  claimed_requester: string;
  confidence_bps: number;
  coverage_status: string;
  created_epoch: number;
  last_review_epoch: number;
  loss_report_tx_hash: string;
  note: string;
  protocol: string;
  raw_signals: string;
  requester: string;
  risk_score_bps: number;
  summary: string;
  verdict: "safe" | "weird" | "dangerous";
  website: string;
};
```

- [ ] **Step 2: Extend the adapter signature**

Replace `GenLayerVerdictAdapter` with a signature that accepts an optional
claimed requester:

```typescript
export type GenLayerVerdictAdapter = {
  submitVerdictRequest(
    request: ShieldVerdictRequest,
    options?: { claimedRequester?: string },
  ): Promise<ShieldVerdictResponse>;
};
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: TypeScript errors in `sdk-adapter.ts`, `cli-adapter.ts`, and
`genlayer-client.ts` because the adapter signatures don't yet match. That's
expected — the next tasks fix them. Confirm only those three files have
errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/genlayer/types.ts
git commit -m "feat(types): extend GenLayerCheck and adapter signature for claimed_requester"
```

---

## Task 4: SDK adapter — pass `claimedRequester` through

**Files:**
- Modify: `src/lib/genlayer/sdk-adapter.ts`

- [ ] **Step 1: Update `submitSdkVerdictRequest` signature and writeContract call**

Replace the body of `submitSdkVerdictRequest` so it branches on
`options.claimedRequester`:

```typescript
async function submitSdkVerdictRequest(
  request: ShieldVerdictRequest,
  options: { claimedRequester?: string } = {},
) {
  const contractAddress = getContractAddressForSdk();
  const account = createAccount(getPrivateKey());
  const client = createClient({
    account,
    chain: studionet,
  });

  const overview = (await client.readContract({
    address: contractAddress,
    functionName: "get_overview",
    args: [],
  })) as GenLayerOverview;
  const expectedCheckId = parseNextCheckId(overview);

  const writeArgs = options.claimedRequester
    ? [
        options.claimedRequester,
        request.actionType,
        request.protocol,
        request.website,
        request.summary,
        request.rawSignals,
      ]
    : [
        request.actionType,
        request.protocol,
        request.website,
        request.summary,
        request.rawSignals,
      ];

  const transactionHash = await client.writeContract({
    account,
    address: contractAddress,
    functionName: options.claimedRequester
      ? "submit_action_check_for"
      : "submit_action_check",
    args: writeArgs,
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 1_000,
    retries: 120,
  });

  const checkId =
    isFinishedWithReturn(receipt)
      ? parseReturnedCheckId({
          result: receipt.result,
          consensus_data: receipt.consensus_data,
        })
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

- [ ] **Step 2: Build to verify SDK adapter compiles**

```bash
npm run build
```

Expected: errors in `cli-adapter.ts` and `genlayer-client.ts` only — SDK
adapter should now compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/genlayer/sdk-adapter.ts
git commit -m "feat(sdk-adapter): support submit_action_check_for"
```

---

## Task 5: CLI adapter — pass `claimedRequester` through

**Files:**
- Modify: `src/lib/genlayer/cli-adapter.ts`
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Update `submitCliVerdictRequest`**

Replace the function with:

```typescript
async function submitCliVerdictRequest(
  request: ShieldVerdictRequest,
  options: { claimedRequester?: string } = {},
) {
  const contractAddress = getContractAddress();
  const accountName = getAccountName();

  await runGenLayerCommand(["account", "use", accountName]);

  const writeArgs = options.claimedRequester
    ? [
        "write",
        contractAddress,
        "submit_action_check_for",
        "--args",
        options.claimedRequester,
        request.actionType,
        request.protocol,
        request.website,
        request.summary,
        request.rawSignals,
      ]
    : [
        "write",
        contractAddress,
        "submit_action_check",
        "--args",
        request.actionType,
        request.protocol,
        request.website,
        request.summary,
        request.rawSignals,
      ];

  const writeOutput = await runGenLayerCommand(writeArgs);

  const receipt = parseObjectLiteral<GenLayerWriteReceipt>(writeOutput);
  const checkId = parseReturnedCheckId(receipt);
  await waitForTransaction(receipt.hash);

  const checkOutput = await runGenLayerCommand([
    "call",
    contractAddress,
    "get_check",
    "--args",
    String(checkId),
  ]);

  const check = parseObjectLiteral<GenLayerCheck>(checkOutput);
  return mapCheckToVerdict(check, request, {
    contractAddress,
    transactionHash: receipt.hash,
  });
}
```

- [ ] **Step 2: Update `genlayer-client.ts` pass-through**

Replace `submitVerdictRequest` in `src/lib/genlayer-client.ts`:

```typescript
export async function submitVerdictRequest(
  request: ShieldVerdictRequest,
  options?: { claimedRequester?: string },
) {
  return createGenLayerAdapter().submitVerdictRequest(request, options);
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build (no TypeScript errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/genlayer/cli-adapter.ts src/lib/genlayer-client.ts
git commit -m "feat(adapters): forward claimedRequester through CLI and dispatcher"
```

---

## Task 6: Verdict route — accept and validate `claimedRequester`

**Files:**
- Modify: `src/app/api/verdict/route.ts`

- [ ] **Step 1: Add validation regex constant**

Near the top of the file, after `DEMO_MODE_HEADER`:

```typescript
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
```

- [ ] **Step 2: Read and validate `claimedRequester` in `POST`**

Inside `POST`, after the existing `assetValueUsd`/`gasCostUsd` validation
block and before the `normalizedPayload` assignment, insert:

```typescript
  const rawClaimedRequester = (payload as { claimedRequester?: unknown })
    .claimedRequester;
  let claimedRequester: string | undefined;
  if (
    rawClaimedRequester !== undefined &&
    rawClaimedRequester !== null &&
    rawClaimedRequester !== ""
  ) {
    if (
      typeof rawClaimedRequester !== "string" ||
      !ETH_ADDRESS_REGEX.test(rawClaimedRequester)
    ) {
      return NextResponse.json(
        { error: "Invalid claimedRequester address." },
        { status: 400 },
      );
    }
    claimedRequester = rawClaimedRequester;
  }
```

- [ ] **Step 3: Forward `claimedRequester` into `submitVerdictRequest`**

Replace the existing live-mode branch:

```typescript
    verdict = shouldUseDemoMode(request)
      ? getShieldVerdict(normalizedPayload)
      : await submitVerdictRequest(normalizedPayload, { claimedRequester });
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 5: Smoke (with dev server already started in another terminal in demo mode)**

```bash
npm run smoke:api
```

Expected: all three packets pass with `source=mock` (claimedRequester is
unused in demo mode, but the route must not reject the existing payloads).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/verdict/route.ts
git commit -m "feat(api): accept and validate optional claimedRequester"
```

---

## Task 7: GET `/api/overview`

**Files:**
- Modify: `src/lib/genlayer-client.ts`
- Create: `src/app/api/overview/route.ts`

- [ ] **Step 1: Add contract reader helpers to genlayer-client**

Append to `src/lib/genlayer-client.ts` (consolidate imports at the top):

```typescript
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";

import { getContractAddress } from "./genlayer/config";
import type { GenLayerCheck } from "./genlayer/types";

function getReadOnlyClient() {
  const privateKey =
    process.env.GENLAYER_PRIVATE_KEY?.trim() ||
    process.env.GENLAYER_ACCOUNT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("GENLAYER_PRIVATE_KEY is not set.");
  }
  const normalized = /^[0-9a-fA-F]{64}$/.test(privateKey)
    ? (`0x${privateKey}` as `0x${string}`)
    : (privateKey as `0x${string}`);
  const account = createAccount(normalized);
  return createClient({ account, chain: studionet });
}

export type ContractOverview = {
  current_epoch: number;
  check_count: number;
  safe: number;
  weird: number;
  dangerous: number;
};

export async function readOverview(): Promise<ContractOverview> {
  const client = getReadOnlyClient();
  return (await client.readContract({
    address: getContractAddress() as Address,
    functionName: "get_overview",
    args: [],
  })) as ContractOverview;
}

export async function readChecksFor(
  address: string,
  limit: number,
): Promise<GenLayerCheck[]> {
  const client = getReadOnlyClient();
  return (await client.readContract({
    address: getContractAddress() as Address,
    functionName: "get_checks_for",
    args: [address, limit],
  })) as GenLayerCheck[];
}
```

- [ ] **Step 2: Create the route**

`src/app/api/overview/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { readOverview } from "@/lib/genlayer-client";

export async function GET() {
  if (!process.env.GENLAYER_CONTRACT_ADDRESS?.trim()) {
    return NextResponse.json(
      { error: "GenLayer contract is not configured." },
      { status: 503 },
    );
  }

  try {
    const overview = await readOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Overview read failed.",
      },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Manual smoke (dev server running, live mode)**

```bash
curl http://localhost:3000/api/overview
```

Expected: JSON with `{ "overview": { "current_epoch": ..., "check_count": 0, "safe": 0, "weird": 0, "dangerous": 0 } }` for the freshly-deployed contract.

- [ ] **Step 5: Commit**

```bash
git add src/lib/genlayer-client.ts src/app/api/overview/route.ts
git commit -m "feat(api): add /api/overview reading get_overview"
```

---

## Task 8: GET `/api/checks`

**Files:**
- Create: `src/app/api/checks/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";

import { readChecksFor } from "@/lib/genlayer-client";

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  if (!process.env.GENLAYER_CONTRACT_ADDRESS?.trim()) {
    return NextResponse.json(
      { error: "GenLayer contract is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  const limitRaw = url.searchParams.get("limit");

  if (!address || !ETH_ADDRESS_REGEX.test(address)) {
    return NextResponse.json(
      { error: "Invalid or missing address." },
      { status: 400 },
    );
  }

  const limitNumber = Number(limitRaw ?? 20);
  if (!Number.isFinite(limitNumber)) {
    return NextResponse.json(
      { error: "Invalid limit." },
      { status: 400 },
    );
  }
  const limit = Math.min(Math.max(limitNumber, 1), 50);

  try {
    const checks = await readChecksFor(address, limit);
    return NextResponse.json({ checks });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Checks read failed.",
      },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Manual smoke**

```bash
curl "http://localhost:3000/api/checks?address=0x0000000000000000000000000000000000000001&limit=5"
```

Expected: `{ "checks": [] }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/checks/route.ts
git commit -m "feat(api): add /api/checks reading get_checks_for"
```

---

## Task 9: Smoke test for `claimedRequester` round-trip

**Files:**
- Create: `scripts/smoke-checks.mjs`
- Modify: `scripts/smoke-api.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update `smoke-api.mjs` to also assert `/api/overview`**

Append to `scripts/smoke-api.mjs` after the existing for-loop and before the
final `console.log("API smoke passed against ...")`:

```javascript
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
```

- [ ] **Step 2: Create `scripts/smoke-checks.mjs`**

```javascript
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
```

- [ ] **Step 3: Add npm script**

In `package.json`, add `smoke:checks` alongside the existing smoke scripts:

```json
    "smoke:checks": "node scripts/smoke-checks.mjs",
```

- [ ] **Step 4: Run smokes (dev server in LIVE mode, with redeployed contract)**

```bash
npm run smoke:api
npm run smoke:checks
```

Expected: both pass. The first prints the OVERVIEW line; the second prints
the round-trip OK line.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-api.mjs scripts/smoke-checks.mjs package.json
git commit -m "test: add smoke for claimedRequester round-trip and overview"
```

---

## Task 10: Wallet types and context

**Files:**
- Create: `src/features/wallet/types.ts`
- Create: `src/features/wallet/wallet-context.tsx`

- [ ] **Step 1: Write the types module**

`src/features/wallet/types.ts`:

```typescript
export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unsupported";

export type WalletState = {
  address: string | null;
  status: WalletStatus;
  invalidationKey: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  bumpInvalidation: () => void;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
  }
}
```

- [ ] **Step 2: Write the context provider**

`src/features/wallet/wallet-context.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { WalletState, WalletStatus } from "./types";

const STORAGE_KEY = "shield-guardian:wallet-address";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const WalletContext = createContext<WalletState | null>(null);

function readStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && ADDRESS_REGEX.test(stored) ? stored : null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [invalidationKey, setInvalidationKey] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.ethereum) {
      setStatus("unsupported");
      return;
    }

    const stored = readStoredAddress();
    if (!stored) return;

    let cancelled = false;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((result) => {
        if (cancelled) return;
        const accounts = Array.isArray(result) ? (result as string[]) : [];
        const match = accounts.find(
          (entry) => entry.toLowerCase() === stored.toLowerCase(),
        );
        if (match) {
          setAddress(match);
          setStatus("connected");
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {
        if (!cancelled) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum?.on) return;

    const handler = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      if (accounts.length === 0) {
        setAddress(null);
        setStatus("disconnected");
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const next = accounts[0];
      setAddress(next);
      setStatus("connected");
      window.localStorage.setItem(STORAGE_KEY, next);
    };

    window.ethereum.on("accountsChanged", handler);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handler);
    };
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setStatus("unsupported");
      return;
    }
    setStatus("connecting");
    try {
      const result = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const accounts = Array.isArray(result) ? (result as string[]) : [];
      const next = accounts[0];
      if (!next || !ADDRESS_REGEX.test(next)) {
        setStatus("disconnected");
        return;
      }
      setAddress(next);
      setStatus("connected");
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      setStatus("disconnected");
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus(window.ethereum ? "disconnected" : "unsupported");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const bumpInvalidation = useCallback(() => {
    setInvalidationKey((current) => current + 1);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      status,
      invalidationKey,
      connect,
      disconnect,
      bumpInvalidation,
    }),
    [address, status, invalidationKey, connect, disconnect, bumpInvalidation],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside WalletProvider.");
  }
  return ctx;
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/wallet/types.ts src/features/wallet/wallet-context.tsx
git commit -m "feat(wallet): add EIP-1193 wallet context and provider"
```

---

## Task 11: Connect button + wire WalletProvider into layout

**Files:**
- Create: `src/features/wallet/connect-button.tsx`
- Create: `src/features/wallet/wallet.module.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the styles**

`src/features/wallet/wallet.module.css`:

```css
.connect {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(12, 18, 28, 0.7);
  color: #e7eef8;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 120ms ease;
}

.connect:hover:not(:disabled) {
  background: rgba(38, 56, 84, 0.9);
}

.connect:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.connectActive {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #e7eef8;
  font-size: 0.85rem;
}

.connectDot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: #62e1a8;
}

.disconnect {
  background: transparent;
  border: none;
  color: rgba(231, 238, 248, 0.65);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
```

- [ ] **Step 2: Write the connect button**

`src/features/wallet/connect-button.tsx`:

```tsx
"use client";

import { useWallet } from "./wallet-context";
import styles from "./wallet.module.css";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function ConnectButton() {
  const { address, status, connect, disconnect } = useWallet();

  if (status === "unsupported") {
    return (
      <button
        className={styles.connect}
        type="button"
        disabled
        title="Install MetaMask to connect a wallet."
      >
        Wallet unsupported
      </button>
    );
  }

  if (status === "connected" && address) {
    return (
      <span className={styles.connectActive}>
        <span className={styles.connectDot} aria-hidden />
        <span title={address}>{shortAddress(address)}</span>
        <button
          className={styles.disconnect}
          type="button"
          onClick={disconnect}
          title="Forget on this site"
        >
          Disconnect
        </button>
      </span>
    );
  }

  return (
    <button
      className={styles.connect}
      type="button"
      disabled={status === "connecting"}
      onClick={() => {
        void connect();
      }}
    >
      {status === "connecting" ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
```

- [ ] **Step 3: Wrap the app in WalletProvider**

Update `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";

import "./globals.css";
import { WalletProvider } from "@/features/wallet/wallet-context";
import {
  PROJECT_DESCRIPTION,
  PROJECT_NAME,
} from "@/lib/project-metadata";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: PROJECT_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/wallet/connect-button.tsx src/features/wallet/wallet.module.css src/app/layout.tsx
git commit -m "feat(wallet): add ConnectButton and wire provider into layout"
```

---

## Task 12: Dashboard data hooks

**Files:**
- Create: `src/features/shield/lib/dashboard-data.ts`

- [ ] **Step 1: Write the module**

```typescript
"use client";

import { useEffect, useState } from "react";

import type { GenLayerCheck } from "@/lib/genlayer/types";

export type OverviewSnapshot = {
  current_epoch: number;
  check_count: number;
  safe: number;
  weird: number;
  dangerous: number;
};

export type CheckRow = {
  checkId: number;
  verdict: "SAFE" | "WEIRD" | "DANGEROUS";
  protocol: string;
  actionType: string;
  summary: string;
  website: string;
  createdEpoch: number;
};

type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

function mapVerdict(value: GenLayerCheck["verdict"]): CheckRow["verdict"] {
  if (value === "safe") return "SAFE";
  if (value === "dangerous") return "DANGEROUS";
  return "WEIRD";
}

function mapCheckRow(check: GenLayerCheck): CheckRow {
  return {
    checkId: check.check_id,
    verdict: mapVerdict(check.verdict),
    protocol: check.protocol || "Unknown",
    actionType: check.action_type,
    summary: check.summary,
    website: check.website,
    createdEpoch: check.created_epoch,
  };
}

export async function fetchOverview(): Promise<OverviewSnapshot> {
  const response = await fetch("/api/overview");
  if (!response.ok) {
    throw new Error(`Overview request failed: ${response.status}`);
  }
  const body = (await response.json()) as { overview: OverviewSnapshot };
  return body.overview;
}

export async function fetchMyChecks(
  address: string,
  limit: number,
): Promise<CheckRow[]> {
  const response = await fetch(
    `/api/checks?address=${encodeURIComponent(address)}&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`Checks request failed: ${response.status}`);
  }
  const body = (await response.json()) as { checks: GenLayerCheck[] };
  return body.checks.map(mapCheckRow);
}

export function useOverview(invalidationKey: number): FetchState<OverviewSnapshot> {
  const [state, setState] = useState<FetchState<OverviewSnapshot>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    fetchOverview()
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Overview failed.",
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [invalidationKey]);

  return state;
}

export function useMyChecks(
  address: string | null,
  invalidationKey: number,
): FetchState<CheckRow[]> {
  const [state, setState] = useState<FetchState<CheckRow[]>>({
    data: null,
    error: null,
    loading: false,
  });

  useEffect(() => {
    if (!address) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    fetchMyChecks(address, 20)
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Checks failed.",
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address, invalidationKey]);

  return state;
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/shield/lib/dashboard-data.ts
git commit -m "feat(shield): add dashboard data fetchers and React hooks"
```

---

## Task 13: `OverviewStats` and `ActivityHistory` components

**Files:**
- Create: `src/features/shield/components/overview-stats.tsx`
- Create: `src/features/shield/components/activity-history.tsx`

- [ ] **Step 1: Write `overview-stats.tsx`**

```tsx
"use client";

import { useOverview } from "@/features/shield/lib/dashboard-data";
import styles from "@/features/shield/shield-page.module.css";
import { useWallet } from "@/features/wallet/wallet-context";

export function OverviewStats() {
  const { invalidationKey } = useWallet();
  const { data, error, loading } = useOverview(invalidationKey);

  if (error) {
    return (
      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.metricLabel}>Live data unavailable</span>
          <strong>—</strong>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  const checkCount = data?.check_count ?? 0;
  const dangerous = data?.dangerous ?? 0;
  const weird = data?.weird ?? 0;
  const safe = data?.safe ?? 0;

  return (
    <div className={styles.statsGrid}>
      <article className={styles.statCard}>
        <span className={styles.metricLabel}>Total Scans</span>
        <strong>{loading ? "…" : checkCount.toLocaleString()}</strong>
        <p>Across wallet, bridge, and claim flows</p>
      </article>
      <article className={styles.statCard}>
        <span className={styles.metricLabel}>Threats Blocked</span>
        <strong>{loading ? "…" : dangerous.toLocaleString()}</strong>
        <p>Resolved as dangerous by GenLayer policy</p>
      </article>
      <article className={styles.statCard}>
        <span className={styles.metricLabel}>Suspicious Actions</span>
        <strong>{loading ? "…" : weird.toLocaleString()}</strong>
        <p>Escalated to weird status ({safe} safe-pass on record)</p>
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Write `activity-history.tsx`**

```tsx
"use client";

import { useMyChecks } from "@/features/shield/lib/dashboard-data";
import type { CheckRow } from "@/features/shield/lib/dashboard-data";
import styles from "@/features/shield/shield-page.module.css";
import { useWallet } from "@/features/wallet/wallet-context";

function protocolGlyph(protocol: string) {
  return protocol
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function verdictTone(verdict: CheckRow["verdict"]) {
  if (verdict === "SAFE") return styles.safe;
  if (verdict === "WEIRD") return styles.weird;
  return styles.dangerous;
}

function describeAction(row: CheckRow) {
  const head = `${row.actionType[0]?.toUpperCase() ?? ""}${row.actionType.slice(1)}`;
  const tail = row.summary || row.website;
  return tail ? `${head} · ${tail}` : head;
}

function tableShellWithMessage(message: string) {
  return (
    <div className={styles.tableShell}>
      <div className={styles.tableHeader}>
        <span>Epoch</span>
        <span>Protocol</span>
        <span>Action</span>
        <span>Verdict</span>
      </div>
      <div className={styles.tableRow}>
        <span>—</span>
        <span>—</span>
        <span>{message}</span>
        <span>—</span>
      </div>
    </div>
  );
}

export function ActivityHistory() {
  const { address, status, invalidationKey } = useWallet();
  const { data, error, loading } = useMyChecks(address, invalidationKey);

  if (status !== "connected" || !address) {
    return tableShellWithMessage("Connect a wallet to see your scan history.");
  }

  if (error) {
    return tableShellWithMessage(`Live data unavailable: ${error}`);
  }

  const rows = data ?? [];

  if (loading && rows.length === 0) {
    return tableShellWithMessage("Loading scans…");
  }

  if (rows.length === 0) {
    return tableShellWithMessage("No scans submitted from this wallet yet.");
  }

  return (
    <div className={styles.tableShell}>
      <div className={styles.tableHeader}>
        <span>Epoch</span>
        <span>Protocol</span>
        <span>Action</span>
        <span>Verdict</span>
      </div>
      {rows.map((row) => (
        <div key={row.checkId} className={styles.tableRow}>
          <span>#{row.checkId} / e{row.createdEpoch}</span>
          <span className={styles.protocolCell}>
            <span className={styles.protocolIcon}>
              {protocolGlyph(row.protocol)}
            </span>
            {row.protocol}
          </span>
          <span>{describeAction(row)}</span>
          <span className={`${styles.badge} ${verdictTone(row.verdict)}`}>
            {row.verdict}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/shield/components/overview-stats.tsx src/features/shield/components/activity-history.tsx
git commit -m "feat(shield): add OverviewStats and ActivityHistory live components"
```

---

## Task 14: Wire `claimedRequester` through the verdict request

**Files:**
- Modify: `src/features/shield/types.ts`

- [ ] **Step 1: Extend `ShieldVerdictRequest`**

In `src/features/shield/types.ts`, add an optional field:

```typescript
export type ShieldVerdictRequest = {
  actionType: ActionType;
  protocol: string;
  website: string;
  summary: string;
  rawSignals: string;
  assetValueUsd: number;
  gasCostUsd: number;
  claimedRequester?: string;
};
```

(No code change to `requestShieldVerdict` is needed: adding `claimedRequester`
to the type flows through `JSON.stringify(payload)` automatically.)

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/shield/types.ts
git commit -m "feat(shield): allow claimedRequester on ShieldVerdictRequest"
```

---

## Task 15: Refactor `shield-page.tsx` — remove fixtures, mount live components

**Files:**
- Modify: `src/features/shield/components/shield-page.tsx`

This is the largest single edit. Read the current file first to confirm exact
line numbers before applying each step.

- [ ] **Step 1: Add new imports**

At the top of the imports block, add:

```typescript
import { ActivityHistory } from "@/features/shield/components/activity-history";
import { OverviewStats } from "@/features/shield/components/overview-stats";
import { ConnectButton } from "@/features/wallet/connect-button";
import { useWallet } from "@/features/wallet/wallet-context";
```

- [ ] **Step 2: Remove top-level constants `DEFAULT_VERDICT` and `HISTORY_ROWS`**

Delete these blocks entirely:

- The whole `const DEFAULT_VERDICT: ShieldVerdictResponse = { ... }` literal.
- The whole `const HISTORY_ROWS = [ ... ]` array.

The `verdictTone` function still uses `VerdictLabel`, so keep that import.

- [ ] **Step 3: Read wallet state inside `ShieldPage()`**

Near the top of `ShieldPage()`, after the existing `useState`/`useTransition`
hooks and before `const displayedVerdict = ...`, add:

```typescript
  const wallet = useWallet();
```

- [ ] **Step 4: Replace `displayedVerdict` to allow null**

Replace:

```typescript
  const displayedVerdict = result ?? DEFAULT_VERDICT;
  const provenanceRows = getProvenanceRows(displayedVerdict);
```

With:

```typescript
  const provenanceRows = result ? getProvenanceRows(result) : [];
```

- [ ] **Step 5: Forward `claimedRequester` and bump invalidation on submit**

Inside `handleSubmit`, replace the `payload`/`requestShieldVerdict`/`setResult`
block with:

```typescript
        const payload: ShieldVerdictRequest = {
          actionType: form.actionType,
          protocol: form.protocol,
          website: form.website,
          summary: form.summary,
          rawSignals: form.rawSignals,
          assetValueUsd: Number(form.assetValueUsd || 0),
          gasCostUsd: Number(form.gasCostUsd || 0),
          ...(wallet.address ? { claimedRequester: wallet.address } : {}),
        };

        const verdict = await requestShieldVerdict(payload, { demoMode });
        setResult(verdict);
        wallet.bumpInvalidation();
```

- [ ] **Step 6: Insert ConnectButton into the topbar nav**

Locate the `<nav className={styles.nav}>` block in the topbar and append the
button after the last `<a>`:

```tsx
        <nav className={styles.nav}>
          <a href="#analysis">Analysis Engine</a>
          <a href="#history">Audit Trail</a>
          <a href="#coverage">Coverage Mandate</a>
          <a href="#readiness">Demo Readiness</a>
          <ConnectButton />
        </nav>
```

- [ ] **Step 7: Replace verdict panel render to show idle state**

Find the `<div className={styles.analysisCanvas}>` block (currently using
`displayedVerdict`). Replace its inner content from `<div className={styles.canvasHeader}>` through the closing of `<div className={styles.kernelLog}>` with:

```tsx
            <div className={styles.canvasHeader}>
              <div>
                <p className={styles.metricLabel}>Analysis Canvas</p>
                <h3>Verdict Result</h3>
              </div>
              <div
                className={`${styles.canvasBadge} ${result ? verdictTone(result.verdict) : ""}`}
              >
                {result ? result.verdict : "IDLE"}
              </div>
            </div>

            {result ? (
              <>
                <div className={styles.verdictHero}>
                  <div>
                    <p className={styles.metricLabel}>Risk level</p>
                    <h4 className={verdictTone(result.verdict)}>
                      {result.verdict}
                    </h4>
                  </div>
                  <div className={styles.scoreBlock}>
                    <span>Risk Score</span>
                    <strong>{result.riskScore}/100</strong>
                    <p>Confidence {result.confidence}%</p>
                  </div>
                </div>

                {provenanceRows.length ? (
                  <div className={styles.provenanceGrid}>
                    {provenanceRows.map((row) => (
                      <div
                        key={row.label}
                        className={styles.provenanceItem}
                      >
                        <span className={styles.metricLabel}>{row.label}</span>
                        <strong title={row.title}>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className={styles.reasonBlock}>
                  <div className={styles.reasonHeader}>
                    <span className={styles.metricLabel}>Risk Signals</span>
                    <span className={styles.metricLabel}>
                      Coverage {result.coverageEligible ? "Eligible" : "Denied"}
                    </span>
                  </div>
                  <ul className={styles.reasonList}>
                    {result.reasons.map((reason) => (
                      <li key={reason} className={styles.reasonItem}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.briefingCard}>
                  <span className={styles.metricLabel}>Shield Briefing</span>
                  <p>{result.briefing}</p>
                </div>

                <div className={styles.verdictActions}>
                  <button className={styles.abortButton} type="button">
                    Abort Transaction
                  </button>
                  <button className={styles.secondaryButton} type="button">
                    Proceed with Caution
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.briefingCard}>
                <span className={styles.metricLabel}>Idle</span>
                <p>
                  Submit an action packet to receive a verdict from the
                  GenLayer policy court.
                </p>
              </div>
            )}

            <div className={styles.kernelLog}>
              <div className={styles.kernelHead}>
                <span>KERNEL LOG</span>
                <span>mission-control / live feed</span>
              </div>
              <div className={styles.kernelBody}>
                {KERNEL_LOG.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
```

- [ ] **Step 8: Replace stats grid with `<OverviewStats />`**

In the `id="history"` section, find the existing `<div className={styles.statsGrid}>` block (three hardcoded `<article>` cards with `12,804`, `481`, `1,129`) and replace the entire `<div>...</div>` with:

```tsx
        <OverviewStats />
```

- [ ] **Step 9: Replace history table with `<ActivityHistory />`**

In the same section, find the `<div className={styles.tableShell}>` block (with `HISTORY_ROWS.map(...)`) and replace the entire `<div>...</div>` with:

```tsx
        <ActivityHistory />
```

After this replacement, the helper `protocolGlyph` and constant `HISTORY_ROWS`
are no longer used in this file. Remove the `protocolGlyph` function from the
top of `shield-page.tsx`.

- [ ] **Step 10: Remove the capacity card from the coverage section**

In the `id="coverage"` section, delete the entire
`<div className={styles.capacityCard}>` block (the one announcing
`12.4 ETH`).

- [ ] **Step 11: Build**

```bash
npm run build
```

Expected: clean. Watch for any unused-variable warnings (unused imports,
unused `protocolGlyph`); remove anything the linter flags.

- [ ] **Step 12: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 13: Manual UI smoke**

```bash
npm run dev
```

Open `http://localhost:3000` in a Chromium browser with MetaMask installed.
Verify:

1. Topbar shows "Connect Wallet". Click → MetaMask prompt → after approval
   the topbar shows truncated address with green dot.
2. Activity History shows "No scans submitted from this wallet yet."
3. Stats cards show real counts (likely zeros for fresh contract).
4. Submit a packet (any of the example presets). Verdict renders. Stats and
   history update on next render (counts increment, the new row appears).
5. Click Disconnect → activity history reverts to the connect-prompt empty
   state, but stats remain (they are global).

- [ ] **Step 14: Commit**

```bash
git add src/features/shield/components/shield-page.tsx
git commit -m "feat(shield): mount live OverviewStats, ActivityHistory, ConnectButton; drop fixtures"
```

---

## Task 16: Update docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `DEMO.md`
- Modify: `README.md`

- [ ] **Step 1: Update `docs/ARCHITECTURE.md`**

Append a new section before "Runtime Setup":

```markdown
## Wallet Identity

The web app reads the connected wallet from `window.ethereum` (EIP-1193) via
`src/features/wallet/wallet-context.tsx`. The address is forwarded to the
verdict API as `claimedRequester`. The server still signs the GenLayer
transaction with `GENLAYER_PRIVATE_KEY` — wallet connection is identity-only
in Phase A.

The contract stores `claimed_requester` separately from `requester` (the
on-chain message sender), so per-wallet history is honest:

- `submit_action_check_for(claimed_requester, ...)` is used when the user
  has connected a wallet.
- `submit_action_check(...)` (legacy) is used for anonymous submissions and
  records `claimed_requester = sender_address`.
- `get_checks_for(claimed_requester, limit)` powers `GET /api/checks`.
- `get_overview()` powers `GET /api/overview`.
```

Also extend the "Contract Surface" bullet list at the bottom with:

```markdown
- `submit_action_check_for`: same as `submit_action_check` but records a
  declared `claimed_requester` address
- `get_checks_for`: returns recent checks filtered by `claimed_requester`
```

- [ ] **Step 2: Update `DEMO.md`**

In the "Demo Flow" numbered list, insert a new step before the existing
step 1, then renumber the rest:

```markdown
1. (Optional) Click Connect Wallet in the topbar and approve the MetaMask
   prompt. The address appears with a green status dot. The verdict you
   submit will be attributed to this address and visible in Activity History.
2. Open any normal web page.
3. Open the Shield Guardian popup.
4. Click Capture tab.
...
```

- [ ] **Step 3: Update `README.md`**

In the "Key entry points" list, add:

```markdown
- `src/features/wallet/wallet-context.tsx`
- `src/app/api/checks/route.ts`
- `src/app/api/overview/route.ts`
```

In the "Project structure" list, add:

```markdown
- `src/features/wallet` - wallet identity (EIP-1193 context and connect button)
```

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md DEMO.md README.md
git commit -m "docs: cover wallet identity, new endpoints, and contract methods"
```

---

## Task 17: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Smoke (server in LIVE mode against the new contract)**

Stop dev server. Restart with `SHIELD_ENABLE_DEMO_MODE` unset:

```bash
npm run dev
```

In another terminal:

```bash
npm run smoke:api
npm run smoke:checks
```

Expected: both pass. `smoke:api` prints OVERVIEW line; `smoke:checks` prints
round-trip OK.

- [ ] **Step 4: Manual end-to-end demo run**

Reproduce the manual UI smoke from Task 15 Step 13 with a clean dev session.
Confirm the journey from connect → submit → see attributed history works.

---

## Self-review notes

**Spec coverage check:**
- Connect button in topbar — Tasks 11, 15.
- Activity History from contract / empty state when disconnected — Tasks
  13, 15.
- Three stat cards from `get_overview` — Tasks 13, 15.
- `DEFAULT_VERDICT` removed, idle state — Task 15.
- Wallet address forwarded as `claimedRequester` — Tasks 14, 15.
- Contract `claimed_requester` field, `submit_action_check_for`,
  `get_checks_for` — Task 1.
- Server adapters pass through claimedRequester — Tasks 4, 5.
- New `/api/overview` and `/api/checks` — Tasks 7, 8.
- Validation regex for address — Tasks 6, 8.
- Smoke for round-trip — Task 9.
- Capacity card removal — Task 15 Step 10.
- Doc updates — Task 16.
- All non-goals (no wagmi, no user-signed txns, no extension change) honored
  by absence in the plan.

**Type consistency:** `claimedRequester` (camelCase) is used throughout the
TypeScript layer; `claimed_requester` (snake_case) only inside the contract
and contract-shaped responses. `WalletStatus` and `WalletState` types are
defined in Task 10 and consumed in Tasks 11, 13, 15. `OverviewSnapshot` and
`CheckRow` defined in Task 12 and consumed in Task 13.

**Open items left explicit (from spec):** seed script for demo data is not
included — recommend creating `scripts/seed-demo-checks.mjs` later if a fresh
demo against zero-count stats is unsatisfying. Not blocking.
