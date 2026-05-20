# Phase C-2 Implementation Plan: Chrome Extension MV3 hooking eth_sendTransaction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chrome MV3 hook that intercepts `eth_sendTransaction` requests in the page's MAIN world, normalizes them into Shield Guardian action packets, fetches a verdict via `/api/verdict` demo mode, and renders an overlay with Proceed / Cancel before the wallet popup appears.

**Architecture:** Two declared content scripts — page-world `sg-injector.js` (wraps `window.ethereum.request` + EIP-6963) and isolated `sg-bridge.js` (only component with `chrome.runtime` access) — plus an extension-origin overlay iframe (`sg-overlay.html`). The existing service worker gains `SHIELD_INTERCEPT` / `SHIELD_INTERCEPT_DECISION` handlers. The web app `/` gains a `?prefill=<base64url-json>` parser and a dev-only `/extension-harness` route. No new backend; live policy-court recording continues through the Phase C-1 web-app flow.

**Tech Stack:** Chrome MV3 (declared `content_scripts` with `world: "MAIN"`, requires Chrome 111+), service worker (module), `chrome.storage.session`, `chrome.runtime.sendMessage`, EIP-1193 + EIP-6963, Next.js 16 / React 19 (web app harness + prefill parser), no test framework — `node --test` is used for new unit tests against extension JS modules.

**Test reality:** No existing test framework. Phase C-2 introduces `node --test` runs over plain ESM `.mjs` files for the few pure-logic helpers (selector dictionary, packet normalization, postMessage validation). Manifest checks extend `scripts/check-extension.mjs`. UI verification is the deferred manual MetaMask smoke documented in `extension/README.md`. Build/lint verification is `npm run lint`, `npm run build`, `npm run check:extension`, `npm run package:extension`, `npm run smoke:demo`.

**Phase B / C-1 artefacts already in place (do not duplicate):**
- Browser-signed verdicts via `src/lib/genlayer/browser-sdk-adapter.ts` — referenced only by the web app, not by the extension.
- Challenge + loss-report dialogs in `src/features/shield/components/` — driven from `/` and `#history`; the extension hands off via `?prefill=...`, never re-implements them.
- Extension scaffold (`extension/manifest.json`, `popup.html`, `options.html`, `background.js`, `content.js`, `shared.js`, `styles.css`) — all preserved; C-2 adds files alongside.

---

## File map

**New extension files:**
- `extension/inject/sg-injector.js` — page-world script: wrap `window.ethereum`, EIP-6963 listener, intercept `eth_sendTransaction`, hold/resolve original promise.
- `extension/inject/selectors.js` — static dictionary of well-known 4-byte selectors → `actionType`.
- `extension/inject/normalize.js` — `eth_sendTransaction` params → `ShieldVerdictRequest`-shaped packet.
- `extension/content/sg-bridge.js` — isolated content script: postMessage validation, runtime relay, overlay mount.
- `extension/overlay/sg-overlay.html` — extension-origin overlay iframe markup.
- `extension/overlay/sg-overlay.js` — overlay logic: render SAFE pill / WEIRD modal / DANGEROUS modal / unavailable, Proceed/Cancel/Open-in-app buttons.
- `extension/overlay/sg-overlay.css` — overlay styles (separate from popup `styles.css` to keep iframe payload small).
- `extension/lib/intercept-store.js` — small wrapper over `chrome.storage.session` for pending nonces and recent intercepts.
- `extension/lib/prefill-url.js` — `buildPrefillUrl(packet, apiBaseUrl)` returning the `/?prefill=<base64url>` href.

**New extension tests (`node --test`):**
- `extension/inject/selectors.test.mjs`
- `extension/inject/normalize.test.mjs`
- `extension/content/sg-bridge.test.mjs`
- `extension/lib/prefill-url.test.mjs`

**Modified extension files:**
- `extension/manifest.json` — add `content_scripts` (MAIN-world injector + isolated bridge), `web_accessible_resources` for the overlay, no new permission.
- `extension/background.js` — add `SHIELD_INTERCEPT` and `SHIELD_INTERCEPT_DECISION` handlers; force `x-shield-demo-mode: 1` on the intercept-fetch path; persist last-N intercepts.
- `extension/popup.html` — append `Recent intercepts` panel.
- `extension/popup.js` — render recent intercepts from `chrome.storage.session`.
- `extension/styles.css` — add styles for the recent-intercepts list.
- `extension/README.md` — append `Phase C-2 smoke` section.
- `scripts/check-extension.mjs` — assert new manifest sections (content_scripts both worlds, web_accessible_resources for overlay, host_permissions still excludes `<all_urls>`).
- `package.json` — add `test:extension` script wiring `node --test extension/**/*.test.mjs`; add to `verify:all`.

**New web-app files:**
- `src/app/extension-harness/page.tsx` — dev-only Next.js client page with three buttons that call `eth_sendTransaction` directly.
- `src/features/shield/lib/parse-prefill.ts` — parse and validate the `?prefill=<base64url>` query param into `ShieldFormState`.
- `src/features/shield/lib/parse-prefill.test.mjs` — unit tests for the parser.

**Modified web-app files:**
- `src/features/shield/components/shield-page.tsx` — call the prefill parser at mount, prefill the form state once if a valid payload is present.
- `DEMO.md` — append `Phase C-2 smoke` section describing the harness flow.

---

## Slice 1 — Manifest, bridge skeleton, check-extension

Goal: declared content scripts run on dapp pages, the bridge round-trips a noop `SG_PING`, and `check:extension` knows about the new manifest shape.

### Task 1: Extend `check-extension.mjs` for new manifest sections

**Files:**
- Modify: `scripts/check-extension.mjs`

- [ ] **Step 1: Add assertions for content_scripts and web_accessible_resources**

Locate the block ending with the `optional_host_permissions` assertion and append:

```js
// Phase C-2 manifest extensions.
const contentScripts = manifest.content_scripts ?? [];
assert(
  contentScripts.length >= 2,
  "Manifest must declare both an injector and a bridge content_script.",
);

const injector = contentScripts.find(
  (script) => script.world === "MAIN" && script.run_at === "document_start",
);
assert(
  injector && Array.isArray(injector.js) && injector.js.includes("inject/sg-injector.js"),
  "Manifest must declare a MAIN-world content_script with inject/sg-injector.js at document_start.",
);

const bridge = contentScripts.find(
  (script) => (script.world ?? "ISOLATED") === "ISOLATED" && script.js?.includes("content/sg-bridge.js"),
);
assert(bridge, "Manifest must declare an isolated content_script with content/sg-bridge.js.");

const war = manifest.web_accessible_resources ?? [];
const overlayWar = war.find((entry) =>
  Array.isArray(entry.resources) && entry.resources.some((r) => r === "overlay/sg-overlay.html"),
);
assert(overlayWar, "Manifest must expose overlay/sg-overlay.html via web_accessible_resources.");
assert(
  Array.isArray(overlayWar.matches) && overlayWar.matches.includes("<all_urls>") === false,
  "Overlay web_accessible_resources matches must not include <all_urls>.",
);
```

- [ ] **Step 2: Run check-extension to confirm failure**

Run: `npm run check:extension`
Expected: FAIL with "Manifest must declare both an injector and a bridge content_script." (the manifest is not yet updated).

- [ ] **Step 3: Commit**

```bash
git add scripts/check-extension.mjs
git commit -m "test(phase-c2): extend check-extension for content_scripts + WAR"
```

### Task 2: Update `manifest.json` for content scripts and overlay

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Replace the manifest with the C-2 shape**

```json
{
  "manifest_version": 3,
  "name": "Shield Guardian",
  "version": "0.1.0",
  "description": "Warning-first wallet action analysis for Chrome.",
  "minimum_chrome_version": "111",
  "action": {
    "default_title": "Shield Guardian",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "options_page": "options.html",
  "host_permissions": ["http://localhost/*", "http://127.0.0.1/*"],
  "permissions": ["activeTab", "storage", "scripting"],
  "optional_host_permissions": ["http://*/*", "https://*/*"],
  "content_scripts": [
    {
      "matches": ["http://localhost/*", "http://127.0.0.1/*"],
      "js": ["inject/sg-injector.js"],
      "run_at": "document_start",
      "all_frames": true,
      "world": "MAIN"
    },
    {
      "matches": ["http://localhost/*", "http://127.0.0.1/*"],
      "js": ["content/sg-bridge.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["overlay/sg-overlay.html", "overlay/sg-overlay.js", "overlay/sg-overlay.css"],
      "matches": ["http://localhost/*", "http://127.0.0.1/*"]
    }
  ]
}
```

- [ ] **Step 2: Create empty placeholder files so the script can verify references**

```bash
mkdir -p extension/inject extension/content extension/overlay extension/lib
printf '/* Phase C-2 placeholder */\n' > extension/inject/sg-injector.js
printf '/* Phase C-2 placeholder */\n' > extension/content/sg-bridge.js
printf '<!doctype html><meta charset="utf-8"><title>Shield Guardian</title>\n' > extension/overlay/sg-overlay.html
printf '/* Phase C-2 placeholder */\n' > extension/overlay/sg-overlay.js
printf '/* Phase C-2 placeholder */\n' > extension/overlay/sg-overlay.css
```

- [ ] **Step 3: Run check-extension to confirm pass**

Run: `npm run check:extension`
Expected: `Extension static check passed.`

- [ ] **Step 4: Run build and lint**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/inject extension/content extension/overlay extension/lib
git commit -m "feat(phase-c2): declare main-world injector + isolated bridge + overlay WAR"
```

### Task 3: Add `node --test` extension test runner script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add a `test:extension` script and wire it into verify:all**

Replace the `scripts` block:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "check:extension": "node scripts/check-extension.mjs",
  "package:extension": "node scripts/package-extension.mjs",
  "smoke:api": "node scripts/smoke-api.mjs",
  "smoke:checks": "node scripts/smoke-checks.mjs",
  "smoke:demo": "node scripts/smoke-demo.mjs",
  "test:extension": "node --test \"extension/**/*.test.mjs\" \"src/features/shield/lib/*.test.mjs\"",
  "verify:demo": "npm run lint && npm run build && npm run smoke:demo",
  "verify:all": "npm run lint && npm run build && npm run check:extension && npm run package:extension && npm run test:extension && npm run smoke:demo"
}
```

- [ ] **Step 2: Confirm `test:extension` runs cleanly with no tests yet**

Run: `npm run test:extension`
Expected: `node --test` exits 0 with no test files found yet (or treats glob as empty). If Node reports a failure for "no tests matched", create a placeholder `extension/lib/.gitkeep` and a single trivial smoke test:

```js
// extension/lib/sanity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

test("node --test runs in extension/", () => {
  assert.equal(1 + 1, 2);
});
```

Re-run: `npm run test:extension` — expected: 1 passing.

- [ ] **Step 3: Commit**

```bash
git add package.json extension/lib/sanity.test.mjs
git commit -m "test(phase-c2): add node --test runner for extension and shield helpers"
```

### Task 4: Bridge skeleton with postMessage validation

**Files:**
- Modify: `extension/content/sg-bridge.js`
- Create: `extension/content/sg-bridge.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// extension/content/sg-bridge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { isAcceptableMessage, MESSAGE_TYPES } from "./sg-bridge.js";

test("rejects messages from a different window source", () => {
  const fakeWindow = {};
  const event = { source: fakeWindow, origin: "https://example.com", data: { type: MESSAGE_TYPES.INTERCEPT_REQ } };
  assert.equal(isAcceptableMessage(event, { window: {}, origin: "https://example.com" }), false);
});

test("rejects messages from a different origin", () => {
  const win = {};
  const event = { source: win, origin: "https://attacker.test", data: { type: MESSAGE_TYPES.INTERCEPT_REQ } };
  assert.equal(isAcceptableMessage(event, { window: win, origin: "https://example.com" }), false);
});

test("rejects messages with an unknown type", () => {
  const win = {};
  const event = { source: win, origin: "https://example.com", data: { type: "SG_UNKNOWN" } };
  assert.equal(isAcceptableMessage(event, { window: win, origin: "https://example.com" }), false);
});

test("accepts a well-formed intercept request", () => {
  const win = {};
  const event = {
    source: win,
    origin: "https://example.com",
    data: { type: MESSAGE_TYPES.INTERCEPT_REQ, nonce: "abc", packet: {} },
  };
  assert.equal(isAcceptableMessage(event, { window: win, origin: "https://example.com" }), true);
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test:extension`
Expected: FAIL with "Cannot find module" or "isAcceptableMessage is not a function".

- [ ] **Step 3: Implement the bridge skeleton**

```js
// extension/content/sg-bridge.js
/* global chrome */

export const MESSAGE_TYPES = Object.freeze({
  INTERCEPT_REQ: "SG_INTERCEPT_REQ",
  INTERCEPT_RES: "SG_INTERCEPT_RES",
  PING: "SG_PING",
});

const VALID_TYPES = new Set(Object.values(MESSAGE_TYPES));

export function isAcceptableMessage(event, ctx) {
  if (!event || typeof event !== "object") return false;
  if (event.source !== ctx.window) return false;
  if (event.origin !== ctx.origin) return false;
  const data = event.data;
  if (!data || typeof data !== "object") return false;
  if (typeof data.type !== "string" || !VALID_TYPES.has(data.type)) return false;
  return true;
}

if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome.runtime) {
  const ctx = { window, origin: window.location.origin };

  window.addEventListener("message", (event) => {
    if (!isAcceptableMessage(event, ctx)) return;
    if (event.data.type === MESSAGE_TYPES.PING) {
      window.postMessage({ type: MESSAGE_TYPES.INTERCEPT_RES, nonce: event.data.nonce, choice: "pong" }, ctx.origin);
    }
  });
}
```

- [ ] **Step 4: Run the test to confirm pass**

Run: `npm run test:extension`
Expected: 4 passing in sg-bridge.test.mjs.

- [ ] **Step 5: Commit**

```bash
git add extension/content/sg-bridge.js extension/content/sg-bridge.test.mjs
git commit -m "feat(phase-c2): bridge skeleton with postMessage validation"
```

---

## Slice 2 — Provider wrapping in the page world

Goal: `sg-injector.js` wraps `window.ethereum.request`, intercepts `eth_sendTransaction`, defers to a verdict-keyed Promise, and forwards Proceed/Cancel back to the dapp.

### Task 5: Capture references and wrap request method

**Files:**
- Modify: `extension/inject/sg-injector.js`

- [ ] **Step 1: Write the injector core**

```js
// extension/inject/sg-injector.js
(() => {
  if (window.__shieldGuardianInjected) return;
  window.__shieldGuardianInjected = true;

  const SG_NS = "ShieldGuardianInjector";
  const Frozen = {
    JSON_stringify: JSON.stringify.bind(JSON),
    randomUUID: crypto.randomUUID.bind(crypto),
    Promise: window.Promise,
    postMessage: window.postMessage.bind(window),
    origin: window.location.origin,
    href: window.location.href,
  };

  const REQUEST_TIMEOUT_MS = 60_000;
  const INTERCEPTED_METHOD = "eth_sendTransaction";
  const pending = new Map();

  function rejectAll(reason) {
    for (const entry of pending.values()) {
      entry.reject(reason);
    }
    pending.clear();
  }

  window.addEventListener("pagehide", () => {
    rejectAll({ code: -32603, message: "Shield Guardian internal error: page hidden." });
  }, { once: true });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== Frozen.origin) return;
    const data = event.data;
    if (!data || data.type !== "SG_INTERCEPT_RES") return;
    const entry = pending.get(data.nonce);
    if (!entry) return;
    pending.delete(data.nonce);
    entry.settle(data);
  });

  function deferred() {
    let resolve;
    let reject;
    const promise = new Frozen.Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function dispatchIntercept(originalRequest, args) {
    const nonce = Frozen.randomUUID();
    const packet = window.__shieldGuardianBuildPacket
      ? window.__shieldGuardianBuildPacket(args.params?.[0] ?? {}, { website: Frozen.href })
      : { website: Frozen.href, params: args.params?.[0] ?? null };

    const { promise, resolve, reject } = deferred();
    const timer = setTimeout(() => {
      pending.delete(nonce);
      reject({ code: -32603, message: "Shield Guardian internal error: timeout." });
    }, REQUEST_TIMEOUT_MS);

    pending.set(nonce, {
      reject,
      settle: (data) => {
        clearTimeout(timer);
        if (data.choice === "proceed") {
          originalRequest(args).then(resolve, reject);
        } else if (data.choice === "cancel") {
          reject({ code: 4001, message: "Shield Guardian: user rejected request." });
        } else {
          reject({ code: -32603, message: "Shield Guardian internal error: bad choice." });
        }
      },
    });

    Frozen.postMessage({ type: "SG_INTERCEPT_REQ", nonce, packet }, Frozen.origin);
    return promise;
  }

  function wrapProvider(provider) {
    if (!provider || provider[SG_NS]) return provider;
    const originalRequest = provider.request?.bind(provider);
    if (typeof originalRequest !== "function") return provider;

    const wrapped = new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === "request") {
          return async function (args) {
            if (args && args.method === INTERCEPTED_METHOD) {
              return dispatchIntercept(originalRequest, args);
            }
            return originalRequest(args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    Object.defineProperty(wrapped, SG_NS, { value: true, enumerable: false });
    return wrapped;
  }

  function installEthereumTrap() {
    let current = window.ethereum;
    if (current) current = wrapProvider(current);
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      get() {
        return current;
      },
      set(next) {
        current = wrapProvider(next);
      },
    });
  }

  installEthereumTrap();

  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = event.detail;
    if (!detail || !detail.provider) return;
    detail.provider = wrapProvider(detail.provider);
  });

  window.dispatchEvent(new Event("eip6963:requestProvider"));
})();
```

- [ ] **Step 2: Verify check-extension still passes**

Run: `npm run check:extension`
Expected: pass.

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add extension/inject/sg-injector.js
git commit -m "feat(phase-c2): wrap window.ethereum.request and EIP-6963 in page world"
```

---

## Slice 3 — Packet normalization

Goal: pure-logic decoder of `eth_sendTransaction` `params[0]` into a `ShieldVerdictRequest`-shaped packet, with selector dictionary and unit tests.

### Task 6: Selector dictionary

**Files:**
- Create: `extension/inject/selectors.js`
- Create: `extension/inject/selectors.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// extension/inject/selectors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { actionTypeForSelector, SELECTORS } from "./selectors.js";

test("approve maps to approve", () => {
  assert.equal(actionTypeForSelector("0x095ea7b3"), "approve");
});

test("transfer maps to sign", () => {
  assert.equal(actionTypeForSelector("0xa9059cbb"), "sign");
});

test("transferFrom maps to sign", () => {
  assert.equal(actionTypeForSelector("0x23b872dd"), "sign");
});

test("unknown selector falls back to sign", () => {
  assert.equal(actionTypeForSelector("0xdeadbeef"), "sign");
});

test("at least one bridge and one claim selector are present", () => {
  const values = Object.values(SELECTORS);
  assert.ok(values.includes("bridge"), "expected at least one bridge selector");
  assert.ok(values.includes("claim"), "expected at least one claim selector");
});

test("all selectors are 10-char 0x-hex lowercase", () => {
  for (const sel of Object.keys(SELECTORS)) {
    assert.match(sel, /^0x[0-9a-f]{8}$/, `bad selector format: ${sel}`);
  }
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test:extension`
Expected: FAIL "Cannot find module './selectors.js'".

- [ ] **Step 3: Write the dictionary**

```js
// extension/inject/selectors.js

// Static, best-effort 4-byte selector dictionary. Unknown selectors fall
// back to "sign" — see Phase C-2 design spec, "Verdict packet
// normalization → Decoded fields".
export const SELECTORS = Object.freeze({
  // ERC-20
  "0x095ea7b3": "approve",       // approve(address,uint256)
  "0xa9059cbb": "sign",          // transfer(address,uint256)
  "0x23b872dd": "sign",          // transferFrom(address,address,uint256)

  // Bridges (Hop, Across, Stargate, LayerZero)
  "0xeb672419": "bridge",        // sendToL2 (Hop)
  "0x7dc20382": "bridge",        // bridgeToken (Hop variant)
  "0x9a1d09c0": "bridge",        // depositV3 (Across)
  "0x9fbf10fc": "bridge",        // swap (Stargate)
  "0xc73f7c3a": "bridge",        // sendFrom (LayerZero OFT)

  // Claim / mint patterns
  "0x4e71d92d": "claim",         // claim()
  "0x379607f5": "claim",         // claim(uint256)
  "0xae169a50": "claim",         // claimReward
  "0x1249c58b": "claim",         // mint()
  "0x6a627842": "claim",         // mint(address)
  "0xa0712d68": "claim",         // mint(uint256)
});

export function actionTypeForSelector(selector) {
  if (typeof selector !== "string") return "sign";
  const normalized = selector.toLowerCase();
  return SELECTORS[normalized] ?? "sign";
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm run test:extension`
Expected: 6 passing in selectors.test.mjs.

- [ ] **Step 5: Commit**

```bash
git add extension/inject/selectors.js extension/inject/selectors.test.mjs
git commit -m "feat(phase-c2): static selector dictionary for action-type mapping"
```

### Task 7: Packet normalizer

**Files:**
- Create: `extension/inject/normalize.js`
- Create: `extension/inject/normalize.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// extension/inject/normalize.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPacket } from "./normalize.js";

const ctx = { website: "https://app.example.test/swap", protocol: "Example", chainIdHex: "0xf22f" };

test("native transfer with no data → sign", () => {
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), value: "0x16345785d8a0000" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "sign");
  assert.equal(packet.website, ctx.website);
  assert.match(packet.summary, /sign via Example/);
  assert.equal(packet.assetValueUsd, 0);
  assert.equal(packet.gasCostUsd, 0);
});

test("erc20 approve → approve", () => {
  const data = "0x095ea7b3" + "0".repeat(64) + "0".repeat(64);
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data, value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "approve");
  assert.match(packet.summary, /approve via Example/);
});

test("contract creation (no `to`)", () => {
  const params = { from: "0xaa".padEnd(42, "a"), data: "0x6080604052", value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "sign");
  assert.match(packet.summary, /contract deployment/);
});

test("calldata shorter than 4 bytes", () => {
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data: "0x12", value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "sign");
  assert.match(packet.rawSignals, /selector=0x/);
});

test("oversize calldata is truncated and tagged", () => {
  const huge = "0x" + "ab".repeat(33_000);
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data: huge, value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.match(packet.summary, /oversize calldata/);
  assert.ok(packet.rawSignals.length < 1024, "rawSignals must be capped");
});

test("missing from rejects", () => {
  assert.throws(() => buildPacket({ to: "0xbb".padEnd(42, "b"), value: "0x0" }, ctx), /from/);
});

test("known bridge selector → bridge", () => {
  const params = { from: "0xaa".padEnd(42, "a"), to: "0xbb".padEnd(42, "b"), data: "0xeb672419", value: "0x0" };
  const packet = buildPacket(params, ctx);
  assert.equal(packet.actionType, "bridge");
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test:extension`
Expected: FAIL "Cannot find module './normalize.js'".

- [ ] **Step 3: Implement the normalizer**

```js
// extension/inject/normalize.js
import { actionTypeForSelector } from "./selectors.js";

const MAX_CALLDATA_BYTES = 32 * 1024;
const MAX_SUMMARY = 280;
const SHORT_HASH_HEAD = 6;
const SHORT_HASH_TAIL = 4;

function shortHash(value) {
  const v = String(value ?? "");
  if (v.length <= SHORT_HASH_HEAD + SHORT_HASH_TAIL + 3) return v;
  return `${v.slice(0, SHORT_HASH_HEAD)}...${v.slice(-SHORT_HASH_TAIL)}`;
}

function hexToBigInt(value) {
  if (!value || typeof value !== "string") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function weiToEthString(weiHex) {
  const wei = hexToBigInt(weiHex);
  if (wei === 0n) return "0";
  const eth = Number(wei) / 1e18;
  if (!Number.isFinite(eth)) return wei.toString();
  return eth.toFixed(6).replace(/\.?0+$/, "");
}

function dataSelector(data) {
  if (typeof data !== "string" || !data.startsWith("0x")) return "0x";
  const body = data.slice(2);
  if (body.length < 8) return "0x";
  return `0x${body.slice(0, 8).toLowerCase()}`;
}

function clamp(value, max) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

export function buildPacket(params, ctx) {
  if (!params || typeof params !== "object") {
    throw new Error("buildPacket: missing params");
  }
  if (!params.from || typeof params.from !== "string") {
    throw new Error("buildPacket: missing from");
  }

  const data = typeof params.data === "string" ? params.data : "0x";
  const isCreation = !params.to;
  const selector = isCreation ? "0x" : dataSelector(data);
  const actionType = isCreation ? "sign" : actionTypeForSelector(selector);

  const dataBytes = data.startsWith("0x") ? (data.length - 2) / 2 : 0;
  const oversize = dataBytes > MAX_CALLDATA_BYTES;
  const truncatedData = oversize ? data.slice(0, 2 + 64) : data;

  const protocol = clamp(ctx.protocol ?? "", 64);
  const ethValue = weiToEthString(params.value ?? "0x0");

  let summary;
  if (isCreation) {
    summary = `contract deployment from ${shortHash(params.from)}`;
  } else if (oversize) {
    summary = `${actionType} via ${protocol || "unknown"}: oversize calldata (${dataBytes} B)`;
  } else if (selector === "0x" && data !== "0x") {
    summary = `${actionType} via ${protocol || "unknown"}: undecoded args`;
  } else {
    summary = `${actionType} via ${protocol || "unknown"}: to=${shortHash(params.to)}, value=${ethValue} ETH, selector=${selector}`;
  }

  const rawSignals = [
    `from=${params.from}`,
    `to=${params.to ?? "(creation)"}`,
    `value=${ethValue}`,
    `selector=${selector}`,
    `gas=${params.gas ?? "auto"}`,
    `chainId=${ctx.chainIdHex ?? "unknown"}`,
    `data=${truncatedData}`,
  ].join(" | ");

  return {
    actionType,
    protocol,
    website: ctx.website ?? "",
    summary: clamp(summary, MAX_SUMMARY),
    rawSignals: clamp(rawSignals, 1024),
    assetValueUsd: 0,
    gasCostUsd: 0,
  };
}
```

- [ ] **Step 4: Run the test to confirm pass**

Run: `npm run test:extension`
Expected: 7 passing in normalize.test.mjs.

- [ ] **Step 5: Commit**

```bash
git add extension/inject/normalize.js extension/inject/normalize.test.mjs
git commit -m "feat(phase-c2): packet normalizer for eth_sendTransaction params"
```

### Task 8: Wire normalizer into the injector

**Files:**
- Modify: `extension/inject/sg-injector.js`

The injector's `dispatchIntercept` currently uses a placeholder packet builder. Replace with a static-imported normalizer call. Because content scripts in the MAIN world cannot use ESM imports directly (the script is loaded as classic script by Chrome), inline the normalizer's surface as a single bundled script. The simplest approach: copy the necessary functions inline.

- [ ] **Step 1: Replace the placeholder packet builder**

In `extension/inject/sg-injector.js`, replace the call inside `dispatchIntercept`:

```js
const packet = window.__shieldGuardianBuildPacket
  ? window.__shieldGuardianBuildPacket(args.params?.[0] ?? {}, { website: Frozen.href })
  : { website: Frozen.href, params: args.params?.[0] ?? null };
```

with an inlined builder. Insert these constants and helpers just below the `Frozen` block (do not import — page-world classic scripts):

```js
// Inlined from extension/inject/selectors.js and normalize.js — kept in
// sync by hand to avoid an ESM bundle step. If you change either source,
// update this block in the same commit.
const SG_SELECTORS = Object.freeze({
  "0x095ea7b3": "approve",
  "0xa9059cbb": "sign",
  "0x23b872dd": "sign",
  "0xeb672419": "bridge",
  "0x7dc20382": "bridge",
  "0x9a1d09c0": "bridge",
  "0x9fbf10fc": "bridge",
  "0xc73f7c3a": "bridge",
  "0x4e71d92d": "claim",
  "0x379607f5": "claim",
  "0xae169a50": "claim",
  "0x1249c58b": "claim",
  "0x6a627842": "claim",
  "0xa0712d68": "claim",
});

const SG_MAX_CALLDATA = 32 * 1024;
const SG_MAX_SUMMARY = 280;
const SG_MAX_RAWSIGNALS = 1024;

function sgShort(v) {
  const s = String(v ?? "");
  if (s.length <= 13) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function sgSelector(data) {
  if (typeof data !== "string" || !data.startsWith("0x") || data.length < 10) return "0x";
  return `0x${data.slice(2, 10).toLowerCase()}`;
}

function sgEthValue(weiHex) {
  try {
    const wei = BigInt(weiHex || "0x0");
    if (wei === 0n) return "0";
    const eth = Number(wei) / 1e18;
    return Number.isFinite(eth) ? eth.toFixed(6).replace(/\.?0+$/, "") : wei.toString();
  } catch {
    return "0";
  }
}

function sgClamp(s, max) {
  s = String(s ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

function sgBuildPacket(params, ctx) {
  if (!params || typeof params !== "object") throw new Error("missing params");
  if (!params.from) throw new Error("missing from");

  const data = typeof params.data === "string" ? params.data : "0x";
  const isCreation = !params.to;
  const selector = isCreation ? "0x" : sgSelector(data);
  const actionType = isCreation ? "sign" : SG_SELECTORS[selector] ?? "sign";

  const dataBytes = data.startsWith("0x") ? (data.length - 2) / 2 : 0;
  const oversize = dataBytes > SG_MAX_CALLDATA;
  const truncatedData = oversize ? data.slice(0, 66) : data;
  const protocol = sgClamp(ctx.protocol ?? "", 64);
  const ethValue = sgEthValue(params.value ?? "0x0");

  let summary;
  if (isCreation) summary = `contract deployment from ${sgShort(params.from)}`;
  else if (oversize) summary = `${actionType} via ${protocol || "unknown"}: oversize calldata (${dataBytes} B)`;
  else if (selector === "0x" && data !== "0x") summary = `${actionType} via ${protocol || "unknown"}: undecoded args`;
  else summary = `${actionType} via ${protocol || "unknown"}: to=${sgShort(params.to)}, value=${ethValue} ETH, selector=${selector}`;

  return {
    actionType,
    protocol,
    website: ctx.website ?? "",
    summary: sgClamp(summary, SG_MAX_SUMMARY),
    rawSignals: sgClamp([
      `from=${params.from}`,
      `to=${params.to ?? "(creation)"}`,
      `value=${ethValue}`,
      `selector=${selector}`,
      `gas=${params.gas ?? "auto"}`,
      `chainId=${ctx.chainIdHex ?? "unknown"}`,
      `data=${truncatedData}`,
    ].join(" | "), SG_MAX_RAWSIGNALS),
    assetValueUsd: 0,
    gasCostUsd: 0,
  };
}
```

Then in `dispatchIntercept`, replace the placeholder packet line with:

```js
const protocol = (document.querySelector("[data-shield-protocol]")?.getAttribute("data-shield-protocol")
  || document.title || new URL(Frozen.href).hostname).toString();
let packet;
try {
  packet = sgBuildPacket(args.params?.[0] ?? {}, { website: Frozen.href, protocol });
} catch (err) {
  reject({ code: -32603, message: `Shield Guardian internal error: ${err.message}` });
  return promise;
}
```

- [ ] **Step 2: Lint + check-extension + build**

Run: `npm run lint && npm run check:extension && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add extension/inject/sg-injector.js
git commit -m "feat(phase-c2): inline normalizer into page-world injector"
```

---

## Slice 4 — Service worker intercept handlers

Goal: `background.js` accepts `SHIELD_INTERCEPT` from the bridge, fetches a verdict from `/api/verdict` in demo mode, persists pending state in `chrome.storage.session`, and routes `SHIELD_INTERCEPT_DECISION` back to the bridge.

### Task 9: Intercept-store helper

**Files:**
- Create: `extension/lib/intercept-store.js`

- [ ] **Step 1: Write the helper**

```js
// extension/lib/intercept-store.js
/* global chrome */

const PENDING_KEY = "shieldGuardian.pendingIntercepts";
const RECENT_KEY = "shieldGuardian.recentIntercepts";
const MAX_RECENT = 10;
const PENDING_TTL_MS = 30_000;

async function readSession(key) {
  const result = await chrome.storage.session.get(key);
  return result[key];
}

async function writeSession(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

export async function setPending(nonce, payload) {
  const map = (await readSession(PENDING_KEY)) ?? {};
  map[nonce] = { ...payload, createdAt: Date.now() };
  await writeSession(PENDING_KEY, map);
}

export async function getPending(nonce) {
  const map = (await readSession(PENDING_KEY)) ?? {};
  const entry = map[nonce];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    delete map[nonce];
    await writeSession(PENDING_KEY, map);
    return null;
  }
  return entry;
}

export async function clearPending(nonce) {
  const map = (await readSession(PENDING_KEY)) ?? {};
  delete map[nonce];
  await writeSession(PENDING_KEY, map);
}

export async function pushRecent(record) {
  const list = (await readSession(RECENT_KEY)) ?? [];
  const trimmed = [record, ...list].slice(0, MAX_RECENT);
  await writeSession(RECENT_KEY, trimmed);
}

export async function readRecent() {
  return (await readSession(RECENT_KEY)) ?? [];
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add extension/lib/intercept-store.js
git commit -m "feat(phase-c2): chrome.storage.session helper for intercepts"
```

### Task 10: Service worker SHIELD_INTERCEPT handler

**Files:**
- Modify: `extension/background.js`

- [ ] **Step 1: Add imports for the intercept store**

At the top of `extension/background.js`, after the existing imports:

```js
import {
  clearPending,
  getPending,
  pushRecent,
  setPending,
} from "./lib/intercept-store.js";
```

- [ ] **Step 2: Add `interceptRequest` and `recordDecision` helpers**

Just before the `chrome.runtime.onInstalled` listener, add:

```js
async function interceptRequest({ nonce, packet, tabId, frameId }) {
  if (!nonce || !packet) {
    throw new Error("Missing intercept payload.");
  }

  const settings = await readSettings();
  const endpoint = getApiEndpoint(settings.apiBaseUrl);
  const permissionPattern = getPermissionPattern(settings.apiBaseUrl);
  const permissionGranted = await chrome.permissions.contains({
    origins: [permissionPattern],
  });

  if (!permissionGranted) {
    throw new Error(
      `Shield API access is not granted for ${settings.apiBaseUrl}. Open the extension settings and grant access.`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let verdict = null;
  let source = "unavailable";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Phase C-2 pre-screen always uses demo mode regardless of the
        // user's saved demoMode preference (see design spec, "Why
        // /api/verdict demo mode").
        "x-shield-demo-mode": "1",
      },
      body: JSON.stringify(packet),
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.verdict) {
        verdict = data.verdict;
        source = "demo";
      }
    }
  } catch {
    verdict = null;
  } finally {
    clearTimeout(timeoutId);
  }

  await setPending(nonce, { packet, verdict, tabId, frameId });
  await pushRecent({
    nonce,
    capturedAt: Date.now(),
    packet,
    verdict,
    source,
  });

  return { ok: true, nonce, verdict, source };
}

async function recordDecision({ nonce, choice }) {
  if (!nonce || (choice !== "proceed" && choice !== "cancel")) {
    throw new Error("Bad decision payload.");
  }
  const entry = await getPending(nonce);
  await clearPending(nonce);
  return { ok: true, nonce, choice, packet: entry?.packet ?? null, verdict: entry?.verdict ?? null };
}
```

- [ ] **Step 3: Wire the handlers into the existing message dispatcher**

Inside the `chrome.runtime.onMessage.addListener` callback, before the final `return false;`, insert:

```js
if (message.type === "SHIELD_INTERCEPT") {
  void (async () => {
    try {
      sendResponse(
        await interceptRequest({
          nonce: message.nonce,
          packet: message.packet,
          tabId: _sender?.tab?.id,
          frameId: _sender?.frameId,
        }),
      );
    } catch (error) {
      sendResponse({ ok: false, error: asErrorMessage(error) });
    }
  })();
  return true;
}

if (message.type === "SHIELD_INTERCEPT_DECISION") {
  void (async () => {
    try {
      sendResponse(await recordDecision({ nonce: message.nonce, choice: message.choice }));
    } catch (error) {
      sendResponse({ ok: false, error: asErrorMessage(error) });
    }
  })();
  return true;
}
```

The `_sender` parameter is the second argument of `addListener`; rename `_sender` to `sender` in the existing function signature so the new handlers can read `sender.tab.id` and `sender.frameId`. Update the existing handlers to keep using `sender` (no behaviour change).

- [ ] **Step 4: Lint + check-extension + build**

Run: `npm run lint && npm run check:extension && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add extension/background.js
git commit -m "feat(phase-c2): service worker SHIELD_INTERCEPT and decision handlers"
```

### Task 11: Bridge round-trip with the service worker

**Files:**
- Modify: `extension/content/sg-bridge.js`

- [ ] **Step 1: Replace the bridge body with the intercept relay**

Keep the exported `MESSAGE_TYPES` and `isAcceptableMessage` (the test in Task 4 still relies on them) and add the runtime relay below them. The full file becomes:

```js
// extension/content/sg-bridge.js
/* global chrome */

export const MESSAGE_TYPES = Object.freeze({
  INTERCEPT_REQ: "SG_INTERCEPT_REQ",
  INTERCEPT_RES: "SG_INTERCEPT_RES",
  PING: "SG_PING",
});

const VALID_TYPES = new Set(Object.values(MESSAGE_TYPES));
const OVERLAY_ID = "shield-guardian-overlay-frame";

export function isAcceptableMessage(event, ctx) {
  if (!event || typeof event !== "object") return false;
  if (event.source !== ctx.window) return false;
  if (event.origin !== ctx.origin) return false;
  const data = event.data;
  if (!data || typeof data !== "object") return false;
  if (typeof data.type !== "string" || !VALID_TYPES.has(data.type)) return false;
  return true;
}

function ensureOverlay(nonce) {
  let frame = document.getElementById(OVERLAY_ID);
  if (frame) {
    frame.dataset.nonce = nonce;
    return frame;
  }
  frame = document.createElement("iframe");
  frame.id = OVERLAY_ID;
  frame.dataset.nonce = nonce;
  frame.src = chrome.runtime.getURL(`overlay/sg-overlay.html?nonce=${encodeURIComponent(nonce)}`);
  Object.assign(frame.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
    zIndex: "2147483646",
    background: "transparent",
    colorScheme: "dark",
  });
  document.documentElement.appendChild(frame);
  return frame;
}

function removeOverlay() {
  const frame = document.getElementById(OVERLAY_ID);
  if (frame) frame.remove();
}

async function relayIntercept(event, ctx) {
  const { nonce, packet } = event.data;
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "SHIELD_INTERCEPT",
      nonce,
      packet,
    });
  } catch (error) {
    response = { ok: false, error: error?.message ?? "runtime unavailable" };
  }

  if (!response?.ok) {
    ctx.window.postMessage(
      { type: MESSAGE_TYPES.INTERCEPT_RES, nonce, choice: "cancel" },
      ctx.origin,
    );
    return;
  }

  ensureOverlay(nonce);
}

if (typeof window !== "undefined" && window.top === window && typeof chrome !== "undefined" && chrome.runtime) {
  const ctx = { window, origin: window.location.origin };

  window.addEventListener("message", (event) => {
    if (!isAcceptableMessage(event, ctx)) return;
    if (event.data.type === MESSAGE_TYPES.INTERCEPT_REQ) {
      relayIntercept(event, ctx);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "SHIELD_OVERLAY_DECISION") return false;
    const { nonce, choice } = message;
    ctx.window.postMessage({ type: MESSAGE_TYPES.INTERCEPT_RES, nonce, choice }, ctx.origin);
    removeOverlay();
    return false;
  });
}
```

- [ ] **Step 2: Re-run the bridge unit tests**

Run: `npm run test:extension`
Expected: existing 4 tests still pass; the new runtime-relay code path is not exercised by node tests but is verified by the manual smoke flow.

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add extension/content/sg-bridge.js
git commit -m "feat(phase-c2): bridge relays intercepts and mounts overlay iframe"
```

---

## Slice 5 — Overlay iframe

Goal: extension-origin iframe renders SAFE pill / WEIRD modal / DANGEROUS modal / Verdict-unavailable, with Proceed / Cancel / Open-in-Shield-Guardian buttons.

### Task 12: Overlay HTML scaffold

**Files:**
- Modify: `extension/overlay/sg-overlay.html`

- [ ] **Step 1: Replace the placeholder with the overlay shell**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shield Guardian verdict</title>
    <link rel="stylesheet" href="./sg-overlay.css" />
  </head>
  <body class="overlay-body">
    <main id="overlayRoot" class="overlay-root" aria-live="polite" aria-busy="true">
      <section id="loadingPanel" class="overlay-panel loading">
        <p class="eyebrow">Shield Guardian</p>
        <h1>Reviewing transaction...</h1>
        <p class="muted">Holding the wallet popup until the verdict returns.</p>
      </section>
    </main>
    <script type="module" src="./sg-overlay.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Confirm check-extension still passes**

Run: `npm run check:extension`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add extension/overlay/sg-overlay.html
git commit -m "feat(phase-c2): overlay iframe shell"
```

### Task 13: Overlay styles

**Files:**
- Modify: `extension/overlay/sg-overlay.css`

- [ ] **Step 1: Replace the placeholder with overlay styles**

```css
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

.overlay-body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #e7eefb;
}

.overlay-root {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(8, 17, 31, 0.78);
  backdrop-filter: blur(12px);
}

.overlay-root.tone-safe { background: transparent; place-items: end; padding: 24px; }

.overlay-panel {
  width: min(560px, 92vw);
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.92);
  padding: 24px;
  display: grid;
  gap: 16px;
}

.overlay-panel.safe-pill {
  width: min(360px, 92vw);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-color: rgba(94, 234, 212, 0.36);
}

.overlay-panel.weird { border-color: rgba(251, 191, 36, 0.36); }
.overlay-panel.dangerous { border-color: rgba(251, 113, 133, 0.4); }
.overlay-panel.unavailable { border-color: rgba(125, 211, 252, 0.36); }

.eyebrow {
  margin: 0;
  color: #8ea0bf;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
p { margin: 0; line-height: 1.55; }
.muted { color: #8ea0bf; font-size: 13px; }

.summary-block {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(7, 13, 25, 0.62);
  padding: 12px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-word;
}

.reasons {
  display: grid;
  gap: 6px;
}
.reasons li { font-size: 13px; }

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

button {
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
  font: inherit;
}

.primary { background: linear-gradient(135deg, #7dd3fc, #38bdf8); color: #06111d; }
.danger { background: linear-gradient(135deg, #fb7185, #f43f5e); color: #fff; }
.ghost { background: transparent; color: #cbd5f5; border: 1px solid rgba(148, 163, 184, 0.24); }
.secondary { background: rgba(15, 23, 42, 0.78); color: #e7eefb; border: 1px solid rgba(148, 163, 184, 0.24); }

.countdown { color: #8ea0bf; font-size: 12px; margin-left: 8px; }

.hidden { display: none !important; }
```

- [ ] **Step 2: Commit**

```bash
git add extension/overlay/sg-overlay.css
git commit -m "feat(phase-c2): overlay iframe styles"
```

### Task 14: Overlay logic

**Files:**
- Modify: `extension/overlay/sg-overlay.js`
- Create: `extension/lib/prefill-url.js`
- Create: `extension/lib/prefill-url.test.mjs`

- [ ] **Step 1: Write the prefill-url failing test**

```js
// extension/lib/prefill-url.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPrefillUrl } from "./prefill-url.js";

test("encodes the packet as base64url JSON in ?prefill=", () => {
  const url = buildPrefillUrl({
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: 0,
    gasCostUsd: 0,
  }, "http://localhost:3000");

  const parsed = new URL(url);
  assert.equal(parsed.origin, "http://localhost:3000");
  assert.ok(parsed.searchParams.get("prefill"), "prefill param missing");
});

test("decoded payload round-trips", () => {
  const packet = {
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: 0,
    gasCostUsd: 0,
  };
  const url = buildPrefillUrl(packet, "http://localhost:3000");
  const param = new URL(url).searchParams.get("prefill");
  const padded = param + "=".repeat((4 - (param.length % 4)) % 4);
  const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const decoded = JSON.parse(json);
  assert.deepEqual(decoded, packet);
});

test("returns base URL only when payload would exceed 4 KiB", () => {
  const oversized = "x".repeat(8000);
  const url = buildPrefillUrl({ summary: oversized }, "http://localhost:3000");
  assert.equal(url, "http://localhost:3000/");
});
```

- [ ] **Step 2: Run failing test**

Run: `npm run test:extension`
Expected: FAIL with "Cannot find module './prefill-url.js'".

- [ ] **Step 3: Implement prefill-url**

```js
// extension/lib/prefill-url.js
const PREFILL_MAX_BYTES = 4096;

function base64UrlEncode(json) {
  const bytes = new TextEncoder().encode(json);
  let base64;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildPrefillUrl(packet, apiBaseUrl) {
  const base = apiBaseUrl?.replace(/\/+$/, "") || "http://localhost:3000";
  try {
    const json = JSON.stringify(packet);
    if (json.length > PREFILL_MAX_BYTES) return `${base}/`;
    const encoded = base64UrlEncode(json);
    return `${base}/?prefill=${encoded}`;
  } catch {
    return `${base}/`;
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm run test:extension`
Expected: 3 passing in prefill-url.test.mjs.

- [ ] **Step 5: Implement overlay logic**

Replace `extension/overlay/sg-overlay.js` with:

```js
/* global chrome */

import { buildPrefillUrl } from "../lib/prefill-url.js";
import { getPending } from "../lib/intercept-store.js";
import { getApiEndpoint, normalizeApiBaseUrl, readSettings } from "../shared.js";

const params = new URLSearchParams(location.search);
const nonce = params.get("nonce") ?? "";
const root = document.getElementById("overlayRoot");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendDecision(choice) {
  await chrome.runtime.sendMessage({ type: "SHIELD_OVERLAY_DECISION", nonce, choice });
}

async function openInWebApp(packet) {
  const settings = await readSettings();
  const apiBase = normalizeApiBaseUrl(settings.apiBaseUrl);
  const url = buildPrefillUrl(packet, apiBase);
  await chrome.tabs.create({ url });
}

function renderUnavailable(packet) {
  root.classList.remove("tone-safe");
  root.innerHTML = `
    <section class="overlay-panel unavailable">
      <p class="eyebrow">Shield Guardian</p>
      <h1>Verdict unavailable</h1>
      <p class="muted">The Shield API did not return a verdict. Review the action below.</p>
      <div class="summary-block">${escapeHtml(packet?.summary ?? "")}</div>
      <div class="button-row">
        <button class="ghost" data-action="open">Open in Shield Guardian</button>
        <button class="secondary" data-action="proceed">Proceed</button>
        <button class="danger" data-action="cancel" autofocus>Cancel</button>
      </div>
    </section>
  `;
}

function renderSafe(packet, verdict) {
  root.classList.add("tone-safe");
  root.innerHTML = `
    <section class="overlay-panel safe-pill">
      <strong>SAFE</strong>
      <span class="muted">${escapeHtml(packet?.summary ?? "")}</span>
      <span class="countdown" id="countdown">2</span>
      <button class="ghost" data-action="hold">Hold</button>
    </section>
  `;
  let remaining = 2;
  const span = document.getElementById("countdown");
  const interval = setInterval(() => {
    remaining -= 1;
    if (span) span.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(interval);
      sendDecision("proceed");
    }
  }, 1000);
  root.querySelector('[data-action="hold"]').addEventListener("click", () => {
    clearInterval(interval);
    renderModal(packet, verdict, "weird");
  });
}

function renderModal(packet, verdict, tone) {
  root.classList.remove("tone-safe");
  const reasons = (verdict?.reasons ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  root.innerHTML = `
    <section class="overlay-panel ${tone}">
      <p class="eyebrow">Shield Guardian</p>
      <h1>${tone === "dangerous" ? "Dangerous" : "Warning"}</h1>
      <div class="summary-block">${escapeHtml(packet?.summary ?? "")}</div>
      <ul class="reasons">${reasons}</ul>
      <div class="button-row">
        <button class="ghost" data-action="open">Open in Shield Guardian</button>
        ${tone === "dangerous"
          ? '<button class="secondary hidden" data-action="proceed" id="proceedBtn">Proceed despite warning</button><button class="ghost" data-action="reveal">Show override</button>'
          : '<button class="secondary" data-action="proceed">Proceed</button>'}
        <button class="danger" data-action="cancel" autofocus>Cancel</button>
      </div>
    </section>
  `;

  if (tone === "dangerous") {
    root.querySelector('[data-action="reveal"]').addEventListener("click", (e) => {
      e.target.classList.add("hidden");
      const proceed = document.getElementById("proceedBtn");
      if (proceed) proceed.classList.remove("hidden");
    });
  }
}

function attachActions(packet) {
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    if (action === "proceed") sendDecision("proceed");
    else if (action === "cancel") sendDecision("cancel");
    else if (action === "open") openInWebApp(packet);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") sendDecision("cancel");
  });
}

async function main() {
  if (!nonce) {
    renderUnavailable(null);
    attachActions(null);
    return;
  }
  const entry = await getPending(nonce);
  const packet = entry?.packet ?? null;
  const verdict = entry?.verdict ?? null;

  if (!verdict) {
    renderUnavailable(packet);
  } else if (verdict.verdict === "SAFE") {
    renderSafe(packet, verdict);
  } else if (verdict.verdict === "DANGEROUS") {
    renderModal(packet, verdict, "dangerous");
  } else {
    renderModal(packet, verdict, "weird");
  }

  attachActions(packet);
}

main();
```

- [ ] **Step 6: Lint + check-extension + build**

Run: `npm run lint && npm run check:extension && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add extension/lib/prefill-url.js extension/lib/prefill-url.test.mjs extension/overlay/sg-overlay.js
git commit -m "feat(phase-c2): overlay iframe verdict states + prefill url helper"
```

---

## Slice 6 — Web-app prefill + dev-only harness

Goal: web app `/` accepts `?prefill=<base64url-json>` and prefills the analysis form, and a dev-only `/extension-harness` route exposes raw `eth_sendTransaction` buttons.

### Task 15: Prefill parser

**Files:**
- Create: `src/features/shield/lib/parse-prefill.ts`
- Create: `src/features/shield/lib/parse-prefill.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// src/features/shield/lib/parse-prefill.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePrefill } from "./parse-prefill.ts";

function encode(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("returns null for missing or empty input", () => {
  assert.equal(parsePrefill(null), null);
  assert.equal(parsePrefill(""), null);
});

test("returns null for invalid base64url", () => {
  assert.equal(parsePrefill("!@#$"), null);
});

test("returns null for non-object JSON", () => {
  const encoded = Buffer.from("\"hi\"", "utf8").toString("base64").replace(/=+$/, "");
  assert.equal(parsePrefill(encoded), null);
});

test("returns null when actionType is unsupported", () => {
  const encoded = encode({ actionType: "destroy", website: "https://x.test" });
  assert.equal(parsePrefill(encoded), null);
});

test("normalizes a valid packet to ShieldFormState", () => {
  const encoded = encode({
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: 240,
    gasCostUsd: 3.5,
  });
  const result = parsePrefill(encoded);
  assert.deepEqual(result, {
    actionType: "approve",
    protocol: "Example",
    website: "https://example.test",
    summary: "approve via Example",
    rawSignals: "from=0xabc",
    assetValueUsd: "240",
    gasCostUsd: "3.5",
  });
});

test("returns null when payload exceeds 4 KiB", () => {
  const big = encode({ actionType: "sign", website: "https://x.test", summary: "x".repeat(8000) });
  assert.equal(parsePrefill(big), null);
});
```

The test imports a `.ts` file under `node --test`. Node 22 cannot import TypeScript directly without a loader; we need either a `.mjs` test file that imports from a built artifact, or a separate JS module containing the logic. The simplest fit for the existing scripts (`smoke-*.mjs`) pattern is to keep the parser in JS as well.

Decision: implement the parser as `src/features/shield/lib/parse-prefill.mjs`, then re-export from a thin TS wrapper for type-safe consumption in `shield-page.tsx`. This keeps `node --test` working without a loader and the TS form type-safe.

Update the test file's first import:

```js
import { parsePrefill } from "./parse-prefill.mjs";
```

- [ ] **Step 2: Run failing test**

Run: `npm run test:extension`
Expected: FAIL with "Cannot find module './parse-prefill.mjs'".

- [ ] **Step 3: Implement the JS parser**

```js
// src/features/shield/lib/parse-prefill.mjs
const ALLOWED_ACTION_TYPES = new Set(["sign", "approve", "bridge", "claim"]);
const PREFILL_MAX_BYTES = 4096;

function decodeBase64Url(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  const binary = atob(base64);
  let result = "";
  for (let i = 0; i < binary.length; i += 1) {
    result += String.fromCharCode(binary.charCodeAt(i));
  }
  return decodeURIComponent(escape(result));
}

function toFiniteNonNegativeNumberString(value) {
  if (value === undefined || value === null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(n);
}

export function parsePrefill(rawParam) {
  if (typeof rawParam !== "string" || rawParam.length === 0) return null;
  if (!/^[A-Za-z0-9_\-]+$/.test(rawParam)) return null;

  let json;
  try {
    json = decodeBase64Url(rawParam);
  } catch {
    return null;
  }
  if (json.length > PREFILL_MAX_BYTES) return null;

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!ALLOWED_ACTION_TYPES.has(payload.actionType)) return null;

  return {
    actionType: payload.actionType,
    protocol: typeof payload.protocol === "string" ? payload.protocol : "",
    website: typeof payload.website === "string" ? payload.website : "",
    summary: typeof payload.summary === "string" ? payload.summary : "",
    rawSignals: typeof payload.rawSignals === "string" ? payload.rawSignals : "",
    assetValueUsd: toFiniteNonNegativeNumberString(payload.assetValueUsd),
    gasCostUsd: toFiniteNonNegativeNumberString(payload.gasCostUsd),
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm run test:extension`
Expected: 6 passing in parse-prefill.test.mjs.

- [ ] **Step 5: Add the TypeScript wrapper**

```ts
// src/features/shield/lib/parse-prefill.ts
import type { ShieldFormState } from "@/features/shield/types";

import { parsePrefill as parsePrefillImpl } from "./parse-prefill.mjs";

export function parsePrefill(rawParam: string | null): ShieldFormState | null {
  return parsePrefillImpl(rawParam) as ShieldFormState | null;
}
```

- [ ] **Step 6: Lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/shield/lib/parse-prefill.mjs src/features/shield/lib/parse-prefill.ts src/features/shield/lib/parse-prefill.test.mjs
git commit -m "feat(phase-c2): web app ?prefill= base64url-json parser"
```

### Task 16: Apply prefill on `/`

**Files:**
- Modify: `src/features/shield/components/shield-page.tsx`

- [ ] **Step 1: Read the existing form-state initialization**

Run: `grep -n "ShieldFormState" src/features/shield/components/shield-page.tsx`
Note the existing initial-state setup (likely a `useState(defaultFormState)` or similar).

- [ ] **Step 2: Add the prefill effect**

Near the top of the component body, after the existing `useState` for the form, add:

```ts
import { parsePrefill } from "@/features/shield/lib/parse-prefill";

// ...inside the component body, after form state is declared:
useEffect(() => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("prefill");
  if (!raw) return;
  const next = parsePrefill(raw);
  if (!next) return;
  setFormState(next);
  // Strip the prefill param so reloads don't re-apply it.
  const url = new URL(window.location.href);
  url.searchParams.delete("prefill");
  window.history.replaceState({}, "", url.toString());
}, []);
```

If `useEffect` is not yet imported, add it to the React import. If the form state setter is named differently than `setFormState`, use the actual setter name.

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/shield/components/shield-page.tsx
git commit -m "feat(phase-c2): apply ?prefill= to shield page form once on mount"
```

### Task 17: Dev-only `/extension-harness` route

**Files:**
- Create: `src/app/extension-harness/page.tsx`

- [ ] **Step 1: Implement the harness page**

```tsx
"use client";

import { useState } from "react";

type ResultLogEntry = {
  label: string;
  status: "pending" | "ok" | "error";
  message: string;
  timestamp: number;
};

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const NATIVE_TRANSFER = {
  label: "Native transfer (no data)",
  build: (from: string) => ({
    from,
    to: "0x000000000000000000000000000000000000dEaD",
    value: "0x16345785d8a0000",
  }),
};

const ERC20_APPROVE = {
  label: "ERC-20 approve(spender, max)",
  build: (from: string) => ({
    from,
    to: "0x111111111111111111111111111111111111dEaD",
    data:
      "0x095ea7b3" +
      "0".repeat(24) + "2222222222222222222222222222222222222222" +
      "f".repeat(64),
    value: "0x0",
  }),
};

const UNKNOWN_SELECTOR = {
  label: "Unknown selector",
  build: (from: string) => ({
    from,
    to: "0x333333333333333333333333333333333333dEaD",
    data: "0xdeadbeef" + "00".repeat(32),
    value: "0x0",
  }),
};

const SCENARIOS = [NATIVE_TRANSFER, ERC20_APPROVE, UNKNOWN_SELECTOR] as const;

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return candidate ?? null;
}

export default function ExtensionHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main style={{ padding: 24 }}>
        <p>This route is only available in development.</p>
      </main>
    );
  }

  const [log, setLog] = useState<ResultLogEntry[]>([]);

  function appendLog(entry: ResultLogEntry) {
    setLog((prev) => [entry, ...prev].slice(0, 20));
  }

  async function runScenario(scenario: (typeof SCENARIOS)[number]) {
    const provider = getProvider();
    if (!provider) {
      appendLog({
        label: scenario.label,
        status: "error",
        message: "window.ethereum not present.",
        timestamp: Date.now(),
      });
      return;
    }

    appendLog({ label: scenario.label, status: "pending", message: "Sending...", timestamp: Date.now() });

    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts[0];
      if (!from) throw new Error("no account");
      const params = scenario.build(from);
      const result = await provider.request({ method: "eth_sendTransaction", params: [params] });
      appendLog({
        label: scenario.label,
        status: "ok",
        message: `Resolved: ${String(result)}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      const err = error as { code?: number; message?: string };
      appendLog({
        label: scenario.label,
        status: "error",
        message: `Rejected: code=${err?.code ?? "?"} msg=${err?.message ?? String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "Inter, system-ui", color: "#e7eefb", background: "#08111f", minHeight: "100vh" }}>
      <h1>Extension Harness — Phase C-2</h1>
      <p>Each button calls <code>window.ethereum.request</code> with a different shape.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBlock: 16 }}>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.label}
            type="button"
            onClick={() => runScenario(scenario)}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #334155", background: "#0f172a", color: "#e7eefb", cursor: "pointer" }}
          >
            {scenario.label}
          </button>
        ))}
      </div>
      <h2>Log</h2>
      <ul style={{ display: "grid", gap: 8 }}>
        {log.map((entry) => (
          <li key={entry.timestamp + entry.label} style={{ padding: 12, border: "1px solid #1e293b", borderRadius: 12 }}>
            <strong>{entry.label}</strong> — {entry.status} — {entry.message}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: pass; the route shows up in the route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/extension-harness/page.tsx
git commit -m "feat(phase-c2): dev-only extension-harness route for eth_sendTransaction"
```

### Task 18: DEMO.md smoke note

**Files:**
- Modify: `DEMO.md`

- [ ] **Step 1: Append the C-2 smoke section**

After the existing `Verification` block, add:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add DEMO.md
git commit -m "docs(phase-c2): add manual smoke section for extension hook"
```

---

## Slice 7 — Popup recent intercepts panel

Goal: the existing popup gains a `Recent intercepts` panel below the verdict panel, listing the last 10 intercepts from `chrome.storage.session`.

### Task 19: Popup HTML markup

**Files:**
- Modify: `extension/popup.html`

- [ ] **Step 1: Append the panel after the verdict panel**

Just before the closing `</main>` tag, add:

```html
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Phase C-2</p>
            <h2>Recent intercepts</h2>
          </div>
          <span class="hint">Cleared on browser close</span>
        </div>
        <ul id="recentIntercepts" class="reasons" aria-live="polite"></ul>
      </section>
```

- [ ] **Step 2: Verify check-extension still passes**

Run: `npm run check:extension`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add extension/popup.html
git commit -m "feat(phase-c2): popup markup for recent intercepts panel"
```

### Task 20: Popup script renders the list

**Files:**
- Modify: `extension/popup.js`

- [ ] **Step 1: Add imports for the intercept store and prefill helper**

Add to the existing import block at the top:

```js
import { readRecent } from "./lib/intercept-store.js";
import { buildPrefillUrl } from "./lib/prefill-url.js";
```

- [ ] **Step 2: Add `renderRecentIntercepts` and wire it in**

Add the function after `renderVerdict`:

```js
async function renderRecentIntercepts() {
  if (!refs.recentIntercepts) return;
  const list = await readRecent();
  if (!list.length) {
    refs.recentIntercepts.innerHTML = `<li class="reason">No intercepts captured yet.</li>`;
    return;
  }

  const apiBase = state.connection?.settings?.apiBaseUrl;
  refs.recentIntercepts.innerHTML = list
    .map((entry) => {
      const verdict = entry.verdict?.verdict ?? "UNAVAILABLE";
      const host = (() => {
        try { return new URL(entry.packet?.website ?? "").hostname; } catch { return entry.packet?.website ?? ""; }
      })();
      const url = buildPrefillUrl(entry.packet ?? {}, apiBase);
      return `
        <li class="reason">
          <strong>${escapeHtml(verdict)}</strong> — ${escapeHtml(entry.packet?.actionType ?? "?")} on ${escapeHtml(host)}
          <span class="hint">${escapeHtml(formatDateTime(entry.capturedAt))}</span>
          <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">Open in Shield Guardian</a>
        </li>
      `;
    })
    .join("");
}
```

- [ ] **Step 3: Wire the renderer into init and refresh paths**

In `init`, register the new ref:

```js
refs.recentIntercepts = document.getElementById("recentIntercepts");
```

At the end of `loadInitialState`, after `renderVerdict(state.lastVerdict)`, add:

```js
await renderRecentIntercepts();
```

After `renderVerdict(state.lastVerdict)` inside `analyzePacket`, also call:

```js
await renderRecentIntercepts();
```

- [ ] **Step 4: Lint + check-extension + build + tests**

Run: `npm run lint && npm run check:extension && npm run build && npm run test:extension`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add extension/popup.js
git commit -m "feat(phase-c2): popup renders recent intercepts panel"
```

### Task 21: README and verify:all

**Files:**
- Modify: `extension/README.md`

- [ ] **Step 1: Append the Phase C-2 smoke section**

After the existing `Test Flow` block, add:

```markdown
## Phase C-2 smoke (deferred)

The MV3 hook for `eth_sendTransaction` is exercised manually:

1. Start the web app: `npm run dev`.
2. Reload the extension at `chrome://extensions`.
3. Open `http://localhost:3000/extension-harness`.
4. For each scenario button, watch for the Shield Guardian overlay before
   the MetaMask popup appears.
5. Confirm Proceed forwards to MetaMask and Cancel rejects with EIP-1193
   `code: 4001` in the harness log.
6. From any overlay click `Open in Shield Guardian` and confirm the form
   is prefilled from the decoded packet.

This smoke remains deferred alongside the Phase B and Phase C-1 manual
MetaMask smokes.
```

- [ ] **Step 2: Run the full verify chain**

Run: `npm run verify:all`
Expected: lint + build + check:extension + package:extension + test:extension + smoke:demo all pass.

- [ ] **Step 3: Commit**

```bash
git add extension/README.md
git commit -m "docs(phase-c2): extension README smoke section"
```

---

## Self-review notes

Spec-coverage check (against `docs/superpowers/specs/2026-05-20-phase-c2-extension-design.md`):

- Architecture (page-world injector + isolated bridge + service worker + overlay iframe + web app prefill) → Slices 1-6.
- Injection and provider wrapping (capture references, `Proxy` over `request`, EIP-6963 announce/request, setter trap) → Tasks 5, 8.
- Message flow (page → bridge → SW → bridge → overlay → bridge → page) → Tasks 4, 10, 11, 14.
- Verdict packet normalization (selectors, decoded fields, oversize handling) → Tasks 6, 7.
- `/api/verdict` demo mode forced on intercept path → Task 10 (`x-shield-demo-mode: 1` header).
- User experience (SAFE pill auto-proceed, WEIRD modal, DANGEROUS modal with override, unavailable) → Tasks 12-14.
- Open in Shield Guardian via base64url-encoded JSON in URL, capped at 4 KiB → Tasks 14, 15.
- Recent intercepts panel in popup → Tasks 19, 20.
- Security model (origin validation, cancel via 4001, internal error via -32603, single-flight nonces, 30 s coalesce, 60 s injector timeout) → Tasks 4, 5, 9, 10.
- Compatibility (EIP-6963 + setter trap + `all_frames`, `minimum_chrome_version: 111`) → Task 2.
- Testing plan (`scripts/check-extension.mjs` extensions, unit tests for selectors / normalize / prefill / parse-prefill / sg-bridge, harness route, smoke section) → Tasks 1, 3, 6, 7, 14, 15, 17, 18, 21.

Placeholder scan: no TBD/TODO entries; every step contains the actual content (code or exact command).

Type/name consistency: message types use the same `SG_INTERCEPT_REQ` / `SG_INTERCEPT_RES` / `SG_PING` and `SHIELD_INTERCEPT` / `SHIELD_INTERCEPT_DECISION` / `SHIELD_OVERLAY_DECISION` strings throughout. `nonce`, `packet`, `choice`, `verdict` field names are stable across page → bridge → SW → overlay. `intercept-store` exposes `setPending` / `getPending` / `clearPending` / `pushRecent` / `readRecent` and is consumed in the SW (Task 10) and the overlay/popup (Tasks 14, 20) with those exact names. `parsePrefill` and `buildPrefillUrl` are reused from one source by the overlay, the popup, and the web app.

Notable judgement calls captured in the plan:

- The page-world injector is loaded as a classic content script (`world: "MAIN"`); ESM imports are not available there. The selector dictionary and normalizer are kept in `extension/inject/*.js` for unit testing under `node --test`, and a copy of their logic is inlined into `sg-injector.js` (Task 8). The plan calls out the duplication and the need to keep both in sync.
- `parse-prefill` lives in `.mjs` form so `node --test` can import it without a TS loader, with a thin `.ts` wrapper for the React component. This is consistent with the existing `scripts/smoke-*.mjs` pattern in this repo.
- Decision messaging uses `chrome.runtime.sendMessage` → bridge listener → page postMessage rather than the bridge sending the decision directly to the page via the iframe's MessageChannel; this matches the spec's "overlay → page is indirect" rule.

