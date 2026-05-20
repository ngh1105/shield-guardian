// src/features/shield/components/verdict-policy-actions.tsx
"use client";

import { useState } from "react";

import { ChallengeDialog } from "@/features/shield/components/challenge-dialog";
import { LossReportDialog } from "@/features/shield/components/loss-report-dialog";
import type {
  OptimisticAction,
  PolicyActionPhase,
  PolicyActionsHandle,
} from "@/features/shield/lib/use-policy-court-actions";
import styles from "@/features/shield/shield-page.module.css";
import type { ShieldVerdictResponse } from "@/features/shield/types";
import { addressesMatch } from "@/lib/genlayer/policy-actions";

type VerdictPolicyActionsProps = {
  result: ShieldVerdictResponse;
  walletAddress: string | null;
  walletStatus: "connected" | "disconnected" | "connecting" | "unsupported";
  actions: PolicyActionsHandle;
};

function describePhase(
  phase: PolicyActionPhase,
  checkId: number,
): { tone: "info" | "error"; message: string } | null {
  if (phase.kind === "idle") return null;
  if (!("checkId" in phase) || phase.checkId !== checkId) return null;

  const verb = phase.action === "challenge" ? "challenge" : "loss report";

  if (phase.kind === "preflight") {
    return { tone: "info", message: `Confirming chain in your wallet for ${verb}…` };
  }
  if (phase.kind === "signing") {
    return { tone: "info", message: `Awaiting wallet signature for ${verb}…` };
  }
  if (phase.kind === "error") {
    return { tone: "error", message: phase.message };
  }
  return null;
}

function describeOptimistic(
  action: OptimisticAction,
): string | null {
  if (action.kind === "challenge") {
    return `Challenge submitted. Coverage marked as ${action.coverageStatus || "challenged"}.`;
  }
  if (action.kind === "loss") {
    return `Loss report submitted. Coverage marked as ${action.coverageStatus || "payout_review"}.`;
  }
  return null;
}

export function VerdictPolicyActions({
  result,
  walletAddress,
  walletStatus,
  actions,
}: VerdictPolicyActionsProps) {
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [lossOpen, setLossOpen] = useState(false);

  const checkId = result.provenance?.checkId;
  if (!checkId) return null;

  const optimistic = actions.optimistic[checkId];
  const baseChallengeCount = result.provenance?.challengeCount ?? 0;
  const displayedChallengeCount =
    (optimistic?.serverCheck?.challengeCount ??
      baseChallengeCount) +
    (optimistic?.challengeCountDelta ?? 0);
  const coverageStatus =
    optimistic?.coverageStatus ?? result.provenance?.coverageStatus ?? "—";

  const requester = result.provenance?.requester;
  const isRequester = addressesMatch(walletAddress, requester);
  const walletConnected = walletStatus === "connected" && Boolean(walletAddress);

  const busy = actions.isBusy(checkId);
  const phaseText = describePhase(actions.phase, checkId);
  const optimisticText = optimistic ? describeOptimistic(optimistic) : null;

  const activeError =
    actions.phase.kind === "error" &&
    "checkId" in actions.phase &&
    actions.phase.checkId === checkId
      ? actions.phase.message
      : null;

  const challengeDisabled = !walletConnected || busy;
  const lossDisabled = !walletConnected || !isRequester || busy;

  const lossReason = !walletConnected
    ? "Connect a wallet to report loss."
    : !isRequester
      ? "Only the original requester can report loss for this check."
      : undefined;

  return (
    <div className={styles.policyActionBlock}>
      <div className={styles.policyActionHead}>
        <div>
          <span className={styles.metricLabel}>Coverage status</span>
          <strong>{coverageStatus}</strong>
        </div>
        <div>
          <span className={styles.metricLabel}>Challenges</span>
          <strong>{displayedChallengeCount}</strong>
        </div>
      </div>

      <div className={styles.policyActionButtons}>
        <button
          className={styles.secondaryButton}
          disabled={challengeDisabled}
          title={!walletConnected ? "Connect a wallet to challenge." : undefined}
          type="button"
          onClick={() => setChallengeOpen(true)}
        >
          Challenge verdict
        </button>
        <button
          className={styles.secondaryButton}
          disabled={lossDisabled}
          title={lossReason}
          type="button"
          onClick={() => setLossOpen(true)}
        >
          Report loss
        </button>
      </div>

      {phaseText ? (
        <p
          className={
            phaseText.tone === "error"
              ? styles.policyStatusError
              : styles.policyStatusInfo
          }
        >
          {phaseText.message}
        </p>
      ) : null}

      {!phaseText && optimisticText ? (
        <p className={styles.policyStatusInfo}>{optimisticText}</p>
      ) : null}

      {challengeOpen ? (
        <ChallengeDialog
          busy={busy}
          busyLabel="Awaiting wallet…"
          challengeCount={displayedChallengeCount}
          checkId={checkId}
          externalError={activeError}
          onCancel={() => {
            if (!busy) {
              setChallengeOpen(false);
              actions.reset();
            }
          }}
          onSubmit={async (serialized) => {
            const ok = await actions.submitChallenge(checkId, serialized);
            if (ok) setChallengeOpen(false);
          }}
        />
      ) : null}

      {lossOpen ? (
        <LossReportDialog
          busy={busy}
          busyLabel="Awaiting wallet…"
          checkId={checkId}
          externalError={activeError}
          rawVerdict={result.provenance?.rawVerdict}
          onCancel={() => {
            if (!busy) {
              setLossOpen(false);
              actions.reset();
            }
          }}
          onSubmit={async (txHash, serialized) => {
            const ok = await actions.submitLossReport(checkId, txHash, serialized, {
              rawVerdict: result.provenance?.rawVerdict,
            });
            if (ok) setLossOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
