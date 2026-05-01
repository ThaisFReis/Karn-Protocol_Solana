//! Treasury — governance-controlled SPL vault, scholarships.
//!
//! See `~/Documentos/Workspace/Karn Protocol/contracts/treasury/src/lib.rs`
//! for the canonical Stellar reference implementation.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use errors::TreasuryError;
pub use instructions::*;

declare_id!("97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV");

#[program]
pub mod treasury {
    use super::*;

    /// Bootstrap: create TreasuryState PDA + vault ATA.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// Allocate shares to a receiver — callable only via Valocracy CPI.
    pub fn deposit(ctx: Context<Deposit>, shares: u64) -> Result<()> {
        instructions::deposit::handler(ctx, shares)
    }

    /// Transfer assets from vault to receiver (Governor-only, reentrancy-guarded).
    pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
        instructions::transfer::handler(ctx, amount)
    }

    /// Funder deposits tokens, creating a scholarship Lab PDA (KRN-01).
    pub fn fund_lab(ctx: Context<FundLab>, total_amount: u64, scholarship_per_member: u64) -> Result<()> {
        instructions::fund_lab::handler(ctx, total_amount, scholarship_per_member)
    }

    /// Governor allocates scholarship funds to a member from an active Lab.
    pub fn approve_scholarship(ctx: Context<ApproveScholarship>, lab_id: u32) -> Result<()> {
        instructions::approve_scholarship::handler(ctx, lab_id)
    }

    /// Member withdraws their approved scholarship balance from the vault.
    pub fn withdraw_scholarship(ctx: Context<WithdrawScholarship>, amount: u64) -> Result<()> {
        instructions::withdraw_scholarship::handler(ctx, amount)
    }
}
