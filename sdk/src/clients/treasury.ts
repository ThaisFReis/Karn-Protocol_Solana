/**
 * TreasuryClient — thin wrapper around the Treasury Anchor program.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import type { TreasuryState, UserShares, Lab, Claimable } from "../types";
import { treasuryStatePda, sharesPda, labPda, claimablePda } from "../seeds";

export class TreasuryClient {
  readonly program: Program<any>;
  readonly programId: PublicKey;

  constructor(program: Program<any>) {
    this.program = program;
    this.programId = program.programId;
  }

  // ── PDAs ────────────────────────────────────────────────────────────────────

  statePda()                              { return treasuryStatePda(this.programId); }
  sharesPda(owner: PublicKey)             { return sharesPda(owner, this.programId); }
  labPda(labId: number)                   { return labPda(labId, this.programId); }
  claimablePda(member: PublicKey)         { return claimablePda(member, this.programId); }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async getState(): Promise<TreasuryState> {
    const [pda] = this.statePda();
    return (this.program.account as any).treasuryState.fetch(pda);
  }

  async getShares(owner: PublicKey): Promise<UserShares | null> {
    const [pda] = this.sharesPda(owner);
    try { return await (this.program.account as any).userShares.fetch(pda); }
    catch { return null; }
  }

  async getLab(labId: number): Promise<Lab | null> {
    const [pda] = this.labPda(labId);
    try { return await (this.program.account as any).lab.fetch(pda); }
    catch { return null; }
  }

  async getClaimable(member: PublicKey): Promise<Claimable | null> {
    const [pda] = this.claimablePda(member);
    try { return await (this.program.account as any).claimable.fetch(pda); }
    catch { return null; }
  }

  /**
   * Total spendable assets in the vault (excluding restricted scholarship reserves).
   * Mirrors `total_assets()` on-chain: vault_balance − restricted_reserves.
   *
   * Requires the vault ATA balance fetched separately via `connection.getTokenAccountBalance`.
   */
  totalAssets(vaultBalance: bigint, restrictedReserves: bigint): bigint {
    return vaultBalance > restrictedReserves ? vaultBalance - restrictedReserves : 0n;
  }

  // ── Instruction builders ─────────────────────────────────────────────────────

  fundLab(totalAmount: bigint, scholarshipPerMember: bigint) {
    return this.program.methods.fundLab(
      new anchor.BN(totalAmount.toString()),
      new anchor.BN(scholarshipPerMember.toString()),
    );
  }

  withdrawScholarship(amount: bigint) {
    return this.program.methods.withdrawScholarship(
      new anchor.BN(amount.toString()),
    );
  }
}
