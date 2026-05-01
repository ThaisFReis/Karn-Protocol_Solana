//! PDA seed prefixes — single source of truth.
//!
//! Every PDA derivation across the three programs MUST source its prefix from
//! a constant declared here. Inline byte literals are forbidden.
//!
//! See `docs/PDA_CONVENTIONS.md` for the full layout (entity → seeds → struct).

// ── Valocracy ────────────────────────────────────────────────────────────────

/// Singleton config (governor, treasury, signer, supply, leadership_valor_id).
pub const VALOCRACY_CONFIG: &[u8] = b"config";

/// Per-`valor_id` badge definition (rarity, secondary_rarity, track, metadata).
pub const VALOR: &[u8] = b"valor";

/// Per-wallet user statistics (credential_level, expiry, activity, primary).
pub const USER_STATS: &[u8] = b"user_stats";

/// Per-token owner pointer (for revoke + ownership query).
pub const TOKEN_OWNER: &[u8] = b"token_owner";

/// Per-token valor_id pointer.
pub const TOKEN_VALOR: &[u8] = b"token_valor";

/// Per-guardian allowlist of track_ids (capped at 32, see DT-08).
pub const GUARDIAN_TRACKS: &[u8] = b"guardian";

/// Per-credit-authority allowlist of track_ids (capped at 32, see DT-08).
pub const CREDIT_AUTHORITY: &[u8] = b"credit_auth";

/// Per-account rolling 30-day activity-credit cap window.
pub const CREDIT_WINDOW: &[u8] = b"credit_window";

/// Per-(account, nonce) replay-protection marker for `self_register`.
pub const USED_NONCE: &[u8] = b"nonce";

// ── Governor ─────────────────────────────────────────────────────────────────

/// Singleton governor state (valocracy ref, proposal_count, reentrancy lock).
pub const GOVERNOR_CONFIG: &[u8] = b"gov_config";

/// Singleton tunable governance parameters (delay, period, thresholds).
pub const GOVERNOR_PARAMS: &[u8] = b"gov_params";

/// Per-proposal account.
pub const PROPOSAL: &[u8] = b"proposal";

/// Per-(proposal_id, voter) vote receipt — also enforces single-vote rule.
pub const VOTE: &[u8] = b"vote";

// ── Treasury ─────────────────────────────────────────────────────────────────

/// Singleton treasury state (governor ref, asset_mint, total_shares, restricted).
pub const TREASURY_STATE: &[u8] = b"treasury";

/// Per-account share balance.
pub const USER_SHARES: &[u8] = b"shares";

/// Per-lab scholarship escrow record.
pub const LAB: &[u8] = b"lab";

/// Per-member claimable scholarship balance.
pub const CLAIMABLE: &[u8] = b"claimable";

#[cfg(test)]
mod tests {
    use super::*;

    /// All seed prefixes registered in this module. If you add a new seed
    /// constant above, add it here too — the uniqueness test will catch
    /// accidental collisions.
    const ALL_SEEDS: &[(&str, &[u8])] = &[
        ("VALOCRACY_CONFIG", VALOCRACY_CONFIG),
        ("VALOR", VALOR),
        ("USER_STATS", USER_STATS),
        ("TOKEN_OWNER", TOKEN_OWNER),
        ("TOKEN_VALOR", TOKEN_VALOR),
        ("GUARDIAN_TRACKS", GUARDIAN_TRACKS),
        ("CREDIT_AUTHORITY", CREDIT_AUTHORITY),
        ("CREDIT_WINDOW", CREDIT_WINDOW),
        ("USED_NONCE", USED_NONCE),
        ("GOVERNOR_CONFIG", GOVERNOR_CONFIG),
        ("GOVERNOR_PARAMS", GOVERNOR_PARAMS),
        ("PROPOSAL", PROPOSAL),
        ("VOTE", VOTE),
        ("TREASURY_STATE", TREASURY_STATE),
        ("USER_SHARES", USER_SHARES),
        ("LAB", LAB),
        ("CLAIMABLE", CLAIMABLE),
    ];

    /// Two distinct PDA families MUST NOT share a seed prefix — a collision
    /// would make derivations indistinguishable and let one entity overwrite
    /// another.
    #[test]
    fn all_seeds_are_unique() {
        for (i, (name_a, seed_a)) in ALL_SEEDS.iter().enumerate() {
            for (name_b, seed_b) in ALL_SEEDS.iter().skip(i + 1) {
                assert_ne!(
                    seed_a, seed_b,
                    "seed collision: {} == {} ({:?})",
                    name_a, name_b, seed_a
                );
            }
        }
    }

    /// Anchor seed-byte limits: every component of `seeds = [...]` must be
    /// ≤ 32 bytes. Our prefixes are far below that, but pin a sanity bound
    /// so an accidentally-long prefix never makes a PDA underivable.
    #[test]
    fn all_seeds_are_short() {
        for (name, seed) in ALL_SEEDS {
            assert!(
                seed.len() <= 32,
                "seed {} is {} bytes, exceeds 32-byte component limit",
                name,
                seed.len()
            );
        }
    }

    /// Stellar parity: critical seeds exposed to the SDK must keep their
    /// ASCII prefix stable. Changing these is a breaking change to every
    /// off-chain client. Pinning the bytes here makes such a change
    /// impossible by accident.
    #[test]
    fn parity_pins() {
        assert_eq!(VALOCRACY_CONFIG, b"config");
        assert_eq!(USER_STATS, b"user_stats");
        assert_eq!(VALOR, b"valor");
        assert_eq!(PROPOSAL, b"proposal");
        assert_eq!(VOTE, b"vote");
        assert_eq!(TREASURY_STATE, b"treasury");
        assert_eq!(LAB, b"lab");
    }
}
