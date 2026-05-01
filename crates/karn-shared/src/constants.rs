//! Protocol-level numeric constants.
//!
//! These mirror the Stellar/Soroban implementation byte-for-byte. Changing any
//! of them is a protocol change — must go through governance + ADR.

// ── Time windows ─────────────────────────────────────────────────────────────

/// 180 days in seconds. Credential level decays linearly to `MEMBER_FLOOR`
/// over this window.
pub const VACANCY_PERIOD: i64 = 180 * 24 * 60 * 60;

/// 90 days in seconds. Activity level decays linearly to zero over this window.
pub const ACTIVITY_PERIOD: i64 = 90 * 24 * 60 * 60;

/// 30 days in seconds. Rolling window for the activity-credit cap.
pub const ACTIVITY_CREDIT_CAP_PERIOD: i64 = 30 * 24 * 60 * 60;

// ── Mana ─────────────────────────────────────────────────────────────────────

/// Baseline Mana every registered member has, regardless of badges or activity.
pub const MEMBER_FLOOR: u64 = 5;

/// Maximum activity credits any single account can accumulate within a
/// `ACTIVITY_CREDIT_CAP_PERIOD` window.
pub const ACTIVITY_CREDIT_CAP: u64 = 200;

// ── Treasury vault math (KRN-04 + first-depositor protection) ────────────────

/// Minimum first deposit (`shares`) accepted by the Treasury — protects
/// against the first-depositor inflation attack.
pub const MIN_INITIAL_DEPOSIT: u128 = 1_000;

/// Virtual offset on shares side of vault math (ERC-4626 inflation shield).
pub const VIRTUAL_SHARES: u128 = 1_000;

/// Virtual offset on assets side of vault math.
pub const VIRTUAL_ASSETS: u128 = 1;

// ── Governance defaults ──────────────────────────────────────────────────────

/// Default voting delay between proposal creation and vote opening.
pub const DEFAULT_VOTING_DELAY: i64 = 24 * 60 * 60;

/// Default duration of the voting window.
pub const DEFAULT_VOTING_PERIOD: i64 = 7 * 24 * 60 * 60;

/// Default minimum Mana required to create a proposal.
pub const DEFAULT_PROPOSAL_THRESHOLD: u64 = 100;

/// Default percentage of `for_votes / total_votes` required to pass.
pub const DEFAULT_QUORUM_PERCENTAGE: u64 = 51;

/// Default minimum percentage of `total_mana_at_creation` that must vote
/// for a proposal to be considered (KRN-03).
pub const DEFAULT_PARTICIPATION_THRESHOLD: u64 = 4;

// ── Domain constraints (DT-08) ───────────────────────────────────────────────

/// Maximum number of `track_id`s a single guardian / credit authority may be
/// registered on. Keeps `Vec<u64>` realloc bounded.
pub const MAX_TRACKS_PER_AUTHORITY: usize = 32;

// ── Compile-time invariants ──────────────────────────────────────────────────

// Percentages must stay within [0, 100]. Compile-time `assert!` so a future
// edit that raises a default beyond 100 fails to build instead of producing
// nonsensical proposal arithmetic.
const _: () = assert!(DEFAULT_QUORUM_PERCENTAGE <= 100);
const _: () = assert!(DEFAULT_PARTICIPATION_THRESHOLD <= 100);

#[cfg(test)]
mod tests {
    use super::*;

    /// Stellar parity: time windows in seconds must match the Soroban
    /// `VACANCY_PERIOD` / `ACTIVITY_PERIOD` constants exactly. Off-by-a-day
    /// shifts all decay calculations and breaks cross-implementation tests.
    #[test]
    fn time_windows_match_stellar() {
        assert_eq!(VACANCY_PERIOD, 15_552_000); // 180 * 86_400
        assert_eq!(ACTIVITY_PERIOD, 7_776_000); // 90 * 86_400
        assert_eq!(ACTIVITY_CREDIT_CAP_PERIOD, 2_592_000); // 30 * 86_400
    }

    #[test]
    fn member_floor_and_cap() {
        assert_eq!(MEMBER_FLOOR, 5);
        assert_eq!(ACTIVITY_CREDIT_CAP, 200);
    }

    #[test]
    fn vault_math_constants() {
        assert_eq!(MIN_INITIAL_DEPOSIT, 1_000);
        assert_eq!(VIRTUAL_SHARES, 1_000);
        assert_eq!(VIRTUAL_ASSETS, 1);
    }

    #[test]
    fn governance_defaults_match_stellar() {
        assert_eq!(DEFAULT_VOTING_DELAY, 86_400); // 1 day
        assert_eq!(DEFAULT_VOTING_PERIOD, 604_800); // 7 days
        assert_eq!(DEFAULT_PROPOSAL_THRESHOLD, 100);
        assert_eq!(DEFAULT_QUORUM_PERCENTAGE, 51);
        assert_eq!(DEFAULT_PARTICIPATION_THRESHOLD, 4);
    }

    // The percentage upper bound is enforced at compile time via `const _`
    // assertions above (clippy correctly flags `assert!(CONST < N)` as
    // tautological at runtime — `const _` runs at build time instead).
}
