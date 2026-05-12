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

## Runtime Setup

Use the fixed Studionet contract:

```env
GENLAYER_RPC_URL=https://studio.genlayer.com/api
GENLAYER_CONTRACT_ADDRESS=0x0B6C673eBb242fb171291bc4ADCCa9785cDDa65f
GENLAYER_ACCOUNT_NAME=shieldtest
```

The current server integration shells out to the installed `genlayer` CLI. The
named account must exist locally and be unlocked before live verdict requests
can be submitted.

## Contract Surface

- `submit_action_check`: stores an action packet and resolves a verdict
- `challenge_verdict`: reopens a stored check and increments `challenge_count`
- `report_loss`: records a loss report and updates coverage status
- `get_check`: reads one stored action check
- `get_overview`: returns aggregate verdict counts
