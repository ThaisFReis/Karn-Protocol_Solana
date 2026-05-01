//! `mint` — Governor-only path for Leadership/Track/Governance badges.
//!
//! Stellar parity: dispatches the part of `valocracy.mint` that requires
//! `minter == governor`. Community badges (60..=69) need a member-as-minter
//! check that requires the minter's `UserStats` account, which can't be
//! resolved with a single Anchor `Accounts` shape — those go through
//! `mint_community` (see ADR-0004).
//!
//! Genesis bootstrap: `mint(governor → genesis_member, leadership_valor_id)`
//! is the path that satisfies the `total_supply == genesis_count` PRD M3
//! criterion (re-mapped here per ADR-0003).
//!
//! Treasury CPI (M11): if the caller passes exactly 3 `remaining_accounts`
//! in order [treasury_program, treasury_state, user_shares], the instruction
//! performs a CPI to `treasury.deposit(receiver, effective_rarity)` signed
//! by the Valocracy Config PDA. This keeps the M4 test suite intact — those
//! tests pass no remaining accounts and the CPI is silently skipped.

use anchor_lang::prelude::*;
use karn_shared::constants::VACANCY_PERIOD;
use karn_shared::seeds::{TOKEN_OWNER, TOKEN_VALOR, USER_STATS, VALOCRACY_CONFIG, VALOR};

use crate::errors::ValocracyError;
use crate::events::MintEvent;
use crate::helpers::{effective_rarity, get_badge_category, BadgeCategory};
use crate::state::{Config, TokenOwner, TokenValorId, UserStats, Valor};

#[derive(Accounts)]
#[instruction(valor_id: u64, token_id: u64)]
pub struct Mint<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    /// CHECK: only used to derive `recipient_stats`/`token_owner` PDAs and
    /// recorded as the badge owner. Never deserialized as a typed account.
    pub recipient: AccountInfo<'info>,

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
        init_if_needed,
        payer = minter,
        space = 8 + UserStats::SIZE,
        seeds = [USER_STATS, recipient.key().as_ref()],
        bump,
    )]
    pub recipient_stats: Account<'info, UserStats>,

    #[account(
        init,
        payer = minter,
        space = 8 + TokenOwner::SIZE,
        seeds = [TOKEN_OWNER, &token_id.to_le_bytes()],
        bump,
    )]
    pub token_owner: Account<'info, TokenOwner>,

    #[account(
        init,
        payer = minter,
        space = 8 + TokenValorId::SIZE,
        seeds = [TOKEN_VALOR, &token_id.to_le_bytes()],
        bump,
    )]
    pub token_valor: Account<'info, TokenValorId>,

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, Mint<'info>>, valor_id: u64, token_id: u64) -> Result<()> {
    let category = get_badge_category(valor_id)?;

    // Block categories not handled by this path.
    match category {
        BadgeCategory::Member | BadgeCategory::Founder => {
            return Err(error!(ValocracyError::BadgeNotMintable));
        }
        BadgeCategory::Community => {
            // Community badges have a different auth flow (member-as-minter),
            // routed through `mint_community`.
            return Err(error!(ValocracyError::MintNotAuthorized));
        }
        BadgeCategory::Leadership | BadgeCategory::Track | BadgeCategory::Governance => {
            require_keys_eq!(
                ctx.accounts.minter.key(),
                ctx.accounts.config.governor,
                ValocracyError::MintNotAuthorized
            );
        }
    }

    let effective = apply_mint(
        &mut ctx.accounts.config,
        &ctx.accounts.valor,
        &mut ctx.accounts.recipient_stats,
        &mut ctx.accounts.token_owner,
        &mut ctx.accounts.token_valor,
        ctx.accounts.recipient.key(),
        valor_id,
        token_id,
        ctx.bumps.recipient_stats,
        ctx.bumps.token_owner,
        ctx.bumps.token_valor,
    )?;

    // Treasury CPI — only executed when 3 remaining accounts are supplied:
    //   [0] treasury program
    //   [1] treasury state PDA  (writable)
    //   [2] user_shares PDA     (writable, init_if_needed)
    if ctx.remaining_accounts.len() >= 3 {
        let treasury_program = &ctx.remaining_accounts[0];
        let treasury_state = &ctx.remaining_accounts[1];
        let user_shares = &ctx.remaining_accounts[2];

        let config_bump = ctx.accounts.config.bump;
        let seeds: &[&[u8]] = &[VALOCRACY_CONFIG, &[config_bump]];
        let signer_seeds = &[seeds];

        treasury::cpi::deposit(
            CpiContext::new_with_signer(
                treasury_program.to_account_info(),
                treasury::cpi::accounts::Deposit {
                    valocracy_authority: ctx.accounts.config.to_account_info(),
                    state: treasury_state.to_account_info(),
                    receiver: ctx.accounts.recipient.to_account_info(),
                    user_shares: user_shares.to_account_info(),
                    payer: ctx.accounts.minter.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            ),
            effective,
        )?;
    }

    Ok(())
}

/// Shared mint side-effects used by `mint`, `guardian_mint`, and `self_register`.
/// Caller is responsible for category-specific authorization checks before invoking.
/// Returns the effective rarity applied (for upstream CPI use).
#[allow(clippy::too_many_arguments)]
pub(crate) fn apply_mint(
    config: &mut Account<Config>,
    valor: &Account<Valor>,
    recipient_stats: &mut Account<UserStats>,
    token_owner: &mut Account<TokenOwner>,
    token_valor: &mut Account<TokenValorId>,
    recipient_key: Pubkey,
    valor_id: u64,
    token_id: u64,
    recipient_stats_bump: u8,
    token_owner_bump: u8,
    token_valor_bump: u8,
) -> Result<u64> {
    require!(
        token_id == config.total_supply.saturating_add(1),
        ValocracyError::InvalidTokenId
    );

    let effective = effective_rarity(recipient_stats.primary_track_id, valor);

    let now = Clock::get()?.unix_timestamp;

    // `init_if_needed` leaves a brand-new UserStats with zeroed fields and a
    // garbage `bump` (0). Set the bump on first use so future seeds checks
    // line up with the canonical bump.
    if recipient_stats.bump == 0 {
        recipient_stats.bump = recipient_stats_bump;
    }
    recipient_stats.credential_level = recipient_stats.credential_level.saturating_add(effective);
    recipient_stats.credential_expiry = now + VACANCY_PERIOD;

    token_owner.owner = recipient_key;
    token_owner.bump = token_owner_bump;
    token_valor.valor_id = valor_id;
    token_valor.bump = token_valor_bump;

    config.total_supply = token_id;

    emit!(MintEvent {
        to: recipient_key,
        token_id,
        valor_id,
        level: recipient_stats.credential_level,
    });

    Ok(effective)
}
