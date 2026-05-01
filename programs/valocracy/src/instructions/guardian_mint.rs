//! `guardian_mint` — domain-scoped Guardian mints a Track badge to an account.
//!
//! Stellar parity: `valocracy.guardian_mint`. Solana adds an explicit
//! `guardian != account` check (CONFIG.md Rule 5), because the dual `Signer`
//! constraint alone (KRN-05) is satisfiable by a single wallet signing once.

use anchor_lang::prelude::*;
use karn_shared::seeds::{
    GUARDIAN_TRACKS, TOKEN_OWNER, TOKEN_VALOR, USER_STATS, VALOCRACY_CONFIG, VALOR,
};

use crate::errors::ValocracyError;
use crate::helpers::{get_badge_category, BadgeCategory};
use crate::instructions::mint::apply_mint;
use crate::state::{Config, GuardianTracks, TokenOwner, TokenValorId, UserStats, Valor};

#[derive(Accounts)]
#[instruction(valor_id: u64, token_id: u64)]
pub struct GuardianMint<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    /// KRN-05: the account being credited must consent (dual-auth).
    pub account: Signer<'info>,

    #[account(
        mut,
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [VALOR, &valor_id.to_le_bytes()],
        bump = valor.bump,
    )]
    pub valor: Account<'info, Valor>,

    #[account(
        seeds = [GUARDIAN_TRACKS, guardian.key().as_ref()],
        bump = guardian_tracks.bump,
        constraint = guardian_tracks.authority == guardian.key()
            @ ValocracyError::GuardianTrackUnauthorized,
    )]
    pub guardian_tracks: Account<'info, GuardianTracks>,

    #[account(
        init_if_needed,
        payer = guardian,
        space = 8 + UserStats::SIZE,
        seeds = [USER_STATS, account.key().as_ref()],
        bump,
    )]
    pub recipient_stats: Account<'info, UserStats>,

    #[account(
        init,
        payer = guardian,
        space = 8 + TokenOwner::SIZE,
        seeds = [TOKEN_OWNER, &token_id.to_le_bytes()],
        bump,
    )]
    pub token_owner: Account<'info, TokenOwner>,

    #[account(
        init,
        payer = guardian,
        space = 8 + TokenValorId::SIZE,
        seeds = [TOKEN_VALOR, &token_id.to_le_bytes()],
        bump,
    )]
    pub token_valor: Account<'info, TokenValorId>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<GuardianMint>, valor_id: u64, token_id: u64) -> Result<()> {
    // CONFIG.md Rule 5 + Solana KRN-05 reinforcement: a single wallet
    // satisfies both `Signer<'info>` checks if `guardian == account`. Reject.
    require_keys_neq!(
        ctx.accounts.guardian.key(),
        ctx.accounts.account.key(),
        ValocracyError::GuardianSelfMintForbidden
    );

    let valor = &ctx.accounts.valor;

    // Guardians can only mint domain-bound badges (track_id > 0).
    require!(
        valor.track_id != 0,
        ValocracyError::GuardianTrackUnauthorized
    );

    // Guardian's allowlist must include this badge's track.
    let tracks = &ctx.accounts.guardian_tracks;
    require!(
        tracks.track_ids.iter().any(|t| *t == valor.track_id),
        ValocracyError::GuardianTrackUnauthorized
    );

    // Defensive: only Track-category badges flow through guardian_mint.
    let category = get_badge_category(valor_id)?;
    require!(
        matches!(category, BadgeCategory::Track),
        ValocracyError::BadgeNotMintable
    );

    apply_mint(
        &mut ctx.accounts.config,
        valor,
        &mut ctx.accounts.recipient_stats,
        &mut ctx.accounts.token_owner,
        &mut ctx.accounts.token_valor,
        ctx.accounts.account.key(),
        valor_id,
        token_id,
        ctx.bumps.recipient_stats,
        ctx.bumps.token_owner,
        ctx.bumps.token_valor,
    )?;
    Ok(())
}
