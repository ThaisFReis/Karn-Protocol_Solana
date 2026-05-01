//! `credit_activity` — credit activity points to a registered member.
//!
//! Only a registered `CreditAuthority` may call this, and only for tracks in
//! its allowlist. Enforces three guards in order:
//!   1. `Config.credit_paused == false` (circuit breaker)
//!   2. `CreditAuthority` exists and contains `track_id`
//!   3. Rolling 30-day cap: at most `ACTIVITY_CREDIT_CAP` (200) credits per
//!      account per window
//!
//! Stellar parity: `valocracy.credit_activity`.

use anchor_lang::prelude::*;
use karn_shared::{
    constants::{ACTIVITY_CREDIT_CAP, ACTIVITY_CREDIT_CAP_PERIOD, ACTIVITY_PERIOD},
    seeds::{CREDIT_AUTHORITY, CREDIT_WINDOW, USER_STATS, VALOCRACY_CONFIG},
};

use crate::errors::ValocracyError;
use crate::events::ActivityCreditedEvent;
use crate::state::{Config, CreditAuthority, CreditWindow, UserStats};

#[derive(Accounts)]
#[instruction(account: Pubkey, track_id: u64, amount: u64)]
pub struct CreditActivity<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [CREDIT_AUTHORITY, authority.key().as_ref()],
        bump = credit_authority.bump,
    )]
    pub credit_authority: Account<'info, CreditAuthority>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + CreditWindow::SIZE,
        seeds = [CREDIT_WINDOW, account.as_ref()],
        bump,
    )]
    pub credit_window: Account<'info, CreditWindow>,

    /// Must already exist — crediting a non-member is rejected.
    #[account(
        mut,
        seeds = [USER_STATS, account.as_ref()],
        bump = user_stats.bump,
    )]
    pub user_stats: Account<'info, UserStats>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreditActivity>,
    _account: Pubkey,
    track_id: u64,
    amount: u64,
) -> Result<()> {
    // Guard 1: circuit breaker
    require!(
        !ctx.accounts.config.credit_paused,
        ValocracyError::ActivityCreditPaused
    );

    // Guard 2: authority track check
    require!(
        ctx.accounts.credit_authority.track_ids.contains(&track_id),
        ValocracyError::CreditAuthorityUnauthorized
    );

    let now = Clock::get()?.unix_timestamp;
    let window = &mut ctx.accounts.credit_window;

    // Initialize bump on first use (init_if_needed leaves bump as 0).
    if window.bump == 0 {
        window.bump = ctx.bumps.credit_window;
    }

    // Guard 3: rolling 30-day window — reset if expired
    if now >= window.period_start.saturating_add(ACTIVITY_CREDIT_CAP_PERIOD) {
        window.credits = 0;
        window.period_start = now;
    }

    let remaining_cap = ACTIVITY_CREDIT_CAP.saturating_sub(window.credits);
    let effective_amount = amount.min(remaining_cap);

    window.credits = window.credits.saturating_add(effective_amount);

    let stats = &mut ctx.accounts.user_stats;
    stats.activity_level = stats.activity_level.saturating_add(effective_amount);
    stats.activity_expiry = now.saturating_add(ACTIVITY_PERIOD);

    emit!(ActivityCreditedEvent {
        account: _account,
        track_id,
        amount,
        effective_amount,
    });

    Ok(())
}
