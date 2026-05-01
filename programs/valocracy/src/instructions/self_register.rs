//! `self_register` — onboarding via backend ed25519 signature.
//!
//! Stellar parity: `valocracy.self_register`. Solana adds two divergences:
//!
//! 1. **Native Ed25519 precompile** — the user submits a tx with two
//!    instructions: first the `Ed25519SigVerify` precompile (validates the
//!    signature itself), then `self_register`. This instruction reads the
//!    Instructions sysvar to **inspect** the precompile's data and confirm
//!    the precompile signed exactly the message we expect against the
//!    `Config.signer` key. The signature math is offloaded to the precompile;
//!    we only verify the precompile ran with the right inputs.
//!
//! 2. **`track_id` in the signed payload (D3-A)** — Stellar's payload is
//!    `caller || nonce || expiry`. Solana adds `track_id` so the user's
//!    primary domain is bound by the backend signature instead of being a
//!    follow-up `update_primary` call.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    self as ix_sysvar, load_instruction_at_checked,
};

/// Solana's Ed25519 signature-verify precompile. Hardcoded here because the
/// `solana_program::ed25519_program` module path is not stable across all
/// versions of `anchor-lang` re-exports.
const ED25519_PROGRAM_ID: Pubkey =
    anchor_lang::pubkey!("Ed25519SigVerify111111111111111111111111111");
use karn_shared::payload::{build_self_register_payload, SELF_REGISTER_PAYLOAD_SIZE};
use karn_shared::seeds::{
    TOKEN_OWNER, TOKEN_VALOR, USED_NONCE, USER_STATS, VALOCRACY_CONFIG, VALOR,
};

use crate::errors::ValocracyError;
use crate::instructions::mint::apply_mint;
use crate::state::{Config, TokenOwner, TokenValorId, UsedNonce, UserStats, Valor};

/// Offsets inside the Ed25519 precompile instruction data, per the Solana
/// docs. We re-validate them rather than trusting them blindly.
const SIG_IX_NUM_SIG: usize = 0;
const SIG_IX_PUBKEY_OFFSET_LO: usize = 6;
const SIG_IX_PUBKEY_OFFSET_HI: usize = 7;
const SIG_IX_MSG_OFFSET_LO: usize = 10;
const SIG_IX_MSG_OFFSET_HI: usize = 11;
const SIG_IX_MSG_SIZE_LO: usize = 12;
const SIG_IX_MSG_SIZE_HI: usize = 13;
const SIG_IX_HEADER_LEN: usize = 16;

#[derive(Accounts)]
#[instruction(track_id: u64, nonce: u64, expiry: i64, token_id: u64)]
pub struct SelfRegister<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [VALOCRACY_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [VALOR, &config.member_valor_id.to_le_bytes()],
        bump = member_valor.bump,
    )]
    pub member_valor: Account<'info, Valor>,

    /// Anti-replay: `init` will fail if this `(caller, nonce)` pair has been
    /// consumed before — naturally enforces single-use semantics.
    #[account(
        init,
        payer = caller,
        space = 8 + UsedNonce::SIZE,
        seeds = [USED_NONCE, caller.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub used_nonce: Account<'info, UsedNonce>,

    #[account(
        init,
        payer = caller,
        space = 8 + UserStats::SIZE,
        seeds = [USER_STATS, caller.key().as_ref()],
        bump,
    )]
    pub caller_stats: Account<'info, UserStats>,

    #[account(
        init,
        payer = caller,
        space = 8 + TokenOwner::SIZE,
        seeds = [TOKEN_OWNER, &token_id.to_le_bytes()],
        bump,
    )]
    pub token_owner: Account<'info, TokenOwner>,

    #[account(
        init,
        payer = caller,
        space = 8 + TokenValorId::SIZE,
        seeds = [TOKEN_VALOR, &token_id.to_le_bytes()],
        bump,
    )]
    pub token_valor: Account<'info, TokenValorId>,

    /// CHECK: address-pinned to the canonical Instructions sysvar; we read it
    /// (never write) to introspect the Ed25519 precompile invocation.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SelfRegister>,
    track_id: u64,
    nonce: u64,
    expiry: i64,
    token_id: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(expiry > now, ValocracyError::SignatureExpired);

    verify_ed25519_precompile(
        &ctx.accounts.instructions_sysvar,
        &ctx.accounts.config.signer,
        &ctx.accounts.caller.key(),
        nonce,
        expiry,
        track_id,
    )?;

    // Persist replay marker (rest is just struct field).
    ctx.accounts.used_nonce.bump = ctx.bumps.used_nonce;

    // Set primary track BEFORE apply_mint so effective_rarity sees it.
    // Member badge has track_id == 0 in practice, so this doesn't change the
    // computed rarity for the bootstrap case — but it's the right invariant
    // for any future variant.
    ctx.accounts.caller_stats.primary_track_id = Some(track_id);

    let member_valor_id = ctx.accounts.config.member_valor_id;
    apply_mint(
        &mut ctx.accounts.config,
        &ctx.accounts.member_valor,
        &mut ctx.accounts.caller_stats,
        &mut ctx.accounts.token_owner,
        &mut ctx.accounts.token_valor,
        ctx.accounts.caller.key(),
        member_valor_id,
        token_id,
        ctx.bumps.caller_stats,
        ctx.bumps.token_owner,
        ctx.bumps.token_valor,
    )?;
    Ok(())
}

/// Walk the Instructions sysvar looking for an `Ed25519SigVerify` precompile
/// invocation that signed exactly the payload we expect, with the
/// `Config.signer` pubkey. Anchor sysvar helpers don't expose iteration
/// directly; we scan from index 0 and stop at the first match (or hit the end
/// of the tx and fail).
///
/// Picking by content (instead of trusting a client-provided index) means an
/// attacker can't point us at an unrelated precompile call from the same tx.
fn verify_ed25519_precompile(
    sysvar: &AccountInfo<'_>,
    expected_signer: &[u8; 32],
    caller: &Pubkey,
    nonce: u64,
    expiry: i64,
    track_id: u64,
) -> Result<()> {
    let expected_msg = build_self_register_payload(caller, nonce, expiry, track_id);

    let mut idx: usize = 0;
    while let Ok(ix) = load_instruction_at_checked(idx, sysvar) {
        if ix.program_id == ED25519_PROGRAM_ID
            && ix_payload_matches(&ix.data, expected_signer, &expected_msg)
        {
            return Ok(());
        }
        idx = idx
            .checked_add(1)
            .ok_or(error!(ValocracyError::InvalidSignature))?;
    }

    Err(error!(ValocracyError::InvalidSignature))
}

/// Inspect a single Ed25519 precompile data blob and confirm:
/// - exactly one signature in this precompile call,
/// - the embedded public key equals `expected_signer`,
/// - the embedded message equals `expected_msg`.
///
/// This **does not** re-verify the signature math. The precompile already
/// did that — if it ran in the tx, the signature is valid for those bytes.
/// We only confirm the inputs.
fn ix_payload_matches(data: &[u8], expected_signer: &[u8; 32], expected_msg: &[u8]) -> bool {
    if data.len() < SIG_IX_HEADER_LEN {
        return false;
    }
    if data[SIG_IX_NUM_SIG] != 1 {
        return false;
    }

    let pubkey_offset =
        u16::from_le_bytes([data[SIG_IX_PUBKEY_OFFSET_LO], data[SIG_IX_PUBKEY_OFFSET_HI]]) as usize;
    let msg_offset =
        u16::from_le_bytes([data[SIG_IX_MSG_OFFSET_LO], data[SIG_IX_MSG_OFFSET_HI]]) as usize;
    let msg_size =
        u16::from_le_bytes([data[SIG_IX_MSG_SIZE_LO], data[SIG_IX_MSG_SIZE_HI]]) as usize;

    if msg_size != SELF_REGISTER_PAYLOAD_SIZE {
        return false;
    }
    if data.len() < pubkey_offset + 32 {
        return false;
    }
    if data.len() < msg_offset + msg_size {
        return false;
    }

    let pubkey_in_ix = &data[pubkey_offset..pubkey_offset + 32];
    if pubkey_in_ix != expected_signer {
        return false;
    }

    let msg_in_ix = &data[msg_offset..msg_offset + msg_size];
    msg_in_ix == expected_msg
}
