/**
 * M6 — get_votes / get_votes_at Bankrun tests.
 *
 * Coverage:
 *  1. get_votes returns 0 for an unregistered account
 *  2. get_votes returns MEMBER_FLOOR (5) after a Member-floor mint
 *  3. get_votes returns credential_level (=50) right after a Leadership mint
 *     (full VACANCY_PERIOD remaining → bonus == credential_level − floor)
 *  4. get_votes_at decays correctly halfway through VACANCY_PERIOD
 *  5. get_votes_at at or past expiry returns MEMBER_FLOOR only
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Clock } from "solana-bankrun";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");

// 180 days in seconds (mirrors VACANCY_PERIOD constant).
const VACANCY_PERIOD = BigInt(180 * 24 * 60 * 60);

const MEMBER_FLOOR = 5n;

const NOW = 1_000_000n; // arbitrary deterministic "now"

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

/** Derive user_stats PDA for a given wallet. */
function userStatsPda(program: anchor.Program<any>, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, wallet.toBuffer()],
    program.programId
  );
  return pda;
}

describe("valocracy.get_votes / get_votes_at (M6)", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let configPda: PublicKey;

  const leadershipValorId = 10;
  const leadershipRarity = 50;

  before(async () => {
    env = await bootstrapValocracy();
    governor = fundedKeypair(env);

    // Pin clock to deterministic NOW.
    env.context.setClock(
      new Clock(1n, NOW, 0n, 0n, NOW)
    );

    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      env.program.programId
    );

    // Initialize: governor is the "governor" authority, member valor id = 0.
    await env.program.methods
      .initialize(
        governor.publicKey,
        Keypair.generate().publicKey,
        Array.from(new Uint8Array(32)),
        new anchor.BN(0),
        new anchor.BN(leadershipValorId)
      )
      .accounts({ payer: env.payer.publicKey, config: configPda } as any)
      .rpc();

    // Register a Leadership badge definition (id=10, rarity=50, track=0).
    const [valorPda] = PublicKey.findProgramAddressSync(
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
        valor: valorPda,
        payer: governor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Mint token_id=1 Leadership badge to recipient, signed by governor. */
  async function mintLeadershipTo(recipient: Keypair): Promise<void> {
    const tokenId = 1;
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(leadershipValorId)],
      env.program.programId
    );
    const recipientStatsPda = userStatsPda(env.program, recipient.publicKey);

    await env.program.methods
      .mint(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: valorPda,
        recipientStats: recipientStatsPda,
        tokenOwner: tokenOwnerPda,
        tokenValor: tokenValorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  it("returns 0 for an unregistered account", async () => {
    const stranger = Keypair.generate();
    const statsPda = userStatsPda(env.program, stranger.publicKey);
    // BankrunProvider.simulate doesn't auto-sign with wallet; pass payer explicitly.
    const mana = await env.program.methods
      .getVotes(stranger.publicKey)
      .accounts({ userStats: statsPda } as any)
      .signers([env.payer])
      .view();
    expect(mana.toNumber()).to.equal(0);
  });

  it("returns credential_level (50) right after Leadership mint at NOW", async () => {
    const recipient = fundedKeypair(env);
    await mintLeadershipTo(recipient);

    const statsPda = userStatsPda(env.program, recipient.publicKey);
    const mana = await env.program.methods
      .getVotes(recipient.publicKey)
      .accounts({ userStats: statsPda } as any)
      .signers([env.payer])
      .view();
    // Mana = MEMBER_FLOOR + (50-5)*VACANCY_PERIOD/VACANCY_PERIOD = 5+45 = 50
    expect(mana.toNumber()).to.equal(leadershipRarity);
  });

  it("get_votes_at halfway through VACANCY_PERIOD returns 5 + 22 = 27", async () => {
    // Reuse the recipient from the previous test — or just derive it.
    const recipient = fundedKeypair(env);
    // Need a fresh token_id. We'll use a fresh context to avoid token_id collision.
    // Instead, query an existing user with credential_level=50.
    // Since tests share state within the describe block, create a new recipient
    // and mint before querying.

    // Use token_id=2 since token_id=1 was used above.
    const tokenId = 2;
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(leadershipValorId)],
      env.program.programId
    );
    const recipientStatsPda = userStatsPda(env.program, recipient.publicKey);

    await env.program.methods
      .mint(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: valorPda,
        recipientStats: recipientStatsPda,
        tokenOwner: tokenOwnerPda,
        tokenValor: tokenValorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();

    // Snapshot at NOW + VACANCY_PERIOD/2:
    // time_remaining = VACANCY_PERIOD/2
    // credential_bonus = (45 * VACANCY_PERIOD/2) / VACANCY_PERIOD = 22 (truncates)
    const halfwayTs = new anchor.BN((NOW + VACANCY_PERIOD / 2n).toString());
    const mana = await env.program.methods
      .getVotesAt(recipient.publicKey, halfwayTs)
      .accounts({ userStats: recipientStatsPda } as any)
      .signers([env.payer])
      .view();
    expect(mana.toNumber()).to.equal(5 + 22); // MEMBER_FLOOR + 22
  });

  it("get_votes_at at credential_expiry returns MEMBER_FLOOR (5)", async () => {
    const recipient = fundedKeypair(env);
    const tokenId = 3;
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(leadershipValorId)],
      env.program.programId
    );
    const recipientStatsPda = userStatsPda(env.program, recipient.publicKey);

    await env.program.methods
      .mint(new anchor.BN(leadershipValorId), new anchor.BN(tokenId))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: valorPda,
        recipientStats: recipientStatsPda,
        tokenOwner: tokenOwnerPda,
        tokenValor: tokenValorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();

    // At or after credential_expiry, credential_bonus = 0.
    const expiryTs = new anchor.BN((NOW + VACANCY_PERIOD).toString());
    const mana = await env.program.methods
      .getVotesAt(recipient.publicKey, expiryTs)
      .accounts({ userStats: recipientStatsPda } as any)
      .signers([env.payer])
      .view();
    expect(mana.toNumber()).to.equal(Number(MEMBER_FLOOR));
  });

  it("get_votes_at returns 0 for an unregistered account", async () => {
    const stranger = Keypair.generate();
    const statsPda = userStatsPda(env.program, stranger.publicKey);
    const mana = await env.program.methods
      .getVotesAt(stranger.publicKey, new anchor.BN(0))
      .accounts({ userStats: statsPda } as any)
      .signers([env.payer])
      .view();
    expect(mana.toNumber()).to.equal(0);
  });
});
