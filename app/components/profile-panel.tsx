"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { useKarnSolana, useValocracy } from "@karn_lat/protocol-sdk-solana/react";

export function ProfilePanel() {
  const { publicKey, clients } = useKarnSolana();
  const { stats, mana, refresh, register } = useValocracy();

  const [trackId, setTrackId] = useState(
    process.env.NEXT_PUBLIC_REGISTER_DEFAULT_TRACK_ID || "1",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    const timer = setInterval(() => void refresh(publicKey), 5000);
    return () => clearInterval(timer);
  }, [publicKey?.toBase58?.()]);

  const onRegister = async () => {
    if (!publicKey) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const config = await clients.valocracy.getConfig();
      const tokenId = BigInt(config.totalSupply.toString()) + 1n;

      const res = await fetch("/api/sign-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caller: publicKey.toBase58(),
          trackId: Number(trackId),
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Could not sign register payload.");
      }

      const payload = await res.json();
      await register({
        trackId: BigInt(payload.trackId),
        nonce: BigInt(payload.nonce),
        expiry: BigInt(payload.expiry),
        tokenId,
        backendSignature: Uint8Array.from(payload.signature),
        backendPublicKey: Uint8Array.from(payload.publicKey),
      });

      setMessage("Self-register submitted.");
      await refresh(publicKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel stack-lg">
      <div>
        <h2>Profile</h2>
        <p>
          Register the current wallet, inspect on-chain `UserStats`, and watch Mana refresh every 5 seconds.
        </p>
      </div>

      <div className="field-grid three">
        <div className="metric">
          <span className="microcopy">Wallet</span>
          <strong className="mono">
            {publicKey ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}` : "Disconnected"}
          </strong>
        </div>
        <div className="metric">
          <span className="microcopy">Credential Level</span>
          <strong>{stats ? stats.credentialLevel.toString() : "0"}</strong>
        </div>
        <div className="metric">
          <span className="microcopy">Mana</span>
          <strong>{mana.toString()}</strong>
        </div>
      </div>

      <div className="field-grid two">
        <div className="metric">
          <span className="microcopy">Primary Track</span>
          <strong>{stats?.primaryTrackId?.toString?.() ?? "None"}</strong>
        </div>
        <div className="metric">
          <span className="microcopy">Activity Level</span>
          <strong>{stats ? stats.activityLevel.toString() : "0"}</strong>
        </div>
      </div>

      <div className="divider" />

      <div className="stack">
        <div className="field">
          <label>Track Id For Register</label>
          <input value={trackId} onChange={(e) => setTrackId(e.target.value)} />
        </div>
        <div className="row">
          <button className="cta" disabled={!publicKey || busy} onClick={() => void onRegister()}>
            {busy ? "Registering..." : "Register Wallet"}
          </button>
          <button className="ghost" disabled={!publicKey} onClick={() => void refresh(publicKey)}>
            Refresh Stats
          </button>
        </div>
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <p className="footer-note">
        The API route signs the registration payload server-side. This is devnet bootstrap behavior, not a production custody model.
      </p>
    </div>
  );
}
