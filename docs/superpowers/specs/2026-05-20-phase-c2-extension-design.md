# Phase C-2 Design: Chrome Extension MV3 hooking `eth_sendTransaction`

## Status

Date: 2026-05-20

Status: design ready for user review.

Scope: Chrome Manifest V3 extension hook for EIP-1193 `eth_sendTransaction`.
Builds on Phase B (browser-signed GenLayer writes) and Phase C-1 (challenge +
loss-report UI in the web app). Web-app code remains the source of truth for
live policy-court reads/writes; the extension is a pre-screen surface, not a
second backend.

Cost note: standing instruction "ko cần quan tâm cost" applies. C-2 will not
defer features, downgrade UX, or shorten work because of cost warnings. Hook
warnings about cost are acknowledged once and ignored.

## Context

The current `extension/` scaffold (`manifest.json`, `popup.html/.js`,
`options.html/.js`, `background.js`, `content.js`, `shared.js`,
`styles.css`, `README.md`) is a tab-context capture and demo-packet popup. It:

- Captures the active tab (`pageUrl`, `pageOrigin`, `pageTitle`,
  `selectedText`, `activeElement`) on demand.
- Lets the user fill an action packet by hand or from a demo button.
- Sends the packet to `POST /api/verdict` and renders the result.
- Does not touch wallet methods, calldata, or `window.ethereum`.

The Phase B/C-1 web app at `/` already runs the live verdict path through
`window.ethereum` via `submitBrowserVerdictRequest` in
`src/lib/genlayer/browser-sdk-adapter.ts`. The challenge and loss-report
helpers in the same file follow the same shape (bare `Address` for
`createClient.account`, no per-call `account` on `writeContract`,
`ensureStudionet` preflight at the call sites).

C-2 adds an MV3 hook into `eth_sendTransaction` so a wallet-bound action gets
a Shield Guardian verdict review **before** the wallet popup appears. The
extension does not sign, broadcast, or hold keys; it brokers a verdict and
optionally hands off to the web app for on-chain recording.

## Goals

- Intercept `eth_sendTransaction` requests from EIP-1193 providers (primarily
  MetaMask) and present a Shield Guardian verdict before the wallet
  confirmation popup is shown.
- Normalize each intercepted request into a `ShieldVerdictRequest`-shaped
  packet without breaking dapp semantics or wallet behavior.
- Reuse `POST /api/verdict` (demo/heuristic mode) for the inline pre-screen
  verdict so C-2 ships no new backend.
- Let the user `Proceed` (resolve to wallet) or `Cancel` (reject with a
  4001-style "user rejected" error) from the extension UI.
- Provide a hand-off to the Shield Guardian web app for live, signed
  policy-court recording, kept off the `eth_sendTransaction` critical path so
  it does not race the wallet's pending request.
- Stay within MV3 constraints: no remote-hosted code, declarative manifest,
  service-worker background, page-world content script for provider wrapping.
- Keep the existing demo popup, options page, and `npm run check:extension`
  behavior working unless Phase C-2 explicitly extends them.

## Non-goals

- Hooking `eth_sign`, `personal_sign`, or `eth_signTypedData_v4`. Listed as
  open follow-up; not in C-2.
- Any USD price oracle. `assetValueUsd` and `gasCostUsd` default to `0` in
  intercept-derived packets.
- A new server endpoint or write path. The extension never calls policy-court
  writes directly. Live policy-court recording continues through the web app.
- Origin allowlists/blocklists beyond a static MV3 host scope. A per-origin
  policy UI is deferred.
- Replacing or wrapping MetaMask's own confirmation UI. C-2 sits in front of
  the wallet, never inside it.
- Firefox, Safari, or other browser ports.
- Multi-tab synchronization of intercepted requests beyond
  `chrome.storage.session`.

## Current extension audit

`extension/manifest.json`:

- MV3, service worker `background.js` (module type), `popup.html` action,
  `options.html` options page.
- `permissions`: `activeTab`, `storage`, `scripting`.
- `host_permissions`: `http://localhost/*`, `http://127.0.0.1/*`.
- `optional_host_permissions`: `http://*/*`, `https://*/*`.
- No `content_scripts` declarations; `content.js` is injected on demand by
  the popup via `chrome.scripting.executeScript`.

`extension/background.js`:

- Default settings init on install.
- Three message handlers: `SHIELD_GET_STATE`, `SHIELD_CAPTURE_ACTIVE_TAB`,
  `SHIELD_ANALYZE`.
- `SHIELD_ANALYZE` POSTs to the configured `/api/verdict` and writes the
  result to `chrome.storage.session`.

`extension/content.js`:

- Self-guarded re-entry via `globalThis.__shieldGuardianContextListener`.
- Single message: `SHIELD_CAPTURE_CONTEXT`. Returns page metadata only.

`extension/popup.js`:

- Demo packet buttons, manual form, `Capture tab` to prefill.
- Renders verdict from `SHIELD_ANALYZE`.

`extension/options.js`:

- API base URL + demo-mode toggle. Requests host permission for the chosen
  origin.

`scripts/check-extension.mjs`:

- Asserts MV3, presence of `background.service_worker`,
  `action.default_popup`, `options_page`, listed `permissions`, that
  `host_permissions` includes both localhost forms but NOT `<all_urls>`, and
  that `optional_host_permissions` covers `http://*/*` and `https://*/*`.
- Walks HTML/JS references to ensure files exist.

`scripts/package-extension.mjs`:

- Recursively zips `extension/` into `dist/shield-guardian-extension-v0.1.0.zip`.
- Already picks up new files automatically; no per-file allowlist.

The scaffold is healthy; C-2 extends it with a provider-wrapping pipeline and
a verdict overlay, without removing any existing surface.

## Architecture

C-2 introduces a small set of focused components, each with one job. The
files below are what the implementation plan will create or extend.

```
[ dapp page (MAIN world) ]
  ├─ extension/inject/sg-injector.js      (page-world script, document_start)
  │     wraps window.ethereum and EIP-6963 announced providers
  │     intercepts eth_sendTransaction requests, posts to bridge
  │     awaits decision before resolving/rejecting the original promise
  │
  v
[ content script (ISOLATED world) ]
  └─ extension/content/sg-bridge.js       (declared content_script)
        relays nonce-tagged window.postMessage <-> chrome.runtime.sendMessage
        injects sg-injector.js into MAIN world via scripting.executeScript
        injects the overlay iframe sg-overlay.html into the page DOM
  ^
  |
[ service worker (background.js, extended) ]
  └─ extension/background.js              (already present)
        new handler: SHIELD_INTERCEPT
          - validates packet
          - calls /api/verdict in demo/heuristic mode
          - returns verdict to bridge
          - persists last N intercepts to storage.session
        existing handlers untouched
  ^
  |
[ overlay iframe in the dapp page ]
  └─ extension/overlay/sg-overlay.html    (extension-origin iframe)
        renders verdict, Proceed / Cancel / Open in Shield Guardian
        runs in extension origin; talks to the bridge via runtime messaging
```

The web app at `/` is unchanged for the eth_sendTransaction path. A new
`/?prefill=<base64-json>` query param is the only web-app-side addition: it
prefills the analysis form so "Open in Shield Guardian" lands on a
ready-to-submit verdict form. `prefill` is a strict, schema-validated JSON
shape; unknown keys are ignored.

### Trust boundary

| Surface                          | Trusts                              | Treats as untrusted              |
| -------------------------------- | ----------------------------------- | -------------------------------- |
| `sg-injector.js` (page world)    | nothing                             | dapp DOM, dapp scripts, provider |
| `sg-bridge.js` (isolated world)  | extension origin, runtime           | postMessage payloads, dapp DOM   |
| `background.js` (service worker) | extension origin, configured API    | runtime messages from bridge     |
| `sg-overlay.html` (iframe)       | extension origin, runtime           | dapp page below                  |
| Web app `/`                      | only its own origin and the wallet  | `prefill` query string           |

The bridge is the only component with `chrome.runtime` access. Page scripts
cannot reach the service worker directly. The overlay iframe runs in the
extension origin and is unaffected by dapp CSP.

## Injection and provider wrapping

### Why page-world

Wrapping `window.ethereum.request` and EIP-6963 events requires running in
the page's MAIN world; isolated content scripts have a separate global scope
and cannot patch the dapp-visible `window.ethereum`. C-2 uses a declared
content script with `world: "MAIN"`, `run_at: "document_start"`,
`all_frames: true`, plus a second declared `world: "ISOLATED"` content
script (`sg-bridge.js`) that owns runtime messaging and overlay injection.

Both are declared in `manifest.json`'s `content_scripts` so they run before
dapp scripts and survive page reloads. The popup's existing on-demand
`SHIELD_CAPTURE_CONTEXT` injection is unaffected.

### What gets wrapped

1. `window.ethereum` if already present at document_start — wrap immediately.
2. `window.ethereum` setter trap — if a provider is assigned later, wrap it
   on assignment.
3. EIP-6963 — listen for `eip6963:announceProvider` and re-announce a wrapped
   detail. Issue a fresh `eip6963:requestProvider` to discover providers
   that announced before our listener attached.
4. Cached references — dapps that captured a reference before injection
   keep the wrapped reference because we patched in place; the assignment
   trap covers wallets that swap providers mid-session.

### Wrapper semantics

The wrapper is a `Proxy` over the original `request` function. For any
method other than `eth_sendTransaction` (the only intercept target in C-2),
the wrapper calls through unchanged and returns the original promise. For
`eth_sendTransaction`:

1. Capture `params[0]` as the unsigned-tx object.
2. Generate a nonce (`crypto.randomUUID()`).
3. `window.postMessage` the packet plus nonce to the bridge with
   `targetOrigin: window.location.origin`.
4. Return a `Promise` whose resolver/rejector is keyed by nonce.
5. When the bridge posts back the verdict + decision:
   - `Proceed`: invoke the original `request({method, params})`, forward the
     resulting promise resolution/rejection to the wrapper consumer.
   - `Cancel`: reject with `{ code: 4001, message: "Shield Guardian: user
     rejected request." }`. This matches the EIP-1193 error code dapps
     already handle for "user rejected".
6. Failure modes (timeout, bridge crash, malformed response) reject with
   `{ code: -32603, message: "Shield Guardian internal error: <reason>" }`
   so dapps surface a generic provider error rather than hang.

The wrapper preserves async ordering and never calls the original `request`
twice for one user-initiated invocation.

### What we do not change

- The wallet's own confirmation UI is left intact. After `Proceed`, the
  wallet popup appears as it does today.
- Provider events (`accountsChanged`, `chainChanged`, etc.) are passed
  through unchanged. Subscriptions and other JSON-RPC methods are not
  intercepted.
- `window.ethereum.isMetaMask` and similar identity flags remain reachable
  via the proxy.

## Message flow

```
[page] sg-injector
  -- window.postMessage({type: "SG_INTERCEPT_REQ", nonce, packet}, origin) -->
[isolated] sg-bridge
  -- chrome.runtime.sendMessage({type: "SHIELD_INTERCEPT", nonce, packet}) -->
[sw] background
  validates, calls fetch(/api/verdict), shapes response
  -- sendResponse({ok, verdict, source, packetEcho}) -->
[isolated] sg-bridge
  injects/updates overlay iframe and forwards verdict via postMessage
  to overlay; overlay renders, awaits decision
[overlay] sg-overlay
  -- chrome.runtime.sendMessage({type: "SHIELD_INTERCEPT_DECISION", nonce, choice}) -->
[isolated] sg-bridge
  -- window.postMessage({type: "SG_INTERCEPT_RES", nonce, choice}, origin) -->
[page] sg-injector
  resolves or rejects the original promise based on choice
```

### What crosses each boundary

- **page → isolated**: `{type, nonce, packet}` only. No DOM nodes, no
  closures, no functions. `packet` is a plain JSON object validated against
  the schema in *Verdict packet normalization* below.
- **isolated → sw**: same payload plus the bridge-known `tabId` and
  `frameId` from `chrome.runtime`. The bridge does not trust the page
  origin; it independently records the frame/tab and uses
  `chrome.runtime.sender` echo back for the response.
- **sw → /api/verdict**: a `ShieldVerdictRequest` JSON body, with
  `x-shield-demo-mode: 1` always set in C-2 (see *Why `/api/verdict` demo
  mode* below).
- **sw → isolated**: verdict response plus the SW-validated `packetEcho`
  (the same packet shape, normalized once at the SW). The SW also stores
  `(nonce → packet)` in `chrome.storage.session` for the popup's recent
  intercepts panel.
- **isolated → overlay**: verdict + nonce + `packetEcho` via runtime
  messaging. The overlay iframe runs in the extension origin and trusts
  the runtime channel; it never reads from cross-origin postMessage.
- **overlay → page**: indirect, via the bridge. The page never receives
  anything from the overlay directly.

### Validation rules

The bridge rejects any postMessage whose `event.source !== window` or whose
`event.origin !== window.location.origin`. The service worker rejects any
runtime message that does not match the declared schema (`type` enum,
`nonce` UUID, `packet` object with the keys below). Numeric fields are
parsed with the same `parseUsdNumber`-style guard already used in
`/api/verdict`.

## Verdict packet normalization

`eth_sendTransaction` `params[0]` exposes (per EIP-1193 / EIP-1474):

```text
from:  Address
to?:   Address           // missing = contract creation
value?: 0x-hex            // wei
data?:  0x-hex            // calldata
gas?:   0x-hex
gasPrice? / maxFeePerGas? / maxPriorityFeePerGas? / nonce? / type?
```

C-2 derives a `ShieldVerdictRequest` plus a small auxiliary struct kept on
the SW side for storage and overlay rendering.

### Decoded fields

`actionType`:

- If `data` is missing or `0x` and `value` is non-zero → `"sign"`. (Native
  transfer; we treat it as a generic signing intent in v1.)
- If `data` selector (first 4 bytes) is `0x095ea7b3` (`approve`) →
  `"approve"`.
- If selector is `0xa9059cbb` (`transfer`) or `0x23b872dd`
  (`transferFrom`) → `"sign"`.
- If selector matches a static C-2 dictionary of well-known bridge
  selectors (Hop, Across, Stargate, LayerZero) → `"bridge"`.
- If selector matches a static C-2 dictionary of well-known claim/airdrop
  selectors (`claim(...)`, `claimReward`, `mint`) → `"claim"`.
- Otherwise → `"sign"`.

The dictionary lives in `extension/inject/selectors.js`, ships ~30 entries
covering the dominant routers, and is documented as best-effort. Unknown
selectors fall back to `"sign"`. This avoids both false `claim` flags and
silently-routed phishing traffic.

`protocol`: best-effort, in priority order: explicit `data-shield-protocol`
DOM attribute, then `document.title` clamped to 64 chars, then the page
hostname.

`website`: `location.href` captured at intercept time. The bridge re-reads
`location.origin` independently and rejects if the page origin disagrees;
this defeats trivial spoofing of `window.location` via getter overrides.

`summary`: assembled string of the form
`"<actionType> via <protocol>: to=<short-to>, value=<eth>, selector=<sel>"`.
For known selectors with decoded args (`approve(spender, amount)`,
`transfer(to, amount)`), include the spender/recipient short hash. The
overlay shows the full untruncated summary; the packet stays under 280
characters.

`rawSignals`: pipe-joined string with `from`, `to`, `value` (decimal eth),
`selector`, `gas`, plus a `chainId` echo from `wallet_chainId` (read once
per intercept, cached for 5 seconds in the SW).

`assetValueUsd`: `0`. USD valuation is deferred.

`gasCostUsd`: `0`. Same reason.

### Incomplete / hostile calldata

- Missing `to` (contract creation): packet still flows; selector decoding
  is skipped; `actionType = "sign"`; summary reads
  `"contract deployment from <short-from>"`.
- Calldata shorter than 4 bytes: `actionType = "sign"`, selector is
  recorded as `0x` in `rawSignals`.
- Calldata that decodes to a known selector but with malformed args: keep
  `actionType` from the selector match, but set summary to
  `"<actionType> via <protocol>: undecoded args"`.
- Oversized calldata (> 32 KiB): truncate the calldata recorded in
  `rawSignals` to the first 32 bytes plus length, and tag the summary
  `"oversize calldata (<bytes> B)"`.

### Why `/api/verdict` demo mode

C-2 is a pre-screen, not an on-chain record. Three reasons to keep it on
demo mode for now:

1. **Wallet contention.** The user's wallet is already mid-flow on the
   intercepted `eth_sendTransaction`. A live signed `submit_action_check`
   would need a second wallet popup — at best a confusing UX, at worst a
   provider deadlock.
2. **Latency budget.** A live policy-court submit takes seconds (per Phase
   B, no receipt wait on studionet but consensus rotation still applies).
   The pre-screen target latency is sub-second.
3. **No new backend.** `/api/verdict` already returns a full verdict object
   in demo mode (`getShieldVerdict`), which the route handler and the
   overlay both already render.

Live, signed policy-court recording remains available via the
`Open in Shield Guardian` button in the overlay (see *User experience*).
That hand-off resolves the wallet contention issue by waiting for the
intercepted tx to settle before issuing its own request.

## User experience

### Overlay states

The overlay iframe is injected into the dapp page DOM by the bridge as a
`<iframe src="chrome-extension://<id>/overlay/sg-overlay.html?nonce=...">`
with `position: fixed; inset: 0; z-index: 2147483646;`. The dapp page
remains in the background and is not blocked from receiving events outside
the iframe, but the iframe captures focus and is dismissable only via the
overlay's own buttons or `Escape`.

States by verdict:

- `SAFE`:
  - Compact bottom-right pill, not a full-screen modal.
  - Auto-proceeds after a 2-second visible countdown unless the user clicks
    `Hold` (which expands to the full review modal).
  - `Open in Shield Guardian` link in the corner for the curious user.
- `WEIRD`:
  - Full-screen modal, yellow accent.
  - Lists reasons and the decoded summary.
  - Buttons: `Proceed`, `Cancel`, `Open in Shield Guardian`.
  - `Proceed` requires one click; no typed confirmation.
- `DANGEROUS`:
  - Full-screen modal, red accent.
  - Same content as WEIRD plus a "What's wrong" reasons block highlighted.
  - Default action is `Cancel`.
  - `Proceed despite warning` is a secondary button that requires the user
    to first click `Show override` to reveal it. No typed confirmation.
- API failure / no verdict:
  - Yellow modal labeled `Verdict unavailable`.
  - Shows the decoded packet so the user can self-review.
  - Buttons: `Proceed`, `Cancel`. Default focus is `Cancel`.

### What the user sees before MetaMask

The extension overlay appears first. It shows the decoded tx summary, the
verdict label, the verdict reasons, and the verdict source (`Demo/mock`
during C-2). Only after `Proceed` does the wallet popup appear. On
`Cancel`, the wallet popup never appears and the dapp receives a
`code: 4001` error.

### Open in Shield Guardian

The overlay's `Open in Shield Guardian` button does not interrupt the
intercepted request. It opens a new tab to
`<apiBaseUrl>/?prefill=<base64url(json)>` (default `http://localhost:3000`),
where the payload is the decoded packet JSON. The web app parses,
validates against the existing `ShieldFormState` shape, and prefills the
analysis form. The encoded payload is capped at 4 KiB; oversized packets
fall back to opening `/` with no prefill and the user retypes. No new
API surface is introduced; live-verdict + challenge flows continue to
go through Phase C-1's existing browser-signed path.

### Recent intercepts

The popup gains a new `Recent intercepts` panel appended after the existing
verdict-panel: a list of the last 10 intercepted requests from
`chrome.storage.session`, each with verdict label, host, action type,
time, and an `Open in Shield Guardian` link. This is read-only and clears
with the session. The existing access strip, capture-tab, action-packet
form, and verdict panels are unchanged.

## Security model

### Threats and mitigations

- **Hostile page tampers with `sg-injector.js`.** The injector lives in the
  page world and is reachable in principle. Mitigations: (a) it captures
  references to `JSON.stringify`, `Object.freeze`, `crypto.randomUUID`,
  `Promise`, and the original `window.ethereum.request` at injection time
  before the dapp runs, then freezes its own internal state; (b) all
  cross-boundary state is held in the bridge (isolated world), which the
  page cannot reach; (c) the bridge rejects messages whose `event.source`
  is not `window` or whose origin is not `location.origin`.
- **Page spoofs metadata** (`document.title`, `location.href`). The bridge
  re-reads `location.origin`/`location.href` from its own context and
  refuses if the page-supplied `website` does not start with the bridge's
  `location.origin`. `protocol` is treated as untrusted user content; it is
  HTML-escaped before render and never used as a key.
- **Wallet address leakage.** The extension never sends `from` to any
  endpoint other than the configured Shield API. `from` is recorded in
  `rawSignals` for the verdict packet only. `chrome.storage.session` keeps
  the address for the recent-intercepts list and is wiped on browser
  close.
- **Recursion.** The wrapper sets a per-call `__sgInFlight = true` symbol
  on the wrapped request before delegating to the original; the bridge
  ignores any inbound message whose nonce is already in flight; the SW
  drops duplicate `SHIELD_INTERCEPT` messages for the same nonce. There is
  one wallet popup per user click, no matter how many times the page tries
  to call `request`.
- **Duplicate prompts.** Coalesce by `(tabId, frameId, nonce)` for 30
  seconds in the SW. A repeat request reuses the prior verdict; the
  overlay reuses its existing iframe.
- **MV3/CSP constraints.** The injector and the overlay are bundled with
  the extension; no remote code. The overlay iframe runs at the extension
  origin, so its CSP is the extension's own. The injector, running in the
  page world, is subject to the dapp CSP for fetch — but it does no fetch;
  all network requests go through the SW.
- **Origin scope.** C-2 ships with `host_permissions` unchanged from
  today (`http://localhost/*`, `http://127.0.0.1/*`) plus the existing
  `optional_host_permissions` (`http://*/*`, `https://*/*`). The user
  grants per-origin access through the existing options page before the
  extension can talk to a dapp. Until granted, the injector is not loaded
  on that origin (declared `content_scripts` honor `host_permissions` /
  granted optional permissions). Allowlist/blocklist UI is deferred.
- **MV3 service worker termination.** All shared state (recent intercepts,
  pending nonces) is held in `chrome.storage.session`, so the service
  worker can be terminated and respawned mid-flow without dropping a
  pending intercept. The injector's pending Promise also has a 60-second
  timeout; if the worker never replies, the wrapped request rejects with
  internal error rather than hanging the dapp.
- **EIP-1193 error contract.** Cancel uses `code: 4001` so existing dapp
  error handling treats it identically to a wallet rejection. Internal
  errors use `code: -32603` ("Internal error") per JSON-RPC.

## Compatibility notes

- **MetaMask** is the primary target. Provider exposes `request`,
  `isMetaMask`, and announces via EIP-6963 in recent versions. The wrapper
  handles both `window.ethereum` direct and EIP-6963 announce paths.
- **Multiple providers.** Each EIP-6963 announcement is wrapped on its
  own; we re-announce wrapped detail on the same channel. The dapp's own
  provider selection logic still wins.
- **Cached references.** The injector runs at `document_start` before
  dapp scripts; references captured by dapp scripts are already wrapped.
  For the rare wallet that replaces `window.ethereum` after page load, the
  setter trap re-wraps on assignment.
- **Async timing.** All wrapping happens synchronously inside the injector
  on first script execution. The wrapper does not introduce additional
  microtask hops in the non-intercept path; in the intercept path, the
  added latency is one round-trip through the bridge plus the SW fetch.
- **Browser permissions.** No new manifest permission is required beyond
  what the extension already has; declared `content_scripts` use the same
  host scope as `host_permissions`/granted optional permissions.
- **Page-world content scripts** are MV3-supported as of Chrome 111. The
  manifest declares `world: "MAIN"` for the injector; bridges run in the
  default isolated world.
- **CSP-strict pages** (e.g. GitHub, banks). The injector relies only on
  patching globals, not on inline `<script>` injection, so strict CSP does
  not block it. The overlay iframe loads from the extension origin and is
  exempt from the page's CSP `frame-src`. If a page uses
  `Content-Security-Policy: frame-ancestors 'self'`, the iframe still
  works because the extension origin is not framed by the page; the
  iframe frames the extension into the page.
- **iframes.** The content scripts use `all_frames: true`. Each frame gets
  its own injector and bridge; the overlay is mounted on the top frame
  only, keyed by `frameId === 0`.

## Error handling

- **Verdict API non-2xx.** SW rethrows as `internal`; bridge surfaces a
  yellow `Verdict unavailable` overlay; user defaults to Cancel.
- **API timeout (10 s).** Same as above. The bridge fires its own 10 s
  timer and closes the overlay with the same yellow state if the SW does
  not reply.
- **Service worker terminated mid-flow.** The bridge re-sends the
  intercept after a 250 ms gap (exponential backoff up to 3 attempts).
  The page-side promise hangs only until the 60 s injector timeout.
- **Malformed packet from page world.** Bridge silently drops the message,
  logs to the SW for the popup's recent-intercepts list as
  `{ verdict: "INVALID" }`. The page-side wrapper's promise rejects with
  internal error.
- **Provider chained calls.** If a dapp issues multiple
  `eth_sendTransaction` in parallel, each gets its own nonce and overlay
  state. The overlay UI stacks with most-recent-on-top; only one is
  visible at a time, but all decisions are honored.
- **User dismisses overlay via tab close.** The bridge listens for
  `chrome.tabs.onRemoved`; pending nonces for that tab are auto-rejected
  with `code: 4001`. The injector's Promise also rejects via the
  `pagehide` listener registered at injection time.
- **Wallet not installed.** The wrapper is never installed because
  `window.ethereum` and EIP-6963 events are absent. No-op fallthrough.
- **Wallet on wrong chain.** Out of scope for the wrapper itself. The
  wallet handles chain mismatch as it does today after `Proceed`. The
  Shield verdict is computed from the packet's `chainId` echo and may be
  surfaced as a reason.

## Testing plan

### Unit tests (Node)

- `extension/inject/selectors.test.mjs`: selector dictionary completeness
  and `actionType` mapping for `approve`, `transfer`, `transferFrom`,
  one bridge, one claim, and an unknown selector.
- `extension/inject/normalize.test.mjs`: packet builder for
  - native transfer (no data),
  - approve with spender,
  - contract creation (no `to`),
  - oversized calldata,
  - malformed args,
  - missing `from` (rejects).
- `extension/bridge.test.mjs`: postMessage validation rejects wrong
  origin, wrong source, missing nonce.
- Existing `scripts/check-extension.mjs` is extended to:
  - assert `content_scripts` declares both `world: "MAIN"` injector and
    isolated bridge,
  - assert `web_accessible_resources` includes the overlay HTML/JS so the
    iframe can load,
  - assert `host_permissions` still does not include `<all_urls>`.

### Local dapp harness

A new Next.js route at `src/app/extension-harness/page.tsx` (web app, not
the extension) exposes three buttons that call
`window.ethereum.request({ method: "eth_sendTransaction", params: [...] })`
with shapes that exercise: native transfer, ERC-20 approve, and an
unknown-selector contract call. The harness logs the resolved/rejected
result so a manual tester can verify Proceed/Cancel paths drive the dapp
correctly. The route is gated by a `process.env.NODE_ENV !== "production"`
guard at render time so production builds render a 404-style stub. Linked
from `DEMO.md` as a Phase C-2 manual smoke target.

### Manual Chrome smoke (deferred, not gating C-2 implementation)

Documented in `extension/README.md` under a new `Phase C-2 smoke` section:

1. `npm run dev`, load extension via `chrome://extensions`.
2. Visit the harness route, click the native transfer button.
3. Expect SAFE pill, auto-proceed after 2 s, MetaMask popup appears.
4. Visit the harness, click the unknown selector button.
5. Expect WEIRD or DANGEROUS overlay (depends on the demo heuristic), and
   verify Cancel rejects with `code: 4001` in the harness log.
6. Click `Open in Shield Guardian` on a WEIRD overlay; verify the web app
   prefills with the decoded packet and is ready for live submission.
7. Confirm the popup's `Recent intercepts` panel lists each interception.

This Phase C-2 manual smoke is explicitly deferred alongside the Phase B
and Phase C-1 manual MetaMask smokes. C-2 implementation does not block on
it.

### Build/lint/static checks

- `npm run lint` — the new web-app code (harness route, prefill parser)
  must pass `eslint`.
- `npm run build` — production build of the Next.js app continues to work
  with the new `/?prefill=...` handling and the harness route.
- `npm run check:extension` — extended to cover the new manifest sections.
- `npm run package:extension` — produces the zip with the new files. The
  packager already walks the directory recursively.
- `npm run verify:all` continues to chain lint → build → check → package
  → smoke:demo and remains green.

## Implementation slices

C-2 implementation is one plan with seven sequential slices.

1. **Manifest + bridge skeleton.** Add `content_scripts` with both worlds,
   `web_accessible_resources` for the overlay, an empty
   `extension/inject/sg-injector.js`, an empty
   `extension/content/sg-bridge.js`, and bridge-only postMessage echo.
   Extend `scripts/check-extension.mjs` for the new manifest fields.
2. **Provider wrapping.** Implement `sg-injector.js`: capture references,
   wrap `window.ethereum`, attach EIP-6963 listeners, intercept
   `eth_sendTransaction`, hold and resolve the Promise via bridge.
3. **Packet normalization.** Implement `extension/inject/selectors.js` and
   the packet builder, with unit tests. Bridge forwards packets to the
   service worker.
4. **Service worker handler.** Add `SHIELD_INTERCEPT` and
   `SHIELD_INTERCEPT_DECISION` to `background.js`. Reuse existing settings
   plumbing. Force `x-shield-demo-mode: 1` on the verdict fetch. Persist
   recent intercepts to `chrome.storage.session`.
5. **Overlay iframe.** Add `extension/overlay/sg-overlay.html` and
   `sg-overlay.js`, render the four states (SAFE pill, WEIRD modal,
   DANGEROUS modal, unavailable). Wire decision messaging back to the
   bridge.
6. **Web-app prefill.** Add `?prefill=<base64url-json>` parsing on `/`
   that prefills `ShieldFormState`. Add the `extension-harness` route.
   Update `DEMO.md` with the C-2 smoke section.
7. **Popup recent-intercepts panel.** Extend `extension/popup.html` and
   `popup.js` with the read-only list. Cap at 10, paint short hashes,
   link to web app via the same prefill mechanism.

Each slice ships green: lint, build, `check:extension`, `package:extension`,
and `smoke:demo` continue to pass at every slice boundary.

## Open follow-ups

- `eth_sign`, `personal_sign`, and `eth_signTypedData_v4` interception are
  the natural next phase. Each has different decoding rules and UX
  guidelines (typed-data deserves a tree view, not a summary line).
- USD valuation. `assetValueUsd`/`gasCostUsd` are stuck at `0` until a
  price-source is wired in. A future phase can plumb a CoinGecko or
  on-chain Chainlink price into the SW.
- Origin allowlist/blocklist UI in the options page, with per-host
  policies (`auto-proceed on SAFE`, `always block`, etc.).
- A live-signed pre-screen path that submits `submit_action_check` to the
  policy court before the wallet popup. Blocked today by wallet contention
  with the intercepted tx; would require either a second-wallet pattern or
  a watcher that defers the policy submission until the original tx
  receipt lands.
- Manual MetaMask smoke for Phase B, Phase C-1, and the new Phase C-2
  harness remains deferred. Public deployment continues to be gated on
  walking those paths.
- EIP-712 typed-data summarization (when the signTypedData hook lands).
- A Firefox MV3 port. Currently out of scope; the architecture is
  Chrome-specific in `chrome.scripting.executeScript` and the page-world
  declaration syntax.
