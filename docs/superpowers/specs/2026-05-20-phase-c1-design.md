# Phase C-1 Design: Challenge + Loss Reporting UI

## Status

Date: 2026-05-20

Status: design ready for user review.

Scope: web app only. Phase C-2 remains the later Chrome extension MV3
`eth_sendTransaction` interception work.

Cost note: the standing project instruction is "ko cần quan tâm cost". C-1 will
not halt challenge or loss-report work because of cost warnings. The UI may show
normal wallet/network progress, but cost concern is not a blocking condition.

## Decisions

1. Challenge access mirrors the contract. Any connected wallet can challenge any
   visible check. The client does not filter challenge access by requester.
2. Loss reporting mirrors the contract. Only the original `requester` can submit
   `report_loss`; non-requester wallets see why the action is unavailable.
3. The UI surface is both immediate and retroactive:
   - Inline actions appear on the live verdict result after a live GenLayer check
     resolves.
   - The existing in-page `#history` Activity History section becomes the
     retroactive check-management surface. C-1 does not add a new `/activity`
     route because the current contract exposes `get_checks_for(address, limit)`
     rather than a broad public feed, and the app already has a history section
     wired to wallet invalidation.
4. Challenge rationale uses one required preset reason plus one optional comment.
5. There is no hard UI cap on `challenge_count`. The UI warns when a check has
   already been challenged 3 or more times.
6. After a write, the app shows an optimistic local status immediately, then
   refetches the affected wallet history and the overview. If the refreshed row
   disagrees with the optimistic state, on-chain state wins.

## Goals/Non-goals

Goals:

- Let a connected wallet challenge a live or historical check through MetaMask.
- Let the original requester report a loss for a live or historical check
  through MetaMask.
- Preserve the Phase B browser-signing model: no server-side private key, no
  server write endpoint, and all state-changing policy-court calls go through
  the EIP-1193 provider.
- Make post-write state visible through `coverage_status`, `challenge_count`,
  `loss_report_tx_hash`, and `note`.
- Keep the first implementation aligned with the existing single-page app and
  current contract read methods.

Non-goals:

- No Chrome extension changes in C-1.
- No contract changes for a global activity feed.
- No off-chain arbitration, payout accounting, file upload, or evidence storage.
- No attempt to bypass the contract's requester gate for `report_loss`.
- No new economic/cost gating.

## User flows

Live challenge flow:

1. User submits a live verdict from the analysis form.
2. The result card displays verdict provenance, coverage state, and action
   buttons.
3. User selects "Challenge verdict".
4. A dialog asks for a reason code and optional comment.
5. User confirms the app summary, then MetaMask signs `challenge_verdict`.
6. The result card marks the check as "Challenge submitted" optimistically.
7. The app refetches history and overview; refreshed on-chain state replaces the
   optimistic status.

Retroactive challenge flow:

1. User connects a wallet and opens `#history`.
2. Activity History lists checks returned by `get_checks_for(connectedWallet)`.
3. Each row exposes "Challenge" regardless of requester because visible rows are
   valid challenge targets.
4. The same challenge dialog and write flow run.

Live loss-report flow:

1. User submits a live verdict from the analysis form.
2. If the connected wallet matches the check requester, the result card exposes
   "Report loss".
3. User enters a transaction hash and structured loss summary fields.
4. MetaMask signs `report_loss`.
5. The UI optimistically shows "Loss report submitted".
6. Refetch updates the row to `payout_review` for safe checks or `denied` for
   non-safe checks, matching contract behavior.

Non-requester loss flow:

1. User sees a check whose requester differs from the connected wallet.
2. "Report loss" is disabled with copy: "Only the original requester can report
   loss for this check."
3. If account changes make the connected wallet match the requester, the action
   becomes enabled after the wallet context updates.

## UI design

The live verdict surface gets a compact post-verdict action block below the
briefing and before the existing "Abort Transaction" / "Proceed with Caution"
buttons. It shows:

- Current coverage status.
- Challenge count.
- "Challenge verdict" button.
- "Report loss" button when eligible for the connected wallet, otherwise a
  disabled button with explanatory title/copy.
- A transient action status line for wallet, submitted, refetching, and failed
  states.

The Activity History section evolves from a four-column table into a denser
check list/table. Each row includes:

- Check id and epoch.
- Protocol/action summary.
- Verdict badge.
- Coverage status badge.
- Challenge count.
- Row actions: Challenge, Report Loss.

Component boundaries:

- `ActivityHistory` remains the data-loading shell for connected-wallet checks.
- Add a presentational `CheckActivityRow` for row rendering and action
  availability.
- Add `VerdictPolicyActions` for the live result action block.
- Add shared `ChallengeDialog` and `LossReportDialog` components used by both
  live and history surfaces.
- Add a client hook such as `usePolicyCourtActions` to own write phases,
  optimistic labels, errors, and invalidation calls.
- Extend `CheckRow` to carry `requester`, `claimedRequester`,
  `coverageStatus`, `lossReportTxHash`, `note`, `challengeCount`, and
  `transactionHash` when available.

No new `/activity` route is added in C-1. A future route can reuse the same row
and dialog components if the contract later adds a broader feed.

## Data/write flow

Reads:

- Keep `/api/checks?address=<wallet>&limit=<n>` backed by
  `get_checks_for(connectedWallet, limit)`.
- Expand the response mapping instead of adding a new server API surface.
- Keep `/api/overview` for aggregate refresh.
- Live verdict results already include provenance; C-1 should include enough
  check metadata in the mapped result to drive the action block without a second
  immediate read.

Writes:

- Extend `src/lib/genlayer/browser-sdk-adapter.ts` with browser-signed write
  helpers:
  - `challengeBrowserVerdict(checkId, rationale, deps)`
  - `reportBrowserLoss(checkId, txHash, lossSummary, deps)`
- These helpers use the same Phase B client shape:
  `createClient({ account: walletAddress, chain: studionet, provider })`.
- Per Phase B, omit per-call `account` on `writeContract`.
- Use `ensureStudionet` before every state-changing call, through the same path
  as the verdict submission flow.
- Wait for accepted transaction receipt where the SDK supports it, then refetch
  relevant reads.

Optimistic/refetch behavior:

- On challenge submission, update the local check display to
  `coverage_status="challenged"` and increment displayed `challenge_count` by 1.
- On loss submission, show `coverage_status="payout_review"` only if the
  current verdict is `SAFE`; otherwise show `coverage_status="denied"` because
  that is the contract's deterministic branch.
- Trigger `wallet.bumpInvalidation()` after accepted write so `ActivityHistory`
  and `OverviewStats` refetch.
- If refetch fails, keep the optimistic status with a warning that live refresh
  failed.

Challenge rationale serialization:

The string sent to `challenge_verdict` is:

```text
reason=<CODE>;comment=<COMMENT>
```

`CODE` is one of:

- `MISCLASSIFIED_SAFE`: verdict looked too permissive for the submitted action.
- `MISCLASSIFIED_DANGEROUS`: verdict looked too harsh for a known legitimate
  flow.
- `MISSING_CONTEXT`: website, protocol, or raw signals omitted important facts.
- `STALE_OR_CHANGED_SITE`: site or transaction context changed after the check.
- `SUSPICIOUS_AFTER_REVIEW`: user found new suspicious evidence after the
  verdict.

`COMMENT` is trimmed user text. Semicolons and line breaks are replaced with
spaces before submission so the note remains parseable. Empty comments serialize
as `comment=`.

Loss summary serialization:

The string sent to `report_loss` is:

```text
impact=<IMPACT>;amount_usd=<AMOUNT>;asset=<ASSET>;comment=<COMMENT>
```

`IMPACT` is one of:

- `FUNDS_LOST`
- `APPROVAL_ABUSED`
- `BRIDGE_OR_SWAP_FAILURE`
- `ACCOUNT_COMPROMISED`
- `OTHER`

`AMOUNT` is a decimal string supplied by the user or empty when unknown.
`ASSET` is a short token/symbol/free-text asset label or empty. `COMMENT` is the
required narrative summary, sanitized like challenge comments.

## Validation

Challenge form:

- Reason code is required.
- Optional comment max length: 280 characters after trimming.
- Serialized rationale max length: 420 characters.
- If `challenge_count >= 3`, show warning copy before confirmation:
  "This check has already been challenged several times. Another challenge is
  allowed, but the policy court will use the full challenge history."

Loss form:

- `tx_hash` is required.
- Client accepts only `0x` followed by 64 hex characters.
- Impact code is required.
- Comment is required, 20 to 500 characters after trimming.
- Amount USD is optional. If present, it must be a non-negative decimal with at
  most two decimal places.
- Asset label is optional, max 32 characters.
- Serialized summary max length: 700 characters.

Address checks:

- Compare requester and connected wallet case-insensitively.
- Challenge button only requires a connected wallet and a valid visible check id.
- Report Loss requires connected wallet, requester match, and no pending write.

## Error handling

- Missing wallet provider: keep existing unsupported wallet state and disable
  write actions.
- Disconnected wallet: show connect prompt in action area.
- Wrong chain or missing studionet: reuse Phase B preflight. If wallet rejects
  add/switch, show the rejection and keep form state.
- User rejects MetaMask signing: show "Wallet signature rejected" and allow retry.
- Contract requester failure on `report_loss`: show
  "Only the original requester can report loss for this check." This can still
  happen after an account switch race, so the UI must handle it even when the
  button was enabled.
- Invalid check id or read failure: show row-level error and keep the rest of
  history usable.
- Refetch failure after accepted write: keep optimistic status, show a warning,
  and provide a "Refresh history" action.

## Testing

Automated checks:

- Unit-test serialization helpers for challenge rationale and loss summary,
  including semicolon/newline sanitization and length bounds.
- Unit-test tx hash validation with valid hash, missing `0x`, short hash,
  non-hex, and uppercase hex cases.
- Unit-test requester comparison as case-insensitive.
- Component-test action availability for connected requester, connected
  non-requester, disconnected wallet, and unsupported wallet states.
- Verify `npm run lint` and `npm run build`.

Manual browser smoke:

- Submit a live verdict with MetaMask on studionet, then challenge it from the
  live result card.
- Challenge an older row from Activity History.
- Report loss from the requester wallet for a safe check and confirm
  `coverage_status` becomes `payout_review`.
- Report loss from the requester wallet for a non-safe check and confirm
  `coverage_status` becomes `denied`.
- Switch to a non-requester wallet and confirm Report Loss is disabled; attempt
  cannot be submitted from the UI.
- Repeat Phase B open MetaMask smoke items that remain manual: wrong-chain
  behavior, add-chain UX, confirmation copy, and receipt timing.

## Open follow-ups

- A global challenge feed needs a contract read method such as
  `get_recent_checks(limit)` or paginated index reads. C-1 does not add it.
- A future `/activity` page can be added once history needs filters,
  pagination, or public/global views beyond the current landing-page section.
- Loss reports may later need evidence attachments or external incident links.
  C-1 stores only the on-chain `tx_hash` and structured summary string.
- Reason and impact taxonomies can be revised after real user smoke tests, but
  C-1 ships the conservative sets above to avoid blank free-form-only reports.
- Public deployment remains gated by the unresolved manual MetaMask smoke from
  the Phase B feasibility document.
