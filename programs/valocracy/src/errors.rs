//! Valocracy errors.
//!
//! **Parity rule:** variant order and names mirror the Stellar `ValocracyError`
//! enum 1:1. Casting `as u32` yields the **raw discriminant** (0-indexed).
//! Anchor adds the `6000` offset only when converting to `anchor_lang::error::Error`
//! at runtime — that's the value clients see. So:
//!
//!   - `ValocracyError::AlreadyInitialized as u32` → `0`
//!   - On-chain reported code → `6000`
//!   - Equivalent Stellar `ValocracyError::AlreadyInitialized` code → `1`
//!
//! Mapping: `solana_anchor_code = 6000 + variant_index`, `stellar_code = variant_index + 1`.
//!
//! See ADR-0002 for the rationale.
//!
//! Adding a new variant: **append at the end**. Reordering or inserting in the
//! middle breaks every off-chain client that decoded errors by code.

use anchor_lang::prelude::*;

#[error_code]
pub enum ValocracyError {
    #[msg("Contract already initialized")]
    AlreadyInitialized, // 6000 — Stellar code 1
    #[msg("Contract not initialized")]
    NotInitialized, // 6001 — Stellar code 2
    #[msg("Caller not authorized")]
    NotAuthorized, // 6002 — Stellar code 3
    #[msg("Valor id does not exist")]
    NonExistentValor, // 6003 — Stellar code 4
    #[msg("Token id does not exist")]
    NonExistentToken, // 6004 — Stellar code 5
    #[msg("Account has no UserStats")]
    NonExistentAccount, // 6005 — Stellar code 6
    #[msg("Tokens are non-transferable")]
    TokenSoulbound, // 6006 — Stellar code 7
    #[msg("Account already registered")]
    AlreadyRegistered, // 6007 — Stellar code 8
    #[msg("Signature verification failed")]
    InvalidSignature, // 6008 — Stellar code 9
    #[msg("Nonce already used")]
    NonceUsed, // 6009 — Stellar code 10
    #[msg("Signature expired")]
    SignatureExpired, // 6010 — Stellar code 11
    #[msg("Invalid valor id range")]
    InvalidValorId, // 6011 — Stellar code 12
    #[msg("Minter not authorized for this badge category")]
    MintNotAuthorized, // 6012 — Stellar code 13
    #[msg("Badge category cannot be minted")]
    BadgeNotMintable, // 6013 — Stellar code 14
    #[msg("Reentrancy detected")]
    ReentrancyDetected, // 6014 — Stellar code 15
    #[msg("Guardian not authorized for this track")]
    GuardianTrackUnauthorized, // 6015 — Stellar code 16
    #[msg("Activity crediting is paused")]
    ActivityCreditPaused, // 6016 — Stellar code 17
    #[msg("Credit authority not registered for this track")]
    CreditAuthorityUnauthorized, // 6017 — Stellar code 18

    // ── Solana-specific additions (no Stellar counterpart) ──
    #[msg("token_id mismatch — expected total_supply + 1")]
    InvalidTokenId, // 6018 — Solana-only (Soroban auto-increments token_id internally; on Solana the client must pass it for PDA derivation, so we validate against the counter)
    #[msg("Self-mint forbidden: guardian and account must differ")]
    GuardianSelfMintForbidden, // 6019 — Solana-only (CONFIG.md Rule 5; KRN-05's dual `Signer` constraint is satisfied by a single wallet, so we check explicitly)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Stellar parity: variants 0..=17 mirror the Stellar enum 1:1. If the
    /// boundary `CreditAuthorityUnauthorized == 17` drifts, the
    /// Stellar→Solana mapping (`stellar_code = variant_index + 1`) silently
    /// breaks for every SDK that decodes errors by code.
    #[test]
    fn stellar_parity_boundary_is_index_17() {
        assert_eq!(ValocracyError::AlreadyInitialized as u32, 0);
        assert_eq!(ValocracyError::CreditAuthorityUnauthorized as u32, 17);
    }

    /// Solana-only additions live AFTER the Stellar mirror. Pin the indices
    /// so a future variant can't be inserted in the middle without us
    /// noticing.
    #[test]
    fn solana_only_variants_at_expected_indices() {
        assert_eq!(ValocracyError::InvalidTokenId as u32, 18);
        assert_eq!(ValocracyError::GuardianSelfMintForbidden as u32, 19);
    }

    /// Total variant count: 18 mirrored from Stellar + 2 Solana-only = 20.
    #[test]
    fn variant_count_is_twenty() {
        assert_eq!(ValocracyError::GuardianSelfMintForbidden as u32 + 1, 20);
    }
}
