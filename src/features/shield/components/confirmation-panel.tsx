// src/features/shield/components/confirmation-panel.tsx
"use client";

import styles from "@/features/shield/shield-page.module.css";
import type { ShieldVerdictRequest } from "@/features/shield/types";

const CONSENSUS_CONTRACT_ADDRESS = "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575";

type ConfirmationPanelProps = {
  walletAddress: string;
  contractAddress: string;
  request: ShieldVerdictRequest;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationPanel({
  walletAddress,
  contractAddress,
  request,
  busy,
  onConfirm,
  onCancel,
}: ConfirmationPanelProps) {
  return (
    <div className={styles.confirmationCard} role="dialog" aria-modal="false">
      <span className={styles.metricLabel}>Confirm signature</span>
      <h3>You are about to ask the policy court for a verdict.</h3>
      <ul className={styles.confirmationList}>
        <li><strong>Action:</strong> {request.actionType}</li>
        <li><strong>Protocol:</strong> {request.protocol || "(not specified)"}</li>
        <li><strong>Website:</strong> {request.website}</li>
        <li><strong>Summary:</strong> {request.summary}</li>
        <li><strong>Wallet:</strong> {walletAddress}</li>
        <li>
          <strong>Policy contract:</strong> {contractAddress}
        </li>
        <li>
          <strong>Consensus contract:</strong> {CONSENSUS_CONTRACT_ADDRESS}
          <span className={styles.confirmationHint}>
            (this is the address MetaMask will show. The policy contract above
            is invoked inside the call data.)
          </span>
        </li>
      </ul>
      <div className={styles.formActions}>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Awaiting wallet..." : "Sign with wallet"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
