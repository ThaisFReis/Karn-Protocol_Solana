//! On-chain state for the Treasury program.

use anchor_lang::prelude::*;

/// Singleton treasury state. Seeds: `[b"treasury"]`.
#[account]
pub struct TreasuryState {
    pub governor: Pubkey,
    pub valocracy: Pubkey,
    pub asset_mint: Pubkey,
    /// Total outstanding shares (u128 for vault math precision).
    pub total_shares: u128,
    /// Locked scholarship funds excluded from governance-accessible assets (KRN-01).
    pub restricted_reserves: u64,
    /// Reentrancy guard: true during an in-flight `transfer` CPI.
    pub locked: bool,
    pub bump: u8,
    /// Monotonic counter used as Lab IDs — incremented on every `fund_lab`.
    pub lab_counter: u32,
}

impl TreasuryState {
    /// 32 + 32 + 32 + 16 + 8 + 1 + 1 + 4 = 126 bytes (+ 8 discriminator).
    pub const SIZE: usize = 32 + 32 + 32 + 16 + 8 + 1 + 1 + 4;
}

/// Per-account share balance. Seeds: `[USER_SHARES, owner]`.
#[account]
pub struct UserShares {
    pub owner: Pubkey,
    /// Shares denominated in the same unit as `total_shares` (u128).
    pub shares: u128,
    pub bump: u8,
}

impl UserShares {
    /// 32 + 16 + 1 = 49 bytes (+ 8 discriminator).
    pub const SIZE: usize = 32 + 16 + 1;
}

/// Scholarship lab lifecycle state.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LabStatus {
    Active,
    Cancelled,
    Completed,
}

/// Per-lab scholarship escrow record. Seeds: `[LAB, id.to_le_bytes()]`.
#[account]
pub struct Lab {
    pub id: u32,
    pub funder: Pubkey,
    pub total_amount: u64,
    pub scholarship_per_member: u64,
    pub status: LabStatus,
    pub bump: u8,
}

impl Lab {
    /// 4 + 32 + 8 + 8 + 1 + 1 = 54 bytes (+ 8 discriminator).
    pub const SIZE: usize = 4 + 32 + 8 + 8 + 1 + 1;
}

/// Per-member claimable scholarship balance. Seeds: `[CLAIMABLE, member]`.
#[account]
pub struct Claimable {
    pub member: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

impl Claimable {
    /// 32 + 8 + 1 = 41 bytes (+ 8 discriminator).
    pub const SIZE: usize = 32 + 8 + 1;
}
