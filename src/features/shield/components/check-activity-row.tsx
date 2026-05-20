// src/features/shield/components/check-activity-row.tsx
"use client";

import { useState } from "react";

import { ChallengeDialog } from "@/features/shield/components/challenge-dialog";
import { LossReportDialog } from "@/features/shield/components/loss-report-dialog";
import type { CheckRow } from "@/features/shield/lib/dashboard-data";
import type {
  OptimisticAction,
  PolicyActionPhase,
  PolicyActionsHandle,
} from "@/features/shield/lib/use-policy-court-actions";
import styles from "@/features/shield/shield-page.module.css";
import { addressesMatch } from "@/lib/genlayer/policy-actions";

function protocolGlyph(protocol: string) {
  return protocol
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function verdictTone(verdict: CheckRow["verdict"]) {
  if (verdict === "SAFE") return styles.safe;
  if (verdict === "WEIRD") return styles.weird;
  return styles.dangerous;
}

function describeAction(row: CheckRow) {
  const head = `${row.actionType[0]?.toUpperCase() ?? ""}${row.actionType.slice(1)}`;
  const tail = row.summary || row.website;
  return tail ? `${head} · ${tail}` : head;
}

function rowPhaseText(
  phase: PolicyActionPhase,
  checkId: number,
): string | null {
  if (phase.kind === "idle") return null;
  if (!("checkId" in phase) || phase.checkId !== checkId) return null;
  const verb = phase.action === "challenge" ? "challenge" : "loss report";
  if (phase.kind === "preflight") return `Confirming chain for ${verb}…`;
  if (phase.kind === "signing") return `Awaiting signature for ${verb}…`;
  if (phase.kind === "error") return `Error: ${phase.message}`;
  return null;
}

function describeOptimistic(action: OptimisticAction): string | null {
  if (action.kind === "challenge") {
    return `Challenge submitted (coverage ${action.coverageStatus}).`;
  }
  if (action.kind === "loss") {
    return `Loss report submitted (coverage ${action.coverageStatus}).`;
  }
  return null;
}

type CheckActivityRowProps = {
  row: CheckRow;
  walletAddress: string | null;
  walletStatus: "connected" | "disconnected" | "connecting" | "unsupported";
  actions: PolicyActionsHandle;
};

export function CheckActivityRow({
  row,
  walletAddress,
  walletStatus,
  actions,
}: CheckActivityRowProps) {
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [lossOpen, setLossOpen] = useState(false);

  const optimistic = actions.optimistic[row.checkId];
  const displayedChallengeCount =
    (optimistic?.serverCheck?.challengeCount ?? row.challengeCount) +
    (optimistic?.challengeCountDelta ?? 0);
  const coverageStatus =
    optimistic?.coverageStatus ?? row.coverageStatus ?? "—";

  const isRequester = addressesMatch(walletAddress, row.requester);
  const walletConnected = walletStatus === "connected" && Boolean(walletAddress);

  const busy = actions.isBusy(row.checkId);
  const status = rowPhaseText(actions.phase, row.checkId);
  const optimisticText = optimistic ? describeOptimistic(optimistic) : null;

  const activeError =
    actions.phase.kind === "error" &&
    "checkId" in actions.phase &&
    actions.phase.checkId === row.checkId
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
    <div className={styles.tableRow}>
      <span>#{row.checkId} / e{row.createdEpoch}</span>
      <span className={styles.protocolCell}>
        <span className={styles.protocolIcon}>{protocolGlyph(row.protocol)}</span>
        {row.protocol}
      </span>
      <span>{describeAction(row)}</span>
      <span className={`${styles.badge} ${verdictTone(row.verdict)}`}>
        {row.verdict}
      </span>
      <span className={styles.coverageCell}>
        <span className={styles.coverageStatus}>{coverageStatus}</span>
        <span className={styles.coverageMeta}>
          {displayedChallengeCount} challenge{displayedChallengeCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className={styles.rowActions}>
        <button
          className={styles.rowActionButton}
          disabled={challengeDisabled}
          title={!walletConnected ? "Connect a wallet to challenge." : undefined}
          type="button"
          onClick={() => setChallengeOpen(true)}
        >
          Challenge
        </button>
        <button
          className={styles.rowActionButton}
          disabled={lossDisabled}
          title={lossReason}
          type="button"
          onClick={() => setLossOpen(true)}
        >
          Report loss
        </button>
        {status ? <span className={styles.rowStatus}>{status}</span> : null}
        {!status && optimisticText ? (
          <span className={styles.rowStatus}>{optimisticText}</span>
        ) : null}
      </span>

      {challengeOpen ? (
        <ChallengeDialog
          busy={busy}
          busyLabel="Awaiting wallet…"
          challengeCount={displayedChallengeCount}
          checkId={row.checkId}
          externalError={activeError}
          onCancel={() => {
            if (!busy) {
              setChallengeOpen(false);
              actions.reset();
            }
          }}
          onSubmit={async (serialized) => {
            const ok = await actions.submitChallenge(row.checkId, serialized);
            if (ok) setChallengeOpen(false);
          }}
        />
      ) : null}

      {lossOpen ? (
        <LossReportDialog
          busy={busy}
          busyLabel="Awaiting wallet…"
          checkId={row.checkId}
          externalError={activeError}
          rawVerdict={row.rawVerdict}
          onCancel={() => {
            if (!busy) {
              setLossOpen(false);
              actions.reset();
            }
          }}
          onSubmit={async (txHash, serialized) => {
            const ok = await actions.submitLossReport(row.checkId, txHash, serialized, {
              rawVerdict: row.rawVerdict,
            });
            if (ok) setLossOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
