//! Deterministic payload serialization for instructions that consume
//! off-chain ed25519 signatures (e.g. `self_register`).
//!
//! Both the on-chain program and the off-chain backend signer must produce
//! the **same byte sequence** for a given tuple of parameters, otherwise the
//! signature check in the program won't match the message that was signed.
//! Centralizing the layout here keeps both sides honest.

use anchor_lang::prelude::Pubkey;

/// Byte length of the `self_register` payload: caller (32) + nonce (8) +
/// expiry (8) + track_id (8) = 56 bytes.
pub const SELF_REGISTER_PAYLOAD_SIZE: usize = 32 + 8 + 8 + 8;

/// Construct the payload that the backend must sign for `self_register`.
///
/// Layout (little-endian for integers):
/// ```text
/// [0..32]  caller Pubkey bytes
/// [32..40] nonce (u64)
/// [40..48] expiry (i64, unix timestamp seconds)
/// [48..56] track_id (u64)
/// ```
///
/// The `track_id` field at the end is the v2-Solana D3-A divergence — Stellar's
/// Soroban payload is `caller || nonce || expiry` (no track). Solana sets the
/// caller's primary domain at registration time, so the signed payload binds
/// the track choice cryptographically.
pub fn build_self_register_payload(
    caller: &Pubkey,
    nonce: u64,
    expiry: i64,
    track_id: u64,
) -> [u8; SELF_REGISTER_PAYLOAD_SIZE] {
    let mut buf = [0u8; SELF_REGISTER_PAYLOAD_SIZE];
    buf[0..32].copy_from_slice(caller.as_ref());
    buf[32..40].copy_from_slice(&nonce.to_le_bytes());
    buf[40..48].copy_from_slice(&expiry.to_le_bytes());
    buf[48..56].copy_from_slice(&track_id.to_le_bytes());
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_size_constant() {
        assert_eq!(SELF_REGISTER_PAYLOAD_SIZE, 56);
    }

    #[test]
    fn layout_caller_first_32_bytes() {
        let pk = Pubkey::new_from_array([7u8; 32]);
        let buf = build_self_register_payload(&pk, 0, 0, 0);
        assert_eq!(&buf[0..32], &[7u8; 32]);
    }

    #[test]
    fn layout_nonce_at_offset_32() {
        let buf = build_self_register_payload(&Pubkey::default(), 0xDEADBEEF, 0, 0);
        assert_eq!(&buf[32..40], &(0xDEADBEEF_u64).to_le_bytes());
    }

    #[test]
    fn layout_expiry_at_offset_40() {
        let buf = build_self_register_payload(&Pubkey::default(), 0, 1_700_000_000, 0);
        assert_eq!(&buf[40..48], &(1_700_000_000_i64).to_le_bytes());
    }

    #[test]
    fn layout_track_id_at_offset_48() {
        let buf = build_self_register_payload(&Pubkey::default(), 0, 0, 5);
        assert_eq!(&buf[48..56], &(5_u64).to_le_bytes());
    }

    #[test]
    fn layout_is_deterministic() {
        let pk = Pubkey::new_from_array([7u8; 32]);
        let a = build_self_register_payload(&pk, 42, 1000, 1);
        let b = build_self_register_payload(&pk, 42, 1000, 1);
        assert_eq!(a, b);
    }
}
