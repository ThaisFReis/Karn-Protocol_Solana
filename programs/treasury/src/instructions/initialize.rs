//! `initialize` — bootstrap the Treasury: create state PDA + vault ATA.
//!
//! The vault ATA is an Associated Token Account for `asset_mint` with
//! authority = Treasury state PDA. SPL transfers from the vault are signed
//! by the PDA using seeds `[TREASURY_STATE, &[bump]]`.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use karn_shared::seeds::TREASURY_STATE;

use crate::errors::TreasuryError;
use crate::state::TreasuryState;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: stored as a reference — no auth check needed at init time.
    pub governor: AccountInfo<'info>,

    /// CHECK: stored as a reference for CPI calls in M11+.
    pub valocracy: AccountInfo<'info>,

    pub asset_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + TreasuryState::SIZE,
        seeds = [TREASURY_STATE],
        bump,
        constraint = !state.locked @ TreasuryError::AlreadyInitialized,
    )]
    pub state: Account<'info, TreasuryState>,

    /// Vault ATA owned by the state PDA — receives deposits and pays out.
    #[account(
        init,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = state,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    state.governor = ctx.accounts.governor.key();
    state.valocracy = ctx.accounts.valocracy.key();
    state.asset_mint = ctx.accounts.asset_mint.key();
    state.total_shares = 0;
    state.restricted_reserves = 0;
    state.locked = false;
    state.bump = ctx.bumps.state;
    state.lab_counter = 0;
    Ok(())
}
