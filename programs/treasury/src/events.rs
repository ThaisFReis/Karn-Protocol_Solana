//! Treasury events. Mirrors the 7 events emitted by the Stellar implementation.

use anchor_lang::prelude::*;

#[event]
pub struct TreasuryGovernorUpdate {
    pub new_governor: Pubkey,
}

#[event]
pub struct Deposit {
    pub receiver: Pubkey,
    pub shares: i128,
}

#[event]
pub struct Transfer {
    pub receiver: Pubkey,
    pub amount: i128,
}

#[event]
pub struct LabFunded {
    pub lab_id: u32,
    pub funder: Pubkey,
    pub total_amount: i128,
}

#[event]
pub struct ScholarshipReleased {
    pub lab_id: u32,
    pub member: Pubkey,
    pub amount: i128,
}

#[event]
pub struct ScholarshipWithdrawn {
    pub member: Pubkey,
    pub amount: i128,
}

#[event]
pub struct TreasuryContractUpgraded {
    pub new_wasm_hash: [u8; 32],
}
