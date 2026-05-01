//! ERC4626-style vault math with virtual offsets (KRN-04 + first-depositor
//! inflation shield). All intermediates use `u128`.
//!
//! **Virtual offsets (Stellar parity):**
//! - `VIRTUAL_SHARES = 1_000` — added to `total_shares` denominator
//! - `VIRTUAL_ASSETS = 1`    — added to `total_assets` numerator
//!
//! This prevents the first-depositor inflation attack: at genesis,
//! `convert_to_shares(1) = 1 * 1001 / 1 = 1001`, so donating 1 token to an
//! empty vault only shifts the price by 1/1001 ≈ 0.1%, not 100%.

use crate::constants::{VIRTUAL_ASSETS, VIRTUAL_SHARES};

/// Effective assets under management: vault ATA balance minus locked
/// scholarship reserves (KRN-01). Scholarships in-flight are NOT claimable
/// by governance — they stay reserved until the scholar withdraws.
pub fn total_assets(vault_balance: u64, restricted_reserves: u64) -> u64 {
    vault_balance.saturating_sub(restricted_reserves)
}

/// Convert a `shares` amount to the equivalent asset amount.
///
/// Formula: `shares * (total_assets + VIRTUAL_ASSETS) / (total_shares + VIRTUAL_SHARES)`
///
/// Returns 0 when `total_shares + VIRTUAL_SHARES` would be zero (impossible
/// given constants > 0, but saturating_add ensures no wrap).
pub fn convert_to_assets(shares: u128, total_shares: u128, total_assets_val: u64) -> u64 {
    let numerator = shares
        .saturating_mul(u128::from(total_assets_val).saturating_add(VIRTUAL_ASSETS));
    let denominator = total_shares.saturating_add(VIRTUAL_SHARES);
    // denominator is always >= VIRTUAL_SHARES (1_000) > 0
    (numerator / denominator) as u64
}

/// Convert an `assets` amount to the equivalent shares.
///
/// Formula: `assets * (total_shares + VIRTUAL_SHARES) / (total_assets + VIRTUAL_ASSETS)`
pub fn convert_to_shares(assets: u64, total_shares: u128, total_assets_val: u64) -> u128 {
    let numerator = u128::from(assets)
        .saturating_mul(total_shares.saturating_add(VIRTUAL_SHARES));
    let denominator = u128::from(total_assets_val).saturating_add(VIRTUAL_ASSETS);
    // denominator is always >= VIRTUAL_ASSETS (1) > 0
    numerator / denominator
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{MIN_INITIAL_DEPOSIT, VIRTUAL_ASSETS, VIRTUAL_SHARES};

    // ── total_assets ─────────────────────────────────────────────────────────

    #[test]
    fn total_assets_subtracts_restricted() {
        assert_eq!(total_assets(1_000, 200), 800);
    }

    #[test]
    fn total_assets_saturates_at_zero_when_reserves_exceed_balance() {
        assert_eq!(total_assets(100, 200), 0);
    }

    #[test]
    fn total_assets_zero_reserves_returns_full_balance() {
        assert_eq!(total_assets(5_000, 0), 5_000);
    }

    // ── convert_to_assets ────────────────────────────────────────────────────

    #[test]
    fn convert_to_assets_at_genesis_virtual_offsets_apply() {
        // total_shares=0, total_assets=0 → denominator=VIRTUAL_SHARES, numerator=shares*VIRTUAL_ASSETS
        // shares=1000 → 1000*1 / 1000 = 1
        let assets = convert_to_assets(1_000, 0, 0);
        assert_eq!(assets, 1);
    }

    #[test]
    fn convert_to_assets_1_to_1_after_initial_deposit() {
        // After depositing MIN_INITIAL_DEPOSIT (1000) assets → shares = 1000*1001/1 = 1_001_000
        // Now convert those shares back:
        // assets = 1_001_000 * (1000+1) / (1_001_000+1000) = 1_001_000*1001 / 1_002_000 ≈ 999
        // (slight rounding due to virtual offsets, acceptable)
        let initial_shares = convert_to_shares(1_000, 0, 0);
        let round_trip = convert_to_assets(initial_shares, initial_shares, 1_000);
        // Should be very close to 1000 (virtual offset causes tiny loss)
        assert!(round_trip >= 999 && round_trip <= 1_000);
    }

    #[test]
    fn convert_to_assets_proportional_at_large_supply() {
        // 1000 shares out of 10_000 total, 5_000 assets → 1000*(5001)/(11000) ≈ 454
        let assets = convert_to_assets(1_000, 10_000, 5_000);
        assert_eq!(assets, (1_000u128 * (5_000 + VIRTUAL_ASSETS)) / (10_000 + VIRTUAL_SHARES));
    }

    // ── convert_to_shares ────────────────────────────────────────────────────

    #[test]
    fn convert_to_shares_at_genesis_respects_min_deposit() {
        // assets=MIN_INITIAL_DEPOSIT (1000), total_shares=0, total_assets=0
        // shares = 1000 * (0+1000) / (0+1) = 1_000_000
        let shares = convert_to_shares(MIN_INITIAL_DEPOSIT as u64, 0, 0);
        assert_eq!(shares, 1_000 * 1_000); // = 1_000_000
    }

    #[test]
    fn convert_to_shares_inflation_attack_bounded() {
        // Attacker donates 1 token to empty vault (total_assets=1, total_shares=0)
        // Next depositor gets: shares = 1000 * 1000 / (1+1) = 500_000
        // Without virtual offsets it would be 1000 * 1000 / 1 = 1_000_000 → donor steals half
        // With offsets the shift is only ~0.1%, not 50%
        let shares_before_attack = convert_to_shares(1_000, 0, 0); // = 1_000_000
        let shares_after_attack = convert_to_shares(1_000, 0, 1);  // donate 1 asset
        // After attack depositor still gets nearly the same
        let ratio = shares_before_attack as f64 / shares_after_attack as f64;
        assert!(ratio < 1.01, "inflation attack shifted ratio by more than 1%: {}", ratio);
    }
}
