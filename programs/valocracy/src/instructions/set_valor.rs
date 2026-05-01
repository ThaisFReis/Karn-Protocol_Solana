//! `set_valor` — create or update a badge definition (Governor-only).
//!
//! Stellar parity: `valocracy.set_valor`. `init_if_needed` lets a single
//! instruction handle both create and update — matches Soroban semantics where
//! `set_valor` overwrites silently.

use anchor_lang::prelude::*;
use karn_shared::seeds::{VALOCRACY_CONFIG, VALOR};

use crate::errors::ValocracyError;
use crate::events::ValorUpdateEvent;
use crate::state::{Config, Valor};

#[derive(Accounts)]
#[instruction(valor_id: u64)]
pub struct SetValor<'info> {
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
        space = 8 + Valor::SIZE,
        seeds = [VALOR, &valor_id.to_le_bytes()],
        bump,
    )]
    pub valor: Account<'info, Valor>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SetValor>,
    valor_id: u64,
    rarity: u64,
    secondary_rarity: u64,
    track_id: u64,
    metadata: String,
) -> Result<()> {
    require!(
        metadata.len() <= Valor::MAX_METADATA_LEN,
        ValocracyError::InvalidValorId
    );

    let valor = &mut ctx.accounts.valor;
    valor.rarity = rarity;
    valor.secondary_rarity = secondary_rarity;
    valor.track_id = track_id;
    valor.metadata = metadata.clone();
    valor.bump = ctx.bumps.valor;

    emit!(ValorUpdateEvent {
        valor_id,
        rarity,
        secondary_rarity,
        track_id,
        metadata,
    });

    Ok(())
}
