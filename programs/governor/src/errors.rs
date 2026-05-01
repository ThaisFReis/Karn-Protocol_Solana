//! Governor errors.
//!
//! Mirrors the Stellar `GovernorError` enum 1:1. Solana code = 6000 +
//! (stellar_code - 1). See ADR-0002.

use anchor_lang::prelude::*;

#[error_code]
pub enum GovernorError {
    #[msg("Governor already initialized")]
    AlreadyInitialized, // 6000 — Stellar 1
    #[msg("Governor not initialized")]
    NotInitialized, // 6001 — Stellar 2
    #[msg("Caller not authorized")]
    NotAuthorized, // 6002 — Stellar 3
    #[msg("Proposal not found")]
    ProposalNotFound, // 6003 — Stellar 4
    #[msg("Voting has not started yet")]
    VotingNotStarted, // 6004 — Stellar 5
    #[msg("Voting period has ended")]
    VotingEnded, // 6005 — Stellar 6
    #[msg("Voter has already cast a vote on this proposal")]
    AlreadyVoted, // 6006 — Stellar 7
    #[msg("Voter has no voting power")]
    NoVotingPower, // 6007 — Stellar 8
    #[msg("Proposal did not succeed")]
    ProposalNotSucceeded, // 6008 — Stellar 9
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted, // 6009 — Stellar 10
    #[msg("Invalid proposal state")]
    InvalidProposalState, // 6010 — Stellar 11
    #[msg("Proposer is not a member")]
    NotAMember, // 6011 — Stellar 12
    #[msg("Reentrancy detected")]
    ReentrancyDetected, // 6012 — Stellar 13
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_and_last_variants_at_expected_index() {
        assert_eq!(GovernorError::AlreadyInitialized as u32, 0);
        assert_eq!(GovernorError::ReentrancyDetected as u32, 12);
    }

    #[test]
    fn variant_count_is_thirteen() {
        assert_eq!(GovernorError::ReentrancyDetected as u32 + 1, 13);
    }
}
