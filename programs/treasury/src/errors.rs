//! Treasury errors.
//!
//! Mirrors the Stellar `TreasuryError` enum 1:1. Solana code = 6000 +
//! (stellar_code - 1). See ADR-0002.

use anchor_lang::prelude::*;

#[error_code]
pub enum TreasuryError {
    #[msg("Treasury already initialized")]
    AlreadyInitialized, // 6000 — Stellar 1
    #[msg("Treasury not initialized")]
    NotInitialized, // 6001 — Stellar 2
    #[msg("Caller not authorized")]
    NotAuthorized, // 6002 — Stellar 3
    #[msg("Insufficient shares")]
    InsufficientShares, // 6003 — Stellar 4
    #[msg("Insufficient assets in vault")]
    InsufficientAssets, // 6004 — Stellar 5
    #[msg("Amount must be positive")]
    ZeroAmount, // 6005 — Stellar 6
    #[msg("Reentrancy detected")]
    ReentrancyDetected, // 6006 — Stellar 7
    #[msg("Math overflow")]
    MathOverflow, // 6007 — Stellar 8
    #[msg("Lab not found")]
    LabNotFound, // 6008 — Stellar 9
    #[msg("Lab is not active")]
    LabNotActive, // 6009 — Stellar 10
    #[msg("Insufficient claimable balance")]
    InsufficientClaimable, // 6010 — Stellar 11
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_and_last_variants_at_expected_index() {
        assert_eq!(TreasuryError::AlreadyInitialized as u32, 0);
        assert_eq!(TreasuryError::InsufficientClaimable as u32, 10);
    }

    #[test]
    fn variant_count_is_eleven() {
        assert_eq!(TreasuryError::InsufficientClaimable as u32 + 1, 11);
    }
}
