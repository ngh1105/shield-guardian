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
2. `ShieldPage` collects the action packet and calls `requestShieldVerdict`.
3. `POST /api/verdict` validates and normalizes the request.
4. `submitVerdictRequest` submits `submit_action_check` to GenLayer.
5. The API reads `get_check(check_id)` from GenLayer and maps it into the UI verdict shape.
6. If `GENLAYER_CONTRACT_ADDRESS` is not configured, the route falls back to the local mock verdict engine for development.
7. The Chrome MV3 extension is optional bonus material; the default demo path is the web app only.

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
`src/features/wallet/wallet-context.tsx`. The address is forwarded to the
verdict API as `claimedRequester`. Transactions are signed in the browser via
MetaMask — the server no longer holds a private key.

The contract stores `claimed_requester` separately from `requester` (the
on-chain message sender), so per-wallet history is honest:

- `submit_action_check_for(claimed_requester, ...)` is used when the user
  has connected a wallet.
- `submit_action_check(...)` (legacy) is used for anonymous submissions and
  records `claimed_requester = sender_address`.
- `get_checks_for(claimed_requester, limit)` powers `GET /api/checks`.
- `get_overview()` powers `GET /api/overview`.

## Runtime Setup

Use the fixed Studionet contract:

```env
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_CONTRACT_ADDRESS=0x0B6C673eBb242fb171291bc4ADCCa9785cDDa65f
```

Connect a MetaMask wallet on Studionet (chain id 61999). The dapp signs
transactions in the browser — no server-side private key is required.

## Contract Surface

- `submit_action_check`: stores an action packet and resolves a verdict
- `challenge_verdict`: reopens a stored check and increments `challenge_count`
- `report_loss`: records a loss report and updates coverage status
- `get_check`: reads one stored action check
- `get_overview`: returns aggregate verdict counts
- `submit_action_check_for`: same as `submit_action_check` but records a
  declared `claimed_requester` address
- `get_checks_for`: returns recent checks filtered by `claimed_requester`
