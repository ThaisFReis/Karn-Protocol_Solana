//! `set_guardian_tracks` — register or update a Guardian's track allowlist
//! (Governor-only). Stellar parity: `valocracy.set_guardian_tracks`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{GUARDIAN_TRACKS, VALOCRACY_CONFIG};

use crate::errors::ValocracyError;
use crate::events::GuardianTracksSetEvent;
use crate::state::{Config, GuardianTracks};

#[derive(Accounts)]
#[instruction(guardian_key: Pubkey)]
pub struct SetGuardianTracks<'info> {
    #[account(mut)]
    pub governor: Signer<'info>,

    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = governor,
        space = 8 + GuardianTracks::SIZE,
        seeds = [GUARDIAN_TRACKS, guardian_key.as_ref()],
        bump,
    )]
    pub guardian_tracks: Account<'info, GuardianTracks>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SetGuardianTracks>,
    guardian_key: Pubkey,
    track_ids: Vec<u64>,
) -> Result<()> {
    require!(
        track_ids.len() <= GuardianTracks::MAX_TRACKS,
        ValocracyError::GuardianTrackUnauthorized
    );

    let len = track_ids.len() as u32;
    let tracks = &mut ctx.accounts.guardian_tracks;
    tracks.authority = guardian_key;
    tracks.track_ids = track_ids;
    tracks.bump = ctx.bumps.guardian_tracks;

    emit!(GuardianTracksSetEvent {
        guardian: guardian_key,
        track_ids_len: len,
    });
    Ok(())
}
