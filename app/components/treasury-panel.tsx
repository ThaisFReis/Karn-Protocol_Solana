"use client";

import { useState } from "react";

import { useTreasury } from "@karn_lat/protocol-sdk-solana/react";

import styles from "./karn.module.css";

function formatBigNumber(v: string | undefined): string {
  if (!v) return "0";
  // Show up to thousands with separators; mana/USDC raw units, no decimals
  try {
    return BigInt(v).toLocaleString();
  } catch {
    return v;
  }
}

export function TreasuryPanel() {
  const { state, shares, claimable, fundLab, withdrawScholarship, refresh } = useTreasury();
  const [fundAmount, setFundAmount] = useState("500000");
  const [scholarshipAmount, setScholarshipAmount] = useState("100000");
  const [withdrawAmount, setWithdrawAmount] = useState("100000");
  const [labId, setLabId] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFundLab = async () => {
    try {
      setMessage(null);
      setError(null);
      await fundLab({
        totalAmount: BigInt(fundAmount),
        scholarshipPerMember: BigInt(scholarshipAmount),
      });
      setMessage("fund_lab submitted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onWithdraw = async () => {
    try {
      setMessage(null);
      setError(null);
      await withdrawScholarship({ amount: BigInt(withdrawAmount) });
      setMessage("withdraw_scholarship submitted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const restricted = state ? state.restrictedReserves.toString() : "0";
  const userShares = shares ? shares.shares.toString() : "0";
  const userClaimable = claimable ? claimable.amount.toString() : "0";

  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <div>
          <h3 className={styles.panelHeadTitle}>Treasury</h3>
        </div>
        <div className={styles.panelHeadMeta}>
          <span className={styles.techBadge}>
            <span className={styles.techDot} />
            Vault on-chain
          </span>
        </div>
      </header>

      <div className={styles.panelGrid}>
        <div className={styles.manaBlock}>
          <p className={styles.manaLabel}>Your claimable</p>
          <p className={styles.manaNumber} style={{ fontSize: "clamp(3.5rem, 7vw, 6rem)" }}>
            {formatBigNumber(userClaimable)}
            <span className={styles.manaUnit}>units.</span>
          </p>
          <p className={styles.manaPlain}>
            Scholarship balance available for withdrawal. Approved by governance, paid by the vault.
          </p>

          <div className={styles.btnRow} style={{ marginTop: 24 }}>
            <button type="button" className={styles.btn} onClick={() => void onWithdraw()}>
              Withdraw
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        </div>

        <div>
          <header className={styles.ledgerHead}>
            <span>Account</span>
            <span style={{ textAlign: "right" }}>Amount</span>
            <span style={{ textAlign: "right" }}>Role</span>
          </header>

          <div className={styles.ledgerRow}>
            <span className={styles.ledgerName}>
              <span className={styles.ledgerNameLabel}>Restricted reserves</span>
              <span className={styles.ledgerNameTrack}>Locked, scholarships only</span>
            </span>
            <span className={styles.ledgerWeight}>{formatBigNumber(restricted)}</span>
            <span className={`${styles.ledgerStatus} ${styles.active}`}>Locked</span>
          </div>

          <div className={styles.ledgerRow}>
            <span className={styles.ledgerName}>
              <span className={styles.ledgerNameLabel}>Your shares</span>
              <span className={styles.ledgerNameTrack}>Pro rata of the vault</span>
            </span>
            <span className={styles.ledgerWeight}>{formatBigNumber(userShares)}</span>
            <span className={`${styles.ledgerStatus} ${styles.active}`}>Held</span>
          </div>

          <div className={styles.ledgerRow}>
            <span className={styles.ledgerName}>
              <span className={styles.ledgerNameLabel}>Inspect lab</span>
              <span className={styles.ledgerNameTrack}>Switch the active scholarship lab</span>
            </span>
            <span className={styles.ledgerWeight} style={{ display: "flex", justifyContent: "flex-end" }}>
              <input
                className={styles.fieldInput}
                value={labId}
                onChange={(e) => setLabId(e.target.value)}
                style={{ width: 80, padding: "6px 8px", fontSize: 12, textAlign: "right" }}
              />
            </span>
            <span className={`${styles.ledgerStatus} ${styles.decaying}`}>#{labId}</span>
          </div>
        </div>
      </div>

      <div className={styles.subdivider} />

      {/* Fund Lab form */}
      <div className={styles.fieldStack} style={{ maxWidth: 720 }}>
        <p
          className={styles.manaLabel}
          style={{ marginBottom: 8 }}
        >
          Fund a scholarship lab
        </p>

        <div className={`${styles.fieldRow} ${styles.fieldRowTwo}`}>
          <label className={styles.fieldLabel}>
            Total amount
            <input
              className={styles.fieldInput}
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            Per member
            <input
              className={styles.fieldInput}
              value={scholarshipAmount}
              onChange={(e) => setScholarshipAmount(e.target.value)}
            />
          </label>
        </div>

        <label className={styles.fieldLabel}>
          Withdraw amount
          <input
            className={styles.fieldInput}
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
        </label>

        <div className={styles.btnRow}>
          <button type="button" className={styles.btn} onClick={() => void onFundLab()}>
            Fund lab
          </button>
        </div>
      </div>

      {message ? <div className={styles.feedbackOk}>{message}</div> : null}
      {error ? <div className={styles.feedbackErr}>{error}</div> : null}
    </article>
  );
}
