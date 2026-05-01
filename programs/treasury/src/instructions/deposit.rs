//! `deposit` — Allocate shares to a receiver (Valocracy CPI only).
//!
//! Only callable via CPI whose signer is the Valocracy Config PDA stored in
//! `TreasuryState.valocracy`. Direct wallet calls return `NotAuthorized`.
//!
//! First-deposit invariant: if `total_shares == 0` and `shares < MIN_INITIAL_DEPOSIT`,
//! the instruction fails with `InsufficientShares` to anchor the exchange rate
//! against first-depositor inflation attacks (ERC-4626 §5).

use anchor_lang::prelude::*;
use karn_shared::constants::MIN_INITIAL_DEPOSIT;
use karn_shared::seeds::{TREASURY_STATE, USER_SHARES};

use crate::errors::TreasuryError;
use crate::events::Deposit as DepositEvent;
use crate::state::{TreasuryState, UserShares};

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// Valocracy Config PDA — must match `TreasuryState.valocracy`.
    /// In normal flow this account signs via Valocracy CPI signer seeds.
    pub valocracy_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [TREASURY_STATE],
        bump = state.bump,
        constraint = valocracy_authority.key() == state.valocracy @ TreasuryError::NotAuthorized,
    )]
    pub state: Account<'info, TreasuryState>,

    /// Recipient of the new shares — identity validated by seeds on `user_shares`.
    /// CHECK: address recorded in user_shares.owner; no further check needed.
    pub receiver: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + UserShares::SIZE,
        seeds = [USER_SHARES, receiver.key().as_ref()],
        bump,
    )]
    pub user_shares: Account<'info, UserShares>,

    /// Pays rent for `user_shares` on first mint (the outer mint instruction's
    /// `minter` is forwarded here).
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, shares: u64) -> Result<()> {
    require!(shares > 0, TreasuryError::ZeroAmount);

    let state = &mut ctx.accounts.state;

    // First deposit minimum: prevents exchange-rate inflation attack.
    if state.total_shares == 0 {
        require!(
            u128::from(shares) >= MIN_INITIAL_DEPOSIT,
            TreasuryError::InsufficientShares
        );
    }

    let user_shares = &mut ctx.accounts.user_shares;
    if user_shares.owner == Pubkey::default() {
        user_shares.owner = ctx.accounts.receiver.key();
        user_shares.bump = ctx.bumps.user_shares;
    }
    user_shares.shares = user_shares.shares.saturating_add(u128::from(shares));
    state.total_shares = state.total_shares.saturating_add(u128::from(shares));

    emit!(DepositEvent {
        receiver: ctx.accounts.receiver.key(),
        shares: shares as i128,
    });

    Ok(())
}
