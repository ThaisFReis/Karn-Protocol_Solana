//! `revoke` — Governor-only badge revocation.
//!
//! Closes the `TokenOwner` and `TokenValorId` PDAs for the given token, then
//! decrements the owner's `credential_level` by `effective_rarity`. Rent from
//! both closed accounts is returned to the governor.
//!
//! Stellar parity: `valocracy.revoke`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{TOKEN_OWNER, TOKEN_VALOR, USER_STATS, VALOCRACY_CONFIG, VALOR};

use crate::errors::ValocracyError;
use crate::events::RevokeEvent;
use crate::helpers::effective_rarity;
use crate::state::{Config, TokenOwner, TokenValorId, UserStats, Valor};

#[derive(Accounts)]
#[instruction(token_id: u64)]
pub struct Revoke<'info> {
    #[account(mut)]
    pub governor: Signer<'info>,

    #[account(
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
        has_one = governor @ ValocracyError::NotAuthorized,
    )]
    pub config: Account<'info, Config>,

    /// Closed on revoke — rent returned to governor.
    #[account(
        mut,
        close = governor,
        seeds = [TOKEN_OWNER, &token_id.to_le_bytes()],
        bump = token_owner.bump,
    )]
    pub token_owner: Account<'info, TokenOwner>,

    /// Closed on revoke — rent returned to governor.
    #[account(
        mut,
        close = governor,
        seeds = [TOKEN_VALOR, &token_id.to_le_bytes()],
        bump = token_valor.bump,
    )]
    pub token_valor: Account<'info, TokenValorId>,

    #[account(
        seeds = [VALOR, &token_valor.valor_id.to_le_bytes()],
        bump = valor.bump,
    )]
    pub valor: Account<'info, Valor>,

    /// The token owner's stats — credential_level decremented here.
    #[account(
        mut,
        seeds = [USER_STATS, token_owner.owner.as_ref()],
        bump = user_stats.bump,
    )]
    pub user_stats: Account<'info, UserStats>,
}

pub fn handler(ctx: Context<Revoke>, token_id: u64) -> Result<()> {
    let owner = ctx.accounts.token_owner.owner;
    let valor_id = ctx.accounts.token_valor.valor_id;

    let rarity = effective_rarity(ctx.accounts.user_stats.primary_track_id, &ctx.accounts.valor);

    let stats = &mut ctx.accounts.user_stats;
    stats.credential_level = stats.credential_level.saturating_sub(rarity);

    emit!(RevokeEvent {
        owner,
        token_id,
        valor_id,
        new_level: stats.credential_level,
    });

    Ok(())
}
