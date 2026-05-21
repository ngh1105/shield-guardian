# Architecture

Shield Guardian is organized feature-first so app routing, product UI, verdict
logic, extension UI, and GenLayer policy code stay separated.

## Folders

- `src/app`: Next.js routes and API handlers
- `src/components`: shared layout and UI primitives
- `src/features/shield`: Shield product UI, examples, types, and helpers
- `src/lib`: server-side integration helpers, including the GenLayer CLI client
- `extension`: Chrome MV3 popup, background worker, and options page
- `contracts`: GenLayer intelligent contracts
- `docs`: architecture and rollout notes

## Request Flow

1. `src/app/page.tsx` renders the Shield feature page.
2. `ShieldPage` collects the action packet and the wallet address from
   `useWallet`.
3. For demo mode, the form posts to `POST /api/verdict` with the
   `x-shield-demo-mode: 1` header; the server returns a mock verdict.
4. For live mode, the browser calls `submitBrowserVerdictRequest`
   (`src/lib/genlayer/browser-sdk-adapter.ts`) which signs
   `submit_action_check` directly against the GenLayer policy court
   using the user's wallet (EIP-1193). `/api/verdict` is no longer used
   for live writes and returns HTTP 410 for non-demo POSTs.
5. After the receipt is accepted, the browser reads `get_check(check_id)`
   from the same contract and maps it into the UI verdict shape.
6. `GET /api/checks` and `GET /api/overview` continue to read on the
   server using `GENLAYER_CONTRACT_ADDRESS` for the per-wallet history
   and aggregate counts.
7. The Chrome MV3 extension is optional bonus material; the default
   demo path is the web app only.

## Extension Boundary

The Chrome extension, when used, relies on `activeTab`, `storage`, and
`scripting` plus a fixed local host permission for `http://localhost/*` and
`http://127.0.0.1/*`. API host access for non-local origins is still requested
at runtime from the options page. Chrome match patterns do not include the API
port, so `http://localhost:3000` resolves to the host permission pattern
`http://localhost/*` while the actual verdict endpoint remains
`http://localhost:3000/api/verdict`.

## Wallet Identity

The web app reads the connected wallet from `window.ethereum` (EIP-1193) via
`src/features/wallet/wallet-context.tsx`. Live verdicts are signed in the
browser through `genlayer-js`, so the contract's `msg.sender` IS the user's
wallet — the server no longer holds a private key, and there is no
`claimedRequester` plumbing on the app side (removed in commit `dafd630`,
2026-05-21). The on-chain `claimed_requester` field still exists in
`shield_policy_court.py` and is asserted by `scripts/smoke-checks.mjs`, but
the app reads `requester` directly from each `GenLayerCheck` for ownership
checks (e.g. who can file a loss report).

Contract write/read surface used in v1:

- `submit_action_check(...)` — browser-signed live verdict submission;
  records `claimed_requester = sender_address` automatically.
- `challenge_verdict(check_id, rationale)` — browser-signed challenge.
- `report_loss(check_id, tx_hash, summary)` — browser-signed loss report;
  the UI gates this to the wallet that matches the check's `requester`.
- `get_check(check_id)` — read after a write to refresh provenance.
- `get_checks_for(claimed_requester, limit)` — server-side read powering
  `GET /api/checks?address=<wallet>`.
- `get_overview()` — server-side read powering `GET /api/overview`.

The contract retains `submit_action_check_for(claimed_requester, ...)` for
historical compatibility, but the browser flow does not call it.

## Runtime Setup

```env
# Server-side reads (history + overview).
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_CONTRACT_ADDRESS=0x878b7E60d9b6afD46d7B2981003dd5f2a6871286

# Browser-signed live writes (submit / challenge / report loss).
NEXT_PUBLIC_PHASE_B_CONTRACT=0x878b7E60d9b6afD46d7B2981003dd5f2a6871286

# Live verdict gate. Set to 1 only when the demo/mock path is desired.
SHIELD_ENABLE_DEMO_MODE=0
```

`NEXT_PUBLIC_PHASE_B_CONTRACT` and `GENLAYER_CONTRACT_ADDRESS` should point
at the same policy court address for normal operation; they are split so
the browser bundle never depends on a server-only secret name. Connect a
MetaMask wallet on Studionet (chain id 61999). The dapp signs transactions
in the browser — no server-side private key is required.

## Contract Surface

- `submit_action_check`: stores an action packet and resolves a verdict
- `challenge_verdict`: reopens a stored check and increments `challenge_count`
- `report_loss`: records a loss report and updates coverage status
- `get_check`: reads one stored action check
- `get_overview`: returns aggregate verdict counts
- `submit_action_check_for`: same as `submit_action_check` but records a
  declared `claimed_requester` address
- `get_checks_for`: returns recent checks filtered by `claimed_requester`
