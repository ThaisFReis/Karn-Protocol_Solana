/**
 * GovernorClient — thin wrapper around the Governor Anchor program.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, AccountMeta } from "@solana/web3.js";

import type { Proposal, GovernanceConfig, GovernorConfigPda, ProposalAction, ProposalState } from "../types";
import { govConfigPda, govParamsPda, proposalPda, votePda } from "../seeds";
import { buildExecuteRemainingAccounts } from "../helpers/execute";

// Proposal state enum values mirror the on-chain variant names.
const STATE_NAMES: Record<number, string> = {
  0: "Pending",
  1: "Active",
  2: "Succeeded",
  3: "Defeated",
  4: "Executed",
};

export class GovernorClient {
  readonly program: Program<any>;
  readonly programId: PublicKey;

  constructor(program: Program<any>) {
    this.program = program;
    this.programId = program.programId;
  }

  // ── PDAs ────────────────────────────────────────────────────────────────────

  configPda()                                   { return govConfigPda(this.programId); }
  paramsPda()                                   { return govParamsPda(this.programId); }
  proposalPda(proposalId: bigint | number)      { return proposalPda(proposalId, this.programId); }
  votePda(proposalId: bigint | number, voter: PublicKey) {
    return votePda(proposalId, voter, this.programId);
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async getConfig(): Promise<GovernorConfigPda> {
    const [pda] = this.configPda();
    return (this.program.account as any).governorConfigPda.fetch(pda);
  }

  async getParams(): Promise<GovernanceConfig> {
    const [pda] = this.paramsPda();
    return (this.program.account as any).governanceConfig.fetch(pda);
  }

  async getProposal(proposalId: bigint | number): Promise<Proposal | null> {
    const [pda] = this.proposalPda(proposalId);
    try { return await (this.program.account as any).proposal.fetch(pda); }
    catch { return null; }
  }

  /**
   * Compute the current state of a proposal client-side.
   * Mirrors `programs/governor/src/state.rs::proposal_state`.
   */
  computeProposalState(proposal: Proposal, now: bigint): string {
    const toBig = (v: any): bigint => BigInt(v.toString ? v.toString() : v);
    const nowN  = BigInt(now);
    const start = toBig(proposal.startTime);
    const end   = toBig(proposal.endTime);

    if (proposal.executed) return "Executed";
    if (nowN < start) return "Pending";
    if (nowN <= end)  return "Active";

    const forV     = toBig(proposal.forVotes);
    const againstV = toBig(proposal.againstVotes);
    const total    = forV + againstV;
    if (total === 0n) return "Defeated";

    const totalMana = toBig(proposal.totalManaAtCreation);
    if (totalMana > 0n) {
      const participation = (total * 100n) / totalMana;
      if (participation < 4n) return "Defeated";
    }

    const forPct = (forV * 100n) / total;
    return forPct >= 51n ? "Succeeded" : "Defeated";
  }

  // ── Instruction builders ─────────────────────────────────────────────────────

  propose(description: string, action: ProposalAction) {
    return this.program.methods.propose(description, action as any);
  }

  castVote(proposalId: bigint | number, support: boolean) {
    return this.program.methods.castVote(
      new anchor.BN(BigInt(proposalId).toString()),
      support,
    );
  }

  /**
   * Build the `execute` call with pre-resolved remaining_accounts.
   *
   * @param proposalId - The proposal to execute.
   * @param action     - The action fetched from the Proposal account.
   * @param extraAccounts - See `buildExecuteRemainingAccounts` for required fields per variant.
   */
  execute(
    proposalId: bigint | number,
    action: ProposalAction,
    extraAccounts?: { receiverAta?: PublicKey; vaultAta?: PublicKey },
  ) {
    const remaining = buildExecuteRemainingAccounts(action, extraAccounts);
    return this.program.methods
      .execute(new anchor.BN(BigInt(proposalId).toString()))
      .remainingAccounts(remaining);
  }
}
