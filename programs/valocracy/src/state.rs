//! On-chain state structs for Valocracy.

use anchor_lang::prelude::*;

/// Singleton config (one per program). Stores governance/treasury references,
/// the backend signer pubkey for `self_register`, and protocol-level supply
/// counters.
#[account]
pub struct Config {
    pub governor: Pubkey,
    pub treasury: Pubkey,
    /// Ed25519 public key whose signatures unlock `self_register`. Set at
    /// init; rotated only via governance proposal in later modules.
    pub signer: [u8; 32],
    pub member_valor_id: u64,
    pub leadership_valor_id: u64,
    pub total_supply: u64,
    pub credit_paused: bool,
    pub bump: u8,
}

impl Config {
    /// 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 = 122 bytes. The `init` constraint
    /// adds an 8-byte Anchor discriminator on top.
    pub const SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

/// Per-`valor_id` badge definition. Soroban parity: `Valor { rarity,
/// secondary_rarity, track_id, metadata }`.
#[account]
pub struct Valor {
    pub rarity: u64,
    pub secondary_rarity: u64,
    pub track_id: u64,
    pub metadata: String,
    pub bump: u8,
}

impl Valor {
    /// Maximum metadata bytes — kept small to keep the `realloc` budget tight.
    pub const MAX_METADATA_LEN: usize = 200;
    /// 8 + 8 + 8 + (4 + MAX_METADATA_LEN) + 1.
    pub const SIZE: usize = 8 + 8 + 8 + 4 + Self::MAX_METADATA_LEN + 1;
}

/// Per-wallet user statistics. Soroban parity: `UserStats` with the v2 fields
/// (`primary_track_id`, `primary_valor_id`, `activity_level`, `activity_expiry`).
#[account]
pub struct UserStats {
    pub credential_level: u64,
    /// Always 0 in v2-Solana (DT-10 D1) — kept for binary parity with Stellar.
    pub permanent_level: u64,
    pub credential_expiry: i64,
    pub verified: bool,
    pub primary_track_id: Option<u64>,
    pub primary_valor_id: Option<u64>,
    pub activity_level: u64,
    pub activity_expiry: i64,
    pub bump: u8,
}

impl UserStats {
    /// 8 + 8 + 8 + 1 + (1 + 8) + (1 + 8) + 8 + 8 + 1 = 60 bytes.
    pub const SIZE: usize = 8 + 8 + 8 + 1 + 1 + 8 + 1 + 8 + 8 + 8 + 1;
}

/// Per-token owner pointer. Lookup helper for revoke + ownership queries.
#[account]
pub struct TokenOwner {
    pub owner: Pubkey,
    pub bump: u8,
}

impl TokenOwner {
    pub const SIZE: usize = 32 + 1;
}

/// Per-token valor_id pointer. Closes alongside `TokenOwner` on revoke.
#[account]
pub struct TokenValorId {
    pub valor_id: u64,
    pub bump: u8,
}

impl TokenValorId {
    pub const SIZE: usize = 8 + 1;
}

/// Per-guardian allowlist of `track_id`s the guardian may mint badges for.
/// Capped at `MAX_TRACKS` to keep the realloc budget bounded (see DT-08).
#[account]
pub struct GuardianTracks {
    pub authority: Pubkey,
    pub track_ids: Vec<u64>,
    pub bump: u8,
}

impl GuardianTracks {
    pub const MAX_TRACKS: usize = 32;
    /// 32 (authority) + 4 (Vec len prefix) + 8 * MAX_TRACKS + 1 (bump).
    pub const SIZE: usize = 32 + 4 + 8 * Self::MAX_TRACKS + 1;
}

/// Per-credit-authority allowlist of track_ids. Mirrors `GuardianTracks` in
/// shape — same cap, same realloc budget (DT-08).
#[account]
pub struct CreditAuthority {
    pub authority: Pubkey,
    pub track_ids: Vec<u64>,
    pub bump: u8,
}

impl CreditAuthority {
    pub const MAX_TRACKS: usize = 32;
    /// 32 (authority) + 4 (Vec len prefix) + 8 * MAX_TRACKS + 1 (bump).
    pub const SIZE: usize = 32 + 4 + 8 * Self::MAX_TRACKS + 1;
}

/// Per-account rolling 30-day activity-credit cap window. Tracks how many
/// credits this account has received in the current period so the
/// `ACTIVITY_CREDIT_CAP` (200/30d) can be enforced.
#[account]
pub struct CreditWindow {
    pub credits: u64,
    pub period_start: i64,
    pub bump: u8,
}

impl CreditWindow {
    /// 8 (credits) + 8 (period_start) + 1 (bump).
    pub const SIZE: usize = 8 + 8 + 1;
}

/// Anti-replay marker for `self_register`. The PDA's mere existence (derived
/// from `[USED_NONCE, caller, nonce]`) means this `(caller, nonce)` pair has
/// been consumed. Storing only `bump` keeps the account at the minimum 9
/// bytes (8 disc + 1 bump) — cheapest possible rent.
#[account]
pub struct UsedNonce {
    pub bump: u8,
}

impl UsedNonce {
    pub const SIZE: usize = 1;
}
