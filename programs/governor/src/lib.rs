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
}
