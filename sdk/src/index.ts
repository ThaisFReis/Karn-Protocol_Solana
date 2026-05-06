/**
 * @karn_lat/protocol-sdk-solana — v0.1.0-alpha.1
 *
 * Thin TypeScript clients for the Karn Protocol Solana programs:
 *   ValocracyClient, GovernorClient, TreasuryClient
 *
 * Also exports:
 *   - calculateMana / calculateManaFromStats — client-side Mana formula
 *   - buildSelfRegisterPayload / buildEd25519PreInstruction / buildSelfRegisterAccounts
 *   - buildExecuteRemainingAccounts
 *   - PDA derivation helpers (seeds.ts)
 *   - All IDL-derived types
 *   - Constants (MEMBER_FLOOR, VACANCY_PERIOD, ACTIVITY_PERIOD, program IDs)
 */

// ── Clients ───────────────────────────────────────────────────────────────────
export { ValocracyClient } from "./clients/valocracy";
export { GovernorClient }  from "./clients/governor";
export { TreasuryClient }  from "./clients/treasury";

// ── Core logic ────────────────────────────────────────────────────────────────
export { calculateMana, calculateManaFromStats } from "./mana";
export type { ManaInput } from "./mana";

// ── Helpers ───────────────────────────────────────────────────────────────────
export {
  buildSelfRegisterPayload,
  buildEd25519PreInstruction,
  buildSelfRegisterAccounts,
} from "./helpers/self-register";
export type { SelfRegisterParams } from "./helpers/self-register";

export { buildExecuteRemainingAccounts } from "./helpers/execute";

// ── PDA seeds ─────────────────────────────────────────────────────────────────
export * from "./seeds";

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  ValocracyConfig,
  UserStats,
  Valor,
  TokenOwner,
  CreditAuthority,
  CreditWindow,
  GovernorConfigPda,
  GovernanceConfig,
  Proposal,
  Vote,
  ProposalAction,
  TreasuryState,
  UserShares,
  Lab,
  Claimable,
} from "./types";
export { ProposalState } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────
export {
  MEMBER_FLOOR,
  VACANCY_PERIOD,
  ACTIVITY_PERIOD,
  ACTIVITY_CREDIT_CAP,
  VALOCRACY_PROGRAM_ID,
  GOVERNOR_PROGRAM_ID,
  TREASURY_PROGRAM_ID,
} from "./constants";
