# Demo Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining demo-readiness gaps without expanding Shield Guardian into a production wallet or store-published extension.

**Architecture:** Keep the existing Next.js app, API route, and MV3 extension boundaries. Add a visible web demo-mode toggle, clearer coverage/challenge storytelling, extension packaging automation, and a one-command demo smoke check.

**Tech Stack:** Next.js App Router, React client components, Chrome MV3 extension files, Node.js verification scripts.

---

## Task 1: Web Demo Controls and Readiness Story

**Files:**
- Modify: `src/features/shield/lib/request-verdict.ts`
- Modify: `src/features/shield/components/shield-page.tsx`
- Modify: `src/features/shield/shield-page.module.css`

- [ ] Allow the web verdict request helper to send `x-shield-demo-mode: 1`.
- [ ] Add a web UI demo-mode toggle near the analysis form.
- [ ] Add a demo readiness section that explains live GenLayer vs demo/mock, extension packaging, and verification status.
- [ ] Add a coverage/challenge flow panel that makes the contract story visible in the demo.

## Task 2: Packaging and Automated Demo Smoke

**Files:**
- Create: `scripts/package-extension.mjs`
- Create: `scripts/smoke-demo.mjs`
- Modify: `package.json`

- [ ] Add a deterministic zip packager for the unpacked MV3 extension.
- [ ] Add a script that starts `next start` on a temporary port with demo mode enabled and smoke-tests all three packets.
- [ ] Add npm scripts `package:extension`, `smoke:demo`, and `verify:demo`.

## Task 3: Documentation

**Files:**
- Modify: `DEMO.md`
- Modify: `README.md`
- Modify: `extension/README.md`

- [ ] Document web demo mode.
- [ ] Document extension package output.
- [ ] Document one-command demo verification.

## Task 4: Verification

**Commands:**
- `npm run lint`
- `npm run build`
- `npm run check:extension`
- `npm run package:extension`
- `npm run smoke:demo`

- [ ] Run all checks.
- [ ] Record any remaining non-code gaps.
