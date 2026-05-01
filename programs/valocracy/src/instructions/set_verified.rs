//! `set_verified` — toggle the KYC verified flag on a member (Governor-only).
//!
//! Stellar parity: `valocracy.set_verified`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{USER_STATS, VALOCRACY_CONFIG};

use crate::errors::ValocracyError;
use crate::events::VerificationChangedEvent;
use crate::state::{Config, UserStats};

#[derive(Accounts)]
#[instruction(member: Pubkey)]
pub struct SetVerified<'info> {
    pub governor: Signer<'info>,

    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [USER_STATS, member.as_ref()],
        bump = user_stats.bump,
    )]
    pub user_stats: Account<'info, UserStats>,
}

pub fn handler(ctx: Context<SetVerified>, member: Pubkey, verified: bool) -> Result<()> {
    ctx.accounts.user_stats.verified = verified;

    emit!(VerificationChangedEvent { member, verified });

    Ok(())
}
