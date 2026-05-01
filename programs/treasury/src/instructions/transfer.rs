//! `transfer` — Governor-only outflow from the vault with reentrancy guard.
//!
//! Stellar parity: `treasury.transfer`. The reentrancy lock (`locked`) is set
//! before the SPL CPI and cleared afterwards. If the CPI itself fails, Anchor
//! rolls back state, so the lock can never be permanently stuck.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use karn_shared::seeds::TREASURY_STATE;

use crate::errors::TreasuryError;
use crate::events::Transfer as TransferEvent;
use crate::state::TreasuryState;

#[derive(Accounts)]
pub struct Transfer<'info> {
    pub governor: Signer<'info>,

    #[account(
        mut,
        seeds = [TREASURY_STATE],
        bump = state.bump,
        has_one = governor @ TreasuryError::NotAuthorized,
    )]
    pub state: Account<'info, TreasuryState>,

    /// Vault ATA — source of the outgoing transfer.
    #[account(
        mut,
        associated_token::mint = state.asset_mint,
        associated_token::authority = state,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    /// Receiver's token account. Validated by SPL at transfer time.
    /// CHECK: SPL transfer validates mint + owner consistency.
    #[account(mut)]
    pub receiver_ata: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    require!(amount > 0, TreasuryError::ZeroAmount);
    require!(!ctx.accounts.state.locked, TreasuryError::ReentrancyDetected);
    require!(
        ctx.accounts.vault_ata.amount >= amount,
        TreasuryError::InsufficientAssets
    );

    ctx.accounts.state.locked = true;

    let bump = ctx.accounts.state.bump;
    let seeds: &[&[u8]] = &[TREASURY_STATE, &[bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SplTransfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.receiver_ata.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    ctx.accounts.state.locked = false;

    emit!(TransferEvent {
        receiver: ctx.accounts.receiver_ata.key(),
        amount: amount as i128,
    });

    Ok(())
}
