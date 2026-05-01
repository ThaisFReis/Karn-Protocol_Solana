//! `update_primary` — set an account's primary track and valor (Governor-only).
//!
//! Called by the Governor PDA when a governance proposal executes. Updates
//! `primary_track_id` and `primary_valor_id` on the target's `UserStats` so
//! that future mints use the correct `effective_rarity` branch.
//!
//! Stellar parity: `valocracy.update_primary`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{USER_STATS, VALOCRACY_CONFIG};

use crate::errors::ValocracyError;
use crate::events::PrimaryUpdatedEvent;
use crate::state::{Config, UserStats};

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct UpdatePrimary<'info> {
    pub governor: Signer<'info>,

    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [USER_STATS, account.as_ref()],
        bump = user_stats.bump,
    )]
    pub user_stats: Account<'info, UserStats>,
}

pub fn handler(
    ctx: Context<UpdatePrimary>,
    account: Pubkey,
    new_track_id: u64,
    new_valor_id: u64,
) -> Result<()> {
    let stats = &mut ctx.accounts.user_stats;
    stats.primary_track_id = Some(new_track_id);
    stats.primary_valor_id = Some(new_valor_id);

    emit!(PrimaryUpdatedEvent {
        account,
        new_track_id,
        new_valor_id,
    });

    Ok(())
}
