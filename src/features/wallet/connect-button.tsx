"use client";

import { useWallet } from "./wallet-context";
import styles from "./wallet.module.css";

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function ConnectButton() {
  const { address, status, connect, disconnect } = useWallet();

  if (status === "unsupported") {
    return (
      <button
        className={styles.connect}
        type="button"
        disabled
        title="Install MetaMask to connect a wallet."
      >
        Wallet unsupported
      </button>
    );
  }

  if (status === "connected" && address) {
    return (
      <span className={styles.connectActive}>
        <span className={styles.connectDot} aria-hidden />
        <span title={address}>{shortAddress(address)}</span>
        <button
          className={styles.disconnect}
          type="button"
          onClick={disconnect}
          title="Forget on this site"
        >
          Disconnect
        </button>
      </span>
    );
  }

  return (
    <button
      className={styles.connect}
      type="button"
      disabled={status === "connecting"}
      onClick={() => {
        void connect();
      }}
    >
      {status === "connecting" ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
