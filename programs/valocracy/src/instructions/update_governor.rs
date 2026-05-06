//! `update_governor` — rotate Valocracy's governor authority.

use anchor_lang::prelude::*;
use karn_shared::seeds::VALOCRACY_CONFIG;

use crate::errors::ValocracyError;
use crate::events::GovernorUpdateEvent;
use crate::state::Config;

#[derive(Accounts)]
pub struct UpdateGovernor<'info> {
    pub governor: Signer<'info>,

    #[account(
        mut,
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handler(ctx: Context<UpdateGovernor>, new_governor: Pubkey) -> Result<()> {
    ctx.accounts.config.governor = new_governor;
    emit!(GovernorUpdateEvent { new_governor });
    Ok(())
}
