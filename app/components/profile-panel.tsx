"use client";

import { useEffect, useState } from "react";

import { useKarnSolana, useValocracy } from "@karn_lat/protocol-sdk-solana/react";

import styles from "./karn.module.css";

const VACANCY_PERIOD_DAYS = 180;
const MEMBER_FLOOR = 5;

function shorten(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const isRegistered = stats !== null && stats !== undefined;
  const manaNumber = mana ? Number(mana) : 0;
  const credentialLevel = stats ? Number(stats.credentialLevel) : 0;
  const earnedWeight = Math.max(credentialLevel - MEMBER_FLOOR, 0);

  // Decay calculation — credential_expiry is unix seconds
  let decayPct = 0;
  let daysRemaining = 0;
  if (stats && stats.credentialExpiry) {
    const expiry = Number(stats.credentialExpiry);
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, expiry - now);
    daysRemaining = Math.floor(remaining / 86400);
    decayPct = Math.min(100, Math.round((remaining / (VACANCY_PERIOD_DAYS * 86400)) * 100));
  }

  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <div>
          <h3 className={styles.panelHeadTitle}>{isRegistered ? "Your Profile" : "Profile · Not Registered"}</h3>
        </div>
        <div className={styles.panelHeadMeta}>
          <span className={styles.techBadge}>
            <span className={styles.techDot} />
            {isRegistered ? "Active member" : "Connected · awaiting register"}
          </span>
          {publicKey ? <span className={styles.pubkey}>{shorten(publicKey.toBase58())}</span> : null}
        </div>
      </header>

      {isRegistered ? (
        <RegisteredView
          manaNumber={manaNumber}
          credentialLevel={credentialLevel}
          earnedWeight={earnedWeight}
          activityLevel={stats ? Number(stats.activityLevel) : 0}
          primaryTrackId={stats?.primaryTrackId ? stats.primaryTrackId.toString() : null}
          decayPct={decayPct}
          daysRemaining={daysRemaining}
          onRefresh={() => publicKey && void refresh(publicKey)}
        />
      ) : (
        <RegisterForm
          trackId={trackId}
          setTrackId={setTrackId}
          busy={busy}
          canRegister={!!publicKey}
          onRegister={() => void onRegister()}
        />
      )}

      {message ? <FeedbackBox kind="ok" text={message} /> : null}
      {error ? <FeedbackBox kind="err" text={error} /> : null}
    </article>
  );
}

function RegisteredView(props: {
  manaNumber: number;
  credentialLevel: number;
  earnedWeight: number;
  activityLevel: number;
  primaryTrackId: string | null;
  decayPct: number;
  daysRemaining: number;
  onRefresh: () => void;
}) {
  return (
    <div className={styles.panelGrid}>
      <div className={styles.manaBlock}>
        <p className={styles.manaLabel}>Voting power</p>
        <p className={styles.manaNumber}>
          {props.manaNumber}
          <span className={styles.manaUnit}>mana.</span>
        </p>
        <p className={styles.manaPlain}>
          <strong>Baseline ({MEMBER_FLOOR})</strong> plus {props.earnedWeight.toLocaleString()} from credited
          contributions.
        </p>
        <div className={styles.decayWrap}>
          <p className={styles.decayLabel}>{props.daysRemaining} days remaining</p>
          <div className={styles.decayBar}>
            <div className={styles.decayFill} style={{ width: `${props.decayPct}%` }} />
          </div>
        </div>
      </div>

      <div>
        <header className={styles.ledgerHead}>
          <span>Component</span>
          <span style={{ textAlign: "right" }}>Weight</span>
          <span style={{ textAlign: "right" }}>State</span>
        </header>

        <div className={styles.ledgerRow}>
          <span className={styles.ledgerName}>
            <span className={styles.ledgerNameLabel}>Member Floor</span>
            <span className={styles.ledgerNameTrack}>Everyone gets this</span>
          </span>
          <span className={styles.ledgerWeight}>{MEMBER_FLOOR}</span>
          <span className={`${styles.ledgerStatus} ${styles.active}`}>Active</span>
        </div>

        <div className={styles.ledgerRow}>
          <span className={styles.ledgerName}>
            <span className={styles.ledgerNameLabel}>Credential Level</span>
            <span className={styles.ledgerNameTrack}>
              {props.primaryTrackId ? `Primary track · ${props.primaryTrackId}` : "From your contributions"}
            </span>
          </span>
          <span className={styles.ledgerWeight}>{props.credentialLevel.toLocaleString()}</span>
          <span className={`${styles.ledgerStatus} ${props.decayPct > 50 ? styles.active : styles.decaying}`}>
            {props.decayPct > 50 ? "Active" : "Cooling"}
          </span>
        </div>

        <div className={styles.ledgerRow}>
          <span className={styles.ledgerName}>
            <span className={styles.ledgerNameLabel}>Activity Level</span>
            <span className={styles.ledgerNameTrack}>From recent credits</span>
          </span>
          <span className={styles.ledgerWeight}>{props.activityLevel.toLocaleString()}</span>
          <span className={`${styles.ledgerStatus} ${props.activityLevel > 0 ? styles.active : styles.decaying}`}>
            {props.activityLevel > 0 ? "Active" : "Idle"}
          </span>
        </div>

        <div style={{ marginTop: 24 }}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={props.onRefresh}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterForm(props: {
  trackId: string;
  setTrackId: (v: string) => void;
  busy: boolean;
  canRegister: boolean;
  onRegister: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 560 }}>
      <p className={styles.manaPlain} style={{ maxWidth: "60ch" }}>
        Register this wallet to receive your <strong>baseline voice (5 mana)</strong> plus any contributions
        the protocol has credited to it. Registration is a single signed transaction.
      </p>

      <label
        style={{
          display: "grid",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--mute)",
        }}
      >
        Primary track id
        <input
          value={props.trackId}
          onChange={(e) => props.setTrackId(e.target.value)}
          style={{
            border: "2px solid var(--ink)",
            background: "var(--paper)",
            padding: "12px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            letterSpacing: "0.04em",
            color: "var(--ink)",
            outline: "none",
          }}
        />
      </label>

      <button
        type="button"
        className={styles.btn}
        disabled={!props.canRegister || props.busy}
        onClick={props.onRegister}
        style={{ opacity: !props.canRegister || props.busy ? 0.5 : 1 }}
      >
        {props.busy ? "Registering…" : "Register wallet"}
      </button>
    </div>
  );
}

function FeedbackBox({ kind, text }: { kind: "ok" | "err"; text: string }) {
  const color = kind === "ok" ? "var(--teal)" : "var(--rose)";
  return (
    <div
      style={{
        marginTop: 24,
        padding: "12px 16px",
        border: `2px solid ${color}`,
        color,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.04em",
      }}
    >
      {text}
    </div>
  );
}
