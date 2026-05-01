//! On-chain state for the Governor program.

use anchor_lang::prelude::*;

/// Singleton governor state. Seeds: `[GOVERNOR_CONFIG]` = `[b"gov_config"]`.
#[account]
pub struct GovernorConfigPda {
    /// Valocracy program address — used to derive cross-program PDAs for
    /// UserStats and Config reads (DT-04, no CPI).
    pub valocracy: Pubkey,
    /// Monotonic proposal counter; next proposal gets id = proposal_count.
    pub proposal_count: u64,
    /// Reentrancy guard for proposal execution (M14).
    pub locked: bool,
    pub bump: u8,
}

impl GovernorConfigPda {
    /// 32 + 8 + 1 + 1 = 42 bytes (+ 8 discriminator).
    pub const SIZE: usize = 32 + 8 + 1 + 1;
}

/// Tunable governance parameters. Seeds: `[GOVERNOR_PARAMS]` = `[b"gov_params"]`.
#[account]
pub struct GovernanceConfig {
    /// Seconds between proposal creation and vote opening.
    pub voting_delay: i64,
    /// Duration of the voting window in seconds.
    pub voting_period: i64,
    /// Minimum Mana required to create a proposal.
    pub proposal_threshold: u64,
    /// Minimum percentage of for_votes / total_votes required to pass.
    pub quorum_percentage: u64,
    /// Minimum percentage of total_mana_at_creation that must participate (KRN-03).
    pub participation_threshold: u64,
    pub bump: u8,
}

impl GovernanceConfig {
    /// 8 + 8 + 8 + 8 + 8 + 1 = 41 bytes (+ 8 discriminator).
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 8 + 1;
}

/// On-chain action that a proposal requests to execute.
/// Borsh-serialized; M14 dispatches execution for each variant.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum ProposalAction {
    TreasuryTransfer { receiver: Pubkey, amount: u64 },
    TreasuryApproveScholarship { lab_id: u32, member: Pubkey },
    ValocracySetValor { valor_id: u64, rarity: u64, secondary_rarity: u64, track_id: u64, metadata: String },
    ValocracySetGuardianTracks { guardian: Pubkey, track_ids: Vec<u64> },
    ValocracyUpdatePrimary { account: Pubkey, new_track_id: u64, new_valor_id: u64 },
    ValocracySetCreditAuthority { authority: Pubkey, track_ids: Vec<u64> },
    ValocracyRevoke { token_id: u64 },
    ValocracyPauseCredit,
    ValocracyResumeCredit,
    /// Update governance parameters (tunable defaults).
    UpdateGovernanceConfig {
        voting_delay: i64,
        voting_period: i64,
        proposal_threshold: u64,
        quorum_percentage: u64,
        participation_threshold: u64,
    },
}

/// Per-proposal account. Seeds: `[PROPOSAL, id.to_le_bytes()]`.
#[account]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    /// Human-readable description (max 500 bytes per PRD).
    pub description: String,
    /// Clock time at proposal creation — used as snapshot time (KRN-02).
    pub creation_time: i64,
    /// Voting starts at `creation_time + voting_delay`.
    pub start_time: i64,
    /// Voting ends at `start_time + voting_period`.
    pub end_time: i64,
    pub for_votes: u64,
    pub against_votes: u64,
    pub executed: bool,
    pub action: ProposalAction,
    /// Snapshot of `total_supply × MEMBER_FLOOR` at creation time (KRN-02/03).
    pub total_mana_at_creation: u64,
    pub bump: u8,
}

impl Proposal {
    /// Conservative upper bound for Borsh-serialized Proposal (bytes).
    ///
    /// Fixed fields: 8+32+8+8+8+8+8+1+8+1 = 90
    /// Description:  4 + 500 = 504
    /// Action (max): 1 discriminant + 4 (vec len) + 32*8 (32 track_ids) + 32 = 293
    /// Total: 887 → rounded up to 900.
    pub const MAX_SIZE: usize = 900;
}
