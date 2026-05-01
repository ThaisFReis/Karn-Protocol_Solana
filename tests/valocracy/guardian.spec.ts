import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");
const GUARDIAN_SEED = Buffer.from("guardian");

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

describe("valocracy guardian flow + KRN-05", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  // Track-1 (Tech) badge: rarity 25, secondary 8.
  const techValorId = 20;
  // Track-2 (Design) badge: rarity 22, secondary 7.
  const designValorId = 30;
  // Domain-agnostic Leadership: rarity 50.
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
        Array.from(new Uint8Array(32)),
        new anchor.BN(0),
        new anchor.BN(leadershipValorId)
      )
      .accounts({
        payer: env.payer.publicKey,
        config: configPda,
      } as any)
      .rpc();

    for (const [valorId, rarity, secondary, trackId, name] of [
      [techValorId, 25, 8, 1, "Rust Developer"],
      [designValorId, 22, 7, 2, "UX/UI Design"],
      [leadershipValorId, 50, 0, 0, "Leadership"],
    ] as const) {
      const [valorPda] = PublicKey.findProgramAddressSync(
        [VALOR_SEED, leUint64(valorId)],
        env.program.programId
      );
      await env.program.methods
        .setValor(
          new anchor.BN(valorId),
          new anchor.BN(rarity),
          new anchor.BN(secondary),
          new anchor.BN(trackId),
          name
        )
        .accounts({
          governor: governor.publicKey,
          config: configPda,
          valor: valorPda,
        } as any)
        .signers([governor])
        .rpc();
    }
  });

  function guardianTracksPda(guardian: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [GUARDIAN_SEED, guardian.toBuffer()],
      env.program.programId
    );
    return pda;
  }

  function mintPdas(account: PublicKey, valorId: number, tokenId: number) {
    const [recipientStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, account.toBuffer()],
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

  it("Governor sets a guardian's track allowlist", async () => {
    const guardian = fundedKeypair(env);
    const tracksPda = guardianTracksPda(guardian.publicKey);

    await env.program.methods
      .setGuardianTracks(guardian.publicKey, [new anchor.BN(1)])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    const tracks = await env.program.account.guardianTracks.fetch(tracksPda);
    expect(tracks.authority.toBase58()).to.equal(guardian.publicKey.toBase58());
    expect(tracks.trackIds.map((b: anchor.BN) => b.toNumber())).to.deep.equal([1]);
  });

  it("Non-governor cannot set guardian tracks", async () => {
    const intruder = fundedKeypair(env);
    const guardian = fundedKeypair(env);
    const tracksPda = guardianTracksPda(guardian.publicKey);

    let errored = false;
    try {
      await env.program.methods
        .setGuardianTracks(guardian.publicKey, [new anchor.BN(1)])
        .accounts({
          governor: intruder.publicKey,
          config: configPda,
          guardianTracks: tracksPda,
        } as any)
        .signers([intruder])
        .rpc();
    } catch (_) {
      errored = true;
    }
    expect(errored).to.equal(true);
  });

  it("Authorized guardian mints a Track badge for an account that consents", async () => {
    const guardian = fundedKeypair(env);
    const account = fundedKeypair(env);

    const tracksPda = guardianTracksPda(guardian.publicKey);
    await env.program.methods
      .setGuardianTracks(guardian.publicKey, [new anchor.BN(1)])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;
    const { recipientStats, tokenOwner, tokenValor, valor } = mintPdas(
      account.publicKey,
      techValorId,
      tokenId
    );

    await env.program.methods
      .guardianMint(new anchor.BN(techValorId), new anchor.BN(tokenId))
      .accounts({
        guardian: guardian.publicKey,
        account: account.publicKey,
        config: configPda,
        valor,
        guardianTracks: tracksPda,
        recipientStats,
        tokenOwner,
        tokenValor,
      } as any)
      .signers([guardian, account])
      .rpc();

    const stats = await env.program.account.userStats.fetch(recipientStats);
    // No primary set → cross-domain → secondary_rarity (8).
    expect(stats.credentialLevel.toNumber()).to.equal(8);
  });

  it("Guardian unauthorized for the badge's track is rejected (GuardianTrackUnauthorized)", async () => {
    const guardian = fundedKeypair(env);
    const account = fundedKeypair(env);

    const tracksPda = guardianTracksPda(guardian.publicKey);
    // Guardian only authorized for track 1 (Tech)…
    await env.program.methods
      .setGuardianTracks(guardian.publicKey, [new anchor.BN(1)])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    // …but tries to mint a track-2 (Design) badge.
    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;
    const { recipientStats, tokenOwner, tokenValor, valor } = mintPdas(
      account.publicKey,
      designValorId,
      tokenId
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .guardianMint(new anchor.BN(designValorId), new anchor.BN(tokenId))
        .accounts({
          guardian: guardian.publicKey,
          account: account.publicKey,
          config: configPda,
          valor,
          guardianTracks: tracksPda,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([guardian, account])
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }
    expect(errMsg).to.match(/GuardianTrackUnauthorized|6015/);
  });

  it("Domain-agnostic badge (track_id == 0) cannot be guardian-minted", async () => {
    const guardian = fundedKeypair(env);
    const account = fundedKeypair(env);

    const tracksPda = guardianTracksPda(guardian.publicKey);
    await env.program.methods
      .setGuardianTracks(guardian.publicKey, [new anchor.BN(1)])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    const cfgBefore = await env.program.account.config.fetch(configPda);
    const tokenId = cfgBefore.totalSupply.toNumber() + 1;
    const { recipientStats, tokenOwner, tokenValor, valor } = mintPdas(
      account.publicKey,
      leadershipValorId,
      tokenId
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .guardianMint(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
        .accounts({
          guardian: guardian.publicKey,
          account: account.publicKey,
          config: configPda,
          valor,
          guardianTracks: tracksPda,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([guardian, account])
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }
    expect(errMsg).to.match(/GuardianTrackUnauthorized|6015/);
  });

  it("Governor closes a guardian's track allowlist (rent returned)", async () => {
    const guardian = fundedKeypair(env);
    const tracksPda = guardianTracksPda(guardian.publicKey);

    await env.program.methods
      .setGuardianTracks(guardian.publicKey, [new anchor.BN(1)])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    await env.program.methods
      .removeGuardian(guardian.publicKey)
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    // After close, Anchor's typed fetch throws.
    let errored = false;
    try {
      await env.program.account.guardianTracks.fetch(tracksPda);
    } catch (_) {
      errored = true;
    }
    expect(errored, "guardian_tracks PDA should be closed").to.equal(true);
  });
});
