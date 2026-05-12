import styles from "@/features/shield/shield-page.module.css";
import type { ShieldVerdictResponse } from "@/features/shield/types";

function verdictTone(verdict?: ShieldVerdictResponse["verdict"]) {
  if (verdict === "SAFE") {
    return styles.safe;
  }
  if (verdict === "WEIRD") {
    return styles.weird;
  }
  if (verdict === "NOT_WORTH_IT") {
    return styles.notWorthIt;
  }
  if (verdict === "DANGEROUS") {
    return styles.dangerous;
  }
  return "";
}

type VerdictPanelProps = {
  result: ShieldVerdictResponse | null;
};

export function VerdictPanel({ result }: VerdictPanelProps) {
  if (!result) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.eyebrow}>No verdict yet</p>
        <h3>Pick an example or enter a real action to see the product work.</h3>
        <p>
          When a verdict appears, this becomes the main output that a wallet,
          bridge, or claim portal can use before the user signs.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.verdictCard} ${verdictTone(result.verdict)}`}>
      <div className={styles.verdictTop}>
        <span className={styles.verdictPill}>{result.verdict}</span>
        <span className={styles.verdictMeta}>
          risk {result.riskScore} / confidence {result.confidence}%
        </span>
      </div>

      <h3>{result.briefing}</h3>
      <p className={styles.coverage}>
        {result.coverageEligible
          ? "This case is eligible for the coverage / appeal flow."
          : "This case should be blocked before the user touches chain."}
      </p>

      <div className={styles.reasonList}>
        {result.reasons.map((reason) => (
          <div key={reason} className={styles.reasonItem}>
            {reason}
          </div>
        ))}
      </div>

      <div className={styles.nextStep}>
        <span>Next step</span>
        <strong>{result.nextStep}</strong>
      </div>
    </div>
  );
}
