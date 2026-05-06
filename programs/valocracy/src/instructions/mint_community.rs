//! `mint_community` — member-authorized path for Community badges.
//!
//! Community badges (`valor_id ∈ 60..=69`) require the minter to already be a
//! registered member with `credential_level > 0`. The rest of the mint side
//! effects reuse the shared `apply_mint` helper from `mint.rs`.

use anchor_lang::prelude::*;
use karn_shared::seeds::{TOKEN_OWNER, TOKEN_VALOR, USER_STATS, VALOCRACY_CONFIG, VALOR};

use crate::errors::ValocracyError;
use crate::helpers::{get_badge_category, BadgeCategory};
use crate::instructions::mint::apply_mint;
use crate::state::{Config, TokenOwner, TokenValorId, UserStats, Valor};

#[derive(Accounts)]
#[instruction(valor_id: u64, token_id: u64)]
pub struct MintCommunity<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    /// CHECK: PDA is address-checked via seeds. The account may be absent for
    /// non-members, so the handler deserializes manually to return the
    /// protocol-level `MintNotAuthorized` error instead of Anchor's generic
    /// `AccountNotInitialized`.
    #[account(
        seeds = [USER_STATS, minter.key().as_ref()],
        bump,
    )]
    pub minter_stats: UncheckedAccount<'info>,

    /// CHECK: only used for PDA derivation and badge ownership recording.
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

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, MintCommunity<'info>>,
    valor_id: u64,
    token_id: u64,
) -> Result<()> {
    let category = get_badge_category(valor_id)?;
    require!(
        category == BadgeCategory::Community,
        ValocracyError::BadgeNotMintable
    );

    let minter_stats = load_member_stats(&ctx.accounts.minter_stats)?;
    require!(minter_stats.credential_level > 0, ValocracyError::MintNotAuthorized);

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

fn load_member_stats(account: &UncheckedAccount<'_>) -> Result<UserStats> {
    if account.owner != &crate::ID {
        return Err(error!(ValocracyError::MintNotAuthorized));
    }

    let data = account.try_borrow_data()?;
    if data.is_empty() {
        return Err(error!(ValocracyError::MintNotAuthorized));
    }

    let mut bytes: &[u8] = &data;
    UserStats::try_deserialize(&mut bytes).map_err(|_| error!(ValocracyError::MintNotAuthorized))
}
