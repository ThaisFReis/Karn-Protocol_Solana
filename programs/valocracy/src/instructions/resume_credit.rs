//! `resume_credit` — lift the circuit breaker set by `pause_credit`
//! (Governor-only). Stellar parity: `valocracy.resume_credit`.

use anchor_lang::prelude::*;
use karn_shared::seeds::VALOCRACY_CONFIG;

use crate::errors::ValocracyError;
use crate::events::CreditStatusEvent;
use crate::state::Config;

#[derive(Accounts)]
pub struct ResumeCredit<'info> {
    pub governor: Signer<'info>,

    #[account(
        mut,
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handler(ctx: Context<ResumeCredit>) -> Result<()> {
    ctx.accounts.config.credit_paused = false;
    emit!(CreditStatusEvent { paused: false });
    Ok(())
}
