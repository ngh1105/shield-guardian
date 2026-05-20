// src/features/shield/components/loss-report-dialog.tsx
"use client";

import { useMemo, useState } from "react";

import styles from "@/features/shield/shield-page.module.css";
import {
  LOSS_ASSET_MAX,
  LOSS_COMMENT_MAX,
  LOSS_COMMENT_MIN,
  LOSS_IMPACT_OPTIONS,
  type LossImpactCode,
  validateLossSubmission,
} from "@/lib/genlayer/policy-actions";

type LossReportDialogProps = {
  checkId: number;
  rawVerdict?: "safe" | "weird" | "dangerous";
  busy: boolean;
  busyLabel?: string;
  externalError?: string | null;
  onCancel: () => void;
  onSubmit: (txHash: string, serializedSummary: string) => void;
};

export function LossReportDialog({
  checkId,
  rawVerdict,
  busy,
  busyLabel,
  externalError,
  onCancel,
  onSubmit,
}: LossReportDialogProps) {
  const [txHash, setTxHash] = useState("");
  const [impact, setImpact] = useState<LossImpactCode>(
    LOSS_IMPACT_OPTIONS[0]!.code,
  );
  const [amountUsd, setAmountUsd] = useState("");
  const [asset, setAsset] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const helperComment = useMemo(() => {
    const trimmed = comment.trim();
    return `${trimmed.length}/${LOSS_COMMENT_MAX} (min ${LOSS_COMMENT_MIN})`;
  }, [comment]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = validateLossSubmission(txHash, {
      impact,
      amountUsd,
      asset,
      comment,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSubmit(result.txHash, result.serialized);
  }

  return (
    <div
      aria-labelledby="loss-report-dialog-title"
      aria-modal="true"
      className={styles.policyDialogBackdrop}
      role="dialog"
    >
      <form className={styles.policyDialog} onSubmit={handleSubmit}>
        <div className={styles.policyDialogHeader}>
          <span className={styles.metricLabel}>Report loss</span>
          <h3 id="loss-report-dialog-title">File a loss for check #{checkId}</h3>
          <p className={styles.policyDialogHelper}>
            {rawVerdict === "safe"
              ? "Loss reports for safe-pass checks move coverage to payout review."
              : "Loss reports for non-safe checks resolve as denied per the policy contract."}
          </p>
        </div>

        <label className={styles.policyDialogField}>
          <span>Transaction hash</span>
          <input
            placeholder="0x…"
            value={txHash}
            onChange={(event) => setTxHash(event.target.value)}
          />
          <span className={styles.policyDialogHelper}>
            0x followed by 64 hex characters.
          </span>
        </label>

        <label className={styles.policyDialogField}>
          <span>Impact</span>
          <select
            value={impact}
            onChange={(event) => setImpact(event.target.value as LossImpactCode)}
          >
            {LOSS_IMPACT_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={styles.policyDialogHelper}>
            {LOSS_IMPACT_OPTIONS.find((opt) => opt.code === impact)?.description}
          </span>
        </label>

        <div className={styles.formSplit}>
          <label className={styles.policyDialogField}>
            <span>Amount lost (USD, optional)</span>
            <input
              inputMode="decimal"
              placeholder="240.00"
              value={amountUsd}
              onChange={(event) => setAmountUsd(event.target.value)}
            />
          </label>
          <label className={styles.policyDialogField}>
            <span>Asset (optional)</span>
            <input
              maxLength={LOSS_ASSET_MAX + 8}
              placeholder="WETH"
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            />
          </label>
        </div>

        <label className={styles.policyDialogField}>
          <span>Summary</span>
          <textarea
            maxLength={LOSS_COMMENT_MAX + 32}
            placeholder="Describe what went wrong, who was attacked, and any follow-up evidence."
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <span className={styles.policyDialogHelper}>{helperComment}</span>
        </label>

        {error ? <p className={styles.errorText}>{error}</p> : null}
        {externalError ? <p className={styles.errorText}>{externalError}</p> : null}

        <div className={styles.formActions}>
          <button
            className={styles.primaryButton}
            disabled={busy}
            type="submit"
          >
            {busy ? busyLabel ?? "Submitting…" : "Sign loss report with wallet"}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
