# GenLayer JS Adapter Design

## Goal

Add an internal GenLayer adapter boundary so the verdict API can use `genlayer-js` as the primary production integration while preserving the existing GenLayer CLI path as a fallback during migration.

## Context

The current server integration in `src/lib/genlayer-client.ts` shells out to the installed `genlayer` CLI, parses CLI output, and maps the resulting on-chain check into the existing `ShieldVerdictResponse`. This works locally, but it is fragile for Vercel production because it depends on a CLI binary, local account state, and CLI output shape.

The public API and UI should not change. `src/app/api/verdict/route.ts` should continue to call a single verdict submission function and receive the same `ShieldVerdictResponse` shape.

## Approved approach

Use an adapter boundary with `genlayer-js` as the primary implementation and the current CLI flow as a fallback.

This gives the project a production-oriented path without forcing a risky one-step cutover. If the SDK API is unavailable, incomplete, or incompatible with the current contract workflow, the existing CLI integration can continue to support local/demo validation while the SDK adapter is completed.

## Components

### GenLayer adapter interface

Introduce a small internal interface for live verdict submission:

```ts
export type GenLayerVerdictAdapter = {
  submitVerdictRequest(request: ShieldVerdictRequest): Promise<ShieldVerdictResponse>;
};
```

The API route should remain insulated from the implementation choice. It should continue importing a single `submitVerdictRequest()` function from the GenLayer client boundary.

### CLI adapter

Move the existing CLI command execution, CLI output parsing, account selection, receipt waiting, and check mapping into a CLI adapter module. Preserve the current hardened behavior:

- Use `execFile`, not shell command concatenation.
- Keep `GENLAYER_ACCOUNT_NAME` validation.
- Keep safe JSON/object-literal parsing with no `Function()` or `eval()`.

### SDK adapter

Add a `genlayer-js` adapter only after confirming the real package name and API from official package documentation or installed type definitions. The SDK adapter should perform the same logical operations as the CLI flow:

1. Submit `submit_action_check` with `actionType`, `protocol`, `website`, `summary`, and `rawSignals`.
2. Extract the returned check id and transaction hash/receipt metadata if available.
3. Wait for finality or fetch the transaction result using the SDK-supported mechanism.
4. Call `get_check(checkId)`.
5. Map the returned check into the existing `ShieldVerdictResponse` shape.

The SDK adapter should use environment variables appropriate for server-side signing/connection, without exposing values in logs or client bundles.

### Adapter selection

Add a server-only adapter selector. Default behavior should prefer the SDK adapter when its required configuration is present and fall back to the CLI adapter otherwise. A simple explicit override can be supported with a server env var such as `GENLAYER_CLIENT_MODE` with values like `sdk` or `cli`.

If `GENLAYER_CLIENT_MODE=sdk`, SDK initialization or SDK calls should fail closed rather than silently using the CLI path. If no explicit mode is set, fallback is acceptable during migration.

## Data flow

```text
POST /api/verdict
  -> submitVerdictRequest(request)
    -> select GenLayer adapter
      -> genlayer-js adapter when configured
      -> CLI adapter fallback when SDK is unavailable and fallback is allowed
    -> ShieldVerdictResponse
  -> API response
```

Demo mode remains unchanged. Requests with the demo-mode header can continue using the mock verdict path before live GenLayer submission is attempted.

## Error handling

- Preserve existing API fallback behavior for missing live GenLayer configuration where appropriate.
- In explicit SDK mode, report SDK initialization/submission failures instead of masking them with CLI fallback.
- Do not log secret values such as private keys, RPC URLs containing credentials, or account credentials.
- Keep returned user-facing errors generic while preserving server-side error details only where already safe.

## Testing and verification

Implementation should verify:

- Lint passes.
- Build passes.
- Existing demo smoke tests pass.
- Forbidden dynamic execution patterns are absent from `src` and `extension`.
- CLI fallback still works when SDK mode is not configured.
- SDK mode either passes a live GenLayer smoke test or fails clearly if the real SDK does not support the required workflow.

## Open dependency to resolve during planning

The exact `genlayer-js` package name, install command, import path, constructor/API shape, signing model, and transaction receipt APIs must be confirmed before implementation. Do not infer these from the CLI flow.
