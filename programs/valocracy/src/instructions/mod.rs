//! Instruction handlers for the Valocracy program.
//!
//! Each submodule re-exports a glob so Anchor's `#[program]` macro can find
//! the auto-generated `__client_accounts_<name>` modules from the parent.
//! Multiple modules export `handler`, but every call site qualifies the path
//! (`instructions::initialize::handler`) — the glob ambiguity is benign and
//! we silence the lint locally.

pub mod credit_activity;
pub mod get_votes;

pub mod get_votes_at;
pub mod guardian_mint;
pub mod initialize;
pub mod mint;
pub mod pause_credit;
pub mod remove_guardian;
pub mod resume_credit;
pub mod revoke_credit_authority;
pub mod self_register;
pub mod set_credit_authority;
pub mod revoke;
pub mod set_guardian_tracks;
pub mod set_valor;
pub mod set_verified;
pub mod update_primary;

#[allow(ambiguous_glob_reexports)]
pub use credit_activity::*;
#[allow(ambiguous_glob_reexports)]
pub use get_votes::*;
#[allow(ambiguous_glob_reexports)]
pub use get_votes_at::*;
#[allow(ambiguous_glob_reexports)]
pub use guardian_mint::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize::*;
#[allow(ambiguous_glob_reexports)]
pub use mint::*;
#[allow(ambiguous_glob_reexports)]
pub use pause_credit::*;
#[allow(ambiguous_glob_reexports)]
pub use remove_guardian::*;
#[allow(ambiguous_glob_reexports)]
pub use resume_credit::*;
#[allow(ambiguous_glob_reexports)]
pub use revoke_credit_authority::*;
#[allow(ambiguous_glob_reexports)]
pub use self_register::*;
#[allow(ambiguous_glob_reexports)]
pub use revoke::*;
#[allow(ambiguous_glob_reexports)]
pub use set_credit_authority::*;
#[allow(ambiguous_glob_reexports)]
pub use set_guardian_tracks::*;
#[allow(ambiguous_glob_reexports)]
pub use set_valor::*;
#[allow(ambiguous_glob_reexports)]
pub use set_verified::*;
#[allow(ambiguous_glob_reexports)]
pub use update_primary::*;
