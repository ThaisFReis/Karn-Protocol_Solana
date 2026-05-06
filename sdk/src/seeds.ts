/**
 * PDA seed constants and derivation helpers.
 * Mirrors crates/karn-shared/src/seeds.rs — keep in sync.
 */

import { PublicKey } from "@solana/web3.js";

// ── Seed buffers ──────────────────────────────────────────────────────────────

export const SEED_CONFIG           = Buffer.from("config");
export const SEED_VALOR            = Buffer.from("valor");
export const SEED_USER_STATS       = Buffer.from("user_stats");
export const SEED_TOKEN_OWNER      = Buffer.from("token_owner");
export const SEED_TOKEN_VALOR      = Buffer.from("token_valor");
export const SEED_GUARDIAN         = Buffer.from("guardian");
export const SEED_CREDIT_AUTH      = Buffer.from("credit_auth");
export const SEED_CREDIT_WINDOW    = Buffer.from("credit_window");
export const SEED_USED_NONCE       = Buffer.from("nonce");
export const SEED_GOV_CONFIG       = Buffer.from("gov_config");
export const SEED_GOV_PARAMS       = Buffer.from("gov_params");
export const SEED_PROPOSAL         = Buffer.from("proposal");
export const SEED_VOTE             = Buffer.from("vote");
export const SEED_TREASURY         = Buffer.from("treasury");
export const SEED_SHARES           = Buffer.from("shares");
export const SEED_LAB              = Buffer.from("lab");
export const SEED_CLAIMABLE        = Buffer.from("claimable");

// ── Helper ────────────────────────────────────────────────────────────────────

function leUint64(n: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

function leUint32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

// ── Valocracy ─────────────────────────────────────────────────────────────────

export function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_CONFIG], programId);
}

export function valorPda(valorId: bigint | number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_VALOR, leUint64(valorId)], programId);
}

export function userStatsPda(wallet: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_USER_STATS, wallet.toBuffer()], programId);
}

export function tokenOwnerPda(tokenId: bigint | number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_TOKEN_OWNER, leUint64(tokenId)], programId);
}

export function tokenValorPda(tokenId: bigint | number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_TOKEN_VALOR, leUint64(tokenId)], programId);
}

export function guardianPda(guardian: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_GUARDIAN, guardian.toBuffer()], programId);
}

export function creditAuthPda(authority: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_CREDIT_AUTH, authority.toBuffer()], programId);
}

export function creditWindowPda(account: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_CREDIT_WINDOW, account.toBuffer()], programId);
}

export function usedNoncePda(
  caller: PublicKey,
  nonce: bigint | number,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_USED_NONCE, caller.toBuffer(), leUint64(nonce)],
    programId,
  );
}

// ── Governor ──────────────────────────────────────────────────────────────────

export function govConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_GOV_CONFIG], programId);
}

export function govParamsPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_GOV_PARAMS], programId);
}

export function proposalPda(proposalId: bigint | number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_PROPOSAL, leUint64(proposalId)], programId);
}

export function votePda(
  proposalId: bigint | number,
  voter: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VOTE, leUint64(proposalId), voter.toBuffer()],
    programId,
  );
}

// ── Treasury ──────────────────────────────────────────────────────────────────

export function treasuryStatePda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_TREASURY], programId);
}

export function sharesPda(owner: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_SHARES, owner.toBuffer()], programId);
}

export function labPda(labId: number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_LAB, leUint32(labId)], programId);
}

export function claimablePda(member: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_CLAIMABLE, member.toBuffer()], programId);
}
