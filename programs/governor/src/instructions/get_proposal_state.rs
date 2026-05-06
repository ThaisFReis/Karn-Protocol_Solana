//! `get_proposal_state` — read-only view of a proposal's current state (KRN-03).
//!
//! Returns a u8 encoding `ProposalState`: 0=Pending, 1=Active, 2=Succeeded,
//! 3=Defeated, 4=Executed. Invoke via `.view()` — no state mutation.
//!
//! KRN-03 enforcement: participation check (≥ 4%) applied BEFORE quorum (51%).

use anchor_lang::prelude::*;
use karn_shared::seeds::PROPOSAL;

use crate::state::{proposal_state, Proposal};

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct GetProposalState<'info> {
    #[account(
        seeds = [PROPOSAL, &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,
}

/// Returns the state encoded as u8 (see ProposalState variants).
pub fn handler(ctx: Context<GetProposalState>, _proposal_id: u64) -> Result<u8> {
    let now = Clock::get()?.unix_timestamp;
    Ok(proposal_state(&ctx.accounts.proposal, now) as u8)
}
