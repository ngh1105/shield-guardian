# Shield Guardian

Shield Guardian is a wallet decision layer that turns action packets into live
security verdicts.

## What it does

- fronts a wallet or dapp action packet with a verdict UI
- serves verdicts through `POST /api/verdict`
- integrates with a GenLayer policy court contract
- optionally exposes a Chrome MV3 companion extension for browser-side warnings

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

For a judging-ready walkthrough, follow [`DEMO.md`](./DEMO.md).

Run the full local demo verification:

```bash
npm run verify:demo
```

## Project structure

- `src/app` - Next.js routes and API handlers
- `src/components` - shared layout and UI primitives
- `src/features/shield` - Shield product UI, data, and helpers
- `src/lib` - server-side integration helpers
- `extension` - optional Chrome MV3 companion extension
- `contracts` - GenLayer intelligent contracts
- `docs` - architecture and rollout notes

## Key entry points

- `src/app/page.tsx`
- `src/app/api/verdict/route.ts`
- `src/features/shield/components/shield-page.tsx`
- `src/lib/genlayer-client.ts`
- `extension/popup.html`
- `extension/options.html`
- `contracts/shield_policy_court.py`

## Product model

The app is not a wallet replacement. It is a decision layer:

1. A wallet or dapp sends an action packet.
2. Shield returns a verdict.
3. The extension or UI warns the user before signing.
4. GenLayer handles challenge and loss-report flows when needed.

## Current status

- live verdicts are backed by GenLayer Studio
- the contract has been deployed and tested
- lint, production build, and web demo smoke checks pass
- demo mode is available for stable local judging when explicitly enabled
- the optional Chrome MV3 extension remains in the repo as bonus material
