//! Governor — proposals, voting, execution.
//!
//! Stellar parity: `governor` contract. See CONFIG.md §Governor.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use errors::GovernorError;
pub use instructions::*;
pub use state::ProposalAction;

declare_id!("6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm");

#[program]
pub mod governor {
    use super::*;

    /// Bootstrap both Governor PDAs (GovernorConfigPda + GovernanceConfig).
    pub fn initialize(ctx: Context<Initialize>, valocracy: Pubkey) -> Result<()> {
        instructions::initialize::handler(ctx, valocracy)
    }

    /// Create a governance proposal (KRN-02 snapshot voting).
    pub fn propose(
        ctx: Context<Propose>,
        description: String,
        action: ProposalAction,
    ) -> Result<()> {
        instructions::propose::handler(ctx, description, action)
    }

    /// Cast a FOR or AGAINST vote on an active proposal (KRN-02).
    /// Voting power is computed at `proposal.creation_time`, not now.
    pub fn cast_vote(ctx: Context<CastVote>, proposal_id: u64, support: bool) -> Result<()> {
        instructions::cast_vote::handler(ctx, proposal_id, support)
    }

    /// Read the current state of a proposal (KRN-03). Returns u8 (0–4).
    /// Invoke via `.view()` — no state mutation.
    pub fn get_proposal_state(
        ctx: Context<GetProposalState>,
        proposal_id: u64,
    ) -> Result<u8> {
        instructions::get_proposal_state::handler(ctx, proposal_id)
    }

    /// Execute a succeeded proposal, dispatching its action via CPI (DT-05).
    /// Anyone can trigger execution; proposal must be in Succeeded state.
    pub fn execute<'info>(
        ctx: Context<'_, '_, '_, 'info, Execute<'info>>,
        proposal_id: u64,
    ) -> Result<()> {
        instructions::execute::handler(ctx, proposal_id)
    }
}
