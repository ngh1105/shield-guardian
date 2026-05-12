import styles from "@/features/shield/shield-page.module.css";

export function ProductionTrack() {
  return (
    <div className={styles.trackGrid}>
      <article className={styles.trackCard}>
        <span>1</span>
        <h3>Wallet or dapp sends action payload</h3>
        <p>Popup, bridge form, claim page hoặc extension gửi raw signals.</p>
      </article>

      <article className={styles.trackCard}>
        <span>2</span>
        <h3>Shield API returns verdict</h3>
        <p>API route hiện đang mô phỏng verdict engine để prototype nhanh.</p>
      </article>

      <article className={styles.trackCard}>
        <span>3</span>
        <h3>GenLayer court handles disputes</h3>
        <p>Khi có override, loss report hoặc coverage claim, contract vào cuộc.</p>
      </article>
    </div>
  );
}
