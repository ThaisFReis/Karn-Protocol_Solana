//! `withdraw_scholarship` — Member withdraws their approved scholarship balance.
//!
//! Stellar parity: `treasury.withdraw_scholarship`. Decrements both the member's
//! `Claimable` balance and `restricted_reserves`, then CPI-transfers tokens from
//! the vault to the member's ATA (signed by the Treasury state PDA).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use karn_shared::seeds::{CLAIMABLE, TREASURY_STATE};

use crate::errors::TreasuryError;
use crate::events::ScholarshipWithdrawn;
use crate::state::{Claimable, TreasuryState};

#[derive(Accounts)]
pub struct WithdrawScholarship<'info> {
    pub member: Signer<'info>,

    #[account(
        mut,
        seeds = [TREASURY_STATE],
        bump = state.bump,
    )]
    pub state: Account<'info, TreasuryState>,

    #[account(
        mut,
        seeds = [CLAIMABLE, member.key().as_ref()],
        bump = claimable.bump,
        constraint = claimable.member == member.key() @ TreasuryError::NotAuthorized,
    )]
    pub claimable: Account<'info, Claimable>,

    /// Vault ATA — source of the scholarship payout.
    #[account(
        mut,
        associated_token::mint = state.asset_mint,
        associated_token::authority = state,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    /// Member's token account — receives the payout.
    #[account(
        mut,
        token::mint = state.asset_mint,
        token::authority = member,
    )]
    pub member_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawScholarship>, amount: u64) -> Result<()> {
    require!(amount > 0, TreasuryError::ZeroAmount);
    require!(
        ctx.accounts.claimable.amount >= amount,
        TreasuryError::InsufficientClaimable
    );

    ctx.accounts.claimable.amount -= amount;
    ctx.accounts.state.restricted_reserves =
        ctx.accounts.state.restricted_reserves.saturating_sub(amount);

    let bump = ctx.accounts.state.bump;
    let seeds: &[&[u8]] = &[TREASURY_STATE, &[bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SplTransfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.member_ata.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(ScholarshipWithdrawn {
        member: ctx.accounts.member.key(),
        amount: amount as i128,
    });

    Ok(())
}
