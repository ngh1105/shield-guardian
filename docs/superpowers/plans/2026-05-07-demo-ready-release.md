# Demo-Ready Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shield Guardian reliable enough for a judging/demo flow without expanding into a full wallet or SDK.

**Architecture:** Keep the existing Next.js API as the server boundary and keep the MV3 extension as a warning-only client. Add explicit verdict provenance and an opt-in demo mode so demo reliability improves without hiding whether a verdict is live or mocked.

**Tech Stack:** Next.js App Router route handlers, React client components, Chrome MV3 JavaScript extension, Node.js verification scripts.

---

## File Structure

- Modify `src/features/shield/types.ts`: add verdict provenance types.
- Modify `src/lib/genlayer-client.ts`: attach GenLayer check metadata to mapped verdicts.
- Modify `src/features/shield/lib/mock-verdict.ts`: fix copy encoding and attach mock provenance.
- Modify `src/app/api/verdict/route.ts`: add explicit demo-mode gate.
- Modify `src/features/shield/components/shield-page.tsx`: display provenance in the app verdict panel.
- Modify `src/features/shield/shield-page.module.css`: style provenance rows.
- Modify `extension/shared.js`: add demo packets, demoMode storage, and stronger warning copy.
- Modify `extension/background.js`: send demo-mode header when settings enable it.
- Modify `extension/options.html`: add demo mode setting.
- Modify `extension/options.js`: load/save demo mode.
- Modify `extension/popup.html`: add quick packet buttons.
- Modify `extension/popup.js`: load demo packets and render provenance.
- Modify `extension/styles.css`: style demo controls and provenance.
- Create `scripts/check-extension.mjs`: validate manifest file references and permission shape.
- Create `scripts/smoke-api.mjs`: smoke-test `/api/verdict` with demo-mode header.
- Modify `package.json`: add `check:extension` and `smoke:api`.
- Create `DEMO.md`: demo setup and judging checklist.
- Modify `README.md`: point reviewers to `DEMO.md`.

## Tasks

### Task 1: Verdict Provenance and Demo Mode

**Files:**
- Modify: `src/features/shield/types.ts`
- Modify: `src/lib/genlayer-client.ts`
- Modify: `src/features/shield/lib/mock-verdict.ts`
- Modify: `src/app/api/verdict/route.ts`

- [ ] Add `ShieldVerdictProvenance` and optional `provenance` to `ShieldVerdictResponse`.
- [ ] Add GenLayer provenance when mapping `get_check` output.
- [ ] Fix mojibake mock verdict copy and add `source: "mock"` provenance.
- [ ] Add demo mode only when `SHIELD_ENABLE_DEMO_MODE=1` and `x-shield-demo-mode: 1`.
- [ ] Run `npm run lint`.

### Task 2: Web Demo Provenance UI

**Files:**
- Modify: `src/features/shield/components/shield-page.tsx`
- Modify: `src/features/shield/shield-page.module.css`

- [ ] Add provenance rows under the risk hero.
- [ ] Show `source`, `checkId`, `contractAddress`, `transactionHash`, and `coverageStatus` when present.
- [ ] Keep the UI compact on mobile.
- [ ] Run `npm run lint`.

### Task 3: Extension Demo Controls

**Files:**
- Modify: `extension/shared.js`
- Modify: `extension/background.js`
- Modify: `extension/options.html`
- Modify: `extension/options.js`
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`
- Modify: `extension/styles.css`

- [ ] Add `demoMode` to extension settings.
- [ ] Add quick packet buttons for safe, weird, and dangerous examples.
- [ ] Send `x-shield-demo-mode: 1` only when demo mode is enabled.
- [ ] Render verdict provenance inside the popup.
- [ ] Ensure warning copy still requires acknowledgement for `WEIRD`.
- [ ] Run `npm run check:extension` after Task 4 creates the script.

### Task 4: Demo Docs and Verification Scripts

**Files:**
- Create: `scripts/check-extension.mjs`
- Create: `scripts/smoke-api.mjs`
- Modify: `package.json`
- Create: `DEMO.md`
- Modify: `README.md`
- Modify: `.env.example`

- [ ] Add a Node script that verifies manifest references and permission scope.
- [ ] Add a Node script that posts demo packets to `/api/verdict`.
- [ ] Add npm scripts for both checks.
- [ ] Document the local demo setup without exposing secrets.
- [ ] Add `SHIELD_ENABLE_DEMO_MODE=0` to `.env.example`.
- [ ] Run `npm run check:extension`.

### Task 5: Final Verification

**Files:**
- No source edits expected unless verification exposes a bug.

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run check:extension`.
- [ ] If a dev server is available, run `SHIELD_ENABLE_DEMO_MODE=1 npm run smoke:api` or the PowerShell equivalent.
- [ ] Record any verification gaps in the final response.

## Self-Review

- Spec coverage: provenance, demo mode, extension controls, docs, and checks are all mapped to tasks.
- Placeholder scan: no `TBD`, empty TODO, or unspecified implementation steps remain.
- Type consistency: `demoMode`, `provenance`, and `x-shield-demo-mode` are named consistently across API, extension, and docs.
