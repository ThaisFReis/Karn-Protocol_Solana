"use client";

import { useMemo } from "react";
import { Connection } from "@solana/web3.js";

import { KarnSolanaProvider } from "@karn_lat/protocol-sdk-solana/react";

import { createPrograms } from "@/lib/programs";
import type { KarnWallet } from "@karn_lat/protocol-sdk-solana/react";

export function DemoProviders({
  children,
  wallet,
}: {
  children: React.ReactNode;
  wallet: KarnWallet | null;
}) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
  const rpcEndpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const connection = useMemo(
    () => new Connection(rpcEndpoint, "confirmed"),
    [rpcEndpoint],
  );

  const programs = useMemo(
    () => createPrograms(connection, wallet),
    [connection, wallet?.publicKey?.toBase58?.()],
  );

  return (
    <KarnSolanaProvider
      cluster={cluster}
      rpcEndpoint={rpcEndpoint}
      connection={connection}
      wallet={wallet}
      programs={programs ?? undefined}
    >
      {children}
    </KarnSolanaProvider>
  );
}
