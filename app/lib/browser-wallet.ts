"use client";

import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import type { KarnWallet } from "@karn_lat/protocol-sdk-solana/react";

type SolanaLikeWallet = {
  publicKey?: PublicKey;
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  off?: (event: string, cb: (...args: any[]) => void) => void;
  signTransaction?: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

declare global {
  interface Window {
    solana?: SolanaLikeWallet;
    backpack?: SolanaLikeWallet;
    solflare?: SolanaLikeWallet;
  }
}

function detectWallet(): SolanaLikeWallet | null {
  if (typeof window === "undefined") return null;
  return (
    window.backpack ||
    window.solflare ||
    window.solana ||
    null
  );
}

function wrapWallet(wallet: SolanaLikeWallet | null): KarnWallet | null {
  if (!wallet) return null;
  return {
    publicKey: wallet.publicKey ?? null,
    signTransaction: wallet.signTransaction?.bind(wallet),
    signAllTransactions: wallet.signAllTransactions?.bind(wallet),
  };
}

export function useBrowserWallet() {
  const [provider, setProvider] = useState<SolanaLikeWallet | null>(null);
  const [wallet, setWallet] = useState<KarnWallet | null>(null);
  const [label, setLabel] = useState("No wallet");

  useEffect(() => {
    const detected = detectWallet();
    setProvider(detected);
    setWallet(wrapWallet(detected));

    if (!detected) {
      setLabel("No wallet");
      return;
    }
    if (detected.isBackpack) setLabel("Backpack");
    else if (detected.isSolflare) setLabel("Solflare");
    else if (detected.isPhantom) setLabel("Phantom");
    else setLabel("Wallet Standard");
  }, []);

  const connect = async () => {
    const detected = provider ?? detectWallet();
    if (!detected?.connect) {
      throw new Error("No browser wallet detected.");
    }
    await detected.connect();
    setProvider(detected);
    setWallet(wrapWallet(detected));
  };

  const disconnect = async () => {
    if (provider?.disconnect) {
      await provider.disconnect();
    }
    const detected = detectWallet();
    setProvider(detected);
    setWallet(wrapWallet(detected));
  };

  return {
    provider,
    wallet,
    label,
    publicKey: wallet?.publicKey ?? null,
    connect,
    disconnect,
  };
}
