import type { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import type { Claimable, Lab, TreasuryState, UserShares } from "../types";
import { useKarnSolana } from "./provider";
import { sendMethod, walletKeyOrThrow, toBigIntLike } from "./utils";
import type { SendMethodOptions } from "./types";

export interface FundLabArgs extends SendMethodOptions {
  totalAmount: bigint;
  scholarshipPerMember: bigint;
}

export interface WithdrawScholarshipArgs extends SendMethodOptions {
  amount: bigint;
}

export function useTreasury(targetWallet?: PublicKey | null) {
  const { clients, publicKey } = useKarnSolana();
  const [state, setState] = useState<TreasuryState | null>(null);
  const [shares, setShares] = useState<UserShares | null>(null);
  const [claimable, setClaimable] = useState<Claimable | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const wallet = targetWallet ?? publicKey ?? null;

  const refresh = async (nextWallet?: PublicKey | null) => {
    const member = nextWallet ?? wallet;
    setLoading(true);
    setError(null);
    try {
      const nextState = await clients.treasury.getState();
      const [nextShares, nextClaimable] = member
        ? await Promise.all([
            clients.treasury.getShares(member),
            clients.treasury.getClaimable(member),
          ])
        : [null, null];

      setState(nextState);
      setShares(nextShares);
      setClaimable(nextClaimable);
      return { state: nextState, shares: nextShares, claimable: nextClaimable };
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

  const fundLab = async (args: FundLabArgs) => {
    const nextState = state ?? await clients.treasury.getState();
    const labId = Number(toBigIntLike(nextState.labCounter));
    const [statePda] = clients.treasury.statePda();
    const [lab] = clients.treasury.labPda(labId);

    return sendMethod(clients.treasury.fundLab(args.totalAmount, args.scholarshipPerMember), {
      ...args,
      accounts: args.accounts ?? {
        funder: walletKeyOrThrow(publicKey),
        state: statePda,
        lab,
      },
    });
  };

  const withdrawScholarship = async (args: WithdrawScholarshipArgs) => {
    const member = walletKeyOrThrow(publicKey);
    const [statePda] = clients.treasury.statePda();
    const [claimablePda] = clients.treasury.claimablePda(member);

    return sendMethod(clients.treasury.withdrawScholarship(args.amount), {
      ...args,
      accounts: args.accounts ?? {
        member,
        state: statePda,
        claimable: claimablePda,
      },
    });
  };

  return {
    state,
    shares,
    claimable,
    loading,
    error,
    refresh,
    totalAssets: (vaultBalance: bigint, restrictedReserves?: bigint) =>
      clients.treasury.totalAssets(vaultBalance, restrictedReserves ?? toBigIntLike(state?.restrictedReserves ?? 0)),
    getLab: (labId: number): Promise<Lab | null> => clients.treasury.getLab(labId),
    fundLab,
    withdrawScholarship,
  };
}
