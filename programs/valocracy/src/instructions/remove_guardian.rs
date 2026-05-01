//! `remove_guardian` — close a Guardian's track allowlist (Governor-only).
//! Stellar parity: `valocracy.remove_guardian`. Solana version closes the PDA
//! and returns the rent to the governor.

use anchor_lang::prelude::*;
use karn_shared::seeds::{GUARDIAN_TRACKS, VALOCRACY_CONFIG};

use crate::errors::ValocracyError;
use crate::events::GuardianRemovedEvent;
use crate::state::{Config, GuardianTracks};

#[derive(Accounts)]
#[instruction(guardian_key: Pubkey)]
pub struct RemoveGuardian<'info> {
    #[account(mut)]
    pub governor: Signer<'info>,

    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        close = governor,
        seeds = [GUARDIAN_TRACKS, guardian_key.as_ref()],
        bump = guardian_tracks.bump,
    )]
    pub guardian_tracks: Account<'info, GuardianTracks>,
}

pub fn handler(_ctx: Context<RemoveGuardian>, guardian_key: Pubkey) -> Result<()> {
    emit!(GuardianRemovedEvent {
        guardian: guardian_key,
    });
    Ok(())
}
