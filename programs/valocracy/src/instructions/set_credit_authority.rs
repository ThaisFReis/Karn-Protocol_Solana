//! `set_credit_authority` — register or update a CreditAuthority's track
//! allowlist (Governor-only). Stellar parity: `valocracy.set_credit_authority`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{CREDIT_AUTHORITY, VALOCRACY_CONFIG};

use crate::errors::ValocracyError;
use crate::events::CreditAuthoritySetEvent;
use crate::state::{Config, CreditAuthority};

#[derive(Accounts)]
#[instruction(authority_key: Pubkey)]
pub struct SetCreditAuthority<'info> {
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
        space = 8 + CreditAuthority::SIZE,
        seeds = [CREDIT_AUTHORITY, authority_key.as_ref()],
        bump,
    )]
    pub credit_authority: Account<'info, CreditAuthority>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SetCreditAuthority>,
    authority_key: Pubkey,
    track_ids: Vec<u64>,
) -> Result<()> {
    require!(
        track_ids.len() <= CreditAuthority::MAX_TRACKS,
        ValocracyError::CreditAuthorityUnauthorized
    );

    let len = track_ids.len() as u32;
    let auth = &mut ctx.accounts.credit_authority;
    auth.authority = authority_key;
    auth.track_ids = track_ids;
    auth.bump = ctx.bumps.credit_authority;

    emit!(CreditAuthoritySetEvent {
        authority: authority_key,
        track_ids_len: len,
    });
    Ok(())
}
