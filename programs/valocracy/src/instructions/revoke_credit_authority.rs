//! `revoke_credit_authority` — close a CreditAuthority PDA (Governor-only).
//! Stellar parity: `valocracy.revoke_credit_authority`. Rent is returned to
//! the governor.

use anchor_lang::prelude::*;
use karn_shared::seeds::{CREDIT_AUTHORITY, VALOCRACY_CONFIG};

use crate::errors::ValocracyError;
use crate::events::CreditAuthorityRevokedEvent;
use crate::state::{Config, CreditAuthority};

#[derive(Accounts)]
#[instruction(authority_key: Pubkey)]
pub struct RevokeCreditAuthority<'info> {
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
        seeds = [CREDIT_AUTHORITY, authority_key.as_ref()],
        bump = credit_authority.bump,
    )]
    pub credit_authority: Account<'info, CreditAuthority>,
}

pub fn handler(_ctx: Context<RevokeCreditAuthority>, authority_key: Pubkey) -> Result<()> {
    emit!(CreditAuthorityRevokedEvent {
        authority: authority_key,
    });
    Ok(())
}
