//! `pause_credit` — global circuit breaker that halts all `credit_activity`
//! calls (Governor-only). Stellar parity: `valocracy.pause_credit`.

use anchor_lang::prelude::*;
use karn_shared::seeds::VALOCRACY_CONFIG;

use crate::errors::ValocracyError;
use crate::events::CreditStatusEvent;
use crate::state::Config;

#[derive(Accounts)]
pub struct PauseCredit<'info> {
    pub governor: Signer<'info>,

    #[account(
        mut,
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handler(ctx: Context<PauseCredit>) -> Result<()> {
    ctx.accounts.config.credit_paused = true;
    emit!(CreditStatusEvent { paused: true });
    Ok(())
}
