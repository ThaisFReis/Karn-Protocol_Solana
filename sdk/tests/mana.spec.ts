/**
 * calculateMana — TypeScript fixtures cross-validated against the Rust tests
 * in crates/karn-shared/src/mana.rs.
 *
 * Every fixture here has a 1:1 counterpart in the Rust test suite.
 * If a fixture diverges, either the Rust formula or this implementation is wrong.
 *
 * Constants (mirrors karn-shared/src/constants.rs):
 *   MEMBER_FLOOR    = 5n
 *   VACANCY_PERIOD  = 15_552_000n  (180 days)
 *   ACTIVITY_PERIOD =  7_776_000n  ( 90 days)
 */

import { expect } from "chai";
import { calculateMana, calculateManaFromStats } from "../src/mana";
import { MEMBER_FLOOR, VACANCY_PERIOD, ACTIVITY_PERIOD } from "../src/constants";

const NOW = 1_000_000n;

// ── Fixture helper ─────────────────────────────────────────────────────────────

function mana(opts: {
  credentialLevel?: bigint;
  permanentLevel?: bigint;
  credentialExpiry?: bigint;
  activityLevel?: bigint;
  activityExpiry?: bigint;
  currentTime?: bigint;
}): bigint {
  return calculateMana({
    credentialLevel:  opts.credentialLevel  ?? 0n,
    permanentLevel:   opts.permanentLevel   ?? 0n,
    credentialExpiry: opts.credentialExpiry ?? NOW - 1n,  // expired by default
    activityLevel:    opts.activityLevel    ?? 0n,
    activityExpiry:   opts.activityExpiry   ?? NOW - 1n,  // expired by default
    currentTime:      opts.currentTime      ?? NOW,
  });
}

// ── Credential component ───────────────────────────────────────────────────────

describe("calculateMana — credential component", () => {
  it("full credential at mint time — Mana == credential_level", () => {
    // Rust: full_credential_at_mint_time
    // credential_bonus = (50 - 5) * VACANCY_PERIOD / VACANCY_PERIOD = 45
    // Mana = 5 + 45 = 50
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      currentTime:      NOW,
    });
    expect(result).to.equal(50n);
  });

  it("credential halfway decayed — bonus = (level - floor) / 2 (truncated)", () => {
    // Rust: credential_halfway_decayed
    // extra=45, time_remaining = VACANCY_PERIOD/2 → bonus = 45*VACANCY_PERIOD/2 / VACANCY_PERIOD = 22
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      currentTime:      NOW + VACANCY_PERIOD / 2n,
    });
    expect(result).to.equal(MEMBER_FLOOR + 22n);
  });

  it("credential expired, no permanent level → floor only", () => {
    // Rust: floor_only_when_credential_expired
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW - 1n,
      currentTime:      NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR);
  });

  it("credential expired but permanent_level > 0 → Stellar fallback path", () => {
    // Rust: permanent_level_fallback_when_credential_expired
    const result = mana({
      credentialLevel:  10n,
      permanentLevel:   8n,
      credentialExpiry: NOW - 1n,
      currentTime:      NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR + 8n);
  });

  it("member floor: credential_level at floor, full window → bonus = 0", () => {
    // extra = MEMBER_FLOOR - MEMBER_FLOOR = 0 → no credential bonus
    const result = mana({
      credentialLevel:  MEMBER_FLOOR,
      credentialExpiry: NOW + VACANCY_PERIOD,
      currentTime:      NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR);
  });

  it("credential_level below floor saturates to 0 extra → floor only", () => {
    // If level < floor, saturating_sub returns 0
    const result = mana({
      credentialLevel:  3n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      currentTime:      NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR);
  });

  it("expiry exactly at now: expired, no bonus", () => {
    // current_time < expiry is false when equal → treated as expired
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW,
      currentTime:      NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR);
  });
});

// ── Activity component ────────────────────────────────────────────────────────

describe("calculateMana — activity component", () => {
  it("full activity at credit time — activity_bonus == activity_level", () => {
    // Rust: full_activity_at_credit_time
    // time_remaining = ACTIVITY_PERIOD → bonus = 100 * ACTIVITY_PERIOD / ACTIVITY_PERIOD = 100
    const result = mana({
      activityLevel:  100n,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime:    NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR + 100n);
  });

  it("activity halfway decayed — bonus = level / 2 (truncated)", () => {
    // Rust: activity_halfway_decayed
    // time_remaining = ACTIVITY_PERIOD / 2 → bonus = 100 / 2 = 50
    const result = mana({
      activityLevel:  100n,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime:    NOW + ACTIVITY_PERIOD / 2n,
    });
    expect(result).to.equal(MEMBER_FLOOR + 50n);
  });

  it("activity expired → no activity bonus", () => {
    // Rust: no_activity_bonus_when_expired
    const result = mana({
      activityLevel:  100n,
      activityExpiry: NOW - 1n,
      currentTime:    NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR);
  });

  it("activity_level == 0 → no activity bonus even with valid expiry", () => {
    const result = mana({
      activityLevel:  0n,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime:    NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR);
  });
});

// ── Combined components ───────────────────────────────────────────────────────

describe("calculateMana — combined credential + activity", () => {
  it("both components contribute additively", () => {
    // credential: level=50 full window → bonus=45
    // activity: level=100 full window → bonus=100
    // Mana = 5 + 45 + 100 = 150
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel:    100n,
      activityExpiry:   NOW + ACTIVITY_PERIOD,
      currentTime:      NOW,
    });
    expect(result).to.equal(150n);
  });

  it("credential expired, activity still active", () => {
    // credential expired, no permanent → 0
    // activity full → 100
    // Mana = 5 + 0 + 100 = 105
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW - 1n,
      activityLevel:    100n,
      activityExpiry:   NOW + ACTIVITY_PERIOD,
      currentTime:      NOW,
    });
    expect(result).to.equal(MEMBER_FLOOR + 100n);
  });

  it("credential active, activity expired", () => {
    // credential bonus = 45
    // activity expired → 0
    // Mana = 5 + 45 + 0 = 50
    const result = mana({
      credentialLevel:  50n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel:    100n,
      activityExpiry:   NOW - 1n,
      currentTime:      NOW,
    });
    expect(result).to.equal(50n);
  });
});

// ── Overflow protection (KRN-04) ─────────────────────────────────────────────

describe("calculateMana — KRN-04 overflow protection", () => {
  it("extreme credential_level = u64::MAX with full window does not overflow", () => {
    // Rust: overflow_protection_extreme_credential
    // bonus = (u64::MAX - 5) * VACANCY_PERIOD / VACANCY_PERIOD = u64::MAX - 5
    // Mana saturates to u64::MAX
    const U64_MAX = (1n << 64n) - 1n;
    const result = mana({
      credentialLevel:  U64_MAX,
      credentialExpiry: NOW + VACANCY_PERIOD,
      currentTime:      NOW,
    });
    expect(result).to.equal(U64_MAX);
  });

  it("extreme activity_level near u64::MAX with full window does not overflow", () => {
    const U64_MAX = (1n << 64n) - 1n;
    const result = mana({
      activityLevel:  U64_MAX,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime:    NOW,
    });
    expect(result).to.equal(U64_MAX);
  });
});

// ── calculateManaFromStats convenience wrapper ────────────────────────────────

describe("calculateManaFromStats", () => {
  it("accepts number inputs and matches calculateMana with BigInt inputs", () => {
    const stats = {
      credentialLevel:  50,
      permanentLevel:   0,
      credentialExpiry: Number(NOW + VACANCY_PERIOD),
      activityLevel:    0,
      activityExpiry:   0,
    };
    const fromStats  = calculateManaFromStats(stats, NOW);
    const fromBigInt = calculateMana({
      credentialLevel:  50n,
      permanentLevel:   0n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel:    0n,
      activityExpiry:   0n,
      currentTime:      NOW,
    });
    expect(fromStats).to.equal(fromBigInt);
  });
});
