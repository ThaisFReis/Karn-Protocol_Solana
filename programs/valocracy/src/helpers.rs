//! Pure helpers shared by mint/guardian_mint/self_register paths.

use anchor_lang::prelude::*;

use crate::errors::ValocracyError;
use crate::state::{UserStats, Valor};

/// Badge categories derived from `valor_id` ranges (DT-09 mirrors Stellar).
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum BadgeCategory {
    /// `valor_id == 0` — only mintable via `self_register`.
    Member,
    /// `valor_id == 1` — set at genesis only, never mintable.
    Founder,
    /// `valor_id ∈ 10..=19` — Governor-only.
    Leadership,
    /// `valor_id ∈ 20..=59` — Governor-only OR via `guardian_mint` for the
    /// matching `track_id`.
    Track,
    /// `valor_id ∈ 60..=69` — any current member can mint to others.
    Community,
    /// `valor_id ∈ 70..=79` — Governor-only.
    Governance,
}

/// Map a `valor_id` to its category. Returns `InvalidValorId` for ids outside
/// the allocated ranges.
pub fn get_badge_category(valor_id: u64) -> Result<BadgeCategory> {
    Ok(match valor_id {
        0 => BadgeCategory::Member,
        1 => BadgeCategory::Founder,
        10..=19 => BadgeCategory::Leadership,
        20..=59 => BadgeCategory::Track,
        60..=69 => BadgeCategory::Community,
        70..=79 => BadgeCategory::Governance,
        _ => return Err(error!(ValocracyError::InvalidValorId)),
    })
}

/// Compute the rarity that should be credited when minting `valor` to an
/// account whose current `UserStats.primary_track_id` is `primary`.
///
/// Stellar parity (`Self::effective_rarity_for`):
/// - Domain-agnostic badge (`track_id == 0`) → full `rarity`
/// - Badge in user's primary domain → full `rarity`
/// - Badge in a different domain → `secondary_rarity`
pub fn effective_rarity(primary_track_id: Option<u64>, valor: &Valor) -> u64 {
    if valor.track_id == 0 {
        return valor.rarity;
    }
    match primary_track_id {
        Some(t) if t == valor.track_id => valor.rarity,
        _ => valor.secondary_rarity,
    }
}

/// Same shape but takes a `&UserStats` directly — convenience for callers
/// that already have the account loaded.
pub fn effective_rarity_for(stats: &UserStats, valor: &Valor) -> u64 {
    effective_rarity(stats.primary_track_id, valor)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_valor(rarity: u64, secondary_rarity: u64, track_id: u64) -> Valor {
        Valor {
            rarity,
            secondary_rarity,
            track_id,
            metadata: String::new(),
            bump: 255,
        }
    }

    #[test]
    fn category_ranges_match_stellar() {
        assert_eq!(get_badge_category(0).unwrap(), BadgeCategory::Member);
        assert_eq!(get_badge_category(1).unwrap(), BadgeCategory::Founder);
        assert_eq!(get_badge_category(10).unwrap(), BadgeCategory::Leadership);
        assert_eq!(get_badge_category(19).unwrap(), BadgeCategory::Leadership);
        assert_eq!(get_badge_category(20).unwrap(), BadgeCategory::Track);
        assert_eq!(get_badge_category(59).unwrap(), BadgeCategory::Track);
        assert_eq!(get_badge_category(60).unwrap(), BadgeCategory::Community);
        assert_eq!(get_badge_category(69).unwrap(), BadgeCategory::Community);
        assert_eq!(get_badge_category(70).unwrap(), BadgeCategory::Governance);
        assert_eq!(get_badge_category(79).unwrap(), BadgeCategory::Governance);
    }

    #[test]
    fn category_unknown_id_errors() {
        // Gaps and out-of-range
        assert!(get_badge_category(2).is_err());
        assert!(get_badge_category(9).is_err());
        assert!(get_badge_category(80).is_err());
        assert!(get_badge_category(u64::MAX).is_err());
    }

    #[test]
    fn effective_rarity_domain_agnostic_returns_rarity() {
        let v = dummy_valor(50, 10, 0);
        assert_eq!(effective_rarity(None, &v), 50);
        assert_eq!(effective_rarity(Some(1), &v), 50);
    }

    #[test]
    fn effective_rarity_primary_match_returns_rarity() {
        let v = dummy_valor(25, 8, 1);
        assert_eq!(effective_rarity(Some(1), &v), 25);
    }

    #[test]
    fn effective_rarity_cross_domain_returns_secondary() {
        let v = dummy_valor(25, 8, 1);
        assert_eq!(effective_rarity(Some(2), &v), 8);
        // No primary set yet → cross-domain by default.
        assert_eq!(effective_rarity(None, &v), 8);
    }
}
