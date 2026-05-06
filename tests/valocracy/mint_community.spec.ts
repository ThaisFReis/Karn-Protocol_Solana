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

function expectAnchorError(err: unknown, code: string) {
  expect(err).to.be.an("error");
  const text = err instanceof Error ? err.message : String(err);
  expect(text).to.include(code);
}

describe("valocracy.mint_community", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  const leadershipValorId = 10;
  const leadershipRarity = 50;
  const communityValorId = 60;
  const communityRarity = 12;

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

    const [communityPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(communityValorId)],
      env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(communityValorId),
        new anchor.BN(communityRarity),
        new anchor.BN(communityRarity),
        new anchor.BN(0),
        "Active Voter"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: communityPda,
      } as any)
      .signers([governor])
      .rpc();
  });

  function pdas(recipient: PublicKey, minter: PublicKey, valorId: number, tokenId: number) {
    const [minterStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, minter.toBuffer()],
      env.program.programId
    );
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
    return { minterStats, recipientStats, tokenOwner, tokenValor, valor };
  }

  async function nextTokenId(): Promise<number> {
    const config = await env.program.account.config.fetch(configPda);
    return config.totalSupply.toNumber() + 1;
  }

  async function mintLeadershipToMember(member: PublicKey) {
    const tokenId = await nextTokenId();
    const [recipientStats] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, member.toBuffer()],
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
      [VALOR_SEED, leUint64(leadershipValorId)],
      env.program.programId
    );

    await env.program.methods
      .mint(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
      .accounts({
        minter: governor.publicKey,
        recipient: member,
        config: configPda,
        valor,
        recipientStats,
        tokenOwner,
        tokenValor,
      } as any)
      .signers([governor])
      .rpc();
  }

  it("allows a member with credential_level > 0 to mint a Community badge", async () => {
    const minter = fundedKeypair(env);
    const recipient = Keypair.generate().publicKey;

    await mintLeadershipToMember(minter.publicKey);
    const tokenId = await nextTokenId();

    const { minterStats, recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      minter.publicKey,
      communityValorId,
      tokenId
    );

    await env.program.methods
      .mintCommunity(new anchor.BN(communityValorId), new anchor.BN(tokenId))
      .accounts({
        minter: minter.publicKey,
        minterStats,
        recipient,
        config: configPda,
        valor,
        recipientStats,
        tokenOwner,
        tokenValor,
      } as any)
      .signers([minter])
      .rpc();

    const stats = await env.program.account.userStats.fetch(recipientStats);
    expect(stats.credentialLevel.toNumber()).to.equal(communityRarity);
  });

  it("rejects mint_community when caller is not a member", async () => {
    const intruder = fundedKeypair(env);
    const recipient = Keypair.generate().publicKey;
    const tokenId = await nextTokenId();
    const { minterStats, recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      intruder.publicKey,
      communityValorId,
      tokenId
    );

    let caught: unknown;
    try {
      await env.program.methods
        .mintCommunity(new anchor.BN(communityValorId), new anchor.BN(tokenId))
        .accounts({
          minter: intruder.publicKey,
          minterStats,
          recipient,
          config: configPda,
          valor,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([intruder])
        .rpc();
    } catch (err) {
      caught = err;
    }
    expect(caught, "non-member must fail").to.not.equal(undefined);
    expectAnchorError(caught, "MintNotAuthorized");
  });

  it("rejects mint_community for non-Community valor ids", async () => {
    const minter = fundedKeypair(env);
    const recipient = Keypair.generate().publicKey;

    await mintLeadershipToMember(minter.publicKey);
    const tokenId = await nextTokenId();

    const { minterStats, recipientStats, tokenOwner, tokenValor, valor } = pdas(
      recipient,
      minter.publicKey,
      leadershipValorId,
      tokenId
    );

    let caught: unknown;
    try {
      await env.program.methods
        .mintCommunity(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
        .accounts({
          minter: minter.publicKey,
          minterStats,
          recipient,
          config: configPda,
          valor,
          recipientStats,
          tokenOwner,
          tokenValor,
        } as any)
        .signers([minter])
        .rpc();
    } catch (err) {
      caught = err;
    }
    expect(caught, "non-community badge must fail").to.not.equal(undefined);
    expectAnchorError(caught, "BadgeNotMintable");
  });
});
