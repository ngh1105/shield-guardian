# MVP Release Checkpoint

**Date:** 2026-05-21 (Asia/Bangkok)
**Branch:** `main`
**Commit:** `5337abc` and onwards
**Status:** MVP web path complete. User manual smoke passed 2026-05-21.

This document is the handoff snapshot for the Shield Guardian MVP. It
supersedes scattered status notes in older Phase B / Phase C-1 / Phase C-2
specs for the purpose of "what is true right now and how do I run it."

## Status

- The Next.js web app at `/` is the primary MVP demo surface.
- Live verdicts are signed in the browser via MetaMask through
  `genlayer-js` against the deployed Studionet policy court.
- `npm run lint`, `npm run build`, and `npm run verify:all` are green on
  `main`.
- The Chrome MV3 extension is bonus material; it is not required for the
  MVP demo and its end-to-end overlay smoke is deferred (see below).

## Primary demo path (web form, live MetaMask)

This is the path the user manually validated on 2026-05-21.

1. `npm run dev` (with the env block below in `.env.local`).
2. Open `http://localhost:3000`.
3. Click **Connect Wallet** in the topbar and approve the MetaMask
   prompt. The address pill should turn green.
4. Leave **Use demo mode** off.
5. Fill the analysis form (or pick a quick example) and click
   **Run Analysis**.
6. The wallet card walks through, in order:
   - `Confirming chain in your wallet...` (preflight switches to
     Studionet, chain id `0xf22f` / 61999)
   - **Confirm action** panel — review and click Confirm
   - `Signing` — MetaMask popup appears
   - `Transaction broadcast` — short tx hash shown while consensus runs
   - Verdict result with reasons, risk score, confidence, next step,
     coverage state, and provenance labeled `genlayer`
7. Open **Activity History** to see the new row.
8. Open the **Challenge** dialog or **Loss Report** dialog on that row
   to exercise `challenge_verdict` / `report_loss` writes against the
   same check id.

## Required environment

`.env*` is gitignored (`/.gitignore` line 40), so `.env.example` is not
checked in. Copy this block into `.env.local` for live MVP:

```env
# Server-side reads (history + overview).
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_CONTRACT_ADDRESS=0x0B6C673eBb242fb171291bc4ADCCa9785cDDa65f

# Browser-signed live writes (submit / challenge / report loss).
NEXT_PUBLIC_PHASE_B_CONTRACT=0x0B6C673eBb242fb171291bc4ADCCa9785cDDa65f

# Live verdict gate. Set to 1 only when the demo/mock path is desired.
SHIELD_ENABLE_DEMO_MODE=0
```

Notes:

- `NEXT_PUBLIC_PHASE_B_CONTRACT` is consumed by browser code that signs
  GenLayer writes. After changing it, restart `npm run dev` so the
  Next.js bundle picks up the new value.
- `GENLAYER_CONTRACT_ADDRESS` should normally point at the same address.
  It is read by the server-side history/overview routes only.
- `SHIELD_ENABLE_DEMO_MODE=1` is for stable judging on a slow network.
  In that mode the **Use demo mode** UI toggle plus the
  `x-shield-demo-mode: 1` request header are still required — the
  server never silently mocks live requests.

## Verification commands

```bash
npm run lint
npm run build
npm run verify:all
```

`verify:all` chains lint → build → static extension check → packager →
unit tests → demo smoke against `/api/verdict`. It does not include any
live MetaMask automation; live behaviour is hand-validated.

## Deferred / out-of-scope items

- **C-2 extension overlay smoke** — `extension/` ships an MV3
  `eth_sendTransaction` interceptor and `/extension-harness` test
  route, but the manual Chrome walkthrough described in
  `extension/README.md` and `DEMO.md` is deferred. It is not required
  for the MVP web demo.
- **No automated MetaMask test.** Live verdict, challenge, and loss
  report flows are hand-driven. `scripts/smoke-checks.mjs` only covers
  the read-side `claimed_requester` round-trip via the demo API.
- **Phase B §4.2 edge cases** (wrong chain / missing chain RPC popups)
  — see
  `docs/superpowers/specs/2026-05-19-phase-b-feasibility.md` §5.1.
- **Historical docs.** Plans and specs from 2026-05-07 through
  2026-05-19 still describe an earlier server-signed flow with a
  `claimedRequester` request field. Those documents are kept as
  historical record. The current architecture is the browser-signed
  flow described in `docs/ARCHITECTURE.md` and Phase B §5.

## Latest release commits

```
5337abc chore(genlayer): drop unnecessary `provider as never` casts
dafd630 chore(shield): fix hook deps warning and drop dead claimedRequester
0d4deed fix(extension,shield): resolve P1 routing + dead refresh phase
fe478f3 docs(demo): document web form live MetaMask path as primary MVP demo
1284f6b fix(shield): clarify live verdict wait state
cb34464 fix(genlayer): require returned check id for live verdicts
3dd67ae fix(shield): prevent dashboard refresh loop
17ff0f3 fix(genlayer): expose policy contract to browser
1f3dbed fix(phase-c2): route overlay decisions via SW to originating tab
d87a679 docs(phase-c2): add implementation plan
```

## Operational troubleshooting

- **`NEXT_PUBLIC_PHASE_B_CONTRACT is not set`** in the dev console — the
  browser bundle did not see the env variable. Stop `npm run dev`, set
  the value in `.env.local`, and start the dev server again.
- **Activity History shows `Failed to fetch`** — the `/api/checks` read
  failed. Check the Next.js dev server logs: usually the GenLayer RPC
  is unreachable or `GENLAYER_CONTRACT_ADDRESS` is missing/wrong.
- **Wallet card says `unsupported`** — no EIP-1193 provider in the
  current browser. Install MetaMask (or another EIP-1193 wallet) and
  reload the page.
- **Live submit returns "policy court did not return a verdict"** —
  the on-chain transaction landed in a state other than
  `FINISHED_WITH_RETURN`, or the leader receipt did not include a
  parseable check id. The submission is not retried automatically;
  resubmit after a moment.

## Next human action

1. Re-read this checkpoint.
2. Confirm the env block matches the deployed policy court address.
3. Decide whether to walk the deferred Chrome MV3 smoke before public
   demo, or accept the documented deferral.
4. Tag/release from the latest `main` commit when ready to hand off.
