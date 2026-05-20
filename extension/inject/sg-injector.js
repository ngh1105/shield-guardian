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
