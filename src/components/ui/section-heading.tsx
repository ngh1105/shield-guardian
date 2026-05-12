import styles from "@/features/shield/shield-page.module.css";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  copy?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  copy,
}: SectionHeadingProps) {
  return (
    <div className={styles.panelHead}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {copy ? <p className={styles.panelCopy}>{copy}</p> : null}
    </div>
  );
}
