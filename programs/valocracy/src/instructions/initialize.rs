//! `initialize` — singleton bootstrap.
//!
//! Stellar parity: `valocracy.initialize` (Soroban). This Solana variant only
//! creates the `Config` PDA. Genesis members and badge taxonomy are seeded by
//! follow-up calls to `set_valor` (M3) and `mint` (M4) — the per-call compute
//! budget on Solana forces this split. See PRD §3 mapping note.

use anchor_lang::prelude::*;
use karn_shared::seeds::VALOCRACY_CONFIG;

use crate::events::InitializedEvent;
use crate::state::Config;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Config::SIZE,
        seeds = [VALOCRACY_CONFIG],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    governor: Pubkey,
    treasury: Pubkey,
    signer: [u8; 32],
    member_valor_id: u64,
    leadership_valor_id: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.governor = governor;
    config.treasury = treasury;
    config.signer = signer;
    config.member_valor_id = member_valor_id;
    config.leadership_valor_id = leadership_valor_id;
    config.total_supply = 0;
    config.credit_paused = false;
    config.bump = ctx.bumps.config;

    emit!(InitializedEvent { genesis_count: 0 });
    Ok(())
}
