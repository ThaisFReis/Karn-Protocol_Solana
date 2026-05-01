//! Karn Protocol — shared crate.
//!
//! Houses constants, seed conventions, and pure helpers reused across the
//! three on-chain programs (`valocracy`, `governor`, `treasury`).
//!
//! Anything in this crate must remain free of program entrypoints (no
//! `#[program]`) and free of cross-program account fetches — pure data and
//! pure functions only.

pub mod constants;
pub mod mana;
pub mod payload;
pub mod seeds;
pub mod vault;

pub use constants::*;
pub use mana::*;
pub use payload::*;
pub use seeds::*;
pub use vault::*;
