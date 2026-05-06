//! `update_governor` — rotate Treasury's governor authority.

use anchor_lang::prelude::*;
use karn_shared::seeds::TREASURY_STATE;

use crate::errors::TreasuryError;
use crate::events::TreasuryGovernorUpdate;
use crate::state::TreasuryState;

#[derive(Accounts)]
pub struct UpdateGovernor<'info> {
    pub governor: Signer<'info>,

    #[account(
        mut,
        seeds = [TREASURY_STATE],
        bump = state.bump,
        has_one = governor @ TreasuryError::NotAuthorized,
    )]
    pub state: Account<'info, TreasuryState>,
}

pub fn handler(ctx: Context<UpdateGovernor>, new_governor: Pubkey) -> Result<()> {
    ctx.accounts.state.governor = new_governor;
    emit!(TreasuryGovernorUpdate { new_governor });
    Ok(())
}
