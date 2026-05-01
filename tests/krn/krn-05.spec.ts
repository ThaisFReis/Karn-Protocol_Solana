// KRN-05 — Guardian self-mint must be rejected even when both `Signer`
// constraints are satisfied by the same wallet.
//
// The Stellar version of `guardian_mint` calls `guardian.require_auth()` and
// `account.require_auth()`. If `guardian == account`, a single signature
// satisfies both. Solana's `Signer<'info>` has the same shape — a single
// transaction signed once by `guardian == account` would pass the Anchor
// account-validation pass alone.
//
// This module tests the explicit `require_keys_neq!` check inside
// `guardian_mint::handler` (CONFIG.md Rule 5).

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

describe("KRN-05 — Guardian self-mint forbidden", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  const techValorId = 20;
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

    const [techPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(techValorId)],
      env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(techValorId),
        new anchor.BN(25),
        new anchor.BN(8),
        new anchor.BN(1),
        "Rust"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: techPda,
      } as any)
      .signers([governor])
      .rpc();
  });

  it("guardian == account triggers GuardianSelfMintForbidden", async () => {
    const wallet = fundedKeypair(env);

    const [tracksPda] = PublicKey.findProgramAddressSync(
      [GUARDIAN_SEED, wallet.publicKey.toBuffer()],
      env.program.programId
    );

    // Wallet is registered as a guardian for track 1.
    await env.program.methods
      .setGuardianTracks(wallet.publicKey, [new anchor.BN(1)])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        guardianTracks: tracksPda,
      } as any)
      .signers([governor])
      .rpc();

    const tokenId = 1;
    const [recipientStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, wallet.publicKey.toBuffer()],
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
      [VALOR_SEED, leUint64(techValorId)],
      env.program.programId
    );

    let errMsg: string | null = null;
    try {
      await env.program.methods
        .guardianMint(new anchor.BN(techValorId), new anchor.BN(tokenId))
        .accounts({
          guardian: wallet.publicKey,
          account: wallet.publicKey, // ← attack: same wallet as both
          config: configPda,
          valor,
          guardianTracks: tracksPda,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([wallet]) // single signature
        .rpc();
    } catch (e: any) {
      errMsg = e?.toString() ?? "";
    }

    expect(errMsg, "self-mint must fail").to.not.be.null;
    expect(errMsg).to.match(/GuardianSelfMintForbidden|6019/);
  });

  it("guardian != account proceeds normally (control)", async () => {
    const guardian = fundedKeypair(env);
    const account = fundedKeypair(env);

    const [tracksPda] = PublicKey.findProgramAddressSync(
      [GUARDIAN_SEED, guardian.publicKey.toBuffer()],
      env.program.programId
    );
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

    const [recipientStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, account.publicKey.toBuffer()],
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
      [VALOR_SEED, leUint64(techValorId)],
      env.program.programId
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
    expect(stats.credentialLevel.toNumber()).to.equal(8);
  });
});
