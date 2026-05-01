/**
 * M9 — revoke + set_verified Bankrun tests.
 *
 * Coverage (4 tests required by PRD):
 *  1. revoke ok — credential_level decremented, token PDAs closed
 *  2. revoke non-governor falha — NotAuthorized
 *  3. set_verified ok — verified flag toggled
 *  4. set_verified em non-member falha — AccountNotInitialized
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");

function leUint64(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

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

function userStatsPda(program: anchor.Program<any>, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, wallet.toBuffer()],
    program.programId
  );
  return pda;
}

describe("valocracy.revoke + set_verified (M9)", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  // Leadership valor, rarity=40, secondary_rarity=15, track=0 (domain-agnostic)
  const valorId = 11;
  const rarity = 40;

  let nextTokenId = 1;

  async function mintTo(recipient: Keypair): Promise<number> {
    const tokenId = nextTokenId++;
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)], env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)], env.program.programId
    );
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)], env.program.programId
    );
    await env.program.methods
      .mint(new anchor.BN(valorId), new anchor.BN(tokenId))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: valorPda,
        recipientStats: userStatsPda(env.program, recipient.publicKey),
        tokenOwner: tokenOwnerPda,
        tokenValor: tokenValorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();
    return tokenId;
  }

  async function revokeToken(tokenId: number): Promise<void> {
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)], env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)], env.program.programId
    );
    // Fetch owner from TokenOwner PDA to derive user_stats
    const tokenOwnerAcc = await env.program.account.tokenOwner.fetch(tokenOwnerPda);
    const owner: PublicKey = tokenOwnerAcc.owner;
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)], env.program.programId
    );

    await env.program.methods
      .revoke(new anchor.BN(tokenId))
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        tokenOwner: tokenOwnerPda,
        tokenValor: tokenValorPda,
        valor: valorPda,
        userStats: userStatsPda(env.program, owner),
      } as any)
      .signers([governor])
      .rpc();
  }

  before(async () => {
    env = await bootstrapValocracy();
    governor = fundedKeypair(env);

    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED], env.program.programId
    );

    await env.program.methods
      .initialize(
        governor.publicKey,
        Keypair.generate().publicKey,
        Array.from(new Uint8Array(32)),
        new anchor.BN(valorId),
        new anchor.BN(valorId)
      )
      .accounts({ payer: env.payer.publicKey, config: configPda } as any)
      .rpc();

    // valor_id=11 (Leadership), track_id=0 (domain-agnostic → always full rarity)
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)], env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(valorId),
        new anchor.BN(rarity),
        new anchor.BN(15),
        new anchor.BN(0),   // track_id=0 → domain-agnostic, always full rarity
        "Leadership"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: valorPda,
        payer: governor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();
  });

  // ── 1. revoke ok ─────────────────────────────────────────────────────────

  it("revoke decrements credential_level and closes token PDAs", async () => {
    const member = fundedKeypair(env);
    const tokenId = await mintTo(member);

    const statsPda = userStatsPda(env.program, member.publicKey);
    const statsBefore = await env.program.account.userStats.fetch(statsPda);
    expect(statsBefore.credentialLevel.toNumber()).to.equal(rarity);

    await revokeToken(tokenId);

    // credential_level decremented by rarity (track_id=0 → full rarity)
    const statsAfter = await env.program.account.userStats.fetch(statsPda);
    expect(statsAfter.credentialLevel.toNumber()).to.equal(rarity - rarity); // = 0

    // TokenOwner and TokenValorId PDAs must be closed
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)], env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)], env.program.programId
    );
    const ownerAccInfo = await env.context.banksClient.getAccount(tokenOwnerPda);
    const valorAccInfo = await env.context.banksClient.getAccount(tokenValorPda);
    expect(ownerAccInfo).to.be.null;
    expect(valorAccInfo).to.be.null;
  });

  // ── 2. revoke non-governor rejected ──────────────────────────────────────

  it("rejects revoke from a non-governor wallet", async () => {
    const member = fundedKeypair(env);
    const tokenId = await mintTo(member);

    const stranger = fundedKeypair(env);
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)], env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)], env.program.programId
    );
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)], env.program.programId
    );

    try {
      await env.program.methods
        .revoke(new anchor.BN(tokenId))
        .accounts({
          governor: stranger.publicKey,
          config: configPda,
          tokenOwner: tokenOwnerPda,
          tokenValor: tokenValorPda,
          valor: valorPda,
          userStats: userStatsPda(env.program, member.publicKey),
        } as any)
        .signers([stranger])
        .rpc();
      expect.fail("expected NotAuthorized");
    } catch (e: any) {
      expect(e.toString()).to.include("NotAuthorized");
    }
  });

  // ── 3. set_verified ok ────────────────────────────────────────────────────

  it("governor toggles verified flag on a registered member", async () => {
    const member = fundedKeypair(env);
    await mintTo(member);

    const statsPda = userStatsPda(env.program, member.publicKey);
    const statsBefore = await env.program.account.userStats.fetch(statsPda);
    expect(statsBefore.verified).to.be.false;

    // Set to true
    await env.program.methods
      .setVerified(member.publicKey, true)
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        userStats: statsPda,
      } as any)
      .signers([governor])
      .rpc();

    const statsTrue = await env.program.account.userStats.fetch(statsPda);
    expect(statsTrue.verified).to.be.true;

    // Set back to false
    await env.program.methods
      .setVerified(member.publicKey, false)
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        userStats: statsPda,
      } as any)
      .signers([governor])
      .rpc();

    const statsFalse = await env.program.account.userStats.fetch(statsPda);
    expect(statsFalse.verified).to.be.false;
  });

  // ── 4. set_verified on non-member fails ───────────────────────────────────

  it("rejects set_verified for an account with no UserStats", async () => {
    const stranger = Keypair.generate();
    const statsPda = userStatsPda(env.program, stranger.publicKey);

    try {
      await env.program.methods
        .setVerified(stranger.publicKey, true)
        .accounts({
          governor: governor.publicKey,
          config: configPda,
          userStats: statsPda,
        } as any)
        .signers([governor])
        .rpc();
      expect.fail("expected error for non-member");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });
});
