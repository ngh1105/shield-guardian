import styles from "@/features/shield/shield-page.module.css";
import type { ActionType, ShieldFormState } from "@/features/shield/types";

type ActionFormProps = {
  form: ShieldFormState;
  error: string;
  isPending: boolean;
  onFieldChange: <Key extends keyof ShieldFormState>(
    key: Key,
    value: ShieldFormState[Key],
  ) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function ActionForm({
  form,
  error,
  isPending,
  onFieldChange,
  onSubmit,
}: ActionFormProps) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.formGrid}>
        <label>
          Action type
          <select
            value={form.actionType}
            onChange={(event) =>
              onFieldChange("actionType", event.target.value as ActionType)
            }
          >
            <option value="sign">Sign</option>
            <option value="approve">Approve</option>
            <option value="bridge">Bridge</option>
            <option value="claim">Claim</option>
          </select>
        </label>

        <label>
          Protocol
          <input
            value={form.protocol}
            onChange={(event) => onFieldChange("protocol", event.target.value)}
            placeholder="Uniswap, LayerZero bridge, Retrodrop portal"
          />
        </label>
      </div>

      <label>
        Website
        <input
          value={form.website}
          onChange={(event) => onFieldChange("website", event.target.value)}
          placeholder="https://app.uniswap.org"
        />
      </label>

      <label>
        Action summary
        <textarea
          rows={4}
          value={form.summary}
          onChange={(event) => onFieldChange("summary", event.target.value)}
          placeholder="Describe exactly what the wallet popup is asking the user to do."
        />
      </label>

      <label>
        Raw signals
        <textarea
          rows={4}
          value={form.rawSignals}
          onChange={(event) => onFieldChange("rawSignals", event.target.value)}
          placeholder="Paste spender notes, route hints, host signals, or text from the popup."
        />
      </label>

      <div className={styles.formGrid}>
        <label>
          Asset value (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.assetValueUsd}
            onChange={(event) => onFieldChange("assetValueUsd", event.target.value)}
          />
        </label>

        <label>
          Gas cost (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.gasCostUsd}
            onChange={(event) => onFieldChange("gasCostUsd", event.target.value)}
          />
        </label>
      </div>

      <button className={styles.primaryCta} type="submit" disabled={isPending}>
        {isPending ? "Running verdict..." : "Run shield verdict"}
      </button>

      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
