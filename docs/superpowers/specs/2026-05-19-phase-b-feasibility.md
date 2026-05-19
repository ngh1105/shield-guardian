# Phase B Feasibility Report

**Date:** 2026-05-19
**Status:** Draft
**Question:** Can `genlayer-js` sign GenLayer transactions with an EIP-1193
(MetaMask) wallet in the browser?

## 1. genlayer-js signer surface

Source under analysis: `node_modules/genlayer-js/dist/index.js` and
`node_modules/genlayer-js/dist/index.d.ts` from genlayer-js@1.1.8.

### `createClient`

From `index.d.ts` (lines 10-45):

```ts
interface ClientConfig {
    chain?: {
        id: number;
        name: string;
        rpcUrls: { default: { http: readonly string[] } };
        nativeCurrency: { name: string; symbol: string; decimals: number };
        blockExplorers?: { default: { name: string; url: string } };
    };
    endpoint?: string;
    account?: Account | Address;
    provider?: EthereumProvider;
}

declare const createClient: (config?: ClientConfig) => GenLayerClient<GenLayerChain>;
```

Key fact: the public config exposes a `provider?: EthereumProvider` slot.
`account` accepts either a viem `Account` object or a bare `Address` string.

### `createAccount`

From `index.d.ts` (lines 48-65) and `index.js` (lines 2459-2466):

```ts
declare const createAccount: (accountPrivateKey?: `0x${string}`) => {
    address: viem_accounts.Address;
    sign: ...; signMessage: ...; signTransaction: ...; signTypedData: ...;
    publicKey: viem.Hex;
    source: "privateKey";
    type: "local";
};
```

```js
var createAccount = (accountPrivateKey) => {
  const privateKey = accountPrivateKey || generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return account;
};
```

`createAccount` is a thin wrapper over viem's `privateKeyToAccount`. It
only accepts a 0x-prefixed 64-hex private key (or generates one if absent)
and returns a `type: "local"` private-key-bound account. It does NOT accept
an EIP-1193 provider, an injected wallet handle, or anything else.

### Custom transport / signer hooks

`createClient` itself takes an EIP-1193 provider via `config.provider`.
Internally (`index.js` lines 2354-2418), it builds a custom viem transport:

```js
var PROVIDER_METHODS = new Set([
  "eth_accounts", "eth_requestAccounts",
  "eth_sendTransaction", "eth_signTransaction",
  "personal_sign", "eth_signTypedData_v4"
]);

var getCustomTransportConfig = (config, chainConfig) => {
  const isAddress = typeof config.account !== "object";
  return {
    async request({ method, params = [] }) {
      if (PROVIDER_METHODS.has(method) && isAddress) {
        const provider = config.provider
          || (typeof window !== "undefined" ? window.ethereum : void 0);
        if (provider) {
          if (method === "eth_sendTransaction" || method === "eth_signTransaction") {
            await assertChainMatch(provider, chainConfig);
          }
          return await provider.request({ method, params });
        }
      }
      // ...else POSTs JSON-RPC to chainConfig.rpcUrls.default.http[0]
    }
  };
};
```

So provider-routed signing is gated on TWO conditions both being true:
1. The RPC method is in `PROVIDER_METHODS` (signing/account methods).
2. `config.account` is NOT an object — i.e. it must be an `Address` string,
   not a viem `Account`.

Pass a viem `Account` object and the transport never delegates to the
provider, even if `config.provider` is set. Pass an `Address` string and
the EIP-1193 path activates for the six methods listed.

A grep across `node_modules/genlayer-js/dist/*.js` for
`eip1193|window.ethereum|injected|metamask|wallet_` returns matches
(non-exhaustive):

- `index.js:1574-1582` — `cancelTransaction` falls back to
  `window.ethereum.request({ method: "personal_sign", ... })` when the
  client account has no `signMessage`.
- `index.js:1645-1681` — chain bootstrap helper that calls
  `wallet_addEthereumChain` / `wallet_switchEthereumChain` /
  `wallet_getSnaps` / `wallet_requestSnaps` against `window.ethereum`.
- `index.js:1689-1733` — `metamaskClient` wrapper that talks to a
  GenLayer MetaMask Snap.
- `index.js:2382-2388` — the custom-transport branch quoted above.

EIP-1193 / MetaMask is a first-class code path in this build.

### `_sendTransaction` flow

From `index.js` lines 1090-1199. Two branches keyed on
`validatedSenderAccount.type`:

```js
if (validatedSenderAccount?.type === "local") {
  // ... build legacy tx fields ...
  const serializedTransaction =
    await validatedSenderAccount.signTransaction(transactionRequest);
  const txHash = await client.sendRawTransaction({ serializedTransaction });
  // ...
} else {
  // ... build formattedRequest with from/to/data/value/gas/nonce/chainId ...
  const evmTxHash = await client.request({
    method: "eth_sendTransaction",
    params: [formattedRequest]
  });
  if (client.chain.isStudio) {
    return evmTxHash;
  }
  // ... waitForTransactionReceipt + extractTxIdFromLogs ...
}
```

Branch A (`type === "local"`, what `createAccount(privateKey)` produces):
the SDK signs the raw legacy transaction locally with the private key and
broadcasts via `eth_sendRawTransaction`. The transport is irrelevant at
the signing step — the key bytes do the work. This is the path used by
the current `src/lib/genlayer/sdk-adapter.ts`.

Branch B (everything else — including `account` passed as a bare
`Address` string): the SDK delegates the entire send to the transport
via `client.request({ method: "eth_sendTransaction", ... })`. Combined
with the custom-transport rule from the previous subsection, this
routes through `config.provider.request("eth_sendTransaction", ...)`,
which is exactly the EIP-1193 contract MetaMask implements. MetaMask
signs and broadcasts. The SDK just waits for the resulting hash and
extracts the GenLayer txId.

To/value/data fields in branch B (`index.js` lines 1160-1171):

```js
const formattedRequest = {
  from: validatedSenderAccount.address,
  to: client.chain.consensusMainContract?.address,
  data: encodedDataForSend,
  value: `0x${value.toString(16)}`,
  gas: `0x${estimatedGas.toString(16)}`,
  nonce: `0x${nonceBigInt.toString(16)}`,
  type: "0x0",
  chainId: `0x${client.chain.id.toString(16)}`,
  ...gasPriceHex ? { gasPrice: gasPriceHex } : {}
};
```

`to` is the chain's consensus main contract, `data` is the encoded
GenLayer calldata. The user wallet sees a contract-interaction tx
to the consensus contract with raw calldata — no GenLayer-aware
humanization.

### studionet chain definition

From `chunk-XCQTIUTU.js` lines 4030-8045:

```js
var SIMULATOR_JSON_RPC_URL2 = "https://studio.genlayer.com/api";

var CONSENSUS_MAIN_CONTRACT2 = {
  address: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575",
  abi: [ /* ... */ ]
};

var studionet = defineChain2({
  id: 61999,
  isStudio: true,
  name: "Genlayer Studio Network",
  rpcUrls: { default: { http: [SIMULATOR_JSON_RPC_URL2] } },
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  blockExplorers: {
    default: { name: "GenLayer Explorer", url: EXPLORER_URL }
  },
  testnet: true,
  consensusMainContract: CONSENSUS_MAIN_CONTRACT2,
  consensusDataContract: CONSENSUS_DATA_CONTRACT2,
  stakingContract: null,
  feeManagerContract: null,
  roundsStorageContract: null,
  appealsContract: null,
  defaultNumberOfInitialValidators: 5,
  defaultConsensusMaxRotations: 3
});
```

- chain id: `61999` (hex `0xf22f`)
- rpc url: `https://studio.genlayer.com/api`
- native currency: GEN (18 decimals)
- custom fields: `isStudio: true`, `consensusMainContract.address =
  0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`, plus
  `consensusDataContract`, `defaultNumberOfInitialValidators: 5`,
  `defaultConsensusMaxRotations: 3`. Staking / fee / rounds / appeals
  contracts are all `null` on studionet.
- One important behavioural shortcut: in `_sendTransaction` branch B,
  `if (client.chain.isStudio) return evmTxHash;` — on studionet the SDK
  skips `waitForTransactionReceipt` and returns immediately after the
  wallet broadcasts. That means a studionet PoC can succeed even if the
  RPC does not implement standard receipts, but it also means we will
  not see a chain id mismatch caught by the receipt path; only
  `assertChainMatch` (which is short-circuited on `isStudio`) gates
  network alignment. On studionet, `assertChainMatch` returns
  immediately without checking — see `index.js:2362-2364`:
  `if (chainConfig.isStudio) return;`. So MetaMask will not be forced
  to switch networks for a studionet send.

### Implications

The surface allows EIP-1193 signing with no extra adapter glue, provided
the dapp passes `account` as a bare `Address` string and either supplies
`window.ethereum` as `config.provider` or relies on the implicit
`window.ethereum` fallback. In that mode, `writeContract` →
`_sendTransaction` → custom transport → `provider.request("eth_sendTransaction")`
hands the unsigned tx to MetaMask, which signs and broadcasts.

Two caveats from the static read, to verify in the browser PoC:

1. The wallet sees a raw consensus-contract calldata payload, not a
   readable GenLayer method name. Phase B should expect MetaMask's
   "Contract interaction" view with hex data and decide whether a
   humanizer is in scope.
2. `assertChainMatch` short-circuits on `isStudio`, so the SDK will not
   itself prompt MetaMask to add or switch to chain `61999`. If the
   user's wallet is on a different chain when they click "send", the
   wallet's own behaviour decides whether the request is rejected,
   silently sent on the wrong chain, or prompted-for-switch. The PoC
   needs to record what actually happens.

Phase B is therefore static-feasibility GREEN for studionet. The
remaining unknowns are runtime-feasibility (does MetaMask actually
accept and broadcast the unsigned tx the SDK builds?) and UX (what does
the signing prompt show?), which Tasks 2 and 3 of the investigation
plan resolve.

## 2. Runtime probe — read path

A browser-pinned MetaMask test is out of scope for this controller, so
runtime feasibility was probed with `scripts/phase-b-rpc-probe.mjs`,
a Node script that:

1. Builds a viem `LocalAccount` from `GENLAYER_PRIVATE_KEY`.
2. Wraps the account in a `fakeProvider` that exposes the EIP-1193
   `request({method, params})` shape and routes the six
   `PROVIDER_METHODS` to either `walletClient.sendTransaction` /
   `signTransaction` / `signMessage` / `signTypedData` or to a static
   chain-id reply.
3. Constructs a genlayer-js client with that fakeProvider.
4. Drives `client.readContract` and `client.writeContract` against the
   deployed Phase A contract on studionet.

The probe is the closest non-browser equivalent to MetaMask: same SDK
build, same chain config, same `config.provider` slot, same six methods
the wallet would receive.

### 2.1 Read result

```text
[probe] account=0xD12e272d9b464B5287c50307321c1bB1f6092517
[probe] contract=0x878b7E60d9b6afD46d7B2981003dd5f2a6871286
[probe] chain id=61999 rpc=https://studio.genlayer.com/api

[probe] === READ get_overview ===
READ OK: {"check_count":6,"current_epoch":0,"dangerous":1,"safe":4,"weird":1}
```

`client.readContract({ functionName: "get_overview", args: [] })`
returned live state from the deployed contract. The decoded payload is
the same shape `src/lib/genlayer-client.ts:readOverview` already
returns through the LocalAccount path, confirming that the
provider-mode transport gets reads to studionet without going through
the EIP-1193 signing methods (reads bypass `PROVIDER_METHODS` and fall
to the JSON-RPC `fetch` branch — no wallet prompt, no signature).

The read passes regardless of how `config.account` is shaped, because
`PROVIDER_METHODS` only intercepts signing/account methods. So Phase B
will not prompt MetaMask for read calls — the user only sees the
wallet for state-changing actions, which matches the desired UX.

## 3. Runtime probe — write path

### 3.1 Correct invocation shape

The static analysis in §1 captured the gating condition correctly:
provider-mode signing is active only when `typeof config.account !==
"object"`. The empirically-required shape, derived from getting the
probe to green, is:

```ts
const client = createClient({
  account: walletAddress,        // bare 0x-prefixed Address string
  chain: studionet,
  provider: injectedProvider,    // window.ethereum or equivalent
});

await client.writeContract({
  // NO `account` field here — let the SDK use client.account
  address: contractAddress,
  functionName: "...",
  args: [...],
  value: 0n,
});
```

Two non-obvious requirements that the static read of §1 implied but
did not call out explicitly:

1. **`config.account` must be a bare `Address` string.** Passing
   `{address, type: "json-rpc"}` (the `JsonRpcAccount` shape that
   viem itself produces internally) trips the
   `typeof config.account !== "object"` check in
   `getCustomTransportConfig` (`index.js:2378`) — `isAddress` becomes
   `false`, the `PROVIDER_METHODS` branch is skipped, and
   `eth_sendTransaction` is sent directly to the studionet JSON-RPC
   endpoint, which rejects it with `Method not found:
   eth_sendTransaction`.
2. **Do not pass `account` to `writeContract`.** When `account` is
   omitted, the SDK uses `client.account` (`index.js:680` — `const
   senderAccount = account || client.account`), which viem has
   normalized from the bare Address into a `JsonRpcAccount` with a
   defined `.address`. Passing the raw Address string back into
   `writeContract` makes `validatedSenderAccount.address` be
   `undefined` (because `validateAccount` is a no-op pass-through —
   `index.js:874-881`), which crashes downstream with `Address
   "undefined" is invalid`.

The per-call shape in `src/lib/genlayer/sdk-adapter.ts` (which writes
through a LocalAccount and explicitly passes `account`) is therefore
NOT the right template for Phase B. Phase B needs a separate
provider-mode adapter that constructs the client with a bare Address
and lets `client.account` propagate.

### 3.2 Write result

After applying the shape above, the probe wrote successfully:

```text
[probe] === WRITE submit_action_check ===
WRITE OK txHash: 0x5f34aee8d2e79e5f9bbaf92c060a8dd926e3b2ae1064f46bb29be0e8cefd44f3

[probe] === RPC methods invoked ===
  eth_sendTransaction (params=1)
```

The fakeProvider's `request()` was invoked exactly once, with method
`eth_sendTransaction` and a single param object. The SDK built the
unsigned transaction (legacy type `0x0`, `to` = consensus main contract
`0xb727...e575`, `data` = encoded `submit_action_check` calldata,
`from` = our address, `value: 0x0`, plus gas / nonce / chainId), handed
it off to the provider, the provider's wrapped `walletClient` signed
and broadcast it via the studionet RPC, and the resulting EVM tx hash
flowed back. Because `studionet.isStudio === true`,
`_sendTransaction` returned the EVM hash directly without trying to
extract a GenLayer txId from logs (`index.js:1176-1178`).

This is the exact code path MetaMask would drive in the browser. The
only difference is that MetaMask shows a confirmation UI before
calling `walletClient.sendTransaction` equivalent — the SDK's contract
with the provider is identical.

### 3.3 What the wallet will see

From the formattedRequest in `_sendTransaction` (`index.js:1160-1171`),
the prompt MetaMask gets is a contract-interaction transaction whose:

- `to` is the consensus main contract address
  (`0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`), NOT the Phase A
  contract address (`0x878b...1286`). The Phase A contract address is
  embedded inside the encoded calldata as `recipient` of
  `addTransaction`, so the wallet's "Interacting with" hint will read
  the consensus contract, not the policy court.
- `data` is the ABI-encoded `addTransaction(_sender, _recipient,
  _numOfInitialValidators, _maxRotations, _txData[, _validUntil])`
  call, with `_txData` being the GenLayer-serialized
  `submit_action_check(...)` calldata. There is no
  human-readable function name in the wallet view — MetaMask will
  show "Contract interaction" and a hex blob.
- `value` is `0x0`.
- `chainId` is `0xf22f` (61999).

Because `assertChainMatch` short-circuits on `isStudio`
(`index.js:2362-2364`), the SDK does NOT call
`wallet_switchEthereumChain` or `wallet_addEthereumChain` before
sending. If the user's MetaMask is on a different chain, the wallet
itself decides whether to reject, prompt-for-switch, or silently sign
on the wrong chain. The browser PoC at `src/app/phase-b-poc/page.tsx`
is the artifact that needs to be exercised by a human to record what
MetaMask actually does in those cases — the probe cannot answer that.

### 3.4 Provider methods exercised

Across the green probe run, only one EIP-1193 method reached the
provider: `eth_sendTransaction`. `eth_requestAccounts`,
`eth_chainId`, and the signing methods were all routed elsewhere
(viem's internal account materialisation, the `isStudio`
short-circuit in `assertChainMatch`, etc.). For studionet writes, the
wallet will be asked to handle exactly one method per submission.

## 4. Recommendation

**Verdict: GREEN.** Phase B (user-signed transactions via
MetaMask / EIP-1193 wallets) is feasible on the current
`genlayer-js@1.1.8` build against studionet, with no SDK patches.
The runtime probe replicated the browser code path end-to-end and
got a successful broadcast.

### 4.1 Required Phase B work, scoped from the findings

1. **A second SDK adapter** alongside `src/lib/genlayer/sdk-adapter.ts`
   that builds the client with `account: <Address string>` and
   `provider: window.ethereum`, omits `account` on every
   `writeContract` call, and exposes the same surface (`submit_action_check`,
   `submit_action_check_for`, etc.) the existing LocalAccount adapter
   does. The two adapters can share the `CalldataAddress` wrapping logic.
2. **Connect-wallet UI surface** that obtains the `Address` from
   `eth_requestAccounts` once and persists it for the lifetime of the
   page. Existing components (`ConnectButton`, wallet identity in
   `src/components/...`) already do most of this; Phase B just needs
   to thread the address into the new adapter.
3. **Pre-flight chain check.** Because `assertChainMatch` no-ops on
   studionet, the dapp must enforce the chain itself: read
   `wallet_chainId`, and if it is not `0xf22f`, call
   `wallet_addEthereumChain` (chain id 61999, RPC
   `https://studio.genlayer.com/api`, native currency GEN/18) and then
   `wallet_switchEthereumChain`. This is `< 30` lines but it is
   load-bearing — without it the wallet may sign on the wrong chain.
4. **Hex-blob mitigation.** The wallet will show "Contract
   interaction" against the consensus contract, with no
   human-readable function. Phase B should ship a parallel UI panel
   ("You are about to: approve action X for site Y") rendered from
   the dapp's own state, so the user has context the wallet does not.
   Any deeper humanizer (decoding the wrapped GenLayer calldata into
   an ABI-style summary) is a non-blocker enhancement.

### 4.2 Open questions the probe cannot answer

These need a human in front of MetaMask, using
`src/app/phase-b-poc/page.tsx` as the harness:

- **Network mismatch behaviour.** With wallet on (e.g.) Sepolia, what
  does MetaMask do when the dapp issues `eth_sendTransaction` for
  chain `0xf22f`? Reject, prompt, or silently sign?
- **Add-chain UX.** If the user has never seen studionet in their
  wallet, does `wallet_addEthereumChain` produce a clean popup with
  the GenLayer brand info, or does MetaMask block the unknown RPC?
- **Confirmation copy.** Take a screenshot of the actual confirmation
  prompt for `submit_action_check` — what does the user actually see
  before clicking Confirm?
- **Receipt timing.** Studionet returns the EVM hash fast (no receipt
  wait), but the GenLayer txId may not be queryable for several
  seconds. Phase B's UI needs to decide whether to optimistically
  show "submitted" or block on a follow-up query.

### 4.3 Static / runtime gap closed

The static read in §1 was correct on the gating condition but did not
make the *bare-Address-string* requirement explicit, which cost a debug
cycle. This report supersedes that omission: future Phase B work
should treat §3.1 as the canonical client-construction shape, not the
inferred-from-types shape.

## 5. Implementation status (post-Phase-B-build)

**Date:** 2026-05-19

The Phase B implementation plan
(`docs/superpowers/plans/2026-05-19-phase-b-implementation.md`) landed
in commits `098939a..ef8f1f8` (11 commits). The four §4.1
deliverables are all in `main`:

- Browser SDK adapter: `src/lib/genlayer/browser-sdk-adapter.ts` —
  uses the §3.1 shape verbatim (bare Address string for
  `createClient.account`, `account` omitted on `writeContract`).
- Pre-flight chain check: `src/lib/genlayer/chain-preflight.ts`
  (`ensureStudionet`) — handles `wallet_switchEthereumChain` →
  catch 4902 → `wallet_addEthereumChain` → re-switch.
- Confirmation panel: `src/features/shield/components/confirmation-panel.tsx` —
  shows action / wallet / policy contract / consensus contract before
  the wallet prompt.
- Server-side signing removed: `GENLAYER_PRIVATE_KEY` no longer read
  by any code in `src/`; `/api/verdict` returns HTTP 410 for non-demo
  requests; `submit_action_check_for` and `claimedRequester` are gone
  from the request type.

Build and lint are clean. Final integration review (commit
`bd8fffd` plus `ef8f1f8`) approved the layered flow end-to-end against
the plan and against §4.1 of this report.

### 5.1 Open §4.2 questions — still open

The four UX questions in §4.2 remain unanswered because they require
a human at MetaMask:

1. Wallet on the wrong chain (e.g. Sepolia) — what does MetaMask do
   when the dapp issues `eth_sendTransaction` for chain `0xf22f`?
2. Wallet without studionet configured — does
   `wallet_addEthereumChain` produce a clean popup, or does MetaMask
   block the unknown RPC?
3. Confirmation copy — what does the actual MetaMask review screen
   show for a `submit_action_check` invocation?
4. Receipt timing — gap between MetaMask broadcast and the
   `/api/checks` row appearing.

The dedicated harness route (`src/app/phase-b-poc/page.tsx`) and the
Node EIP-1193 probe (`scripts/phase-b-rpc-probe.mjs`) were retired
once the production form at `/` was wired through the same browser
flow (Task 7, commit `4b61e48`). All four scenarios above can be
reproduced by submitting the form on `/` with the wallet placed in
the relevant state. Until those scenarios are walked and recorded,
*do not deploy publicly* — the non-studionet code path has not been
observed.


