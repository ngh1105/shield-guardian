# Demo-Ready Release Design

Status: Approved for implementation  
Date: 2026-05-07

## Context

Shield Guardian already has a live Next.js app, a GenLayer-backed verdict API,
a deployed policy court contract, and a local Chrome MV3 companion extension.
The next milestone is not a wallet replacement or SDK. The immediate goal is a
stable judging/demo flow that shows a complete product slice with minimal setup
risk.

## Goal

Make Shield Guardian ready for a short demo where a reviewer can:

- run the app locally
- load the extension
- submit representative safe, weird, and dangerous action packets
- see clear warning copy
- see whether a verdict came from GenLayer or the local demo engine
- follow a documented setup and verification checklist

## Non-Goals

- No full wallet extension
- No private key storage in the browser
- No direct contract calls from the extension
- No SDK or dapp integration package
- No new contract deployment unless the existing contract becomes unusable

## Approach

Ship a demo-ready vertical slice:

1. Keep GenLayer as the default live verdict path.
2. Add explicit provenance to verdict responses so the UI can show source,
   check id, contract address, transaction hash, and coverage status when
   available.
3. Add an opt-in demo mode for local judging when GenLayer is slow or
   unavailable. Demo mode must be visibly labeled and must not silently claim to
   be a live GenLayer verdict.
4. Add quick demo packets to the extension so a judge can exercise all warning
   states without hand-entering payloads.
5. Add documentation and lightweight scripts that validate the extension bundle
   and smoke-test the API.

## User Experience

The reviewer should be able to explain the product in one flow:

1. Open a dapp-like page.
2. Capture page context with the extension.
3. Pick or edit an action packet.
4. Analyze the action.
5. Review the verdict, warning copy, reasons, next step, coverage state, and
   provenance.

Verdict behavior:

- `SAFE`: calm pass state, still tells the user to verify final wallet details.
- `WEIRD`: warning state, requires acknowledgement in the extension.
- `DANGEROUS`: red warning state, strongly recommends aborting.

If the API fails, the extension must keep showing an explicit failure state
instead of downgrading to safe.

## Technical Design

### API

`POST /api/verdict` keeps the existing request shape. It adds optional demo-mode
behavior gated by both:

- `SHIELD_ENABLE_DEMO_MODE=1`
- request header `x-shield-demo-mode: 1`

Without both gates, the route keeps using the GenLayer path when
`GENLAYER_CONTRACT_ADDRESS` is configured.

### Verdict Response

`ShieldVerdictResponse` gains optional `provenance`:

- `source`: `genlayer` or `mock`
- `checkId`
- `contractAddress`
- `transactionHash`
- `coverageStatus`
- `createdEpoch`
- `lastReviewEpoch`

The mock engine reports `source: "mock"` and an explanatory coverage status.
The GenLayer mapper reports `source: "genlayer"` with the contract-derived
metadata.

### Extension

Extension settings gain `demoMode`. When enabled, the background worker sends
`x-shield-demo-mode: 1` and the popup labels the connection as demo mode.

The popup gains quick packet buttons for:

- Safe swap
- Weird bridge
- Dangerous claim

The verdict panel shows provenance so a reviewer can tell whether the result is
live GenLayer or demo mode.

### Documentation

Add `DEMO.md` with:

- setup requirements
- `.env.local` checklist without printing secrets
- local app startup
- extension load instructions
- demo mode option
- payload examples
- verification commands

Add scripts:

- `npm run check:extension`
- `npm run smoke:api`

## Acceptance Criteria

- The app builds with `npm run build`.
- Lint passes with `npm run lint`.
- Extension static validation passes.
- API smoke test can run against demo mode when enabled.
- Extension popup can analyze a packet against the configured Shield API.
- UI clearly distinguishes live GenLayer verdicts from demo-mode verdicts.
