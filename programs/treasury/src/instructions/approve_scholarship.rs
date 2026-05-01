//! `approve_scholarship` — Governor allocates scholarship funds to a member.
//!
//! Stellar parity: `treasury.approve_scholarship`. Loads the active Lab and
//! creates/updates the member's `Claimable` PDA by adding `lab.scholarship_per_member`.
//! No token movement occurs here — tokens stay in the vault until `withdraw_scholarship`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{CLAIMABLE, LAB, TREASURY_STATE};

use crate::errors::TreasuryError;
use crate::events::ScholarshipReleased;
use crate::state::{Claimable, Lab, LabStatus, TreasuryState};

#[derive(Accounts)]
#[instruction(lab_id: u32)]
pub struct ApproveScholarship<'info> {
    #[account(mut)]
    pub governor: Signer<'info>,

    #[account(
        seeds = [TREASURY_STATE],
        bump = state.bump,
        has_one = governor @ TreasuryError::NotAuthorized,
    )]
    pub state: Account<'info, TreasuryState>,

    #[account(
        seeds = [LAB, &lab_id.to_le_bytes()],
        bump = lab.bump,
        constraint = matches!(lab.status, LabStatus::Active) @ TreasuryError::LabNotActive,
    )]
    pub lab: Account<'info, Lab>,

    /// Member who will receive the scholarship. CHECK: pubkey stored in Claimable.
    /// CHECK: identity stored in claimable.member; SPL transfer at withdraw validates.
    pub member: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = governor,
        space = 8 + Claimable::SIZE,
        seeds = [CLAIMABLE, member.key().as_ref()],
        bump,
    )]
    pub claimable: Account<'info, Claimable>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ApproveScholarship>, _lab_id: u32) -> Result<()> {
    let scholarship = ctx.accounts.lab.scholarship_per_member;

    let claimable = &mut ctx.accounts.claimable;
    if claimable.member == Pubkey::default() {
        claimable.member = ctx.accounts.member.key();
        claimable.bump = ctx.bumps.claimable;
    }
    claimable.amount = claimable.amount.saturating_add(scholarship);

    emit!(ScholarshipReleased {
        lab_id: ctx.accounts.lab.id,
        member: ctx.accounts.member.key(),
        amount: scholarship as i128,
    });

    Ok(())
}
