import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");
const USED_NONCE_SEED = Buffer.from("nonce");

function fundedKeypair(env: BootstrapResult): Keypair {
  const kp = Keypair.generate();
  env.context.setAccount(kp.publicKey, {
    lamports: 10_000_000_000,
    data: Buffer.alloc(0),
    owner: anchor.web3.SystemProgram.programId,
    executable: false,
  });
  return kp;
}

function leUint64(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function leInt64(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(n));
  return buf;
}

/** Mirror of `karn_shared::payload::build_self_register_payload`. */
function buildPayload(
  caller: PublicKey,
  nonce: bigint,
  expiry: bigint,
  trackId: bigint
): Buffer {
  return Buffer.concat([
    caller.toBuffer(),
    leUint64(nonce),
    leInt64(expiry),
    leUint64(trackId),
  ]);
}

describe("valocracy.self_register (Ed25519 precompile + KRN-equivalent replay protection)", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;
  let memberValorPda: PublicKey;

  // Backend ed25519 keypair (the "trusted signer" referenced by Config.signer).
  const backendKeyPair = nacl.sign.keyPair();
  const backendPubkeyBytes = Array.from(backendKeyPair.publicKey);

  // Member badge: id 0, rarity 5, no track (domain-agnostic).
  const memberValorId = 0;
  const memberRarity = 5;
  const leadershipValorId = 10;

  before(async () => {
    env = await bootstrapValocracy();
    governor = fundedKeypair(env);

    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      env.program.programId
    );

    await env.program.methods
      .initialize(
        governor.publicKey,
        Keypair.generate().publicKey,
        backendPubkeyBytes,
        new anchor.BN(memberValorId),
        new anchor.BN(leadershipValorId)
      )
      .accounts({
        payer: env.payer.publicKey,
        config: configPda,
      } as any)
      .rpc();

    [memberValorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(memberValorId)],
      env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(memberValorId),
        new anchor.BN(memberRarity),
        new anchor.BN(0),
        new anchor.BN(0),
        "Member"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: memberValorPda,
      } as any)
      .signers([governor])
      .rpc();
  });

  function pdas(caller: PublicKey, nonce: bigint, tokenId: number) {
    const [usedNonce] = PublicKey.findProgramAddressSync(
      [USED_NONCE_SEED, caller.toBuffer(), leUint64(nonce)],
      env.program.programId
    );
    const [callerStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, caller.toBuffer()],
      env.program.programId
    );
    const [tokenOwner] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [tokenValor] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)],
      env.program.programId
    );
    return { usedNonce, callerStats, tokenOwner, tokenValor };
  }

  function nowSeconds(): bigint {
    return BigInt(Math.floor(Date.now() / 1000));
  }

  it("registers a new member with valid ed25519 backend signature", async () => {
    const caller = fundedKeypair(env);
    const nonce = 1n;
    const expiry = nowSeconds() + 3600n;
    const trackId = 1n;

    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;

    const message = buildPayload(caller.publicKey, nonce, expiry, trackId);
    const signature = nacl.sign.detached(message, backendKeyPair.secretKey);

    const sigIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: backendKeyPair.publicKey,
      message,
      signature,
    });

    const { usedNonce, callerStats, tokenOwner, tokenValor } = pdas(
      caller.publicKey,
      nonce,
      tokenId
    );

    await env.program.methods
      .selfRegister(
        new anchor.BN(trackId),
        new anchor.BN(nonce),
        new anchor.BN(expiry),
        new anchor.BN(tokenId)
      )
      .accounts({
        caller: caller.publicKey,
        config: configPda,
        memberValor: memberValorPda,
        usedNonce,
        callerStats,
        tokenOwner,
        tokenValor,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      } as any)
      .preInstructions([sigIx])
      .signers([caller])
      .rpc();

    const stats = await env.program.account.userStats.fetch(callerStats);
    expect(stats.credentialLevel.toNumber()).to.equal(memberRarity);
    expect(stats.primaryTrackId).to.not.equal(null);
    // primary_track_id is stored as BN inside Option ; helper converts:
    expect(stats.primaryTrackId.toNumber()).to.equal(Number(trackId));

    const cfgAfter = await env.program.account.config.fetch(configPda);
    expect(cfgAfter.totalSupply.toNumber()).to.equal(tokenId);
  });

  it("fails when no Ed25519 precompile instruction precedes self_register", async () => {
    const caller = fundedKeypair(env);
    const nonce = 2n;
    const expiry = nowSeconds() + 3600n;
    const trackId = 1n;

    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;
    const { usedNonce, callerStats, tokenOwner, tokenValor } = pdas(
      caller.publicKey,
      nonce,
      tokenId
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .selfRegister(
          new anchor.BN(trackId),
          new anchor.BN(nonce),
          new anchor.BN(expiry),
          new anchor.BN(tokenId)
        )
        .accounts({
          caller: caller.publicKey,
          config: configPda,
          memberValor: memberValorPda,
          usedNonce,
          callerStats,
          tokenOwner,
          tokenValor,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        // No preInstructions — sig precompile absent
        .signers([caller])
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }
    expect(errMsg).to.match(/InvalidSignature|6008/);
  });

  it("fails when the signer in the precompile is not Config.signer", async () => {
    const caller = fundedKeypair(env);
    const nonce = 3n;
    const expiry = nowSeconds() + 3600n;
    const trackId = 1n;

    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;

    const wrongSigner = nacl.sign.keyPair(); // not the registered Config.signer
    const message = buildPayload(caller.publicKey, nonce, expiry, trackId);
    const signature = nacl.sign.detached(message, wrongSigner.secretKey);

    const sigIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: wrongSigner.publicKey,
      message,
      signature,
    });

    const { usedNonce, callerStats, tokenOwner, tokenValor } = pdas(
      caller.publicKey,
      nonce,
      tokenId
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .selfRegister(
          new anchor.BN(trackId),
          new anchor.BN(nonce),
          new anchor.BN(expiry),
          new anchor.BN(tokenId)
        )
        .accounts({
          caller: caller.publicKey,
          config: configPda,
          memberValor: memberValorPda,
          usedNonce,
          callerStats,
          tokenOwner,
          tokenValor,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        .preInstructions([sigIx])
        .signers([caller])
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }
    expect(errMsg).to.match(/InvalidSignature|6008/);
  });

  it("rejects a nonce that has already been used (replay protection)", async () => {
    const caller = fundedKeypair(env);
    const nonce = 4n;
    const expiry = nowSeconds() + 3600n;
    const trackId = 1n;

    async function attempt(tokenId: number) {
      const message = buildPayload(caller.publicKey, nonce, expiry, trackId);
      const signature = nacl.sign.detached(message, backendKeyPair.secretKey);
      const sigIx = Ed25519Program.createInstructionWithPublicKey({
        publicKey: backendKeyPair.publicKey,
        message,
        signature,
      });
      const { usedNonce, callerStats, tokenOwner, tokenValor } = pdas(
        caller.publicKey,
        nonce,
        tokenId
      );
      await env.program.methods
        .selfRegister(
          new anchor.BN(trackId),
          new anchor.BN(nonce),
          new anchor.BN(expiry),
          new anchor.BN(tokenId)
        )
        .accounts({
          caller: caller.publicKey,
          config: configPda,
          memberValor: memberValorPda,
          usedNonce,
          callerStats,
          tokenOwner,
          tokenValor,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        .preInstructions([sigIx])
        .signers([caller])
        .rpc();
    }

    // First time should succeed.
    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId1 = cfgBefore.totalSupply.toNumber() + 1;
    await attempt(tokenId1);

    // Second time with the SAME nonce must fail (UsedNonce PDA already exists).
    let errored = false;
    try {
      const cfgAfter = await env.program.account.config.fetch(configPda);
      await attempt(cfgAfter.totalSupply.toNumber() + 1);
    } catch (_) {
      errored = true;
    }
    expect(errored, "replay must fail").to.equal(true);
  });

  it("rejects an expired signature", async () => {
    const caller = fundedKeypair(env);
    const nonce = 5n;
    const expiry = 1n; // year 1970 — definitely past
    const trackId = 1n;

    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;

    const message = buildPayload(caller.publicKey, nonce, expiry, trackId);
    const signature = nacl.sign.detached(message, backendKeyPair.secretKey);
    const sigIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: backendKeyPair.publicKey,
      message,
      signature,
    });

    const { usedNonce, callerStats, tokenOwner, tokenValor } = pdas(
      caller.publicKey,
      nonce,
      tokenId
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .selfRegister(
          new anchor.BN(trackId),
          new anchor.BN(nonce),
          new anchor.BN(expiry),
          new anchor.BN(tokenId)
        )
        .accounts({
          caller: caller.publicKey,
          config: configPda,
          memberValor: memberValorPda,
          usedNonce,
          callerStats,
          tokenOwner,
          tokenValor,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        } as any)
        .preInstructions([sigIx])
        .signers([caller])
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }
    expect(errMsg).to.match(/SignatureExpired|6010/);
  });
});
