//! `cast_vote` — cast a FOR or AGAINST vote on an active proposal (KRN-02).
//!
//! Stellar parity: `governor.cast_vote`. Voting power is calculated using
//! `proposal.creation_time` as the timestamp — not `now` — so badges acquired
//! during the voting delay do not inflate a voter's power (KRN-02).
//!
//! Anti-double-vote is enforced by `init`-ing a `Vote` PDA — Anchor rejects
//! the transaction if the account already exists (AlreadyInUse → AlreadyVoted).

use anchor_lang::prelude::*;
use karn_shared::mana::calculate_mana;
use karn_shared::seeds::{GOVERNOR_CONFIG, PROPOSAL, USER_STATS, VOTE};

use crate::errors::GovernorError;
use crate::events::VoteCast;
use crate::state::{GovernorConfigPda, Proposal, Vote};

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        mut,
        seeds = [GOVERNOR_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, GovernorConfigPda>,

    #[account(
        mut,
        seeds = [PROPOSAL, &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,

    /// Voter's UserStats — read directly from Valocracy (no CPI, DT-04).
    #[account(
        seeds = [USER_STATS, voter.key().as_ref()],
        bump,
        seeds::program = config.valocracy,
    )]
    pub voter_stats: Account<'info, valocracy::state::UserStats>,

    /// Vote receipt PDA — `init` fails if it already exists (double-vote guard).
    #[account(
        init,
        payer = voter,
        space = 8 + Vote::SIZE,
        seeds = [VOTE, &proposal_id.to_le_bytes(), voter.key().as_ref()],
        bump,
    )]
    pub vote: Account<'info, Vote>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CastVote>, proposal_id: u64, support: bool) -> Result<()> {
    require!(!ctx.accounts.config.locked, GovernorError::ReentrancyDetected);

    let now = Clock::get()?.unix_timestamp;
    let creation_time = ctx.accounts.proposal.creation_time;
    let start_time = ctx.accounts.proposal.start_time;
    let end_time = ctx.accounts.proposal.end_time;

    require!(now >= start_time, GovernorError::VotingNotStarted);
    require!(now <= end_time, GovernorError::VotingEnded);

    ctx.accounts.config.locked = true;

    let stats = &ctx.accounts.voter_stats;

    // KRN-02: snapshot voting power at creation_time, not at now.
    let voting_power = calculate_mana(
        stats.credential_level,
        stats.permanent_level,
        stats.credential_expiry,
        stats.activity_level,
        stats.activity_expiry,
        creation_time,
    );

    if voting_power == 0 {
        ctx.accounts.config.locked = false;
        return Err(error!(GovernorError::NoVotingPower));
    }

    let proposal = &mut ctx.accounts.proposal;
    if support {
        proposal.for_votes = proposal.for_votes.saturating_add(voting_power);
    } else {
        proposal.against_votes = proposal.against_votes.saturating_add(voting_power);
    }

    let vote = &mut ctx.accounts.vote;
    vote.support = support;
    vote.bump = ctx.bumps.vote;

    ctx.accounts.config.locked = false;

    emit!(VoteCast {
        proposal_id,
        voter: ctx.accounts.voter.key(),
        support,
        voting_power,
    });

    Ok(())
}
