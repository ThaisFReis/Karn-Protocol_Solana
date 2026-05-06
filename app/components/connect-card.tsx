"use client";

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

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2>Connect</h2>
          <p className="microcopy">
            Browser wallet entrypoint for Phantom, Backpack or Solflare on devnet.
          </p>
        </div>
        <span className="wallet-chip">{label}</span>
      </div>

      {publicKey ? (
        <>
          <div className="metric">
            <span className="microcopy">Connected wallet</span>
            <strong className="mono">{shorten(publicKey.toBase58())}</strong>
          </div>
          <button className="ghost" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <div className="metric">
            <span className="microcopy">
              No wallet is connected. The dApp expects a browser provider compatible with Solana wallets.
            </span>
          </div>
          <button className="cta" onClick={() => void connect()}>
            Connect Wallet
          </button>
        </>
      )}
    </div>
  );
}
