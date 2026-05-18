"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { WalletState, WalletStatus } from "./types";

const STORAGE_KEY = "shield-guardian:wallet-address";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const WalletContext = createContext<WalletState | null>(null);

function readStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && ADDRESS_REGEX.test(stored) ? stored : null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [invalidationKey, setInvalidationKey] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.ethereum) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time detection of missing EIP-1193 provider
      setStatus("unsupported");
      return;
    }

    const stored = readStoredAddress();
    if (!stored) return;

    let cancelled = false;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((result) => {
        if (cancelled) return;
        const accounts = Array.isArray(result) ? (result as string[]) : [];
        const match = accounts.find(
          (entry) => entry.toLowerCase() === stored.toLowerCase(),
        );
        if (match) {
          setAddress(match);
          setStatus("connected");
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {
        if (!cancelled) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum?.on) return;

    const handler = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      if (accounts.length === 0) {
        setAddress(null);
        setStatus("disconnected");
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const next = accounts[0];
      setAddress(next);
      setStatus("connected");
      window.localStorage.setItem(STORAGE_KEY, next);
    };

    window.ethereum.on("accountsChanged", handler);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handler);
    };
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setStatus("unsupported");
      return;
    }
    setStatus("connecting");
    try {
      const result = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const accounts = Array.isArray(result) ? (result as string[]) : [];
      const next = accounts[0];
      if (!next || !ADDRESS_REGEX.test(next)) {
        setStatus("disconnected");
        return;
      }
      setAddress(next);
      setStatus("connected");
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      setStatus("disconnected");
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus(window.ethereum ? "disconnected" : "unsupported");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const bumpInvalidation = useCallback(() => {
    setInvalidationKey((current) => current + 1);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      status,
      invalidationKey,
      connect,
      disconnect,
      bumpInvalidation,
    }),
    [address, status, invalidationKey, connect, disconnect, bumpInvalidation],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside WalletProvider.");
  }
  return ctx;
}
