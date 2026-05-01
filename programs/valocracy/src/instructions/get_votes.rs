//! `get_votes` — read-only view of an account's current Mana.
//!
//! Returns 0 for unregistered accounts (no `UserStats` PDA). Call via
//! `program.methods.getVotes(account).view()` from the TypeScript SDK.

use anchor_lang::prelude::*;
use karn_shared::{calculate_mana, seeds::USER_STATS};

use crate::state::UserStats;

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct GetVotes<'info> {
    /// CHECK: PDA derivation verified by seeds constraint; the account may be
    /// uninitialized (first-time query) — the handler returns 0 in that case.
    #[account(
        seeds = [USER_STATS, account.as_ref()],
        bump
    )]
    pub user_stats: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<GetVotes>, _account: Pubkey) -> Result<u64> {
    if ctx.accounts.user_stats.data_is_empty() {
        return Ok(0);
    }
    let data = ctx.accounts.user_stats.try_borrow_data()?;
    let stats = UserStats::try_deserialize(&mut &data[..])?;
    let clock = Clock::get()?;
    Ok(calculate_mana(
        stats.credential_level,
        stats.permanent_level,
        stats.credential_expiry,
        stats.activity_level,
        stats.activity_expiry,
        clock.unix_timestamp,
    ))
}
