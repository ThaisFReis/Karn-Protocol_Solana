"use client";

import styles from "./karn.module.css";

function shorten(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

interface ConnectCardProps {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  label: string;
  publicKey: { toBase58(): string } | null;
}

export function ConnectCard({ connect, disconnect, label, publicKey }: ConnectCardProps) {
  const detected = label !== "No wallet";

  return (
    <aside className={styles.connectCard}>
      <div>
        <p className={styles.connectLabel}>Step 1</p>
        <h3 className={styles.connectTitle}>Connect your wallet</h3>
      </div>

      <div className={styles.walletList}>
        <div className={`${styles.walletRow} ${detected ? styles.walletRowActive : ""}`}>
          <span>{detected ? label : "Phantom"}</span>
          <span>{detected ? "Available" : "Not detected"}</span>
        </div>
        <div className={`${styles.walletRow} ${styles.walletRowMuted}`}>
          <span>Backpack</span>
          <span>—</span>
        </div>
        <div className={`${styles.walletRow} ${styles.walletRowMuted}`}>
          <span>Solflare</span>
          <span>—</span>
        </div>
      </div>

      {publicKey ? (
        <>
          <p className={styles.connectFootnote}>
            Connected as <span style={{ fontFamily: "var(--font-mono)" }}>{shorten(publicKey.toBase58())}</span>
          </p>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className={styles.connectFootnote}>
            Karn never sees your balance, your transactions, or any asset you hold. Only the public key is needed.
          </p>
          <button type="button" className={styles.btn} onClick={() => void connect()}>
            Connect Wallet
          </button>
        </>
      )}
    </aside>
  );
}
