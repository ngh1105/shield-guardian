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
