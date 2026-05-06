"use client";

import { useState } from "react";

import { useTreasury } from "@karn_lat/protocol-sdk-solana/react";

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

  return (
    <div className="panel stack-lg">
      <div>
        <h2>Treasury</h2>
        <p>
          Lab funding and scholarship withdrawal panel. Reads state directly from the Treasury program.
        </p>
      </div>

      <div className="field-grid three">
        <div className="metric">
          <span className="microcopy">Restricted Reserves</span>
          <strong>{state ? state.restrictedReserves.toString() : "0"}</strong>
        </div>
        <div className="metric">
          <span className="microcopy">Your Shares</span>
          <strong>{shares ? shares.shares.toString() : "0"}</strong>
        </div>
        <div className="metric">
          <span className="microcopy">Your Claimable</span>
          <strong>{claimable ? claimable.amount.toString() : "0"}</strong>
        </div>
      </div>

      <div className="stack">
        <div className="field-grid two">
          <div className="field">
            <label>Fund Lab: Total Amount</label>
            <input value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Fund Lab: Scholarship Per Member</label>
            <input value={scholarshipAmount} onChange={(e) => setScholarshipAmount(e.target.value)} />
          </div>
        </div>

        <button className="cta" onClick={() => void onFundLab()}>
          Fund Lab
        </button>
      </div>

      <div className="divider" />

      <div className="stack">
        <div className="field-grid two">
          <div className="field">
            <label>Inspect Lab Id</label>
            <input value={labId} onChange={(e) => setLabId(e.target.value)} />
          </div>
          <div className="field">
            <label>Withdraw Amount</label>
            <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
          </div>
        </div>

        <div className="row">
          <button className="ghost" onClick={() => void refresh()}>
            Refresh Treasury
          </button>
          <button className="cta" onClick={() => void onWithdraw()}>
            Withdraw Scholarship
          </button>
        </div>
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <p className="footer-note">Current Lab input: #{labId}. This starter UI keeps the dashboard thin and query-driven.</p>
    </div>
  );
}
