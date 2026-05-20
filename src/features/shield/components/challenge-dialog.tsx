// src/features/shield/components/challenge-dialog.tsx
"use client";

import { useMemo, useState } from "react";

import styles from "@/features/shield/shield-page.module.css";
import {
  CHALLENGE_COMMENT_MAX,
  CHALLENGE_COUNT_WARNING_THRESHOLD,
  CHALLENGE_REASON_OPTIONS,
  type ChallengeReasonCode,
  validateChallengeRationale,
} from "@/lib/genlayer/policy-actions";

type ChallengeDialogProps = {
  checkId: number;
  challengeCount: number;
  busy: boolean;
  busyLabel?: string;
  externalError?: string | null;
  onCancel: () => void;
  onSubmit: (serializedRationale: string) => void;
};

export function ChallengeDialog({
  checkId,
  challengeCount,
  busy,
  busyLabel,
  externalError,
  onCancel,
  onSubmit,
}: ChallengeDialogProps) {
  const [reason, setReason] = useState<ChallengeReasonCode>(
    CHALLENGE_REASON_OPTIONS[0]!.code,
  );
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const showWarning = challengeCount >= CHALLENGE_COUNT_WARNING_THRESHOLD;
  const helperLabel = useMemo(() => {
    const trimmed = comment.trim();
    return `${trimmed.length}/${CHALLENGE_COMMENT_MAX}`;
  }, [comment]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = validateChallengeRationale({ reason, comment });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSubmit(result.serialized);
  }

  return (
    <div
      aria-labelledby="challenge-dialog-title"
      aria-modal="true"
      className={styles.policyDialogBackdrop}
      role="dialog"
    >
      <form className={styles.policyDialog} onSubmit={handleSubmit}>
        <div className={styles.policyDialogHeader}>
          <span className={styles.metricLabel}>Challenge verdict</span>
          <h3 id="challenge-dialog-title">Submit a challenge for check #{checkId}</h3>
        </div>

        {showWarning ? (
          <p className={styles.policyDialogWarning}>
            This check has already been challenged {challengeCount} times. Another
            challenge is allowed, but the policy court will use the full
            challenge history.
          </p>
        ) : null}

        <label className={styles.policyDialogField}>
          <span>Reason</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as ChallengeReasonCode)}
          >
            {CHALLENGE_REASON_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={styles.policyDialogHelper}>
            {CHALLENGE_REASON_OPTIONS.find((opt) => opt.code === reason)?.description}
          </span>
        </label>

        <label className={styles.policyDialogField}>
          <span>Comment (optional)</span>
          <textarea
            maxLength={CHALLENGE_COMMENT_MAX + 16}
            placeholder="Add context the policy court should consider."
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <span className={styles.policyDialogHelper}>{helperLabel}</span>
        </label>

        {error ? <p className={styles.errorText}>{error}</p> : null}
        {externalError ? <p className={styles.errorText}>{externalError}</p> : null}

        <div className={styles.formActions}>
          <button
            className={styles.primaryButton}
            disabled={busy}
            type="submit"
          >
            {busy ? busyLabel ?? "Submitting…" : "Sign challenge with wallet"}
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
