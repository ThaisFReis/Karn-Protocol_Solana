/**
 * M8 — update_primary Bankrun tests.
 *
 * Coverage (2 tests required by PRD):
 *  1. Non-governor wallet returns NotAuthorized
 *  2. Governor updates primary_track_id + primary_valor_id; effective_rarity
 *     subsequently reflects new track
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

describe("valocracy.update_primary (M8)", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  // Leadership valor in track 7, rarity=30, secondary_rarity=10
  const valorId = 10;
  const track = 7n;

  let nextTokenId = 1;

  async function mintLeadershipTo(recipient: Keypair): Promise<void> {
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

    // valor_id=10 in track=7, rarity=30, secondary_rarity=10
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)], env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(valorId),
        new anchor.BN(30),
        new anchor.BN(10),
        new anchor.BN(track.toString()),
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

  // ── 1. Non-governor rejected ──────────────────────────────────────────────

  it("rejects update_primary from a non-governor wallet", async () => {
    const member = fundedKeypair(env);
    await mintLeadershipTo(member);

    const stranger = fundedKeypair(env);
    const statsPda = userStatsPda(env.program, member.publicKey);

    try {
      await env.program.methods
        .updatePrimary(member.publicKey, new anchor.BN(7), new anchor.BN(valorId))
        .accounts({
          governor: stranger.publicKey,
          config: configPda,
          userStats: statsPda,
        } as any)
        .signers([stranger])
        .rpc();
      expect.fail("expected NotAuthorized");
    } catch (e: any) {
      expect(e.toString()).to.include("NotAuthorized");
    }
  });

  // ── 2. Governor updates primary; effective_rarity reflects new track ──────

  it("governor sets primary track + valor; subsequent mint uses full rarity", async () => {
    const member = fundedKeypair(env);
    await mintLeadershipTo(member);

    const statsPda = userStatsPda(env.program, member.publicKey);

    // Before update: no primary → cross-domain → secondary_rarity (10)
    const statsBefore = await env.program.account.userStats.fetch(statsPda);
    expect(statsBefore.primaryTrackId).to.be.null;

    // Update primary to track=7, valor_id=10
    await env.program.methods
      .updatePrimary(member.publicKey, new anchor.BN(track.toString()), new anchor.BN(valorId))
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        userStats: statsPda,
      } as any)
      .signers([governor])
      .rpc();

    const statsAfter = await env.program.account.userStats.fetch(statsPda);
    expect(statsAfter.primaryTrackId.toNumber()).to.equal(Number(track));
    expect(statsAfter.primaryValorId.toNumber()).to.equal(valorId);

    // Mint another Leadership badge (same track=7, rarity=30): now primary matches
    // → credential_level increases by rarity (30), not secondary_rarity (10)
    const levelBefore = statsAfter.credentialLevel.toNumber();
    await mintLeadershipTo(member);

    const statsFinal = await env.program.account.userStats.fetch(statsPda);
    // rarity=30 credited (primary track match)
    expect(statsFinal.credentialLevel.toNumber()).to.equal(levelBefore + 30);
  });
});
