import { SystemProgram, type PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import type { GovernanceConfig, GovernorConfigPda, Proposal, ProposalAction } from "../types";
import { useKarnSolana } from "./provider";
import { sendMethod, walletKeyOrThrow, toBigIntLike } from "./utils";
import type { SendMethodOptions } from "./types";

export interface ProposeArgs extends SendMethodOptions {
  description: string;
  action: ProposalAction;
  proposalId?: bigint | number;
}

export interface VoteArgs extends SendMethodOptions {
  proposalId: bigint | number;
  support: boolean;
}

export interface ExecuteArgs extends SendMethodOptions {
  proposalId: bigint | number;
  action: ProposalAction;
  extraAccounts?: { receiverAta?: PublicKey; vaultAta?: PublicKey };
}

export function useGovernor() {
  const { clients, publicKey } = useKarnSolana();
  const [config, setConfig] = useState<GovernorConfigPda | null>(null);
  const [params, setParams] = useState<GovernanceConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConfig, nextParams] = await Promise.all([
        clients.governor.getConfig(),
        clients.governor.getParams(),
      ]);
      setConfig(nextConfig);
      setParams(nextParams);
      return { config: nextConfig, params: nextParams };
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const propose = async (args: ProposeArgs) => {
    const proposer = walletKeyOrThrow(publicKey);
    const nextConfig = config ?? await clients.governor.getConfig();
    const proposalId = args.proposalId ?? toBigIntLike(nextConfig.proposalCount);

    const [govConfig] = clients.governor.configPda();
    const [govParams] = clients.governor.paramsPda();
    const [proposal] = clients.governor.proposalPda(proposalId);
    const [proposerStats] = clients.valocracy.userStatsPda(proposer);
    const [valocracyConfig] = clients.valocracy.configPda();

    return sendMethod(clients.governor.propose(args.description, args.action), {
      ...args,
      accounts: args.accounts ?? {
        proposer,
        config: govConfig,
        params: govParams,
        proposerStats,
        valocracyConfig,
        proposal,
        systemProgram: SystemProgram.programId,
      },
    });
  };

  const vote = async (args: VoteArgs) => {
    const voter = walletKeyOrThrow(publicKey);
    const [govConfig] = clients.governor.configPda();
    const [proposal] = clients.governor.proposalPda(args.proposalId);
    const [votePda] = clients.governor.votePda(args.proposalId, voter);
    const [voterStats] = clients.valocracy.userStatsPda(voter);

    return sendMethod(clients.governor.castVote(args.proposalId, args.support), {
      ...args,
      accounts: args.accounts ?? {
        voter,
        config: govConfig,
        proposal,
        vote: votePda,
        voterStats,
        systemProgram: SystemProgram.programId,
      },
    });
  };

  const execute = async (args: ExecuteArgs) => {
    const [govConfig] = clients.governor.configPda();
    const [proposal] = clients.governor.proposalPda(args.proposalId);

    return sendMethod(
      clients.governor.execute(args.proposalId, args.action, args.extraAccounts),
      {
        ...args,
        accounts: args.accounts ?? {
          config: govConfig,
          proposal,
        },
      },
    );
  };

  return {
    config,
    params,
    loading,
    error,
    refresh,
    getProposal: (proposalId: bigint | number): Promise<Proposal | null> =>
      clients.governor.getProposal(proposalId),
    computeProposalState: (proposal: Proposal, now = BigInt(Math.floor(Date.now() / 1000))) =>
      clients.governor.computeProposalState(proposal, now),
    propose,
    vote,
    execute,
  };
}
