//! Valocracy — identity, soulbound badges, Mana.
//!
//! See `~/Documentos/Workspace/Karn Protocol/contracts/valocracy/src/lib.rs`
//! for the canonical Stellar reference implementation.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod helpers;
pub mod instructions;
pub mod state;

pub use errors::ValocracyError;
pub use instructions::*;

declare_id!("6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf");

#[program]
pub mod valocracy {
    use super::*;

    /// Bootstrap the protocol: create the singleton `Config` PDA.
    pub fn initialize(
        ctx: Context<Initialize>,
        governor: Pubkey,
        treasury: Pubkey,
        signer: [u8; 32],
        member_valor_id: u64,
        leadership_valor_id: u64,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            governor,
            treasury,
            signer,
            member_valor_id,
            leadership_valor_id,
        )
    }

    /// Create or update a badge definition (Governor-only).
    pub fn set_valor(
        ctx: Context<SetValor>,
        valor_id: u64,
        rarity: u64,
        secondary_rarity: u64,
        track_id: u64,
        metadata: String,
    ) -> Result<()> {
        instructions::set_valor::handler(
            ctx,
            valor_id,
            rarity,
            secondary_rarity,
            track_id,
            metadata,
        )
    }

    /// Mint a Leadership/Track/Governance badge (Governor-only).
    pub fn mint<'info>(ctx: Context<'_, '_, '_, 'info, Mint<'info>>, valor_id: u64, token_id: u64) -> Result<()> {
        instructions::mint::handler(ctx, valor_id, token_id)
    }

    /// Mint a Track badge via a domain-scoped Guardian. KRN-05 dual-auth +
    /// `guardian != account` enforced (CONFIG.md Rule 5).
    pub fn guardian_mint(ctx: Context<GuardianMint>, valor_id: u64, token_id: u64) -> Result<()> {
        instructions::guardian_mint::handler(ctx, valor_id, token_id)
    }

    /// Register or update a Guardian's allowlist of `track_id`s (Governor-only).
    pub fn set_guardian_tracks(
        ctx: Context<SetGuardianTracks>,
        guardian_key: Pubkey,
        track_ids: Vec<u64>,
    ) -> Result<()> {
        instructions::set_guardian_tracks::handler(ctx, guardian_key, track_ids)
    }

    /// Revoke all Guardian track authorizations (Governor-only).
    pub fn remove_guardian(ctx: Context<RemoveGuardian>, guardian_key: Pubkey) -> Result<()> {
        instructions::remove_guardian::handler(ctx, guardian_key)
    }

    /// Self-register as a member via a backend ed25519 signature. Requires a
    /// preceding `Ed25519SigVerify` precompile instruction in the same tx.
    pub fn self_register(
        ctx: Context<SelfRegister>,
        track_id: u64,
        nonce: u64,
        expiry: i64,
        token_id: u64,
    ) -> Result<()> {
        instructions::self_register::handler(ctx, track_id, nonce, expiry, token_id)
    }

    /// Credit activity points to a registered member (CreditAuthority-only).
    /// Enforces pause check, track auth, and 30-day rolling cap (ACTIVITY_CREDIT_CAP).
    pub fn credit_activity(
        ctx: Context<CreditActivity>,
        account: Pubkey,
        track_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::credit_activity::handler(ctx, account, track_id, amount)
    }

    /// Register or update a CreditAuthority's track allowlist (Governor-only).
    pub fn set_credit_authority(
        ctx: Context<SetCreditAuthority>,
        authority_key: Pubkey,
        track_ids: Vec<u64>,
    ) -> Result<()> {
        instructions::set_credit_authority::handler(ctx, authority_key, track_ids)
    }

    /// Revoke all CreditAuthority track authorizations and close PDA (Governor-only).
    pub fn revoke_credit_authority(
        ctx: Context<RevokeCreditAuthority>,
        authority_key: Pubkey,
    ) -> Result<()> {
        instructions::revoke_credit_authority::handler(ctx, authority_key)
    }

    /// Pause all `credit_activity` calls globally — circuit breaker (Governor-only).
    pub fn pause_credit(ctx: Context<PauseCredit>) -> Result<()> {
        instructions::pause_credit::handler(ctx)
    }

    /// Resume `credit_activity` after a pause (Governor-only).
    pub fn resume_credit(ctx: Context<ResumeCredit>) -> Result<()> {
        instructions::resume_credit::handler(ctx)
    }

    /// Revoke a badge by token_id (Governor-only). Closes token PDAs and
    /// decrements credential_level by effective_rarity.
    pub fn revoke(ctx: Context<Revoke>, token_id: u64) -> Result<()> {
        instructions::revoke::handler(ctx, token_id)
    }

    /// Set or clear the KYC verified flag for a member (Governor-only).
    pub fn set_verified(
        ctx: Context<SetVerified>,
        member: Pubkey,
        verified: bool,
    ) -> Result<()> {
        instructions::set_verified::handler(ctx, member, verified)
    }

    /// Set the primary track and valor for `account` (Governor-only).
    /// Affects `effective_rarity` on all subsequent mints for this account.
    pub fn update_primary(
        ctx: Context<UpdatePrimary>,
        account: Pubkey,
        new_track_id: u64,
        new_valor_id: u64,
    ) -> Result<()> {
        instructions::update_primary::handler(ctx, account, new_track_id, new_valor_id)
    }

    /// Current Mana for `account`. Returns 0 for unregistered accounts.
    /// Invoke via `.view()` — this is a read-only simulation, not a state mutation.
    pub fn get_votes(ctx: Context<GetVotes>, account: Pubkey) -> Result<u64> {
        instructions::get_votes::handler(ctx, account)
    }

    /// Mana for `account` at a historical `timestamp` (KRN-02 snapshot).
    /// Invoke via `.view()`.
    pub fn get_votes_at(ctx: Context<GetVotesAt>, account: Pubkey, timestamp: i64) -> Result<u64> {
        instructions::get_votes_at::handler(ctx, account, timestamp)
    }
}
