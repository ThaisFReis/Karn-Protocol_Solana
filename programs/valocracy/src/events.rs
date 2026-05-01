//! Valocracy events.
//!
//! Mirrors the 15 events emitted by the Stellar/Soroban implementation.
//! Soroban `#[topic]` annotations have no Solana equivalent — indexers parse
//! program logs at the field level. Field names and order are preserved.

use anchor_lang::prelude::*;

#[event]
pub struct InitializedEvent {
    pub genesis_count: u32,
}

#[event]
pub struct MintEvent {
    pub to: Pubkey,
    pub token_id: u64,
    pub valor_id: u64,
    pub level: u64,
}

#[event]
pub struct ValorUpdateEvent {
    pub valor_id: u64,
    pub rarity: u64,
    pub secondary_rarity: u64,
    pub track_id: u64,
    pub metadata: String,
}

#[event]
pub struct RevokeEvent {
    pub owner: Pubkey,
    pub token_id: u64,
    pub valor_id: u64,
    pub new_level: u64,
}

#[event]
pub struct GovernorUpdateEvent {
    pub new_governor: Pubkey,
}

#[event]
pub struct TreasuryUpdateEvent {
    pub new_treasury: Pubkey,
}

#[event]
pub struct VerificationChangedEvent {
    pub member: Pubkey,
    pub verified: bool,
}

#[event]
pub struct ContractUpgradedEvent {
    pub new_wasm_hash: [u8; 32],
}

#[event]
pub struct ActivityCreditedEvent {
    pub account: Pubkey,
    pub track_id: u64,
    pub amount: u64,
    pub effective_amount: u64,
}

#[event]
pub struct PrimaryUpdatedEvent {
    pub account: Pubkey,
    pub new_track_id: u64,
    pub new_valor_id: u64,
}

#[event]
pub struct GuardianTracksSetEvent {
    pub guardian: Pubkey,
    pub track_ids_len: u32,
}

#[event]
pub struct GuardianRemovedEvent {
    pub guardian: Pubkey,
}

#[event]
pub struct CreditAuthoritySetEvent {
    pub authority: Pubkey,
    pub track_ids_len: u32,
}

#[event]
pub struct CreditAuthorityRevokedEvent {
    pub authority: Pubkey,
}

#[event]
pub struct CreditStatusEvent {
    pub paused: bool,
}
