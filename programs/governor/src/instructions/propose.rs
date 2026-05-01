//! `propose` — Create a governance proposal (snapshot voting, KRN-02).
//!
//! Stellar parity: `governor.propose`. Reads `UserStats(proposer)` and
//! `Config` from the Valocracy program directly (no CPI, DT-04).
//! Snapshots `total_mana_at_creation = total_supply × MEMBER_FLOOR` (KRN-02).
//! Enforces `mana >= proposal_threshold`; fails with `NoVotingPower` otherwise.

use anchor_lang::prelude::*;
use karn_shared::constants::MEMBER_FLOOR;
use karn_shared::mana::calculate_mana;
use karn_shared::seeds::{GOVERNOR_CONFIG, GOVERNOR_PARAMS, PROPOSAL, USER_STATS, VALOCRACY_CONFIG};

use crate::errors::GovernorError;
use crate::events::ProposalCreated;
use crate::state::{GovernanceConfig, GovernorConfigPda, Proposal, ProposalAction};

#[derive(Accounts)]
#[instruction(description: String, action: ProposalAction)]
pub struct Propose<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        mut,
        seeds = [GOVERNOR_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, GovernorConfigPda>,

    #[account(
        seeds = [GOVERNOR_PARAMS],
        bump = params.bump,
    )]
    pub params: Account<'info, GovernanceConfig>,

    /// UserStats of the proposer — read directly from Valocracy (no CPI, DT-04).
    /// Fails with AccountNotInitialized if proposer is not a registered member.
    #[account(
        seeds = [USER_STATS, proposer.key().as_ref()],
        bump,
        seeds::program = config.valocracy,
    )]
    pub proposer_stats: Account<'info, valocracy::state::UserStats>,

    /// Valocracy singleton Config — read for total_supply snapshot (KRN-02).
    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump,
        seeds::program = config.valocracy,
    )]
    pub valocracy_config: Account<'info, valocracy::state::Config>,

    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::MAX_SIZE,
        seeds = [PROPOSAL, &config.proposal_count.to_le_bytes()],
        bump,
    )]
    pub proposal: Account<'info, Proposal>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Propose>, description: String, action: ProposalAction) -> Result<()> {
    require!(
        description.len() <= 500,
        GovernorError::InvalidProposalState
    );

    let stats = &ctx.accounts.proposer_stats;
    let now = Clock::get()?.unix_timestamp;

    let mana = calculate_mana(
        stats.credential_level,
        stats.permanent_level,
        stats.credential_expiry,
        stats.activity_level,
        stats.activity_expiry,
        now,
    );

    require!(mana >= ctx.accounts.params.proposal_threshold, GovernorError::NoVotingPower);

    // KRN-02 snapshot: total_mana = total_supply × MEMBER_FLOOR.
    let total_supply = ctx.accounts.valocracy_config.total_supply;
    let total_mana_at_creation = total_supply.saturating_mul(MEMBER_FLOOR);

    let params = &ctx.accounts.params;
    let start_time = now.saturating_add(params.voting_delay);
    let end_time = start_time.saturating_add(params.voting_period);

    let proposal_id = ctx.accounts.config.proposal_count;
    let proposal = &mut ctx.accounts.proposal;
    proposal.id = proposal_id;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.description = description;
    proposal.creation_time = now;
    proposal.start_time = start_time;
    proposal.end_time = end_time;
    proposal.for_votes = 0;
    proposal.against_votes = 0;
    proposal.executed = false;
    proposal.action = action;
    proposal.total_mana_at_creation = total_mana_at_creation;
    proposal.bump = ctx.bumps.proposal;

    ctx.accounts.config.proposal_count = proposal_id.saturating_add(1);

    emit!(ProposalCreated {
        proposal_id,
        proposer: ctx.accounts.proposer.key(),
    });

    Ok(())
}
