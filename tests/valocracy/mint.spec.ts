import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");

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

describe("valocracy.mint", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  // Leadership badge (id 10), domain-agnostic, rarity 50.
  const leadershipValorId = 10;
  const leadershipRarity = 50;

  // Track badge (id 20), Tech track, rarity 25 / secondary 8.
  const trackValorId = 20;
  const trackRarity = 25;
  const trackSecondaryRarity = 8;
  const trackId = 1;

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
        Array.from(new Uint8Array(32)),
        new anchor.BN(0),
        new anchor.BN(leadershipValorId)
      )
      .accounts({
        payer: env.payer.publicKey,
        config: configPda,
      } as any)
      .rpc();

    // Seed leadership badge as domain-agnostic (track_id = 0).
    const [leadershipPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(leadershipValorId)],
      env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(leadershipValorId),
        new anchor.BN(leadershipRarity),
        new anchor.BN(0),
        new anchor.BN(0),
        "Leadership"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: leadershipPda,
      } as any)
      .signers([governor])
      .rpc();

    // Seed track badge for Tech.
    const [trackPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(trackValorId)],
      env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(trackValorId),
        new anchor.BN(trackRarity),
        new anchor.BN(trackSecondaryRarity),
        new anchor.BN(trackId),
        "Rust Developer"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: trackPda,
      } as any)
      .signers([governor])
      .rpc();
  });

  function pdas(recipient: PublicKey, valorId: number, tokenId: number) {
    const [recipientStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, recipient.toBuffer()],
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
    const [valor] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)],
      env.program.programId
    );
    return { recipientStats, tokenOwner, tokenValor, valor };
  }

  it("Governor mints Leadership badge to first genesis member", async () => {
    const recipient = Keypair.generate().publicKey;
    const { recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      leadershipValorId,
      1
    );

    await env.program.methods
      .mint(new anchor.BN(leadershipValorId), new anchor.BN(1))
      .accounts({
        minter: governor.publicKey,
        recipient,
        config: configPda,
        valor,
        recipientStats,
        tokenOwner,
        tokenValor,
      } as any)
      .signers([governor])
      .rpc();

    const config = await env.program.account.config.fetch(configPda);
    expect(config.totalSupply.toNumber()).to.equal(1);

    const stats = await env.program.account.userStats.fetch(recipientStats);
    expect(stats.credentialLevel.toNumber()).to.equal(leadershipRarity);

    const ownerAcct = await env.program.account.tokenOwner.fetch(tokenOwner);
    expect(ownerAcct.owner.toBase58()).to.equal(recipient.toBase58());

    const valorAcct = await env.program.account.tokenValorId.fetch(tokenValor);
    expect(valorAcct.valorId.toNumber()).to.equal(leadershipValorId);
  });

  it("Increments total_supply across multiple genesis mints", async () => {
    const r2 = Keypair.generate().publicKey;
    const r3 = Keypair.generate().publicKey;

    for (const [recipient, tokenId] of [[r2, 2], [r3, 3]] as const) {
      const { recipientStats, tokenOwner, tokenValor, valor } = pdas(
        recipient,
        leadershipValorId,
        tokenId
      );
      await env.program.methods
        .mint(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
        .accounts({
          minter: governor.publicKey,
          recipient,
          config: configPda,
          valor,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([governor])
        .rpc();
    }

    const config = await env.program.account.config.fetch(configPda);
    expect(config.totalSupply.toNumber()).to.equal(3);
  });

  it("Track badge minted to user without primary track gets secondary rarity", async () => {
    const recipient = Keypair.generate().publicKey;
    const { recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      trackValorId,
      4
    );

    await env.program.methods
      .mint(new anchor.BN(trackValorId), new anchor.BN(4))
      .accounts({
        minter: governor.publicKey,
        recipient,
        config: configPda,
        valor,
        recipientStats,
        tokenOwner,
        tokenValor,
      } as any)
      .signers([governor])
      .rpc();

    const stats = await env.program.account.userStats.fetch(recipientStats);
    // No primary_track_id set → cross-domain → secondary_rarity (8), not 25.
    expect(stats.credentialLevel.toNumber()).to.equal(trackSecondaryRarity);
  });

  it("rejects mint when caller is not the governor", async () => {
    const intruder = fundedKeypair(env);
    const recipient = Keypair.generate().publicKey;
    const { recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      leadershipValorId,
      5
    );

    let errored = false;
    try {
      await env.program.methods
        .mint(new anchor.BN(leadershipValorId), new anchor.BN(5))
        .accounts({
          minter: intruder.publicKey,
          recipient,
          config: configPda,
          valor,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([intruder])
        .rpc();
    } catch (_) {
      errored = true;
    }
    expect(errored, "non-governor must fail").to.equal(true);
  });

  it("rejects mint with token_id != total_supply + 1 (InvalidTokenId)", async () => {
    const recipient = Keypair.generate().publicKey;
    const skipAhead = 99;
    const { recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      leadershipValorId,
      skipAhead
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .mint(new anchor.BN(leadershipValorId), new anchor.BN(skipAhead))
        .accounts({
          minter: governor.publicKey,
          recipient,
          config: configPda,
          valor,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([governor])
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }
    expect(errMsg, "skip-ahead token_id must be rejected").to.not.be.null;
    expect(errMsg).to.match(/InvalidTokenId|6018/);
  });
});
