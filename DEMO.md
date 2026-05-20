# Shield Guardian Demo Guide

This guide is for a short local judging/demo session. It is web-first: the
demo runs entirely from the Next.js app and API, with demo/mock or GenLayer
live verdicts. It avoids private key handling in the browser and keeps all
GenLayer interaction server-side.

## What the Demo Shows

1. The user opens a page or dapp-like surface.
2. The Shield Guardian extension captures minimal tab context.
3. The popup sends an action packet to `POST /api/verdict`.
4. The backend returns a verdict: `SAFE`, `WEIRD`, or `DANGEROUS`.
5. The UI shows reasons, risk score, confidence, next step, coverage state, and
   provenance.
6. The demo readiness section explains whether the result is live GenLayer or
   explicit demo/mock mode.

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

## Demo Flow

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
