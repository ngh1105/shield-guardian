# Shield Guardian Chrome Extension

This folder contains the Chrome Manifest V3 companion extension for Shield
Guardian. It is a warning layer, not a wallet replacement.

## Load Locally

1. Start the Shield Guardian app:

   ```bash
   npm run dev
   ```

2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and select this `extension` folder.
5. Open the extension options page.
6. Keep the API base URL as `http://localhost:3000` for local testing.
7. Enable demo mode only when the server was started with `SHIELD_ENABLE_DEMO_MODE=1`.
8. Save the setting. Localhost is trusted by default; other origins still require a permission prompt.
9. Use Preview popup if you want to open the real action popup from the options page.

For local development, Chrome host permissions use `http://localhost/*` so the
permission covers any localhost port while verdict requests still go to
`http://localhost:3000/api/verdict`.

Google Chrome stable may ignore command-line `--load-extension` automation. For
Chrome, use the manual `chrome://extensions` Load unpacked flow above. For
automated runtime checks, Edge or Chromium can load the same MV3 extension.

## Test Flow

1. Open any normal web page, not `chrome://` or `chrome-extension://`.
2. Open the Shield Guardian extension popup.
3. Click Capture tab.
4. Pick a quick packet: Safe swap, Weird bridge, or Dangerous claim.
5. Click Analyze action.

The popup should render a verdict from the configured Shield API. `WEIRD`
verdicts require an acknowledgement click. `DANGEROUS` verdicts show stronger
warning copy but are not hard-blocked in v1.

When demo mode is enabled, verdict provenance is labeled as `Demo/mock`. In
live mode, successful verdicts should be labeled as `GenLayer live`.

## Package Locally

From the project root:

```bash
npm run package:extension
```

The generated zip is written to `dist/shield-guardian-extension-v0.1.0.zip`.
This is a local demo artifact, not a Chrome Web Store submission.

## Security Boundary

- The extension never stores private keys.
- The extension never signs or sends transactions.
- GenLayer calls stay server-side through `POST /api/verdict`.
- Browser storage only keeps settings and a short-lived last verdict cache.
