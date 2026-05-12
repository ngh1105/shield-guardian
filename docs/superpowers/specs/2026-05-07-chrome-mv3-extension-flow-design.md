# Chrome MV3 Extension Flow for Shield Guardian

Status: Implemented for local verification  
Date: 2026-05-07

## Context

Shield Guardian already has:

- a live Next.js app with a verdict UI
- a Route Handler at `/api/verdict`
- a GenLayer-backed server integration in `src/lib/genlayer-client.ts`
- a deployed contract that supports `submit_action_check`, `challenge_verdict`, `report_loss`, `get_check`, and `get_overview`

The remaining gap is browser-side distribution: users need a lightweight extension that can surface Shield verdicts before a wallet action continues.

## Goal

Build a Chrome Manifest V3 companion extension that:

- captures the current tab context and an action packet
- sends that packet to the existing Shield API
- renders the verdict with warning-first behavior
- stays out of wallet signing, private keys, and onchain writes

## Non-goals

- No full wallet implementation
- No transaction signing or sending from the extension
- No direct private key storage in the extension
- No Firefox/Brave support in v1
- No deep wallet DOM hacking or provider replacement in v1

## Recommended Approach

Use a small MV3 companion extension with three parts:

1. Popup UI for the action packet and verdict result
2. Background service worker for API calls and ephemeral caching
3. Content script for lightweight page context capture

This is the best fit because it gives the user a browser-native workflow without coupling the product to a specific wallet implementation.

### Why not the other options?

- Popup-only manual review is simpler, but it is too disconnected from the browsing context.
- Full wallet/provider integration is more powerful, but it is much larger and would slow down the first usable release.
- A content-script-only solution is fragile because the UI and request orchestration are harder to separate.

## User Experience

The extension should behave as a warning layer, not an auto-signer.

- `SAFE`: show a calm green state and let the user continue normally.
- `WEIRD`: show an amber warning, require an extra confirmation click, and keep the verdict visible.
- `DANGEROUS`: show a red warning with stronger copy, but still do not hard-block in v1. The extension warns and leaves the final choice to the user.

The extension should always show:

- verdict label
- risk score
- confidence
- reasons
- next step

If the Shield API is unavailable, the extension should show an explicit failure state and not silently downgrade to `SAFE`.

## Data Flow

1. The user opens a dapp or wallet-related page.
2. The content script captures minimal page context such as host, title, and selected text.
3. The popup pre-fills the website field from the active tab.
4. The user enters or edits the action packet fields.
5. The popup sends the packet to the background service worker.
6. The background service worker posts the request to `/api/verdict`.
7. The Shield API calls GenLayer or falls back to the mock engine when the contract is not configured.
8. The extension renders the returned verdict and warning state.

## Technical Scope

### Extension layout

Keep the extension source outside `src/` so the Next app and MV3 bundle do not interfere with each other.

Suggested folder layout:

- `extension/manifest.json`
- `extension/background.ts`
- `extension/content.ts`
- `extension/popup.html`
- `extension/popup.ts`
- `extension/popup.css`
- `extension/options.html`
- `extension/options.ts`

### Configuration

The extension should read the Shield API base URL from extension settings, with a local development default of `http://localhost:3000`.

The storage model should be:

- `chrome.storage.sync` for user-configured API base URL
- `chrome.storage.session` for short-lived verdict cache
- no secrets stored in the extension

### Permissions

Use the narrowest permission set that supports the first release:

- `activeTab`
- `storage`
- `scripting`
- optional host permission for the configured Shield API origin, requested after the user saves the endpoint in settings

Avoid broad `<all_urls>` access in v1.

## Error Handling

The extension should treat uncertainty as a warning, not as a silent pass.

- API timeout: show a retryable failure state.
- Invalid payload: show a validation error before the request is sent.
- Network failure: keep the last known verdict visible if one exists, but mark it stale.
- Unknown response shape: show a generic Shield unavailable message and log the payload shape for debugging.

## Security

- Never accept or store private keys in the extension.
- Keep all GenLayer interaction on the server side through the existing API route.
- Do not let the extension call the contract directly.
- Validate the action packet before sending it.
- Scope host permissions to exactly one Shield API origin chosen by the user.

## Testing

Minimum validation for the first implementation:

- lint the extension code and the Next app
- build the Next app
- load the unpacked extension in Chrome
- verify the popup can send a request to `/api/verdict`
- verify `SAFE`, `WEIRD`, and `DANGEROUS` states render correctly
- verify API failure shows an explicit warning state

## Rollout Plan

1. Scaffold the MV3 extension folder and manifest.
2. Add background request forwarding and settings storage.
3. Build the popup verdict UI.
4. Add the content script for active-tab context capture.
5. Wire the extension to the existing Shield API.
6. Verify the flow in Chrome against the live GenLayer-backed backend.

## Open Assumption

This spec assumes the first release is a Chrome desktop companion extension, not a full wallet replacement. That keeps scope aligned with the current Shield app and the live GenLayer backend.
