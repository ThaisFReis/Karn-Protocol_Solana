//! `get_votes_at` — snapshot Mana at an arbitrary past (or future) timestamp.
//!
//! Used by the Governor for KRN-02 snapshot voting: `cast_vote` computes
//! `voting_power = get_votes_at(voter, proposal.creation_time)` so that Mana
//! minted *after* the snapshot is excluded from the vote.

use anchor_lang::prelude::*;
use karn_shared::{calculate_mana, seeds::USER_STATS};

use crate::state::UserStats;

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct GetVotesAt<'info> {
    /// CHECK: PDA derivation verified by seeds constraint; handler returns 0
    /// for uninitialized accounts.
    #[account(
        seeds = [USER_STATS, account.as_ref()],
        bump
    )]
    pub user_stats: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<GetVotesAt>, _account: Pubkey, timestamp: i64) -> Result<u64> {
    if ctx.accounts.user_stats.data_is_empty() {
        return Ok(0);
    }
    let data = ctx.accounts.user_stats.try_borrow_data()?;
    let stats = UserStats::try_deserialize(&mut &data[..])?;
    Ok(calculate_mana(
        stats.credential_level,
        stats.permanent_level,
        stats.credential_expiry,
        stats.activity_level,
        stats.activity_expiry,
        timestamp,
    ))
}
