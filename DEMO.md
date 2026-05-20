# Shield Guardian Demo Guide

This guide is for a short local judging/demo session. It is web-first: the
demo runs entirely from the Next.js app and API, with demo/mock or GenLayer
live verdicts. It avoids private key handling in the browser and keeps all
GenLayer interaction server-side.

## What the Demo Shows

1. The user opens `http://localhost:3000` and (optionally) connects MetaMask.
2. The web analysis form sends an action packet to `POST /api/verdict` (demo
   mode) or runs `submit_action_check` on the GenLayer policy court via the
   user's wallet (live mode).
3. In live mode, the UI walks through `Confirming chain → Confirm action →
   Signing → Transaction broadcast (with tx hash) → Verdict`. The user sees
   the broadcast tx hash while waiting for consensus.
4. The backend or GenLayer returns a verdict: `SAFE`, `WEIRD`, or
   `DANGEROUS`.
5. The UI shows reasons, risk score, confidence, next step, coverage state,
   and provenance.
6. The demo readiness section explains whether the result is live GenLayer or
   explicit demo/mock mode.
7. The Chrome extension popup is an optional bonus surface that exercises the
   same `POST /api/verdict` path without wallet signing.

## Setup

Install dependencies:

```powershell
npm install
```

Create `.env.local` from `.env.example` and set the GenLayer values locally.
Do not put private keys in the extension. The browser extension never signs,
sends transactions, or calls the contract directly.

For live GenLayer mode:

```env
SHIELD_ENABLE_DEMO_MODE=0
```

For stable local judging when GenLayer is slow or unavailable:

```env
SHIELD_ENABLE_DEMO_MODE=1
```

Demo mode is still explicit: the web UI must enable Use demo mode, and the API
response will be labeled with `source: "mock"`.

## Run the App

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

The web analysis form includes a Use demo mode toggle. It only works when the
server was started with `SHIELD_ENABLE_DEMO_MODE=1`.

## Web form live demo (MetaMask)

This is the primary MVP demo path. The Next.js app at `/` runs a live
GenLayer verdict signed from the user's wallet.

1. Start the app with `npm run dev` (live GenLayer requires
   `SHIELD_ENABLE_DEMO_MODE=0` and a configured `NEXT_PUBLIC_PHASE_B_CONTRACT`).
2. Open `http://localhost:3000`.
3. Click Connect Wallet in the topbar and approve MetaMask.
4. Fill the analysis form (or pick a quick example) and leave Use demo mode
   off.
5. Click Run Analysis. The wallet card walks through:
   - `Confirming chain in your wallet...` (preflight switches to studionet)
   - `Confirm action` panel — review and click Confirm
   - `Signing` — MetaMask popup appears
   - `Transaction broadcast` — short tx hash shown while consensus runs
     (typically a few seconds, up to about two minutes on a slow network)
   - Verdict result rendered with reasons, risk score, confidence, next step,
     coverage state, and provenance labeled `genlayer`
6. Open Activity History to see the new entry. Open the Challenge dialog or
   Loss Report dialog to exercise `challenge_verdict` / `report_loss` writes
   against the same check.

If the GenLayer policy court does not return a verdict for the submission
(`txExecutionResultName !== FINISHED_WITH_RETURN`) or the leader receipt has
no parseable check id, the form surfaces a user-readable error message and
the action button re-enables. The submission is not retried automatically.

## Extension popup demo (optional bonus)

1. (Optional) Click Connect Wallet in the topbar and approve the MetaMask
   prompt. The address appears with a green status dot. The verdict you
   submit will be attributed to this address and visible in Activity History.
2. Open any normal web page.
3. Open the Shield Guardian popup.
4. Click Capture tab.
5. Click one of the quick packet buttons:
   - Safe swap
   - Weird bridge
   - Dangerous claim
6. Click Analyze action.
7. Point out the verdict, risk score, confidence, reasons, next step, and
   provenance.

Expected demo-mode outcomes:

| Packet | Verdict | Source |
| --- | --- | --- |
| Safe swap | `SAFE` | `mock` |
| Weird bridge | `WEIRD` | `mock` |
| Dangerous claim | `DANGEROUS` | `mock` |

In live mode, the source should be `genlayer` and the result should include
contract metadata when the GenLayer CLI call completes. The Chrome extension
is optional bonus material and is not required for the demo path.

## Verification

Static extension check:

```powershell
npm run check:extension
```

Lint:

```powershell
npm run lint
```

Production build:

```powershell
npm run build
```

API smoke test requires a running dev server. Start the server with
`SHIELD_ENABLE_DEMO_MODE=1`, then run:

```powershell
npm run smoke:api
```

One-command demo verification builds the app and verifies all three demo
packets against the web app:

```powershell
npm run verify:demo
```

If you want the optional extension bonus path as well, run:

```powershell
npm run verify:all
```

If the server is running in live GenLayer mode, smoke testing may take longer
and may return GenLayer-derived verdicts instead of the fixed demo-mode
expectations.

## Phase C-2 manual smoke (deferred)

The Phase C-2 Chrome extension hook is exercised manually at
`http://localhost:3000/extension-harness`:

1. `npm run dev` and load the unpacked extension from `chrome://extensions`.
2. Open `/extension-harness` and connect MetaMask.
3. Click `Native transfer` — expect a `SAFE` overlay pill that auto-proceeds.
4. Click `ERC-20 approve` — expect a `WEIRD` modal with Proceed / Cancel.
5. Click `Unknown selector` — expect a `WEIRD` or `DANGEROUS` modal; click
   `Cancel` and confirm the harness logs `code: 4001`.
6. From any modal click `Open in Shield Guardian` — confirm `/` opens with
   the analysis form prefilled from the decoded packet.

Like the Phase B and Phase C-1 manual smokes, this run is recorded after
deployment and does not block C-2 implementation.
