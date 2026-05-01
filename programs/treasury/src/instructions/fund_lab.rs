//! `fund_lab` — Funder deposits tokens and creates a scholarship Lab PDA.
//!
//! Stellar parity: `treasury.fund_lab`. The funder SPL-transfers `total_amount`
//! into the vault, creating a Lab record and incrementing `restricted_reserves`
//! so those tokens are excluded from governance-accessible `total_assets` (KRN-01).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use karn_shared::seeds::{LAB, TREASURY_STATE};

use crate::errors::TreasuryError;
use crate::events::LabFunded;
use crate::state::{Lab, LabStatus, TreasuryState};

#[derive(Accounts)]
pub struct FundLab<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,

    #[account(
        mut,
        seeds = [TREASURY_STATE],
        bump = state.bump,
    )]
    pub state: Account<'info, TreasuryState>,

    /// New Lab PDA — ID derived from current `state.lab_counter`.
    #[account(
        init,
        payer = funder,
        space = 8 + Lab::SIZE,
        seeds = [LAB, &state.lab_counter.to_le_bytes()],
        bump,
    )]
    pub lab: Account<'info, Lab>,

    /// Funder's token account (source of scholarship funds).
    #[account(
        mut,
        token::mint = state.asset_mint,
        token::authority = funder,
    )]
    pub funder_ata: Account<'info, TokenAccount>,

    /// Vault ATA — receives the deposited tokens.
    #[account(
        mut,
        associated_token::mint = state.asset_mint,
        associated_token::authority = state,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FundLab>, total_amount: u64, scholarship_per_member: u64) -> Result<()> {
    require!(total_amount > 0, TreasuryError::ZeroAmount);
    require!(scholarship_per_member > 0, TreasuryError::ZeroAmount);
    require!(
        scholarship_per_member <= total_amount,
        TreasuryError::InsufficientAssets
    );

    // Transfer tokens from funder to vault (SPL CPI, funder signs).
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SplTransfer {
                from: ctx.accounts.funder_ata.to_account_info(),
                to: ctx.accounts.vault_ata.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        total_amount,
    )?;

    let lab_id = ctx.accounts.state.lab_counter;
    let lab = &mut ctx.accounts.lab;
    lab.id = lab_id;
    lab.funder = ctx.accounts.funder.key();
    lab.total_amount = total_amount;
    lab.scholarship_per_member = scholarship_per_member;
    lab.status = LabStatus::Active;
    lab.bump = ctx.bumps.lab;

    let state = &mut ctx.accounts.state;
    state.restricted_reserves = state.restricted_reserves.saturating_add(total_amount);
    state.lab_counter = lab_id.saturating_add(1);

    emit!(LabFunded {
        lab_id,
        funder: ctx.accounts.funder.key(),
        total_amount: total_amount as i128,
    });

    Ok(())
}
