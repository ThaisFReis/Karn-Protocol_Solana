//! `execute` — dispatch a succeeded proposal's action via CPI (DT-05).
//!
//! Stellar parity: `governor.execute`. The Governor Config PDA signs all CPIs
//! via `seeds = [GOVERNOR_CONFIG, &[bump]]` (DT-05). Reentrancy guard on
//! `GovernorConfigPda.locked` (DT-06).
//!
//! # Remaining-accounts layout (per ProposalAction variant)
//!
//! `TreasuryTransfer`:
//!   [0] treasury program  [1] TreasuryState PDA (mut)
//!   [2] vault ATA (mut)   [3] receiver ATA (mut)   [4] token program
//!
//! `TreasuryApproveScholarship`:
//!   [0] treasury program  [1] TreasuryState PDA
//!   [2] Lab PDA           [3] member account
//!   [4] Claimable PDA (mut)  [5] system_program
//!
//! `TreasuryUpdateGovernor`:
//!   [0] treasury program  [1] TreasuryState PDA (mut)
//!
//! `ValocracySetValor`:
//!   [0] valocracy program  [1] valocracy Config PDA
//!   [2] Valor PDA (mut)    [3] system_program
//!
//! `ValocracySetGuardianTracks`:
//!   [0] valocracy program  [1] valocracy Config PDA
//!   [2] GuardianTracks PDA (mut)  [3] system_program
//!
//! `ValocracyUpdatePrimary`:
//!   [0] valocracy program  [1] valocracy Config PDA  [2] UserStats PDA (mut)
//!
//! `ValocracySetCreditAuthority`:
//!   [0] valocracy program  [1] valocracy Config PDA
//!   [2] CreditAuthority PDA (mut)  [3] system_program
//!
//! `ValocracyRevoke`:
//!   [0] valocracy program  [1] valocracy Config PDA
//!   [2] TokenOwner PDA (mut, close)  [3] TokenValorId PDA (mut, close)
//!   [4] Valor PDA  [5] UserStats PDA (mut)
//!
//! `ValocracyPauseCredit` / `ValocracyResumeCredit`:
//!   [0] valocracy program  [1] valocracy Config PDA (mut)
//!
//! `ValocracyUpdateGovernor` / `ValocracyUpdateTreasury`:
//!   [0] valocracy program  [1] valocracy Config PDA (mut)
//!
//! `UpdateGovernanceConfig`:
//!   no remaining accounts — updates GovernanceConfig PDA directly.

use anchor_lang::prelude::*;
use karn_shared::seeds::{GOVERNOR_CONFIG, GOVERNOR_PARAMS, PROPOSAL};

use crate::errors::GovernorError;
use crate::events::ProposalExecuted;
use crate::state::{proposal_state, GovernanceConfig, GovernorConfigPda, Proposal, ProposalAction, ProposalState};

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct Execute<'info> {
    /// Anyone can trigger execution of a passed proposal.
    #[account(mut)]
    pub executor: Signer<'info>,

    /// Governor Config PDA — reentrancy lock + PDA signer for CPIs (DT-05/DT-06).
    #[account(
        mut,
        seeds = [GOVERNOR_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, GovernorConfigPda>,

    /// Governance parameters — updated in place for UpdateGovernanceConfig action.
    #[account(
        mut,
        seeds = [GOVERNOR_PARAMS],
        bump = params.bump,
    )]
    pub params: Account<'info, GovernanceConfig>,

    #[account(
        mut,
        seeds = [PROPOSAL, &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Execute<'info>>,
    proposal_id: u64,
) -> Result<()> {
    require!(!ctx.accounts.config.locked, GovernorError::ReentrancyDetected);
    require!(!ctx.accounts.proposal.executed, GovernorError::ProposalAlreadyExecuted);

    let now = Clock::get()?.unix_timestamp;
    let state = proposal_state(&ctx.accounts.proposal, now);
    require!(state == ProposalState::Succeeded, GovernorError::ProposalNotSucceeded);

    // Clone action and capture bump before any mutable borrows.
    let action = ctx.accounts.proposal.action.clone();
    let bump = ctx.accounts.config.bump;
    let gov_pda = ctx.accounts.config.to_account_info();

    // Set reentrancy lock and mark executed.
    ctx.accounts.config.locked = true;
    ctx.accounts.proposal.executed = true;

    let seeds: &[&[u8]] = &[GOVERNOR_CONFIG, &[bump]];
    let signer = &[seeds];
    let ra = ctx.remaining_accounts;

    match action {
        // ── Treasury ─────────────────────────────────────────────────────────

        ProposalAction::TreasuryTransfer { receiver: _, amount } => {
            // [0] treasury_program  [1] state  [2] vault_ata  [3] receiver_ata  [4] token_program
            require!(ra.len() >= 5, GovernorError::InvalidProposalState);
            treasury::cpi::transfer(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    treasury::cpi::accounts::Transfer {
                        governor: gov_pda,
                        state: ra[1].to_account_info(),
                        vault_ata: ra[2].to_account_info(),
                        receiver_ata: ra[3].to_account_info(),
                        token_program: ra[4].to_account_info(),
                    },
                    signer,
                ),
                amount,
            )?;
        }

        ProposalAction::TreasuryApproveScholarship { lab_id, member: _ } => {
            // [0] treasury_program  [1] state  [2] lab  [3] member  [4] claimable  [5] system_program
            require!(ra.len() >= 6, GovernorError::InvalidProposalState);
            treasury::cpi::approve_scholarship(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    treasury::cpi::accounts::ApproveScholarship {
                        governor: gov_pda,
                        state: ra[1].to_account_info(),
                        lab: ra[2].to_account_info(),
                        member: ra[3].to_account_info(),
                        claimable: ra[4].to_account_info(),
                        system_program: ra[5].to_account_info(),
                    },
                    signer,
                ),
                lab_id,
            )?;
        }

        ProposalAction::TreasuryUpdateGovernor { new_governor } => {
            // [0] treasury_program  [1] state
            require!(ra.len() >= 2, GovernorError::InvalidProposalState);
            treasury::cpi::update_governor(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    treasury::cpi::accounts::UpdateGovernor {
                        governor: gov_pda.clone(),
                        state: ra[1].to_account_info(),
                    },
                    signer,
                ),
                new_governor,
            )?;
        }

        // ── Valocracy ────────────────────────────────────────────────────────

        ProposalAction::ValocracySetValor {
            valor_id,
            rarity,
            secondary_rarity,
            track_id,
            metadata,
        } => {
            // [0] valocracy_program  [1] valocracy_config  [2] valor  [3] system_program
            require!(ra.len() >= 4, GovernorError::InvalidProposalState);
            valocracy::cpi::set_valor(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::SetValor {
                        governor: gov_pda,
                        config: ra[1].to_account_info(),
                        valor: ra[2].to_account_info(),
                        system_program: ra[3].to_account_info(),
                    },
                    signer,
                ),
                valor_id,
                rarity,
                secondary_rarity,
                track_id,
                metadata,
            )?;
        }

        ProposalAction::ValocracySetGuardianTracks { guardian, track_ids } => {
            // [0] valocracy_program  [1] valocracy_config  [2] guardian_tracks  [3] system_program
            require!(ra.len() >= 4, GovernorError::InvalidProposalState);
            valocracy::cpi::set_guardian_tracks(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::SetGuardianTracks {
                        governor: gov_pda,
                        config: ra[1].to_account_info(),
                        guardian_tracks: ra[2].to_account_info(),
                        system_program: ra[3].to_account_info(),
                    },
                    signer,
                ),
                guardian,
                track_ids,
            )?;
        }

        ProposalAction::ValocracyUpdateGovernor { new_governor } => {
            // [0] valocracy_program  [1] valocracy_config
            require!(ra.len() >= 2, GovernorError::InvalidProposalState);
            valocracy::cpi::update_governor(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::UpdateGovernor {
                        governor: gov_pda.clone(),
                        config: ra[1].to_account_info(),
                    },
                    signer,
                ),
                new_governor,
            )?;
        }

        ProposalAction::ValocracyUpdateTreasury { new_treasury } => {
            // [0] valocracy_program  [1] valocracy_config
            require!(ra.len() >= 2, GovernorError::InvalidProposalState);
            valocracy::cpi::update_treasury(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::UpdateTreasury {
                        governor: gov_pda.clone(),
                        config: ra[1].to_account_info(),
                    },
                    signer,
                ),
                new_treasury,
            )?;
        }

        ProposalAction::ValocracyUpdatePrimary {
            account,
            new_track_id,
            new_valor_id,
        } => {
            // [0] valocracy_program  [1] valocracy_config  [2] user_stats
            require!(ra.len() >= 3, GovernorError::InvalidProposalState);
            valocracy::cpi::update_primary(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::UpdatePrimary {
                        governor: gov_pda,
                        config: ra[1].to_account_info(),
                        user_stats: ra[2].to_account_info(),
                    },
                    signer,
                ),
                account,
                new_track_id,
                new_valor_id,
            )?;
        }

        ProposalAction::ValocracySetCreditAuthority { authority, track_ids } => {
            // [0] valocracy_program  [1] valocracy_config  [2] credit_authority  [3] system_program
            require!(ra.len() >= 4, GovernorError::InvalidProposalState);
            valocracy::cpi::set_credit_authority(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::SetCreditAuthority {
                        governor: gov_pda,
                        config: ra[1].to_account_info(),
                        credit_authority: ra[2].to_account_info(),
                        system_program: ra[3].to_account_info(),
                    },
                    signer,
                ),
                authority,
                track_ids,
            )?;
        }

        ProposalAction::ValocracyRevoke { token_id } => {
            // [0] valocracy_program  [1] valocracy_config  [2] token_owner
            // [3] token_valor  [4] valor  [5] user_stats
            require!(ra.len() >= 6, GovernorError::InvalidProposalState);
            valocracy::cpi::revoke(
                CpiContext::new_with_signer(
                    ra[0].to_account_info(),
                    valocracy::cpi::accounts::Revoke {
                        governor: gov_pda,
                        config: ra[1].to_account_info(),
                        token_owner: ra[2].to_account_info(),
                        token_valor: ra[3].to_account_info(),
                        valor: ra[4].to_account_info(),
                        user_stats: ra[5].to_account_info(),
                    },
                    signer,
                ),
                token_id,
            )?;
        }

        ProposalAction::ValocracyPauseCredit => {
            // [0] valocracy_program  [1] valocracy_config (mut)
            require!(ra.len() >= 2, GovernorError::InvalidProposalState);
            valocracy::cpi::pause_credit(CpiContext::new_with_signer(
                ra[0].to_account_info(),
                valocracy::cpi::accounts::PauseCredit {
                    governor: gov_pda,
                    config: ra[1].to_account_info(),
                },
                signer,
            ))?;
        }

        ProposalAction::ValocracyResumeCredit => {
            // [0] valocracy_program  [1] valocracy_config (mut)
            require!(ra.len() >= 2, GovernorError::InvalidProposalState);
            valocracy::cpi::resume_credit(CpiContext::new_with_signer(
                ra[0].to_account_info(),
                valocracy::cpi::accounts::ResumeCredit {
                    governor: gov_pda,
                    config: ra[1].to_account_info(),
                },
                signer,
            ))?;
        }

        // ── Governance self-update ───────────────────────────────────────────

        ProposalAction::UpdateGovernanceConfig {
            voting_delay,
            voting_period,
            proposal_threshold,
            quorum_percentage,
            participation_threshold,
        } => {
            // No CPI needed — update the GovernanceConfig PDA directly.
            let params = &mut ctx.accounts.params;
            params.voting_delay = voting_delay;
            params.voting_period = voting_period;
            params.proposal_threshold = proposal_threshold;
            params.quorum_percentage = quorum_percentage;
            params.participation_threshold = participation_threshold;
        }
    }

    ctx.accounts.config.locked = false;

    emit!(ProposalExecuted { proposal_id });

    Ok(())
}
