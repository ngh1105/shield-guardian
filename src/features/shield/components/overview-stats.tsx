"use client";

import { useOverview } from "@/features/shield/lib/dashboard-data";
import styles from "@/features/shield/shield-page.module.css";
import { useWallet } from "@/features/wallet/wallet-context";

export function OverviewStats() {
  const { invalidationKey } = useWallet();
  const { data, error, loading } = useOverview(invalidationKey);

  if (error) {
    return (
      <div className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.metricLabel}>Live data unavailable</span>
          <strong>—</strong>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  const checkCount = data?.check_count ?? 0;
  const dangerous = data?.dangerous ?? 0;
  const weird = data?.weird ?? 0;
  const safe = data?.safe ?? 0;

  return (
    <div className={styles.statsGrid}>
      <article className={styles.statCard}>
        <span className={styles.metricLabel}>Total Scans</span>
        <strong>{loading ? "…" : checkCount.toLocaleString()}</strong>
        <p>Across wallet, bridge, and claim flows</p>
      </article>
      <article className={styles.statCard}>
        <span className={styles.metricLabel}>Threats Blocked</span>
        <strong>{loading ? "…" : dangerous.toLocaleString()}</strong>
        <p>Resolved as dangerous by GenLayer policy</p>
      </article>
      <article className={styles.statCard}>
        <span className={styles.metricLabel}>Suspicious Actions</span>
        <strong>{loading ? "…" : weird.toLocaleString()}</strong>
        <p>Escalated to weird status ({safe} safe-pass on record)</p>
      </article>
    </div>
  );
}
