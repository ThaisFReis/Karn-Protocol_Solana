/**
 * ValocracyClient — thin wrapper around the Valocracy Anchor program.
 *
 * Responsibilities:
 *   - Typed account reads (getUserStats, getVotes, getConfig, getValor)
 *   - Instruction builders returning Anchor MethodsBuilders
 *   - PDA derivation hidden from the caller
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import type { UserStats, Valor, ValocracyConfig } from "../types";
import { calculateMana } from "../mana";
import {
  configPda,
  valorPda,
  userStatsPda,
  tokenOwnerPda,
  tokenValorPda,
  guardianPda,
  creditAuthPda,
  creditWindowPda,
} from "../seeds";

export class ValocracyClient {
  readonly program: Program<any>;
  readonly programId: PublicKey;

  constructor(program: Program<any>) {
    this.program = program;
    this.programId = program.programId;
  }

  // ── PDAs ────────────────────────────────────────────────────────────────────

  configPda()                                     { return configPda(this.programId); }
  valorPda(valorId: bigint | number)              { return valorPda(valorId, this.programId); }
  userStatsPda(wallet: PublicKey)                 { return userStatsPda(wallet, this.programId); }
  tokenOwnerPda(tokenId: bigint | number)         { return tokenOwnerPda(tokenId, this.programId); }
  tokenValorPda(tokenId: bigint | number)         { return tokenValorPda(tokenId, this.programId); }
  guardianPda(guardian: PublicKey)                { return guardianPda(guardian, this.programId); }
  creditAuthPda(authority: PublicKey)             { return creditAuthPda(authority, this.programId); }
  creditWindowPda(account: PublicKey)             { return creditWindowPda(account, this.programId); }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async getConfig(): Promise<ValocracyConfig> {
    const [pda] = this.configPda();
    return (this.program.account as any).config.fetch(pda);
  }

  async getValor(valorId: bigint | number): Promise<Valor | null> {
    const [pda] = this.valorPda(valorId);
    try { return await (this.program.account as any).valor.fetch(pda); }
    catch { return null; }
  }

  async getUserStats(wallet: PublicKey): Promise<UserStats | null> {
    const [pda] = this.userStatsPda(wallet);
    try { return await (this.program.account as any).userStats.fetch(pda); }
    catch { return null; }
  }

  /** Current Mana — returns 0n for unregistered accounts. */
  async getVotes(account: PublicKey): Promise<bigint> {
    const stats = await this.getUserStats(account);
    if (!stats) return 0n;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const toBig = (v: any): bigint => BigInt(v.toString ? v.toString() : v);
    return calculateMana({
      credentialLevel:  toBig(stats.credentialLevel),
      permanentLevel:   toBig(stats.permanentLevel),
      credentialExpiry: toBig(stats.credentialExpiry),
      activityLevel:    toBig(stats.activityLevel),
      activityExpiry:   toBig(stats.activityExpiry),
      currentTime:      now,
    });
  }

  /** Historical Mana at a given Unix timestamp. */
  async getVotesAt(account: PublicKey, timestamp: bigint): Promise<bigint> {
    const stats = await this.getUserStats(account);
    if (!stats) return 0n;
    const toBig = (v: any): bigint => BigInt(v.toString ? v.toString() : v);
    return calculateMana({
      credentialLevel:  toBig(stats.credentialLevel),
      permanentLevel:   toBig(stats.permanentLevel),
      credentialExpiry: toBig(stats.credentialExpiry),
      activityLevel:    toBig(stats.activityLevel),
      activityExpiry:   toBig(stats.activityExpiry),
      currentTime:     timestamp,
    });
  }

  // ── Instruction builders ─────────────────────────────────────────────────────

  /**
   * Build a `selfRegister` MethodsBuilder.
   * Caller must prepend the Ed25519SigVerify pre-instruction via `.preInstructions([sigIx])`.
   * Use `buildEd25519PreInstruction` + `buildSelfRegisterAccounts` from sdk/helpers/self-register.
   */
  selfRegister(
    trackId: bigint,
    nonce: bigint,
    expiry: bigint,
    tokenId: bigint,
  ) {
    return this.program.methods.selfRegister(
      new anchor.BN(trackId.toString()),
      new anchor.BN(nonce.toString()),
      new anchor.BN(expiry.toString()),
      new anchor.BN(tokenId.toString()),
    );
  }

  /** `guardian_mint` — requires guardian AND account as signers (KRN-05). */
  guardianMint(valorId: bigint, tokenId: bigint) {
    return this.program.methods.guardianMint(
      new anchor.BN(valorId.toString()),
      new anchor.BN(tokenId.toString()),
    );
  }

  /** `mint` — Leadership/Track/Governance badges, Governor-only. */
  mint(valorId: bigint, tokenId: bigint) {
    return this.program.methods.mint(
      new anchor.BN(valorId.toString()),
      new anchor.BN(tokenId.toString()),
    );
  }

  /** `mint_community` — Community badges, member-authorized. */
  mintCommunity(valorId: bigint, tokenId: bigint) {
    return this.program.methods.mintCommunity(
      new anchor.BN(valorId.toString()),
      new anchor.BN(tokenId.toString()),
    );
  }

  /** `creditActivity` — CreditAuthority-only. */
  creditActivity(account: PublicKey, trackId: bigint, amount: bigint) {
    return this.program.methods.creditActivity(
      account,
      new anchor.BN(trackId.toString()),
      new anchor.BN(amount.toString()),
    );
  }

  /** `revoke` — Governor-only. */
  revoke(tokenId: bigint) {
    return this.program.methods.revoke(new anchor.BN(tokenId.toString()));
  }

  /** `setVerified` — Governor-only. */
  setVerified(member: PublicKey, verified: boolean) {
    return this.program.methods.setVerified(member, verified);
  }

  /** `pauseCredit` — Governor-only circuit breaker. */
  pauseCredit() {
    return this.program.methods.pauseCredit();
  }

  /** `resumeCredit` — Governor-only circuit breaker. */
  resumeCredit() {
    return this.program.methods.resumeCredit();
  }
}
