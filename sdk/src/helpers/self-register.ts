/**
 * buildSelfRegisterPayload — mirrors karn-shared::payload::build_self_register_payload.
 *
 * Layout (56 bytes):
 *   [00..32]  caller pubkey (32 bytes)
 *   [32..40]  nonce         (u64 LE)
 *   [40..48]  expiry        (i64 LE)
 *   [48..56]  track_id      (u64 LE)
 */

import { PublicKey, Ed25519Program, TransactionInstruction, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export interface SelfRegisterParams {
  caller: PublicKey;
  nonce: bigint;
  expiry: bigint;
  trackId: bigint;
  tokenId: bigint;
  /** Ed25519 raw 64-byte signature produced by the backend over the payload. */
  backendSignature: Uint8Array;
  /** Raw 32-byte Ed25519 public key of the backend signer (Config.signer). */
  backendPublicKey: Uint8Array;
}

function leUint64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function leInt64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

/** Build the 56-byte payload that the backend must sign. */
export function buildSelfRegisterPayload(
  caller: PublicKey,
  nonce: bigint,
  expiry: bigint,
  trackId: bigint,
): Buffer {
  return Buffer.concat([
    caller.toBuffer(),
    leUint64(nonce),
    leInt64(expiry),
    leUint64(trackId),
  ]);
}

/**
 * Returns the Ed25519SigVerify pre-instruction.
 *
 * The caller must prepend this to the transaction before the `selfRegister`
 * instruction so the on-chain program can verify via the Instructions sysvar.
 */
export function buildEd25519PreInstruction(params: SelfRegisterParams): TransactionInstruction {
  const message = buildSelfRegisterPayload(
    params.caller,
    params.nonce,
    params.expiry,
    params.trackId,
  );
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: params.backendPublicKey,
    message,
    signature: params.backendSignature,
  });
}

/**
 * Return the accounts object for `valocracy.selfRegister`, compatible with
 * Anchor's `.accounts({...})` call.
 *
 * Usage:
 *   const preIx = buildEd25519PreInstruction(params);
 *   await program.methods
 *     .selfRegister(
 *       new anchor.BN(params.trackId.toString()),
 *       new anchor.BN(params.nonce.toString()),
 *       new anchor.BN(params.expiry.toString()),
 *       new anchor.BN(params.tokenId.toString()),
 *     )
 *     .accounts(buildSelfRegisterAccounts(params, programId))
 *     .preInstructions([preIx])
 *     .signers([callerKeypair])
 *     .rpc();
 */
export function buildSelfRegisterAccounts(
  params: Pick<SelfRegisterParams, "caller" | "nonce" | "tokenId">,
  valocracyProgramId: PublicKey,
  memberValorPda: PublicKey,
): Record<string, PublicKey> {
  const [configPda]  = PublicKey.findProgramAddressSync([Buffer.from("config")],      valocracyProgramId);
  const [usedNonce]  = PublicKey.findProgramAddressSync(
    [Buffer.from("nonce"), params.caller.toBuffer(), leUint64(params.nonce)],
    valocracyProgramId,
  );
  const [callerStats] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_stats"), params.caller.toBuffer()],
    valocracyProgramId,
  );
  const [tokenOwner] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_owner"), leUint64(params.tokenId)],
    valocracyProgramId,
  );
  const [tokenValor] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_valor"), leUint64(params.tokenId)],
    valocracyProgramId,
  );

  return {
    caller:             params.caller,
    config:             configPda,
    memberValor:        memberValorPda,
    usedNonce,
    callerStats,
    tokenOwner,
    tokenValor,
    instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
  };
}
