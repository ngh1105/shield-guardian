// src/features/shield/lib/use-shield-verdict.ts
"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";

import type {
  ShieldVerdictRequest,
  ShieldVerdictResponse,
} from "@/features/shield/types";
import { submitBrowserVerdictRequest } from "@/lib/genlayer/browser-sdk-adapter";
import { ensureStudionet } from "@/lib/genlayer/chain-preflight";

type ShieldVerdictPhase =
  | "idle"
  | "preflight"
  | "awaiting-confirm"
  | "signing"
  | "awaiting-receipt"
  | "done"
  | "error";

type ShieldVerdictState = {
  phase: ShieldVerdictPhase;
  request: ShieldVerdictRequest | null;
  result: ShieldVerdictResponse | null;
  error: string | null;
  transactionHash: string | null;
};

const INITIAL: ShieldVerdictState = {
  phase: "idle",
  request: null,
  result: null,
  error: null,
  transactionHash: null,
};

function pickError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function useShieldVerdict() {
  const [state, setState] = useState<ShieldVerdictState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  const beginVerdict = useCallback(
    async (request: ShieldVerdictRequest) => {
      if (typeof window === "undefined" || !window.ethereum) {
        setState({
          phase: "error",
          request,
          result: null,
          error: "MetaMask is not available in this browser.",
          transactionHash: null,
        });
        return;
      }

      setState({ phase: "preflight", request, result: null, error: null, transactionHash: null });

      try {
        await ensureStudionet(window.ethereum);
        setState((prev) => ({ ...prev, phase: "awaiting-confirm" }));
      } catch (error) {
        setState({
          phase: "error",
          request,
          result: null,
          error: pickError(error),
          transactionHash: null,
        });
      }
    },
    [],
  );

  const confirmVerdict = useCallback(
    async (walletAddress: Address) => {
      const request = state.request;
      if (!request) return;
      if (typeof window === "undefined" || !window.ethereum) return;

      setState((prev) => ({ ...prev, phase: "signing", error: null, transactionHash: null }));

      try {
        const result = await submitBrowserVerdictRequest(request, {
          walletAddress,
          provider: window.ethereum,
          onBroadcast: (transactionHash) => {
            setState((prev) => ({
              ...prev,
              phase: "awaiting-receipt",
              transactionHash,
            }));
          },
        });
        setState((prev) => ({
          phase: "done",
          request,
          result,
          error: null,
          transactionHash: prev.transactionHash,
        }));
      } catch (error) {
        setState({
          phase: "error",
          request,
          result: null,
          error: pickError(error),
          transactionHash: null,
        });
      }
    },
    [state.request],
  );

  const cancelVerdict = useCallback(() => {
    setState((prev) => ({ ...INITIAL, request: prev.request }));
  }, []);

  return {
    state,
    beginVerdict,
    confirmVerdict,
    cancelVerdict,
    reset,
  };
}
