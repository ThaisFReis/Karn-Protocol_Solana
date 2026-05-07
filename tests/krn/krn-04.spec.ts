// KRN-04 — Overflow protection in Mana calculation.
//
// The Mana formula multiplies `extra × time_remaining` before dividing by
// VACANCY_PERIOD (15_552_000). With u64-range inputs:
//   max(extra) = u64::MAX - MEMBER_FLOOR ≈ 1.84 × 10^19
//   max(time_remaining) = VACANCY_PERIOD = 15_552_000
//   product ≈ 2.87 × 10^26 — overflows u64 (max ≈ 1.84 × 10^19)
//
// Without a u128 intermediate the product wraps silently on-chain.
// KRN-04 mandates u128 intermediates in Rust (karn-shared/src/mana.rs) and
// BigInt arithmetic in the TypeScript SDK mirror (sdk/src/mana.ts).
//
// This suite tests the TypeScript `calculateMana` function (same cross-fixtures
// as the Rust #[test] block). It also validates that the SDK correctly mirrors
// the on-chain saturation semantics: result is clamped to [0, u64::MAX].

import { expect } from "chai";
import { calculateMana, calculateManaFromStats } from "../../sdk/src/mana";
import { MEMBER_FLOOR, VACANCY_PERIOD, ACTIVITY_PERIOD } from "../../sdk/src/constants";

const U64_MAX = (1n << 64n) - 1n;
const NOW = 1_000_000n;

describe("KRN-04 — Overflow protection in calculateMana (SDK mirror)", () => {
  // ── Baseline: mirror the Rust unit tests for cross-fixture parity ──────────

  it("full credential at mint time → mana equals credential_level", () => {
    const mana = calculateMana({
      credentialLevel: 50n,
      permanentLevel: 0n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel: 0n,
      activityExpiry: 0n,
      currentTime: NOW,
    });
    // extra=45, time=VACANCY_PERIOD, bonus = 45*VACANCY_PERIOD/VACANCY_PERIOD = 45
    expect(mana).to.equal(50n);
  });

  it("credential halfway decayed → mana equals floor + floor(extra/2)", () => {
    const mana = calculateMana({
      credentialLevel: 50n,
      permanentLevel: 0n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel: 0n,
      activityExpiry: 0n,
      currentTime: NOW + VACANCY_PERIOD / 2n,
    });
    // extra=45, time=VACANCY_PERIOD/2 → bonus = floor(45/2) = 22
    expect(mana).to.equal(MEMBER_FLOOR + 22n);
  });

  it("expired credential, no permanent_level → floor only", () => {
    const mana = calculateMana({
      credentialLevel: 50n,
      permanentLevel: 0n,
      credentialExpiry: NOW - 1n,
      activityLevel: 0n,
      activityExpiry: 0n,
      currentTime: NOW,
    });
    expect(mana).to.equal(MEMBER_FLOOR);
  });

  it("permanent_level fallback when credential expired → floor + permanent", () => {
    const mana = calculateMana({
      credentialLevel: 10n,
      permanentLevel: 8n,
      credentialExpiry: NOW - 1n,
      activityLevel: 0n,
      activityExpiry: 0n,
      currentTime: NOW,
    });
    expect(mana).to.equal(MEMBER_FLOOR + 8n);
  });

  it("full activity bonus → mana equals floor + activity_level", () => {
    const mana = calculateMana({
      credentialLevel: 0n,
      permanentLevel: 0n,
      credentialExpiry: NOW - 1n,
      activityLevel: 100n,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime: NOW,
    });
    expect(mana).to.equal(MEMBER_FLOOR + 100n);
  });

  it("expired activity → no activity bonus", () => {
    const mana = calculateMana({
      credentialLevel: 0n,
      permanentLevel: 0n,
      credentialExpiry: NOW - 1n,
      activityLevel: 100n,
      activityExpiry: NOW - 1n,
      currentTime: NOW,
    });
    expect(mana).to.equal(MEMBER_FLOOR);
  });

  // ── KRN-04 specific: overflow cases ──────────────────────────────────────────

  it("KRN-04: u64::MAX credential_level saturates to u64::MAX without wrapping", () => {
    // credential_bonus = (u64::MAX - 5) * VACANCY_PERIOD / VACANCY_PERIOD
    //                  = u64::MAX - 5
    // Mana = 5 + (u64::MAX - 5) = u64::MAX  (saturating_add)
    const mana = calculateMana({
      credentialLevel: U64_MAX,
      permanentLevel: 0n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel: 0n,
      activityExpiry: 0n,
      currentTime: NOW,
    });
    expect(mana).to.equal(U64_MAX, "KRN-04: extreme credential_level must saturate to u64::MAX");
    // Must never wrap to a small number
    expect(mana).to.be.greaterThan(1_000_000n, "KRN-04: result must not have wrapped to a small number");
  });

  it("KRN-04: u64::MAX activity_level saturates to u64::MAX without wrapping", () => {
    // activity_bonus = u64::MAX * ACTIVITY_PERIOD / ACTIVITY_PERIOD = u64::MAX
    // Mana = saturate(5 + u64::MAX) = u64::MAX
    const mana = calculateMana({
      credentialLevel: 0n,
      permanentLevel: 0n,
      credentialExpiry: NOW - 1n,
      activityLevel: U64_MAX,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime: NOW,
    });
    expect(mana).to.equal(U64_MAX, "KRN-04: extreme activity_level must saturate to u64::MAX");
  });

  it("KRN-04: both components extreme — double saturation is still u64::MAX", () => {
    // Both credential and activity at u64::MAX — each bonus saturates to U64_MAX,
    // saturating_add(U64_MAX, U64_MAX) = U64_MAX. No negative wrap.
    const mana = calculateMana({
      credentialLevel: U64_MAX,
      permanentLevel: 0n,
      credentialExpiry: NOW + VACANCY_PERIOD,
      activityLevel: U64_MAX,
      activityExpiry: NOW + ACTIVITY_PERIOD,
      currentTime: NOW,
    });
    expect(mana).to.equal(U64_MAX, "KRN-04: combined saturation must remain u64::MAX");
  });

  it("KRN-04: intermediate product (extra × time_remaining) does not overflow BigInt", () => {
    // At u64::MAX credential_level with full vacancy window:
    //   product = (u64::MAX - 5) * VACANCY_PERIOD ≈ 2.87 × 10^26
    //   A 64-bit integer would wrap; BigInt must hold it without distortion.
    //   Verify by checking the intermediate computation directly.
    const extra = U64_MAX - MEMBER_FLOOR;
    const product = extra * VACANCY_PERIOD; // BigInt — no overflow possible
    // product must be >> U64_MAX (proves a 64-bit int would have wrapped)
    expect(product).to.be.greaterThan(U64_MAX, "intermediate product must exceed u64::MAX — proves BigInt is required");
    // But the final bonus (after dividing by VACANCY_PERIOD) must fit in u64
    const bonus = product / VACANCY_PERIOD;
    expect(bonus).to.equal(extra, "bonus after dividing must equal extra (= u64::MAX - 5)");
  });

  it("KRN-04: minimum non-floor inputs compute correctly without precision loss", () => {
    // Tiny inputs: level=6, time_remaining=1 second
    // bonus = (6 - 5) * 1 / 15_552_000 = 0 (floor division)
    const mana = calculateMana({
      credentialLevel: 6n,
      permanentLevel: 0n,
      credentialExpiry: NOW + 1n,
      activityLevel: 0n,
      activityExpiry: 0n,
      currentTime: NOW,
    });
    expect(mana).to.equal(MEMBER_FLOOR, "tiny time_remaining floors to zero bonus — matches Rust floor-div");
  });

  // ── calculateManaFromStats convenience wrapper ────────────────────────────────

  it("calculateManaFromStats accepts number fields and coerces correctly", () => {
    const mana = calculateManaFromStats(
      {
        credentialLevel: 50,
        permanentLevel: 0,
        credentialExpiry: Number(NOW + VACANCY_PERIOD),
        activityLevel: 0,
        activityExpiry: 0,
      },
      Number(NOW),
    );
    expect(mana).to.equal(50n);
  });
});
