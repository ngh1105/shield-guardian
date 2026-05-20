// src/features/shield/lib/use-policy-court-actions.ts
"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";

import {
  challengeBrowserVerdict,
  reportBrowserLoss,
} from "@/lib/genlayer/browser-sdk-adapter";
import { ensureStudionet } from "@/lib/genlayer/chain-preflight";
import type { GenLayerCheck } from "@/lib/genlayer/types";

export type CoverageStatus =
  | "none"
  | "eligible"
  | "challenged"
  | "payout_review"
  | "denied"
  | string;

export type OptimisticAction = {
  kind: "challenge" | "loss";
  coverageStatus: CoverageStatus;
  challengeCountDelta: number;
  lossReportTxHash: string;
  serverCheck?: {
    coverageStatus: string;
    challengeCount: number;
    lossReportTxHash: string;
    note: string;
  };
};

export type PolicyActionPhase =
  | { kind: "idle" }
  | { kind: "preflight"; checkId: number; action: "challenge" | "loss" }
  | { kind: "signing"; checkId: number; action: "challenge" | "loss" }
  | {
      kind: "error";
      checkId: number;
      action: "challenge" | "loss";
      message: string;
    };

export type PolicyActionDeps = {
  walletAddress: string | null;
  status: "connected" | "disconnected" | "connecting" | "unsupported";
  bumpInvalidation: () => void;
};

function pickError(error: unknown): string {
  if (!error) return "Unknown error.";
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === 4001) return "Wallet signature rejected.";
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      const lowered = message.toLowerCase();
      if (lowered.includes("user rejected") || lowered.includes("user denied")) {
        return "Wallet signature rejected.";
      }
      if (lowered.includes("only the requester")) {
        return "Only the original requester can report loss for this check.";
      }
      return message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

function getProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function usePolicyCourtActions(deps: PolicyActionDeps) {
  const [phase, setPhase] = useState<PolicyActionPhase>({ kind: "idle" });
  const [optimistic, setOptimistic] = useState<Record<number, OptimisticAction>>(
    {},
  );

  const reset = useCallback(() => {
    setPhase({ kind: "idle" });
  }, []);

  const isBusy = useCallback(
    (checkId: number) => {
      return (
        (phase.kind === "preflight" || phase.kind === "signing") &&
        phase.checkId === checkId
      );
    },
    [phase],
  );

  const isAnyBusy = phase.kind !== "idle" && phase.kind !== "error";

  const ensureWallet = useCallback((): {
    ok: true;
    address: Address;
    provider: NonNullable<ReturnType<typeof getProvider>>;
  } | { ok: false; message: string } => {
    const provider = getProvider();
    if (!provider) {
      return {
        ok: false,
        message: "MetaMask is not available in this browser.",
      };
    }
    if (deps.status !== "connected" || !deps.walletAddress) {
      return { ok: false, message: "Connect your wallet to continue." };
    }
    return {
      ok: true,
      address: deps.walletAddress as Address,
      provider,
    };
  }, [deps.status, deps.walletAddress]);

  const submitChallenge = useCallback(
    async (checkId: number, serializedRationale: string) => {
      const wallet = ensureWallet();
      if (!wallet.ok) {
        setPhase({
          kind: "error",
          checkId,
          action: "challenge",
          message: wallet.message,
        });
        return false;
      }

      setPhase({ kind: "preflight", checkId, action: "challenge" });
      try {
        await ensureStudionet(wallet.provider);
      } catch (error) {
        setPhase({
          kind: "error",
          checkId,
          action: "challenge",
          message: pickError(error),
        });
        return false;
      }

      setPhase({ kind: "signing", checkId, action: "challenge" });
      let writeResult: { transactionHash: string; check: GenLayerCheck };
      try {
        writeResult = await challengeBrowserVerdict(checkId, serializedRationale, {
          walletAddress: wallet.address,
          provider: wallet.provider,
        });
      } catch (error) {
        setPhase({
          kind: "error",
          checkId,
          action: "challenge",
          message: pickError(error),
        });
        return false;
      }

      setOptimistic((current) => ({
        ...current,
        [checkId]: {
          kind: "challenge",
          coverageStatus: writeResult.check.coverage_status || "challenged",
          challengeCountDelta: 0,
          lossReportTxHash:
            writeResult.check.loss_report_tx_hash ??
            current[checkId]?.lossReportTxHash ??
            "",
          serverCheck: {
            coverageStatus: writeResult.check.coverage_status,
            challengeCount: writeResult.check.challenge_count,
            lossReportTxHash: writeResult.check.loss_report_tx_hash,
            note: writeResult.check.note,
          },
        },
      }));

      deps.bumpInvalidation();
      setPhase({ kind: "idle" });
      return true;
    },
    [deps, ensureWallet],
  );

  const submitLossReport = useCallback(
    async (
      checkId: number,
      txHash: string,
      serializedSummary: string,
      meta: { rawVerdict?: "safe" | "weird" | "dangerous" },
    ) => {
      const wallet = ensureWallet();
      if (!wallet.ok) {
        setPhase({
          kind: "error",
          checkId,
          action: "loss",
          message: wallet.message,
        });
        return false;
      }

      setPhase({ kind: "preflight", checkId, action: "loss" });
      try {
        await ensureStudionet(wallet.provider);
      } catch (error) {
        setPhase({
          kind: "error",
          checkId,
          action: "loss",
          message: pickError(error),
        });
        return false;
      }

      setPhase({ kind: "signing", checkId, action: "loss" });
      let writeResult: { transactionHash: string; check: GenLayerCheck };
      try {
        writeResult = await reportBrowserLoss(
          checkId,
          txHash,
          serializedSummary,
          {
            walletAddress: wallet.address,
            provider: wallet.provider,
          },
        );
      } catch (error) {
        setPhase({
          kind: "error",
          checkId,
          action: "loss",
          message: pickError(error),
        });
        return false;
      }

      const optimisticCoverage =
        writeResult.check.coverage_status ||
        (meta.rawVerdict === "safe" ? "payout_review" : "denied");

      setOptimistic((current) => ({
        ...current,
        [checkId]: {
          kind: "loss",
          coverageStatus: optimisticCoverage,
          challengeCountDelta: 0,
          lossReportTxHash:
            writeResult.check.loss_report_tx_hash || txHash,
          serverCheck: {
            coverageStatus: writeResult.check.coverage_status,
            challengeCount: writeResult.check.challenge_count,
            lossReportTxHash: writeResult.check.loss_report_tx_hash,
            note: writeResult.check.note,
          },
        },
      }));

      deps.bumpInvalidation();
      setPhase({ kind: "idle" });
      return true;
    },
    [deps, ensureWallet],
  );

  const clearOptimisticForCheck = useCallback((checkId: number) => {
    setOptimistic((current) => {
      if (!(checkId in current)) return current;
      const next = { ...current };
      delete next[checkId];
      return next;
    });
  }, []);

  return {
    phase,
    optimistic,
    submitChallenge,
    submitLossReport,
    isBusy,
    isAnyBusy,
    reset,
    clearOptimisticForCheck,
  };
}

export type PolicyActionsHandle = ReturnType<typeof usePolicyCourtActions>;
