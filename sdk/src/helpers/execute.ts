/**
 * buildExecuteRemainingAccounts — resolve `remaining_accounts` for each
 * ProposalAction variant so callers don't have to read execute.rs directly.
 *
 * Layout per variant mirrors programs/governor/src/instructions/execute.rs:
 *
 *   TreasuryTransfer:
 *     [0] treasury program  [1] TreasuryState PDA (mut)
 *     [2] vault ATA (mut)   [3] receiver ATA (mut)  [4] token program
 *
 *   TreasuryApproveScholarship:
 *     [0] treasury program  [1] TreasuryState PDA
 *     [2] Lab PDA           [3] member account
 *     [4] Claimable PDA (mut)  [5] system_program
 *
 *   TreasuryUpdateGovernor:
 *     [0] treasury program  [1] TreasuryState PDA (mut)
 *
 *   ValocracySetValor:
 *     [0] valocracy program  [1] valocracy Config PDA
 *     [2] Valor PDA (mut)    [3] system_program
 *
 *   ValocracySetGuardianTracks:
 *     [0] valocracy program  [1] valocracy Config PDA
 *     [2] GuardianTracks PDA (mut)  [3] system_program
 *
 *   ValocracyUpdatePrimary:
 *     [0] valocracy program  [1] valocracy Config PDA  [2] UserStats PDA (mut)
 *
 *   ValocracySetCreditAuthority:
 *     [0] valocracy program  [1] valocracy Config PDA
 *     [2] CreditAuthority PDA (mut)  [3] system_program
 *
 *   ValocracyRevoke:
 *     [0] valocracy program  [1] valocracy Config PDA
 *     [2] TokenOwner PDA (mut, close)  [3] TokenValorId PDA (mut, close)
 *     [4] Valor PDA  [5] UserStats PDA (mut)
 *
 *   ValocracyPauseCredit / ValocracyResumeCredit:
 *     [0] valocracy program  [1] valocracy Config PDA (mut)
 *
 *   ValocracyUpdateGovernor / ValocracyUpdateTreasury:
 *     [0] valocracy program  [1] valocracy Config PDA (mut)
 *
 *   UpdateGovernanceConfig:
 *     [] — no remaining accounts needed.
 */

import { PublicKey, SystemProgram, AccountMeta } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  configPda,
  valorPda,
  guardianPda,
  userStatsPda,
  tokenOwnerPda,
  tokenValorPda,
  creditAuthPda,
  treasuryStatePda,
  labPda,
  claimablePda,
} from "../seeds";
import { VALOCRACY_PROGRAM_ID, TREASURY_PROGRAM_ID } from "../constants";
import type { ProposalAction } from "../types";

function ro(pubkey: PublicKey): AccountMeta {
  return { pubkey, isSigner: false, isWritable: false };
}
function rw(pubkey: PublicKey): AccountMeta {
  return { pubkey, isSigner: false, isWritable: true };
}

/**
 * Resolve `remaining_accounts` for a `governor.execute` call.
 *
 * @param action - The action from the fetched Proposal account.
 * @param extraAccounts - Additional pre-derived accounts required by some variants.
 *   - `receiverAta`: required for `TreasuryTransfer` (receiver's token account)
 *   - `vaultAta`: required for `TreasuryTransfer` (treasury vault ATA)
 */
export function buildExecuteRemainingAccounts(
  action: ProposalAction,
  extraAccounts?: {
    receiverAta?: PublicKey;
    vaultAta?: PublicKey;
  },
): AccountMeta[] {
  const valocracyId = new PublicKey(VALOCRACY_PROGRAM_ID);
  const treasuryId  = new PublicKey(TREASURY_PROGRAM_ID);
  const [vConfig]   = configPda(valocracyId);
  const [tState]    = treasuryStatePda(treasuryId);

  if ("treasuryTransfer" in action) {
    const { receiver } = action.treasuryTransfer;
    if (!extraAccounts?.vaultAta || !extraAccounts?.receiverAta) {
      throw new Error("TreasuryTransfer requires vaultAta and receiverAta in extraAccounts");
    }
    return [
      ro(treasuryId),
      rw(tState),
      rw(extraAccounts.vaultAta),
      rw(extraAccounts.receiverAta),
      ro(TOKEN_PROGRAM_ID),
    ];
  }

  if ("treasuryApproveScholarship" in action) {
    const { labId, member } = action.treasuryApproveScholarship;
    const [lab]       = labPda(labId, treasuryId);
    const memberPk    = new PublicKey(member);
    const [claimable] = claimablePda(memberPk, treasuryId);
    return [
      ro(treasuryId),
      ro(tState),
      ro(lab),
      ro(memberPk),
      rw(claimable),
      ro(SystemProgram.programId),
    ];
  }

  if ("treasuryUpdateGovernor" in action) {
    return [
      ro(treasuryId),
      rw(tState),
    ];
  }

  if ("valocracySetValor" in action) {
    const { valorId } = action.valocracySetValor;
    const toBig = (v: any): bigint => BigInt(v.toString ? v.toString() : v);
    const [valor] = valorPda(toBig(valorId), valocracyId);
    return [
      ro(valocracyId),
      ro(vConfig),
      rw(valor),
      ro(SystemProgram.programId),
    ];
  }

  if ("valocracySetGuardianTracks" in action) {
    const { guardian } = action.valocracySetGuardianTracks;
    const guardianPk = new PublicKey(guardian);
    const [gtPda] = guardianPda(guardianPk, valocracyId);
    return [
      ro(valocracyId),
      ro(vConfig),
      rw(gtPda),
      ro(SystemProgram.programId),
    ];
  }

  if ("valocracyUpdateGovernor" in action || "valocracyUpdateTreasury" in action) {
    return [
      ro(valocracyId),
      rw(vConfig),
    ];
  }

  if ("valocracyUpdatePrimary" in action) {
    const { account } = action.valocracyUpdatePrimary;
    const accountPk = new PublicKey(account);
    const [stats] = userStatsPda(accountPk, valocracyId);
    return [
      ro(valocracyId),
      ro(vConfig),
      rw(stats),
    ];
  }

  if ("valocracySetCreditAuthority" in action) {
    const { authority } = action.valocracySetCreditAuthority;
    const authorityPk = new PublicKey(authority);
    const [caPda] = creditAuthPda(authorityPk, valocracyId);
    return [
      ro(valocracyId),
      ro(vConfig),
      rw(caPda),
      ro(SystemProgram.programId),
    ];
  }

  if ("valocracyRevoke" in action) {
    const { tokenId } = action.valocracyRevoke;
    const toBig2 = (v: any): bigint => BigInt(v.toString ? v.toString() : v);
    const tidBig = toBig2(tokenId);
    const [tOwner] = tokenOwnerPda(tidBig, valocracyId);
    const [tValor] = tokenValorPda(tidBig, valocracyId);
    // Fetch the owner from TokenOwner to derive UserStats — caller must pre-fetch
    // or pass it in. For convenience, the SDK throws if owner is not provided.
    // We return partial array; owner-dependent PDAs use a placeholder if unavailable.
    // Full usage: const tokenOwnerAccount = await client.getTokenOwner(tokenId);
    //             then pass ownerStats as extraAccount.
    if (!extraAccounts?.receiverAta) {
      throw new Error("ValocracyRevoke requires extraAccounts.receiverAta = token owner PublicKey (not an ATA, despite naming)");
    }
    const ownerPk = extraAccounts.receiverAta; // reusing field: the revoke target owner
    const [vl] = valorPda(0n, valocracyId); // placeholder — must be overridden
    const [stats] = userStatsPda(ownerPk, valocracyId);
    // Caller must provide the correct Valor PDA — simplest: pass as vaultAta
    const valorAccount = extraAccounts.vaultAta ?? vl;
    return [
      ro(valocracyId),
      ro(vConfig),
      rw(tOwner),
      rw(tValor),
      ro(valorAccount),
      rw(stats),
    ];
  }

  if ("valocracyPauseCredit" in action || "valocracyResumeCredit" in action) {
    return [
      ro(valocracyId),
      rw(vConfig),
    ];
  }

  if ("updateGovernanceConfig" in action) {
    return [];
  }

  throw new Error(`Unknown ProposalAction variant: ${JSON.stringify(action)}`);
}
