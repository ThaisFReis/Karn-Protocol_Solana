import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { createContext, createElement, useContext, useMemo } from "react";

import { GovernorClient } from "../clients/governor";
import { TreasuryClient } from "../clients/treasury";
import { ValocracyClient } from "../clients/valocracy";
import type {
  KarnClients,
  KarnCluster,
  KarnPrograms,
  KarnSolanaContextValue,
  KarnSolanaProviderProps,
  KarnWallet,
} from "./types";

const LOCALNET_ENDPOINT = "http://127.0.0.1:8899";
const DEVNET_ENDPOINT = "https://api.devnet.solana.com";
const TESTNET_ENDPOINT = "https://api.testnet.solana.com";
const MAINNET_ENDPOINT = "https://api.mainnet-beta.solana.com";

const KarnSolanaContext = createContext<KarnSolanaContextValue | null>(null);

function resolveCluster(cluster?: string): KarnCluster {
  if (cluster) return cluster;
  return (
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER ||
    process.env.VITE_SOLANA_CLUSTER ||
    process.env.SOLANA_CLUSTER ||
    "devnet"
  );
}

function resolveRpcEndpoint(cluster: KarnCluster, explicit?: string): string {
  if (explicit) return explicit;

  const envRpc =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.VITE_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL;
  if (envRpc) return envRpc;

  switch (cluster) {
    case "localnet":
      return LOCALNET_ENDPOINT;
    case "testnet":
      return TESTNET_ENDPOINT;
    case "mainnet-beta":
      return MAINNET_ENDPOINT;
    case "devnet":
    default:
      return DEVNET_ENDPOINT;
  }
}

export function createKarnClients(programs: KarnPrograms): KarnClients {
  return {
    valocracy: new ValocracyClient(programs.valocracy),
    governor: new GovernorClient(programs.governor),
    treasury: new TreasuryClient(programs.treasury),
  };
}

export function createAnchorProvider(
  connection: Connection,
  wallet: KarnWallet | null,
  opts?: anchor.web3.ConfirmOptions,
): anchor.AnchorProvider | null {
  if (!wallet || !wallet.publicKey) return null;
  return new anchor.AnchorProvider(connection, wallet as any, opts ?? anchor.AnchorProvider.defaultOptions());
}

export function KarnSolanaProvider(props: KarnSolanaProviderProps) {
  const cluster = resolveCluster(props.cluster);
  const rpcEndpoint = resolveRpcEndpoint(cluster, props.rpcEndpoint);

  const connection = useMemo(
    () => props.connection ?? new Connection(rpcEndpoint, props.confirmOptions ?? "confirmed"),
    [props.connection, props.confirmOptions, rpcEndpoint],
  );

  const provider = useMemo(
    () => props.provider ?? createAnchorProvider(connection, props.wallet ?? null, props.confirmOptions),
    [connection, props.confirmOptions, props.provider, props.wallet],
  );

  const clients = useMemo(() => {
    if (props.clients) return props.clients;
    if (props.programs) return createKarnClients(props.programs);
    throw new Error("KarnSolanaProvider requires either `clients` or `programs`.");
  }, [props.clients, props.programs]);

  const value = useMemo<KarnSolanaContextValue>(
    () => ({
      cluster,
      rpcEndpoint,
      connection,
      wallet: props.wallet ?? null,
      publicKey: props.wallet?.publicKey ?? null,
      provider,
      clients,
    }),
    [clients, cluster, connection, props.wallet, provider, rpcEndpoint],
  );

  return createElement((KarnSolanaContext as any).Provider, { value }, props.children);
}

export function useKarnSolana(): KarnSolanaContextValue {
  const ctx = useContext<KarnSolanaContextValue | null>(KarnSolanaContext);
  if (!ctx) {
    throw new Error("useKarnSolana must be used inside KarnSolanaProvider.");
  }
  return ctx;
}
