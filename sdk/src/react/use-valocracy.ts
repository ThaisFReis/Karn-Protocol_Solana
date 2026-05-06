import { SystemProgram, type PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import type { UserStats } from "../types";
import { buildEd25519PreInstruction } from "../helpers/self-register";
import { useKarnSolana } from "./provider";
import { buildRegisterAccounts, sendMethod, toBigIntLike, walletKeyOrThrow } from "./utils";
import type { SendMethodOptions } from "./types";

export interface RegisterArgs extends SendMethodOptions {
  trackId: bigint;
  nonce: bigint;
  expiry: bigint;
  tokenId: bigint;
  backendSignature: Uint8Array;
  backendPublicKey: Uint8Array;
}

export interface MintArgs extends SendMethodOptions {
  valorId: bigint;
  tokenId: bigint;
  recipient: PublicKey;
}

export interface GuardianMintArgs extends SendMethodOptions {
  valorId: bigint;
  tokenId: bigint;
  account: PublicKey;
}

export interface CreditActivityArgs extends SendMethodOptions {
  account: PublicKey;
  trackId: bigint;
  amount: bigint;
}

export function useValocracy(targetWallet?: PublicKey | null) {
  const { clients, publicKey } = useKarnSolana();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [mana, setMana] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const wallet = targetWallet ?? publicKey ?? null;

  const refresh = async (nextWallet?: PublicKey | null) => {
    const resolved = nextWallet ?? wallet;
    if (!resolved) {
      setStats(null);
      setMana(0n);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await clients.valocracy.getUserStats(resolved);
      setStats(next);
      setMana(await clients.valocracy.getVotes(resolved));
      return next;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(wallet);
  }, [wallet?.toBase58?.()]);

  const register = async (args: RegisterArgs) => {
    const caller = walletKeyOrThrow(publicKey);
    const accounts = args.accounts ?? await buildRegisterAccounts(clients.valocracy, {
      caller,
      nonce: args.nonce,
      tokenId: args.tokenId,
    });
    const sigIx = buildEd25519PreInstruction({
      caller,
      nonce: args.nonce,
      expiry: args.expiry,
      trackId: args.trackId,
      tokenId: args.tokenId,
      backendSignature: args.backendSignature,
      backendPublicKey: args.backendPublicKey,
    });

    const signature = await sendMethod(
      clients.valocracy.selfRegister(args.trackId, args.nonce, args.expiry, args.tokenId),
      {
        ...args,
        accounts,
        preInstructions: [sigIx, ...(args.preInstructions ?? [])],
      },
    );
    await refresh(caller);
    return signature;
  };

  const mint = async (args: MintArgs) => {
    const minter = walletKeyOrThrow(publicKey);
    const [config] = clients.valocracy.configPda();
    const [valor] = clients.valocracy.valorPda(args.valorId);
    const [recipientStats] = clients.valocracy.userStatsPda(args.recipient);
    const [tokenOwner] = clients.valocracy.tokenOwnerPda(args.tokenId);
    const [tokenValor] = clients.valocracy.tokenValorPda(args.tokenId);

    return sendMethod(clients.valocracy.mint(args.valorId, args.tokenId), {
      ...args,
      accounts: args.accounts ?? {
        minter,
        recipient: args.recipient,
        config,
        valor,
        recipientStats,
        tokenOwner,
        tokenValor,
        systemProgram: SystemProgram.programId,
      },
    });
  };

  const mintCommunity = async (args: MintArgs) => {
    const minter = walletKeyOrThrow(publicKey);
    const [config] = clients.valocracy.configPda();
    const [minterStats] = clients.valocracy.userStatsPda(minter);
    const [valor] = clients.valocracy.valorPda(args.valorId);
    const [recipientStats] = clients.valocracy.userStatsPda(args.recipient);
    const [tokenOwner] = clients.valocracy.tokenOwnerPda(args.tokenId);
    const [tokenValor] = clients.valocracy.tokenValorPda(args.tokenId);

    return sendMethod(clients.valocracy.mintCommunity(args.valorId, args.tokenId), {
      ...args,
      accounts: args.accounts ?? {
        minter,
        minterStats,
        recipient: args.recipient,
        config,
        valor,
        recipientStats,
        tokenOwner,
        tokenValor,
        systemProgram: SystemProgram.programId,
      },
    });
  };

  const guardianMint = async (args: GuardianMintArgs) => {
    const guardian = walletKeyOrThrow(publicKey);
    const [config] = clients.valocracy.configPda();
    const [valor] = clients.valocracy.valorPda(args.valorId);
    const [guardianTracks] = clients.valocracy.guardianPda(guardian);
    const [recipientStats] = clients.valocracy.userStatsPda(args.account);
    const [tokenOwner] = clients.valocracy.tokenOwnerPda(args.tokenId);
    const [tokenValor] = clients.valocracy.tokenValorPda(args.tokenId);

    return sendMethod(clients.valocracy.guardianMint(args.valorId, args.tokenId), {
      ...args,
      accounts: args.accounts ?? {
        guardian,
        account: args.account,
        config,
        valor,
        guardianTracks,
        recipientStats,
        tokenOwner,
        tokenValor,
        systemProgram: SystemProgram.programId,
      },
    });
  };

  const creditActivity = async (args: CreditActivityArgs) => {
    const authority = walletKeyOrThrow(publicKey);
    const [config] = clients.valocracy.configPda();
    const [creditAuthority] = clients.valocracy.creditAuthPda(authority);
    const [creditWindow] = clients.valocracy.creditWindowPda(args.account);
    const [userStats] = clients.valocracy.userStatsPda(args.account);

    return sendMethod(clients.valocracy.creditActivity(args.account, args.trackId, args.amount), {
      ...args,
      accounts: args.accounts ?? {
        authority,
        config,
        creditAuthority,
        creditWindow,
        userStats,
        systemProgram: SystemProgram.programId,
      },
    });
  };

  return {
    stats,
    mana,
    loading,
    error,
    refresh,
    register,
    mint,
    mintCommunity,
    guardianMint,
    creditActivity,
    revoke: (tokenId: bigint, options?: SendMethodOptions) =>
      sendMethod(clients.valocracy.revoke(tokenId), options),
    setVerified: (member: PublicKey, verified: boolean, options?: SendMethodOptions) =>
      sendMethod(clients.valocracy.setVerified(member, verified), options),
    pauseCredit: (options?: SendMethodOptions) =>
      sendMethod(clients.valocracy.pauseCredit(), options),
    resumeCredit: (options?: SendMethodOptions) =>
      sendMethod(clients.valocracy.resumeCredit(), options),
    getVotesAt: (account: PublicKey, timestamp: bigint) => clients.valocracy.getVotesAt(account, timestamp),
    getValor: (valorId: bigint | number) => clients.valocracy.getValor(valorId),
  };
}
