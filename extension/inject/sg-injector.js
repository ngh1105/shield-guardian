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

  // Inlined from extension/inject/selectors.mjs and normalize.mjs — kept
  // in sync by hand because Chrome MV3 content_scripts are loaded as
  // classic scripts (no ESM imports). When you change either source,
  // mirror the change here in the same commit.
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
  const SG_MAX_RAW_SIGNALS = 1024;

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

  function sgClamp(value, max) {
    const s = String(value ?? "");
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
      ].join(" | "), SG_MAX_RAW_SIGNALS),
      assetValueUsd: 0,
      gasCostUsd: 0,
    };
  }

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
    const protocol = (
      document.querySelector("[data-shield-protocol]")?.getAttribute("data-shield-protocol")
      || document.title
      || new URL(Frozen.href).hostname
    ).toString();

    const { promise, resolve, reject } = deferred();

    let packet;
    try {
      packet = sgBuildPacket(args.params?.[0] ?? {}, { website: Frozen.href, protocol });
    } catch (err) {
      reject({ code: -32603, message: `Shield Guardian internal error: ${err.message}` });
      return promise;
    }

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
