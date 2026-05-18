"use client";

import { useMyChecks } from "@/features/shield/lib/dashboard-data";
import type { CheckRow } from "@/features/shield/lib/dashboard-data";
import styles from "@/features/shield/shield-page.module.css";
import { useWallet } from "@/features/wallet/wallet-context";

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

function tableShellWithMessage(message: string) {
  return (
    <div className={styles.tableShell}>
      <div className={styles.tableHeader}>
        <span>Epoch</span>
        <span>Protocol</span>
        <span>Action</span>
        <span>Verdict</span>
      </div>
      <div className={styles.tableRow}>
        <span>—</span>
        <span>—</span>
        <span>{message}</span>
        <span>—</span>
      </div>
    </div>
  );
}

export function ActivityHistory() {
  const { address, status, invalidationKey } = useWallet();
  const { data, error, loading } = useMyChecks(address, invalidationKey);

  if (status !== "connected" || !address) {
    return tableShellWithMessage("Connect a wallet to see your scan history.");
  }

  if (error) {
    return tableShellWithMessage(`Live data unavailable: ${error}`);
  }

  const rows = data ?? [];

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
      </div>
      {rows.map((row) => (
        <div key={row.checkId} className={styles.tableRow}>
          <span>#{row.checkId} / e{row.createdEpoch}</span>
          <span className={styles.protocolCell}>
            <span className={styles.protocolIcon}>
              {protocolGlyph(row.protocol)}
            </span>
            {row.protocol}
          </span>
          <span>{describeAction(row)}</span>
          <span className={`${styles.badge} ${verdictTone(row.verdict)}`}>
            {row.verdict}
          </span>
        </div>
      ))}
    </div>
  );
}
