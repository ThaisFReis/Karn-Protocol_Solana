/**
 * calculateMana — TypeScript mirror of karn-shared/src/mana.rs.
 *
 * Formula (DT-10 D2):
 *   Mana = MEMBER_FLOOR
 *        + credential_bonus
 *        + activity_bonus
 *
 * Where:
 *   credential_bonus =
 *     if now < credential_expiry:
 *       (credential_level − MEMBER_FLOOR) × (expiry − now) / VACANCY_PERIOD
 *     else if permanent_level > 0:
 *       permanent_level   (Stellar fallback; always 0 in v2-Solana)
 *     else: 0
 *
 *   activity_bonus =
 *     if activity_level > 0 && now < activity_expiry:
 *       activity_level × (expiry − now) / ACTIVITY_PERIOD
 *     else: 0
 *
 * All arithmetic uses BigInt to mirror the u128 intermediates (KRN-04).
 * Saturating semantics: result is clamped to [0, 2^64-1] to match u64 on-chain.
 */

import { MEMBER_FLOOR, VACANCY_PERIOD, ACTIVITY_PERIOD } from "./constants";

const U64_MAX = (1n << 64n) - 1n;

function saturatingAdd(a: bigint, b: bigint): bigint {
  const r = a + b;
  return r > U64_MAX ? U64_MAX : r;
}

export interface ManaInput {
  credentialLevel: bigint;
  permanentLevel: bigint;
  credentialExpiry: bigint;
  activityLevel: bigint;
  activityExpiry: bigint;
  currentTime: bigint;
}

/**
 * Compute Mana for an account at a given instant.
 *
 * Mirrors `karn_shared::mana::calculate_mana` exactly — same formula, same
 * truncation behavior on integer division, same cross-fixtures as the Rust tests.
 *
 * Returns `MEMBER_FLOOR` (5n) when all bonuses are zero.
 * Callers that need the "not registered → 0" semantic must check account existence
 * before calling (same contract as the Rust version).
 */
export function calculateMana(input: ManaInput): bigint {
  const {
    credentialLevel,
    permanentLevel,
    credentialExpiry,
    activityLevel,
    activityExpiry,
    currentTime,
  } = input;

  let credentialBonus: bigint;
  if (currentTime < credentialExpiry) {
    const extra = credentialLevel > MEMBER_FLOOR ? credentialLevel - MEMBER_FLOOR : 0n;
    const timeRemaining = credentialExpiry - currentTime;
    credentialBonus = (extra * timeRemaining) / VACANCY_PERIOD;
  } else if (permanentLevel > 0n) {
    credentialBonus = permanentLevel;
  } else {
    credentialBonus = 0n;
  }

  let activityBonus: bigint;
  if (activityLevel > 0n && currentTime < activityExpiry) {
    const timeRemaining = activityExpiry - currentTime;
    activityBonus = (activityLevel * timeRemaining) / ACTIVITY_PERIOD;
  } else {
    activityBonus = 0n;
  }

  return saturatingAdd(saturatingAdd(MEMBER_FLOOR, credentialBonus), activityBonus);
}

/**
 * Convenience overload accepting a `UserStats`-shaped object (from anchor fetch)
 * plus an explicit `currentTime` in seconds.
 */
export function calculateManaFromStats(
  stats: {
    credentialLevel: bigint | number;
    permanentLevel: bigint | number;
    credentialExpiry: bigint | number;
    activityLevel: bigint | number;
    activityExpiry: bigint | number;
  },
  currentTime: bigint | number,
): bigint {
  return calculateMana({
    credentialLevel: BigInt(stats.credentialLevel),
    permanentLevel: BigInt(stats.permanentLevel),
    credentialExpiry: BigInt(stats.credentialExpiry),
    activityLevel: BigInt(stats.activityLevel),
    activityExpiry: BigInt(stats.activityExpiry),
    currentTime: BigInt(currentTime),
  });
}
