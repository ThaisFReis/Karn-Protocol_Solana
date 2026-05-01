//! Mana calculation — pure, no I/O, no on-chain deps.
//!
//! Stellar parity: same three-component formula (floor + credential_bonus +
//! activity_bonus). Key divergence: timestamps are `i64` here (Solana
//! `Clock::unix_timestamp`) vs `u64` in Soroban. All intermediates use `u128`
//! (KRN-04).
//!
//! See CONFIG.md DT-10 D2 for the resolved formula, and PRD §M6 for context.

use crate::constants::{ACTIVITY_PERIOD, MEMBER_FLOOR, VACANCY_PERIOD};

/// Compute Mana for an account at a given instant.
///
/// Returns `MEMBER_FLOOR` (5) as a baseline even when all bonuses are zero.
/// Returns `MEMBER_FLOOR` for unregistered accounts — callers that need the
/// "account does not exist → 0" semantic should check existence before calling.
///
/// # Formula (DT-10 D2)
///
/// ```text
/// credential_bonus =
///   if now < credential_expiry:
///     (credential_level − MEMBER_FLOOR) × (expiry − now) / VACANCY_PERIOD
///   else if permanent_level > 0:
///     permanent_level          (Stellar fallback; always 0 in v2-Solana)
///   else:
///     0
///
/// activity_bonus =
///   if activity_level > 0 && now < activity_expiry:
///     activity_level × (expiry − now) / ACTIVITY_PERIOD
///   else:
///     0
///
/// Mana = MEMBER_FLOOR + credential_bonus + activity_bonus
/// ```
pub fn calculate_mana(
    credential_level: u64,
    permanent_level: u64,
    credential_expiry: i64,
    activity_level: u64,
    activity_expiry: i64,
    current_time: i64,
) -> u64 {
    let credential_bonus = if current_time < credential_expiry {
        let extra = credential_level.saturating_sub(MEMBER_FLOOR);
        // positive because current_time < credential_expiry
        let time_remaining = (credential_expiry - current_time) as u64;
        // KRN-04: u128 intermediate prevents overflow for extreme inputs
        ((u128::from(extra) * u128::from(time_remaining)) / u128::from(VACANCY_PERIOD as u64))
            as u64
    } else if permanent_level > 0 {
        permanent_level
    } else {
        0
    };

    let activity_bonus = if activity_level > 0 && current_time < activity_expiry {
        let time_remaining = (activity_expiry - current_time) as u64;
        ((u128::from(activity_level) * u128::from(time_remaining))
            / u128::from(ACTIVITY_PERIOD as u64)) as u64
    } else {
        0
    };

    MEMBER_FLOOR
        .saturating_add(credential_bonus)
        .saturating_add(activity_bonus)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{ACTIVITY_PERIOD, VACANCY_PERIOD};

    const NOW: i64 = 1_000_000;

    // ── Credential component ──────────────────────────────────────────────────

    /// Freshly minted at t=0 with full VACANCY_PERIOD remaining.
    /// credential_bonus = (level − floor) * 1 = level − floor.
    /// Mana == credential_level.
    #[test]
    fn full_credential_at_mint_time() {
        let mana = calculate_mana(
            50,
            0,
            NOW + VACANCY_PERIOD,
            0,
            0,
            NOW,
        );
        assert_eq!(mana, 50);
    }

    /// Halfway through the decay window.
    /// credential_bonus = (45 * VACANCY_PERIOD/2) / VACANCY_PERIOD = 22 (truncates).
    #[test]
    fn credential_halfway_decayed() {
        let mana = calculate_mana(
            50,
            0,
            NOW + VACANCY_PERIOD,
            0,
            0,
            NOW + VACANCY_PERIOD / 2,
        );
        // extra=45, time_remaining=VACANCY_PERIOD/2 → bonus = 45/2 = 22
        assert_eq!(mana, MEMBER_FLOOR + 22);
    }

    /// Credential expired, no permanent level → floor only.
    #[test]
    fn floor_only_when_credential_expired() {
        let mana = calculate_mana(
            50,
            0,
            NOW - 1, // one second past expiry
            0,
            0,
            NOW,
        );
        assert_eq!(mana, MEMBER_FLOOR);
    }

    /// Credential expired but permanent_level > 0 → Stellar fallback path.
    /// In v2-Solana permanent_level is always 0 at runtime, but the formula
    /// must preserve this path for parity with the Stellar reference.
    #[test]
    fn permanent_level_fallback_when_credential_expired() {
        let mana = calculate_mana(
            10,
            8, // permanent_level
            NOW - 1,
            0,
            0,
            NOW,
        );
        assert_eq!(mana, MEMBER_FLOOR + 8);
    }

    // ── Activity component ────────────────────────────────────────────────────

    /// Full ACTIVITY_PERIOD remaining → activity_bonus == activity_level.
    #[test]
    fn full_activity_at_credit_time() {
        let mana = calculate_mana(
            0, // no credential (below floor → extra = 0)
            0,
            NOW - 1,
            100,
            NOW + ACTIVITY_PERIOD,
            NOW,
        );
        assert_eq!(mana, MEMBER_FLOOR + 100);
    }

    /// Halfway through the activity decay window.
    /// activity_bonus = (100 * ACTIVITY_PERIOD/2) / ACTIVITY_PERIOD = 50.
    #[test]
    fn activity_halfway_decayed() {
        let mana = calculate_mana(
            0,
            0,
            NOW - 1,
            100,
            NOW + ACTIVITY_PERIOD,
            NOW + ACTIVITY_PERIOD / 2,
        );
        assert_eq!(mana, MEMBER_FLOOR + 50);
    }

    /// Activity expiry in the past → no activity bonus.
    #[test]
    fn no_activity_bonus_when_expired() {
        let mana = calculate_mana(
            0,
            0,
            NOW - 1,
            100,
            NOW - 1, // expired
            NOW,
        );
        assert_eq!(mana, MEMBER_FLOOR);
    }

    // ── Overflow protection (KRN-04) ─────────────────────────────────────────

    /// Extreme inputs: credential_level = u64::MAX with full window remaining.
    /// The u128 intermediate must absorb the product without panicking.
    /// credential_bonus = (u64::MAX − 5) * VACANCY_PERIOD / VACANCY_PERIOD
    ///                  = u64::MAX − 5.
    /// Final Mana saturates to u64::MAX (saturating_add).
    #[test]
    fn overflow_protection_extreme_credential() {
        let mana = calculate_mana(
            u64::MAX,
            0,
            NOW + VACANCY_PERIOD,
            0,
            0,
            NOW,
        );
        assert_eq!(mana, u64::MAX);
    }
}
