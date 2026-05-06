import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { AccountMeta, ConfirmOptions, Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

import type { GovernorClient } from "../clients/governor";
import type { TreasuryClient } from "../clients/treasury";
import type { ValocracyClient } from "../clients/valocracy";

export type KarnCluster = "devnet" | "testnet" | "mainnet-beta" | "localnet" | string;

export type KarnTransaction = Transaction | VersionedTransaction;

export interface KarnWallet {
  publicKey: PublicKey | null;
  signTransaction?: <T extends KarnTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends KarnTransaction>(transactions: T[]) => Promise<T[]>;
}

export interface KarnPrograms {
  valocracy: Program<any>;
  governor: Program<any>;
  treasury: Program<any>;
}

export interface KarnClients {
  valocracy: ValocracyClient;
  governor: GovernorClient;
  treasury: TreasuryClient;
}

export interface KarnSolanaProviderProps {
  children?: any;
  cluster?: KarnCluster;
  rpcEndpoint?: string;
  connection?: Connection;
  wallet?: KarnWallet | null;
  clients?: KarnClients;
  programs?: KarnPrograms;
  provider?: AnchorProvider;
  confirmOptions?: ConfirmOptions;
}

export interface KarnSolanaContextValue {
  cluster: KarnCluster;
  rpcEndpoint: string;
  connection: Connection;
  wallet: KarnWallet | null;
  publicKey: PublicKey | null;
  provider: AnchorProvider | null;
  clients: KarnClients;
}

export interface SendMethodOptions {
  accounts?: Record<string, unknown>;
  signers?: unknown[];
  preInstructions?: unknown[];
  remainingAccounts?: AccountMeta[];
}
