"use client";

import { ConnectCard } from "@/components/connect-card";
import { DemoProviders } from "@/components/providers";
import { ProfilePanel } from "@/components/profile-panel";
import { ProposalsPanel } from "@/components/proposals-panel";
import { TreasuryPanel } from "@/components/treasury-panel";
import { useBrowserWallet } from "@/lib/browser-wallet";

export function DemoShell() {
  const { wallet, connect, disconnect, label, publicKey } = useBrowserWallet();

  return (
    <main className="page-shell">
      <section className="hero">
        <span className="eyebrow">Karn Protocol · Solana Demo</span>
        <div className="hero-grid">
          <div className="stack-lg">
            <div>
              <h1>Merit Writes The Ledger.</h1>
              <p>
                This demo dApp wires the protocol’s identity, governance and treasury flows into a single devnet dashboard.
                It is intentionally thin: enough surface to connect a wallet, self-register, inspect Mana, create proposals,
                vote, execute, and move scholarship state without hiding the protocol behind generic UI chrome.
              </p>
            </div>
            <div className="stat-ribbon">
              <div className="stat-pill">
                <span>Protocol</span>
                <strong>M1–M16</strong>
              </div>
              <div className="stat-pill">
                <span>Cluster</span>
                <strong>Devnet</strong>
              </div>
              <div className="stat-pill">
                <span>Mode</span>
                <strong>Submission</strong>
              </div>
            </div>
          </div>
          <ConnectCard
            connect={connect}
            disconnect={disconnect}
            label={label}
            publicKey={publicKey}
          />
        </div>
      </section>

      {wallet?.publicKey ? (
        <DemoProviders wallet={wallet}>
          <section className="dashboard-grid">
            <ProfilePanel />
            <ProposalsPanel />
            <TreasuryPanel />
          </section>
        </DemoProviders>
      ) : (
        <div className="panel stack">
          <h2>Protocol Panels Locked</h2>
          <p>
            Connect a browser wallet first. The dashboard only mounts protocol hooks after a wallet is available, so the page
            does not fabricate client state before the signer exists.
          </p>
        </div>
      )}

      <p className="footer-note">
        This app expects the protocol programs to exist on devnet and a backend signing key to be configured for `/api/sign-register`.
      </p>
    </main>
  );
}
