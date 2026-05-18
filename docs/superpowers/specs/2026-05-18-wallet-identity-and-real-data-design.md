# Phase A — Wallet Identity & Real On-Chain Data

**Date:** 2026-05-18
**Status:** Draft, awaiting user review
**Scope:** This spec covers Phase A only. Phase B (user-signed transactions) and
Phase C (real wallet interception) are deferred to separate specs.

## Problem

The web app advertises itself as a "wallet decision layer" but has two visible
gaps:

1. **No wallet presence.** There is no Connect button, no address shown, no way
   for a returning user to see "checks I submitted." Every visitor is anonymous
   to the app even though the product is wallet-shaped.
2. **Surfaces look mocked even when the backend is live.**
   `src/features/shield/components/shield-page.tsx` hard-codes `HISTORY_ROWS`
   (4 fake rows), stats (`12,804 / 481 / 1,129`), capacity (`12.4 ETH`), and
   `DEFAULT_VERDICT` (a pre-populated DANGEROUS verdict shown before the user
   submits anything). The GenLayer SDK adapter reads `get_overview` and
   `get_check`, but its output never reaches the dashboard surfaces.

These are the same problem viewed from two angles: the app cannot tell a "my
data" story because it has neither (a) a way to identify the user nor (b) a
data path from the contract into the dashboard surfaces.

## Goals

- A connected wallet address is visible in the topbar.
- The "Activity History" section shows real `ActionCheck` entries the
  connected user submitted, pulled from the contract. With no wallet, it shows
  a recent global feed instead of fake rows.
- The three stat cards reflect `get_overview` output, not constants.
- `DEFAULT_VERDICT` no longer pre-fills the result panel with fake DANGEROUS
  data; the panel shows an empty/idle state until the user runs a verdict.
- `submit_action_check` records the connected wallet address as the logical
  requester (separate from the server-signing account), so "checks of mine"
  filtering is honest.

## Non-Goals

- The user does NOT sign GenLayer transactions in Phase A. The server still
  holds `GENLAYER_PRIVATE_KEY` and submits the txn. Wallet connection is
  identity-only.
- No new connector library (no wagmi, no rainbowkit). Phase A uses
  `window.ethereum` (EIP-1193) directly; viem is already a transitive dep via
  `genlayer-js`.
- No multi-chain support, no WalletConnect, no mobile deep-linking.
- The Chrome MV3 extension is not changed in this phase.

## Architecture

The change has three layers, in dependency order:

1. **Contract** (`contracts/shield_policy_court.py`) — needs a new write method
   that accepts a `claimed_requester` address parameter, and a new view method
   that filters checks by that address.
2. **Server adapters** (`src/lib/genlayer/sdk-adapter.ts`,
   `src/lib/genlayer/cli-adapter.ts`) — need to pass the user's address through
   to the contract.
3. **Client** (`src/features/shield/`) — needs a wallet-connect surface, a new
   data hook for "my checks" and overview, and removal of hard-coded fixtures.

### Contract changes

Add one field to `ActionCheck`:

```python
claimed_requester: Address  # the wallet address the off-chain submitter is acting on behalf of
```

Add two methods:

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
    # Same body as submit_action_check, but stores claimed_requester.
    # The existing submit_action_check stays for backwards compatibility
    # and stores claimed_requester = gl.message.sender_address (i.e. the
    # server account, which is the existing behavior).

@gl.public.view
def get_checks_for(self, claimed_requester: Address, limit: u32) -> typing.Any:
    # Returns up to `limit` most recent checks where claimed_requester matches.
    # Iterates self.checks in reverse order.
```

`_check_to_dict` adds `"claimed_requester": str(check.claimed_requester)` to
its output so the client can verify the binding.

The existing `challenge_verdict` and `report_loss` keep their current authority
model (server-signed) for Phase A — Phase B will revisit which methods the
end-user signs directly.

**Migration:** The current deployed contract at
`0x0B6C673eBb242fb171291bc4ADCCa9785cDDa65f` does not have `claimed_requester`
on existing entries. We deploy a fresh contract and update
`GENLAYER_CONTRACT_ADDRESS`. Old check ids are abandoned; the demo run does
not depend on historical data. Document this in `docs/ARCHITECTURE.md`.

### Server adapters

`POST /api/verdict` accepts an optional `claimedRequester` field
(0x-prefixed 40-hex string) on the request body. When present and valid:

- The route passes it through to `submitVerdictRequest`.
- The SDK adapter calls `submit_action_check_for(claimedRequester, ...)`.
- The CLI adapter does the same. The exact `genlayer` CLI invocation for the
  new method needs to be verified during implementation; if the CLI cannot
  pass an Address arg cleanly, the CLI adapter falls back to the old
  `submit_action_check` and logs a one-line note (Phase A still works,
  attribution is just lost in CLI mode).

When absent, both adapters fall back to `submit_action_check` (server is
implicitly the requester, matching today's behavior).

A new GET endpoint `GET /api/checks?address=0x...&limit=20` returns up to
`limit` recent `ActionCheck` records for the address, by calling the new
`get_checks_for` view. A separate `GET /api/overview` returns the
`get_overview` payload. Both endpoints are read-only and do not require demo
mode.

The route validates `claimedRequester` and `address` query params with a single
regex `^0x[a-fA-F0-9]{40}$`. Invalid values are rejected with 400 — the route
does not silently strip or normalize them, because doing so would let a wrong
address quietly succeed.

### Client

**New module: `src/features/wallet/`**

- `wallet-context.tsx` — React context exposing `{ address, status, connect,
  disconnect }`. `status` is one of `disconnected | connecting | connected |
  unsupported` (the last when `window.ethereum` is missing). The provider
  wraps the app in `src/app/layout.tsx`. State persists in `localStorage` so a
  refresh re-attaches if the wallet is still authorized; we do NOT auto-prompt
  on first visit.
- `connect-button.tsx` — small component for the topbar. Renders "Connect
  Wallet" when disconnected, a truncated address (`0x1234…abcd`) when
  connected, with a click-to-disconnect dropdown. EIP-1193 has no real
  "disconnect" — clicking disconnect only clears the local context and
  `localStorage`; the dapp permission in MetaMask remains. Tooltip on the
  disconnect item makes this clear: "Forget on this site." When unsupported,
  renders a disabled button with a tooltip pointing to MetaMask.

**New module: `src/features/shield/lib/dashboard-data.ts`**

Exports the lib-level fetchers AND the React hooks that wrap them:

- `fetchOverview(): Promise<OverviewSnapshot>` — POJO fetcher
- `fetchMyChecks(address: string, limit: number): Promise<CheckRow[]>` — POJO fetcher
- `useOverview(invalidationKey: number): { data, error, loading }` — hook
- `useMyChecks(address: string | null, invalidationKey: number): { data, error, loading }` — hook; returns `{ data: [], loading: false }` when address is null

The hooks call the fetchers via `useEffect` on mount and whenever
`invalidationKey` changes. They map contract verdict strings
(`safe/weird/dangerous`) to UI labels (`SAFE/WEIRD/DANGEROUS`).

**Refactor `shield-page.tsx`:**

This file is currently 699 lines and mixes layout, hardcoded fixtures, and
event handlers. As part of this work we extract the hardcoded sections into
small data-aware components:

- `<ActivityHistory />` — replaces the current `HISTORY_ROWS` block. Reads
  from `useMyChecks(address)` when wallet is connected. When disconnected,
  renders an empty state with copy "Connect a wallet to see your scan history."
  (We deliberately do not render a global feed: `get_safe_passes` is biased
  toward SAFE-only and would misrepresent the demo. Adding a generic global
  view is out of scope for Phase A.)
- `<OverviewStats />` — replaces the current three stat cards. Reads from
  `useOverview()`. Maps `safe`, `weird`, `dangerous` counts from the contract
  to the three card labels (Total Scans = check_count; Threats Blocked =
  dangerous; Suspicious Actions = weird).
- `<VerdictPanel />` — already exists as a separate file. Update its caller
  to pass `null` instead of `DEFAULT_VERDICT` and render an idle state in the
  panel until a verdict arrives. Delete `DEFAULT_VERDICT`.
- `<CapacityCard />` — the `12.4 ETH` figure has no contract source. Remove
  the card entirely, or rephrase it as a static product claim with no
  numeric value. Choose removal: less misleading.

`KERNEL_LOG` and `TRUST_SIGNALS` stay as cosmetic copy — they are not data
claims, they are flavor text. `ARCHITECTURE_CARDS`, `POLICY_CONDITIONS`,
`READINESS_ITEMS`, `COVERAGE_STEPS` likewise stay; they are product copy.

**Form submission flow:**

`shield-page.tsx`'s `handleSubmit` reads `address` from the wallet context
and passes it to `requestShieldVerdict` as `claimedRequester`. When wallet is
disconnected, the request is sent without `claimedRequester` (server submits
under its own account, same as today). The form is not gated on wallet
connection — anonymous use still works, it just doesn't get attributed.

After a successful verdict, `<ActivityHistory />` and `<OverviewStats />`
re-fetch (simple invalidation: a counter in context bumped on every successful
submit; the hooks depend on it).

## Data flow

```
[User clicks Connect]
   -> wallet-context.connect()
   -> window.ethereum.request({ method: "eth_requestAccounts" })
   -> store address in context + localStorage

[User submits action packet]
   -> requestShieldVerdict({ ...form, claimedRequester: address })
   -> POST /api/verdict
   -> SDK adapter: client.writeContract(submit_action_check_for, [address, ...])
   -> wait for ACCEPTED, read get_check, return verdict
   -> bump invalidation counter

[ActivityHistory mounts / counter bumps]
   -> fetchMyChecks(address, 20)
   -> GET /api/checks?address=...&limit=20
   -> server: client.readContract(get_checks_for, [address, 20])
   -> map to CheckRow[]
```

## Error handling

- `window.ethereum` missing → context status `unsupported`. Connect button
  disabled with hover hint. Submission still works (server signs).
- User rejects wallet prompt → status returns to `disconnected`. No error
  toast; rejection is a user choice.
- `claimedRequester` provided but malformed → 400 from `/api/verdict` with
  `error: "Invalid claimedRequester address."`. Client surfaces it as the
  existing `error` text in the form.
- `/api/checks` or `/api/overview` failure → the affected component renders
  an inline "Live data unavailable" banner. The action form is unaffected.
- Existing `GENLAYER_CONTRACT_ADDRESS` fallback to mock verdict in the route
  stays. The new GET endpoints have no mock fallback; if the contract is not
  configured, they return 503. The dashboard surfaces show their unavailable
  state in that case.

## Testing

- **Smoke:** `scripts/smoke-api.mjs` extends to call `GET /api/overview` and
  assert the response shape matches `{ check_count, safe, weird, dangerous,
  current_epoch }`.
- **Smoke:** new `scripts/smoke-checks.mjs` submits an action packet with a
  fixed test `claimedRequester` (`0x000...0001`), then calls
  `GET /api/checks?address=0x000...0001` and asserts the new check is in the
  result.
- **Unit-ish:** the existing `npm run lint` + `npm run build` covers
  type-correctness for the wallet context and components.
- **Manual UI verification:** start dev server, install MetaMask, connect a
  test account, submit a packet, verify Activity History updates and topbar
  shows the address. (No automated browser test — the Playwright story is
  a separate non-goal.)

The contract change is verified by running `genlayer` CLI deploy + a basic
read of `get_checks_for` against a known address. The contract test is a
manual smoke step in this phase, not an automated suite.

## File-level change list

**New:**
- `src/features/wallet/wallet-context.tsx`
- `src/features/wallet/connect-button.tsx`
- `src/features/wallet/types.ts`
- `src/features/shield/lib/dashboard-data.ts`
- `src/features/shield/components/activity-history.tsx`
- `src/features/shield/components/overview-stats.tsx`
- `src/app/api/checks/route.ts`
- `src/app/api/overview/route.ts`
- `scripts/smoke-checks.mjs`

**Modified:**
- `contracts/shield_policy_court.py` — add field, two methods, update dict
- `src/lib/genlayer/sdk-adapter.ts` — accept optional `claimedRequester`
- `src/lib/genlayer/cli-adapter.ts` — same
- `src/lib/genlayer/types.ts` — extend `GenLayerCheck` and adapter signature
- `src/lib/genlayer-client.ts` — pass through new param
- `src/features/shield/types.ts` — extend `ShieldVerdictRequest`
- `src/features/shield/lib/request-verdict.ts` — accept `claimedRequester`
- `src/features/shield/components/shield-page.tsx` — extract sections, remove
  `HISTORY_ROWS` / stats constants / `DEFAULT_VERDICT` / capacity card,
  integrate new components and wallet hook
- `src/app/layout.tsx` — wrap with `WalletProvider`
- `src/app/api/verdict/route.ts` — validate and forward `claimedRequester`
- `scripts/smoke-api.mjs` — add overview assertion
- `docs/ARCHITECTURE.md` — note new contract methods, new endpoints, wallet
  layer, contract redeploy
- `DEMO.md` — add wallet-connect step to demo flow
- `README.md` — Key entry points list gets new files

**Deleted:** none. (All hardcoded constants move out of `shield-page.tsx`
but the file itself remains as the page composer.)

## Open questions for implementation phase

These are decisions to surface during the writing-plans pass, not blockers
for this design:

1. Whether `get_checks_for` iterates the full `DynArray` server-side or the
   client paginates. For Phase A, server-side iteration is acceptable; the
   demo dataset is small.
2. Whether to seed the freshly-deployed contract with 3-5 sample checks via
   a script so a fresh demo doesn't show empty stats. Lean toward a
   `scripts/seed-demo-checks.mjs` that submits Safe/Weird/Dangerous packets
   under a demo address.
3. Exact CSS module additions for empty states and the connect button — to
   be specified during implementation, following the existing
   `shield-page.module.css` patterns.

## Phase B/C preview (informational, not in scope)

- **Phase B:** Replace server signing with user signing. Wallet sends the
  GenLayer txn directly. Requires verifying `genlayer-js` browser/EIP-1193
  signer support, which is the first task of Phase B's design phase.
- **Phase C:** Browser extension hooks `eth_sendTransaction` /
  `eth_signTypedData` requests in real wallets, derives an action packet
  automatically, and pre-displays a Shield verdict before the user signs in
  their wallet UI.
