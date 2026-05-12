# GenLayer JS Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-only GenLayer adapter boundary that can use `genlayer-js` as the primary live integration while preserving the hardened CLI path as a fallback.

**Architecture:** Split `src/lib/genlayer-client.ts` into a stable public boundary, shared mapping/types, a CLI adapter, and an SDK adapter. The API route keeps importing `submitVerdictRequest()` from `@/lib/genlayer-client`; adapter selection happens server-side based on `GENLAYER_CLIENT_MODE` and SDK configuration.

**Tech Stack:** Next.js App Router, TypeScript, Node.js server runtime, `genlayer-js@1.1.8`, GenLayer CLI fallback via `child_process.execFile`.

---

## File Structure

- Modify: `package.json` — add `genlayer-js` dependency after confirming package metadata.
- Modify: `package-lock.json` — updated by `npm install genlayer-js@1.1.8`.
- Modify: `src/lib/genlayer-client.ts` — keep public `submitVerdictRequest()` boundary and select an adapter.
- Create: `src/lib/genlayer/types.ts` — shared GenLayer check/receipt/metadata/adapter types.
- Create: `src/lib/genlayer/map-check-to-verdict.ts` — shared mapping from GenLayer check to `ShieldVerdictResponse`.
- Create: `src/lib/genlayer/config.ts` — server-only env parsing for contract address, account name, and adapter mode.
- Create: `src/lib/genlayer/cli-adapter.ts` — move existing CLI implementation here unchanged except imports.
- Create: `src/lib/genlayer/sdk-adapter.ts` — implement `genlayer-js` integration with confirmed SDK APIs.

---

### Task 1: Install and inspect `genlayer-js`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Confirm package metadata**

Run:

```powershell
npm view genlayer-js@1.1.8 name version description repository --json
```

Expected: package exists with name `genlayer-js`, version `1.1.8`, and description `GenLayer JavaScript SDK`.

- [ ] **Step 2: Install the exact SDK version**

Run:

```powershell
npm install genlayer-js@1.1.8
```

Expected: `package.json` contains `"genlayer-js": "^1.1.8"` or compatible npm-added range, and `package-lock.json` is updated.

- [ ] **Step 3: Inspect installed type exports**

Run:

```powershell
Get-Content "node_modules\genlayer-js\dist\index.d.ts" -TotalCount 220
```

Expected: exports include `createClient` and related client methods. If `createAccount`, `writeContract`, `readContract`, or `waitForTransactionReceipt` are not present in the visible type files, inspect `node_modules\genlayer-js\README.md` and `node_modules\genlayer-js\dist\types\index.d.ts` before coding.

- [ ] **Step 4: Inspect chain exports**

Run:

```powershell
Get-Content "node_modules\genlayer-js\dist\chains\index.d.ts" -TotalCount 120
```

Expected: chain exports include at least one of `localnet`, `studionet`, `testnetAsimov`, or `testnetBradbury`.

---

### Task 2: Extract shared GenLayer types

**Files:**
- Create: `src/lib/genlayer/types.ts`
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Create shared type module**

Create `src/lib/genlayer/types.ts` with:

```ts
import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
} from "@/features/shield/types";

export type GenLayerCheck = {
  action_type: string;
  challenge_count: number;
  check_id: number;
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

export type GenLayerWriteReceipt = {
  hash?: string;
  result?: unknown;
  consensus_data?: {
    leader_receipt?: Array<{
      result?: {
        payload?: {
          readable?: string;
        };
      };
    }>;
  };
};

export type GenLayerVerdictMetadata = {
  contractAddress: string;
  transactionHash?: string;
};

export type GenLayerVerdictAdapter = {
  submitVerdictRequest(
    request: ShieldVerdictRequest,
  ): Promise<ShieldVerdictResponse>;
};
```

- [ ] **Step 2: Remove duplicated local type definitions later**

Do not delete types from `src/lib/genlayer-client.ts` until the mapper and CLI adapter compile against the shared module in later tasks.

---

### Task 3: Extract shared verdict mapping

**Files:**
- Create: `src/lib/genlayer/map-check-to-verdict.ts`
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Create mapper module**

Create `src/lib/genlayer/map-check-to-verdict.ts` with:

```ts
import type { ShieldVerdictRequest, VerdictLabel } from "@/features/shield/types";

import type { GenLayerCheck, GenLayerVerdictMetadata } from "./types";

function mapVerdictLabel(value: GenLayerCheck["verdict"]): VerdictLabel {
  if (value === "safe") return "SAFE";
  if (value === "dangerous") return "DANGEROUS";
  return "WEIRD";
}

function buildReasons(check: GenLayerCheck, request: ShieldVerdictRequest) {
  const reasons = [
    `On-chain policy verdict returned ${check.verdict} for ${check.action_type}.`,
    `Protocol ${check.protocol || "unknown"} on host ${check.website}.`,
    `Signals submitted: ${check.raw_signals || "none provided"}.`,
    `Policy note: ${check.note}`,
  ];

  if (request.assetValueUsd > 0) {
    reasons[1] += ` Asset value ${request.assetValueUsd} USD, gas ${request.gasCostUsd} USD.`;
  }

  return reasons;
}

function buildBriefing(check: GenLayerCheck) {
  if (check.verdict === "dangerous") {
    return "GenLayer policy resolved this action as dangerous. Do not continue unless you fully trust the source and intent.";
  }

  if (check.verdict === "weird") {
    return "GenLayer policy found enough ambiguity to escalate this action. Verify the site, spender, and intent before continuing.";
  }

  return "GenLayer policy considers this action acceptable, but the user should still verify the final signing details.";
}

function buildNextStep(check: GenLayerCheck) {
  if (check.verdict === "dangerous") {
    return "Block the action by default and require an explicit override to continue.";
  }

  if (check.verdict === "weird") {
    return "Ask the user to perform an extra confirmation and verify the official host before signing.";
  }

  return "Allow the action to proceed while still displaying the final spender and amount.";
}

export function mapCheckToVerdict(
  check: GenLayerCheck,
  request: ShieldVerdictRequest,
  metadata: GenLayerVerdictMetadata,
) {
  return {
    verdict: mapVerdictLabel(check.verdict),
    riskScore: Math.round(check.risk_score_bps / 100),
    confidence: Math.round(check.confidence_bps / 100),
    reasons: buildReasons(check, request),
    nextStep: buildNextStep(check),
    coverageEligible: check.coverage_status === "eligible",
    briefing: buildBriefing(check),
    provenance: {
      source: "genlayer" as const,
      checkId: check.check_id,
      contractAddress: metadata.contractAddress,
      transactionHash: metadata.transactionHash,
      coverageStatus: check.coverage_status,
      createdEpoch: check.created_epoch,
      lastReviewEpoch: check.last_review_epoch,
    },
  };
}
```

- [ ] **Step 2: Run lint to catch import/type mistakes**

Run:

```powershell
npm run lint
```

Expected: lint exits 0. If lint fails because the new module is unused, continue to Task 4 before re-running.

---

### Task 4: Extract server-side GenLayer config

**Files:**
- Create: `src/lib/genlayer/config.ts`
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Create config module**

Create `src/lib/genlayer/config.ts` with:

```ts
export type GenLayerClientMode = "auto" | "sdk" | "cli";

export function getContractAddress() {
  const address = process.env.GENLAYER_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS is not set.");
  }
  return address;
}

export function getAccountName() {
  const accountName = process.env.GENLAYER_ACCOUNT_NAME?.trim() || "shieldtest";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountName)) {
    throw new Error(
      "GENLAYER_ACCOUNT_NAME must contain only letters, numbers, underscores, or hyphens.",
    );
  }
  return accountName;
}

export function getClientMode(): GenLayerClientMode {
  const mode = process.env.GENLAYER_CLIENT_MODE?.trim().toLowerCase();
  if (!mode) return "auto";
  if (mode === "auto" || mode === "sdk" || mode === "cli") return mode;
  throw new Error("GENLAYER_CLIENT_MODE must be one of: auto, sdk, cli.");
}

export function hasSdkConfig() {
  return Boolean(
    process.env.GENLAYER_CONTRACT_ADDRESS &&
      (process.env.GENLAYER_PRIVATE_KEY || process.env.GENLAYER_ACCOUNT_PRIVATE_KEY),
  );
}
```

- [ ] **Step 2: Keep secrets server-only**

Do not add any `NEXT_PUBLIC_` GenLayer private key variables. Do not print env values in logs or errors.

---

### Task 5: Move existing CLI implementation into adapter

**Files:**
- Create: `src/lib/genlayer/cli-adapter.ts`
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Create CLI adapter module from existing implementation**

Create `src/lib/genlayer/cli-adapter.ts` by moving the existing command execution and parser logic from `src/lib/genlayer-client.ts`. The module should export `createCliGenLayerAdapter()`:

```ts
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ShieldVerdictRequest } from "@/features/shield/types";

import { getAccountName, getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type {
  GenLayerCheck,
  GenLayerVerdictAdapter,
  GenLayerWriteReceipt,
} from "./types";

const execFileAsync = promisify(execFile);
const commandTimeoutMs = 120_000;
const commandMaxBuffer = 10 * 1024 * 1024;

let windowsCliScriptPath: string | null = null;

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getWindowsCliScriptPath() {
  if (windowsCliScriptPath) {
    return windowsCliScriptPath;
  }

  const candidates = [
    process.env.GENLAYER_CLI_PATH,
    path.join(process.cwd(), "node_modules", "genlayer", "dist", "index.js"),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "node_modules", "genlayer", "dist", "index.js")
      : null,
  ];

  for (const candidate of candidates) {
    if (candidate && (await fileExists(candidate))) {
      windowsCliScriptPath = candidate;
      return candidate;
    }
  }

  throw new Error("Unable to locate GenLayer CLI JavaScript entrypoint.");
}

async function getCliInvocation(args: string[]) {
  if (process.platform !== "win32") {
    return { args, executable: "genlayer" };
  }

  return {
    args: [await getWindowsCliScriptPath(), ...args],
    executable: process.execPath,
  };
}

async function runGenLayerCommand(args: string[]) {
  const invocation = await getCliInvocation(args);
  const { stdout } = await execFileAsync(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    maxBuffer: commandMaxBuffer,
    timeout: commandTimeoutMs,
  });

  return stdout;
}

function extractResultBlock(output: string) {
  const marker = "Result:";
  const start = output.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing Result block in GenLayer output.\n${output}`);
  }

  const block = output.slice(start + marker.length);
  const firstBrace = block.indexOf("{");
  if (firstBrace === -1) {
    const singleLineResult = block
      .trim()
      .split(/\r?\n/, 1)[0]
      ?.trim();
    if (!singleLineResult) {
      throw new Error(`Empty Result block in GenLayer output.\n${output}`);
    }
    return singleLineResult;
  }

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = firstBrace; index < block.length; index += 1) {
    const character = block[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = quote !== null;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return block.slice(firstBrace, index + 1).trim();
      }
    }
  }

  throw new Error(`Unterminated Result object in GenLayer output.\n${output}`);
}

function quoteObjectKeys(value: string) {
  return value.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function normalizePythonJsonLiterals(value: string) {
  return value
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false");
}

function parseObjectLiteral<T>(output: string): T {
  const raw = extractResultBlock(output);

  try {
    return JSON.parse(raw) as T;
  } catch {
    const normalized = quoteObjectKeys(normalizePythonJsonLiterals(raw));
    return JSON.parse(normalized) as T;
  }
}

function parseReturnedCheckId(receipt: GenLayerWriteReceipt) {
  const readableReturn = receipt.consensus_data?.leader_receipt?.find(
    (entry) => entry.result?.payload?.readable,
  )?.result?.payload?.readable;

  const parsedCheckId = Number(readableReturn);
  if (Number.isInteger(parsedCheckId) && parsedCheckId > 0) {
    return parsedCheckId;
  }

  const directReturn = receipt.result;
  if (
    !receipt.hash &&
    typeof directReturn === "number" &&
    Number.isInteger(directReturn) &&
    directReturn > 0
  ) {
    return directReturn;
  }

  throw new Error("GenLayer did not return a valid action check id.");
}

async function waitForTransaction(hash: string | undefined) {
  if (!hash) {
    return;
  }

  await runGenLayerCommand(["receipt", hash]);
}

async function submitCliVerdictRequest(request: ShieldVerdictRequest) {
  const contractAddress = getContractAddress();
  const accountName = getAccountName();

  await runGenLayerCommand(["account", "use", accountName]);

  const writeOutput = await runGenLayerCommand([
    "write",
    contractAddress,
    "submit_action_check",
    "--args",
    request.actionType,
    request.protocol,
    request.website,
    request.summary,
    request.rawSignals,
  ]);

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

export function createCliGenLayerAdapter(): GenLayerVerdictAdapter {
  return {
    submitVerdictRequest: submitCliVerdictRequest,
  };
}
```

- [ ] **Step 2: Replace `src/lib/genlayer-client.ts` with CLI-only boundary temporarily**

Replace `src/lib/genlayer-client.ts` with:

```ts
import type { ShieldVerdictRequest } from "@/features/shield/types";

import { createCliGenLayerAdapter } from "./genlayer/cli-adapter";

export async function submitVerdictRequest(request: ShieldVerdictRequest) {
  return createCliGenLayerAdapter().submitVerdictRequest(request);
}
```

- [ ] **Step 3: Verify extraction did not change behavior**

Run:

```powershell
npm run lint
```

Expected: lint exits 0.

Run:

```powershell
npm run smoke:demo
```

Expected: demo smoke returns SAFE, WEIRD, and DANGEROUS demo verdict coverage.

---

### Task 6: Add SDK adapter with confirmed APIs

**Files:**
- Create: `src/lib/genlayer/sdk-adapter.ts`

- [ ] **Step 1: Confirm imports from installed types**

Before writing the adapter, verify the following imports exist in installed types:

```ts
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
```

Run:

```powershell
Select-String -Path "node_modules\genlayer-js\dist\*.d.ts","node_modules\genlayer-js\dist\types\*.d.ts","node_modules\genlayer-js\dist\chains\*.d.ts" -Pattern "createClient|createAccount|TransactionStatus|ExecutionResult|studionet"
```

Expected: all import names appear in type files. If `studionet` is not present, use the installed chain export that matches the deployed contract network and update the adapter code accordingly.

- [ ] **Step 2: Create SDK adapter module**

Create `src/lib/genlayer/sdk-adapter.ts` with this implementation, adjusting only the account/private-key creation call if installed types show a different `createAccount` signature:

```ts
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

import type { ShieldVerdictRequest } from "@/features/shield/types";

import { getContractAddress } from "./config";
import { mapCheckToVerdict } from "./map-check-to-verdict";
import type {
  GenLayerCheck,
  GenLayerVerdictAdapter,
  GenLayerWriteReceipt,
} from "./types";

function getPrivateKey() {
  const privateKey =
    process.env.GENLAYER_PRIVATE_KEY?.trim() ||
    process.env.GENLAYER_ACCOUNT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("GENLAYER_PRIVATE_KEY is not set.");
  }
  return privateKey;
}

function parseReturnedCheckId(receipt: GenLayerWriteReceipt) {
  const readableReturn = receipt.consensus_data?.leader_receipt?.find(
    (entry) => entry.result?.payload?.readable,
  )?.result?.payload?.readable;

  const parsedCheckId = Number(readableReturn);
  if (Number.isInteger(parsedCheckId) && parsedCheckId > 0) {
    return parsedCheckId;
  }

  const directReturn = receipt.result;
  if (
    !receipt.hash &&
    typeof directReturn === "number" &&
    Number.isInteger(directReturn) &&
    directReturn > 0
  ) {
    return directReturn;
  }

  throw new Error("GenLayer SDK did not return a valid action check id.");
}

function isFinishedWithReturn(receipt: { txExecutionResultName?: unknown }) {
  return receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN;
}

async function submitSdkVerdictRequest(request: ShieldVerdictRequest) {
  const contractAddress = getContractAddress();
  const account = createAccount(getPrivateKey());
  const client = createClient({
    account,
    chain: studionet,
  });

  const transactionHash = await client.writeContract({
    account,
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

  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.FINALIZED,
    fullTransaction: false,
  });

  if (!isFinishedWithReturn(receipt)) {
    throw new Error("GenLayer SDK transaction did not finish with a return value.");
  }

  const checkId = parseReturnedCheckId({
    hash: transactionHash,
    result: receipt.result,
    consensus_data: receipt.consensus_data,
  } as GenLayerWriteReceipt);

  const check = (await client.readContract({
    address: contractAddress,
    functionName: "get_check",
    args: [String(checkId)],
    stateStatus: "accepted",
  })) as GenLayerCheck;

  return mapCheckToVerdict(check, request, {
    contractAddress,
    transactionHash,
  });
}

export function createSdkGenLayerAdapter(): GenLayerVerdictAdapter {
  return {
    submitVerdictRequest: submitSdkVerdictRequest,
  };
}
```

- [ ] **Step 3: Resolve SDK type mismatches against installed definitions**

Run:

```powershell
npm run build
```

Expected: build either succeeds or reports exact SDK type mismatches. If it reports type mismatches, update only these SDK-specific details based on installed `.d.ts` files:

- `createAccount(getPrivateKey())` argument shape.
- `createClient({ account, chain })` option key names.
- `writeContract()` address/hash/value types.
- `waitForTransactionReceipt()` receipt property names.
- `readContract()` `stateStatus` support.

Do not change public API route behavior while resolving SDK types.

---

### Task 7: Add adapter selector in public GenLayer client boundary

**Files:**
- Modify: `src/lib/genlayer-client.ts`

- [ ] **Step 1: Replace boundary with adapter selector**

Replace `src/lib/genlayer-client.ts` with:

```ts
import type { ShieldVerdictRequest } from "@/features/shield/types";

import { createCliGenLayerAdapter } from "./genlayer/cli-adapter";
import { getClientMode, hasSdkConfig } from "./genlayer/config";
import { createSdkGenLayerAdapter } from "./genlayer/sdk-adapter";
import type { GenLayerVerdictAdapter } from "./genlayer/types";

function createGenLayerAdapter(): GenLayerVerdictAdapter {
  const mode = getClientMode();

  if (mode === "cli") {
    return createCliGenLayerAdapter();
  }

  if (mode === "sdk") {
    return createSdkGenLayerAdapter();
  }

  if (hasSdkConfig()) {
    return createSdkGenLayerAdapter();
  }

  return createCliGenLayerAdapter();
}

export async function submitVerdictRequest(request: ShieldVerdictRequest) {
  return createGenLayerAdapter().submitVerdictRequest(request);
}
```

- [ ] **Step 2: Verify no route import changes are needed**

Inspect `src/app/api/verdict/route.ts` and keep this import unchanged:

```ts
import { submitVerdictRequest } from "@/lib/genlayer-client";
```

Expected: the API route remains insulated from CLI vs SDK selection.

---

### Task 8: Verify hardening and MVP behavior

**Files:**
- Verify: `src/lib/genlayer-client.ts`
- Verify: `src/lib/genlayer/**/*.ts`
- Verify: `src/app/api/verdict/route.ts`
- Verify: `package.json`

- [ ] **Step 1: Search for forbidden dynamic execution**

Run:

```powershell
git grep -n "Function(\|eval(" -- src extension
```

Expected: no matches.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: lint exits 0.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: Next.js build exits 0.

- [ ] **Step 4: Run demo smoke**

Run:

```powershell
npm run smoke:demo
```

Expected: demo smoke covers SAFE, WEIRD, and DANGEROUS verdicts.

- [ ] **Step 5: Run full local verification**

Run:

```powershell
npm run verify:all
```

Expected: lint, build, extension check, extension package, and demo smoke all exit 0.

---

### Task 9: Verify SDK or fallback runtime mode

**Files:**
- Verify: `src/lib/genlayer-client.ts`
- Verify: `src/lib/genlayer/sdk-adapter.ts`
- Verify: Vercel/server env names only, never values

- [ ] **Step 1: Verify CLI fallback selection when SDK config is absent**

Run the API locally without `GENLAYER_PRIVATE_KEY` and with demo mode enabled through existing smoke scripts:

```powershell
npm run smoke:demo
```

Expected: demo mode remains unaffected. Non-demo live requests should still be capable of falling back to CLI when `GENLAYER_CLIENT_MODE` is unset and CLI config is available.

- [ ] **Step 2: Verify explicit SDK mode fails closed if SDK config is incomplete**

Run a local build-time-safe API smoke or manual request with:

```powershell
$env:GENLAYER_CLIENT_MODE = 'sdk'; $env:GENLAYER_PRIVATE_KEY = ''; npm run smoke:demo
```

Expected: demo mode still passes because it does not call live GenLayer. A non-demo live request should return a clear server error rather than silently using CLI.

- [ ] **Step 3: Verify live SDK mode only after env names are configured**

Before live SDK smoke, confirm the following variable names exist in the target environment without printing values:

```powershell
vercel env ls production
```

Expected names for SDK mode:

```text
GENLAYER_CONTRACT_ADDRESS
GENLAYER_PRIVATE_KEY
GENLAYER_CLIENT_MODE
```

If using a named RPC/network env after SDK type inspection, include that variable name too. Do not print or copy values into chat or logs.

- [ ] **Step 4: Run live SDK smoke only when production env is complete**

After redeploying with complete env names, send a non-demo `/api/verdict` request through the deployed app or `vercel curl`.

Expected: response has `verdict.provenance.source` equal to `genlayer`, includes a `transactionHash`, and does not expose secrets.

If live SDK smoke fails because the SDK does not support the deployed network/account shape, set `GENLAYER_CLIENT_MODE=cli` for the current deployment and keep the SDK adapter code behind explicit mode until SDK compatibility is resolved.

---

## Self-Review

- Spec coverage: adapter boundary, CLI fallback, SDK primary path, server-only selection, unchanged API route, secret safety, and verification are all covered.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified code steps are intentionally left.
- Type consistency: the shared adapter method is consistently named `submitVerdictRequest`; shared GenLayer check/receipt types are imported by both adapters; public route import remains unchanged.
