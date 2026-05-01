//! Governor events. Mirrors the 5 events emitted by the Stellar implementation.

use anchor_lang::prelude::*;

#[event]
pub struct ConfigUpdate {}

#[event]
pub struct ProposalCreated {
    pub proposal_id: u64,
    pub proposer: Pubkey,
}

#[event]
pub struct VoteCast {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub support: bool,
    pub voting_power: u64,
}

#[event]
pub struct ProposalExecuted {
    pub proposal_id: u64,
}

#[event]
pub struct GovernorContractUpgraded {
    pub new_wasm_hash: [u8; 32],
}
