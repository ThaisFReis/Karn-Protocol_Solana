//! `update_treasury` — rotate the TreasuryState reference stored in Valocracy.

use anchor_lang::prelude::*;
use karn_shared::seeds::VALOCRACY_CONFIG;

use crate::errors::ValocracyError;
use crate::events::TreasuryUpdateEvent;
use crate::state::Config;

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    pub governor: Signer<'info>,

    #[account(
        mut,
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handler(ctx: Context<UpdateTreasury>, new_treasury: Pubkey) -> Result<()> {
    ctx.accounts.config.treasury = new_treasury;
    emit!(TreasuryUpdateEvent { new_treasury });
    Ok(())
}
