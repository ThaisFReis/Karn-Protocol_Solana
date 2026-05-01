//! `initialize` — Bootstrap both Governor PDAs.
//!
//! Creates `GovernorConfigPda` (singleton state) and `GovernanceConfig`
//! (tunable parameters) with the same defaults as the Stellar implementation.

use anchor_lang::prelude::*;
use karn_shared::constants::{
    DEFAULT_PARTICIPATION_THRESHOLD, DEFAULT_PROPOSAL_THRESHOLD, DEFAULT_QUORUM_PERCENTAGE,
    DEFAULT_VOTING_DELAY, DEFAULT_VOTING_PERIOD,
};
use karn_shared::seeds::{GOVERNOR_CONFIG, GOVERNOR_PARAMS};

use crate::state::{GovernanceConfig, GovernorConfigPda};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + GovernorConfigPda::SIZE,
        seeds = [GOVERNOR_CONFIG],
        bump,
    )]
    pub config: Account<'info, GovernorConfigPda>,

    #[account(
        init,
        payer = payer,
        space = 8 + GovernanceConfig::SIZE,
        seeds = [GOVERNOR_PARAMS],
        bump,
    )]
    pub params: Account<'info, GovernanceConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, valocracy: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.valocracy = valocracy;
    config.proposal_count = 0;
    config.locked = false;
    config.bump = ctx.bumps.config;

    let params = &mut ctx.accounts.params;
    params.voting_delay = DEFAULT_VOTING_DELAY;
    params.voting_period = DEFAULT_VOTING_PERIOD;
    params.proposal_threshold = DEFAULT_PROPOSAL_THRESHOLD;
    params.quorum_percentage = DEFAULT_QUORUM_PERCENTAGE;
    params.participation_threshold = DEFAULT_PARTICIPATION_THRESHOLD;
    params.bump = ctx.bumps.params;

    Ok(())
}
