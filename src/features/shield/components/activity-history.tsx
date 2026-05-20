"use client";

import { useEffect } from "react";

import { CheckActivityRow } from "@/features/shield/components/check-activity-row";
import type { CheckRow } from "@/features/shield/lib/dashboard-data";
import { useMyChecks } from "@/features/shield/lib/dashboard-data";
import type { PolicyActionsHandle } from "@/features/shield/lib/use-policy-court-actions";
import styles from "@/features/shield/shield-page.module.css";
import { useWallet } from "@/features/wallet/wallet-context";

function tableShellWithMessage(message: string) {
  return (
    <div className={styles.tableShell}>
      <div className={styles.tableHeader}>
        <span>Epoch</span>
        <span>Protocol</span>
        <span>Action</span>
        <span>Verdict</span>
        <span>Coverage</span>
        <span>Actions</span>
      </div>
      <div className={styles.tableRow}>
        <span>—</span>
        <span>—</span>
        <span>{message}</span>
        <span>—</span>
        <span>—</span>
        <span>—</span>
      </div>
    </div>
  );
}

type ActivityHistoryProps = {
  actions: PolicyActionsHandle;
};

export function ActivityHistory({ actions }: ActivityHistoryProps) {
  const { address, status, invalidationKey } = useWallet();
  const { data, error, loading } = useMyChecks(address, invalidationKey);
  const { clearOptimisticForCheck, optimistic } = actions;

  useEffect(() => {
    if (!data) return;
    data.forEach((row) => {
      const optimisticRow = optimistic[row.checkId];
      if (!optimisticRow?.serverCheck) return;
      const matchesServerCheck =
        row.coverageStatus === optimisticRow.serverCheck.coverageStatus &&
        row.challengeCount === optimisticRow.serverCheck.challengeCount &&
        row.lossReportTxHash === optimisticRow.serverCheck.lossReportTxHash;
      if (matchesServerCheck) {
        clearOptimisticForCheck(row.checkId);
      }
    });
  }, [clearOptimisticForCheck, data, optimistic]);

  if (status !== "connected" || !address) {
    return tableShellWithMessage("Connect a wallet to see your scan history.");
  }

  if (error) {
    return tableShellWithMessage(`Live data unavailable: ${error}`);
  }

  const rows: CheckRow[] = data ?? [];

  if (loading && rows.length === 0) {
    return tableShellWithMessage("Loading scans…");
  }

  if (rows.length === 0) {
    return tableShellWithMessage("No scans submitted from this wallet yet.");
  }

  return (
    <div className={styles.tableShell}>
      <div className={styles.tableHeader}>
        <span>Epoch</span>
        <span>Protocol</span>
        <span>Action</span>
        <span>Verdict</span>
        <span>Coverage</span>
        <span>Actions</span>
      </div>
      {rows.map((row) => (
        <CheckActivityRow
          key={row.checkId}
          actions={actions}
          row={row}
          walletAddress={address}
          walletStatus={status}
        />
      ))}
    </div>
  );
}
