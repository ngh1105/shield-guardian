import styles from "@/features/shield/shield-page.module.css";
import type { ShieldFormState } from "@/features/shield/types";

type ExampleGalleryProps = {
  examples: Array<{
    name: string;
    description: string;
    values: ShieldFormState;
  }>;
  onSelect: (values: ShieldFormState) => void;
};

export function ExampleGallery({
  examples,
  onSelect,
}: ExampleGalleryProps) {
  return (
    <section className={styles.examples}>
      {examples.map((example) => (
        <button
          key={example.name}
          className={styles.exampleCard}
          type="button"
          onClick={() => onSelect(example.values)}
        >
          <span>{example.name}</span>
          <strong>{example.description}</strong>
        </button>
      ))}
    </section>
  );
}
