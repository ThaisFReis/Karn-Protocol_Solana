/**
 * M7 — credit_activity / set_credit_authority / pause_credit / resume_credit
 *      / revoke_credit_authority Bankrun tests.
 *
 * Coverage (7 tests required by PRD):
 *  1. credit ok — happy path, activity_level updated
 *  2. pausado falha — credit_activity rejects when credit_paused == true
 *  3. authority sem track falha — track_id not in CreditAuthority list
 *  4. cap respeitado — amount=300 → effective=200 (ACTIVITY_CREDIT_CAP)
 *  5. janela rolante reseta — after 30d window resets and fresh cap applies
 *  6. partial credit — fills remaining cap after partial use
 *  7. credit a non-member falha — recipient has no UserStats
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Clock } from "solana-bankrun";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

// Mirrors constants in karn-shared
const ACTIVITY_CREDIT_CAP = 200n;
const ACTIVITY_CREDIT_CAP_PERIOD = BigInt(30 * 24 * 60 * 60); // 30 days
const ACTIVITY_PERIOD = BigInt(90 * 24 * 60 * 60); // 90 days

const NOW = 1_000_000n;

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");
const CREDIT_AUTH_SEED = Buffer.from("credit_auth");
const CREDIT_WINDOW_SEED = Buffer.from("credit_window");

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

function creditAuthPda(program: anchor.Program<any>, authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [CREDIT_AUTH_SEED, authority.toBuffer()],
    program.programId
  );
  return pda;
}

function creditWindowPda(program: anchor.Program<any>, account: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [CREDIT_WINDOW_SEED, account.toBuffer()],
    program.programId
  );
  return pda;
}

function userStatsPda(program: anchor.Program<any>, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, wallet.toBuffer()],
    program.programId
  );
  return pda;
}

describe("valocracy.credit_activity (M7)", () => {
  let env: BootstrapResult;
  let governor: Keypair;
  let creditAuth: Keypair;
  let configPda: PublicKey;

  // valor_id=10 → Leadership category, mintable by governor via `mint`.
  const memberValorId = 10;
  const trackId = 5n;

  /** Mint a Leadership badge (rarity=50) to `recipient` using sequential token_ids. */
  let nextTokenId = 1;
  async function mintMemberTo(recipient: Keypair): Promise<void> {
    const tokenId = nextTokenId++;
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)],
      env.program.programId
    );
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(memberValorId)],
      env.program.programId
    );
    const recipientStatsPda = userStatsPda(env.program, recipient.publicKey);

    await env.program.methods
      .mint(new anchor.BN(memberValorId), new anchor.BN(tokenId))
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

  /** Call credit_activity as `creditAuth` for `recipient`. */
  async function creditActivity(
    recipient: PublicKey,
    amount: bigint
  ): Promise<void> {
    const authPda = creditAuthPda(env.program, creditAuth.publicKey);
    const windowPda = creditWindowPda(env.program, recipient);
    const statsPda = userStatsPda(env.program, recipient);

    await env.program.methods
      .creditActivity(recipient, new anchor.BN(trackId.toString()), new anchor.BN(amount.toString()))
      .accounts({
        authority: creditAuth.publicKey,
        config: configPda,
        creditAuthority: authPda,
        creditWindow: windowPda,
        userStats: statsPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([creditAuth])
      .rpc();
  }

  before(async () => {
    env = await bootstrapValocracy();
    governor = fundedKeypair(env);
    creditAuth = fundedKeypair(env);

    env.context.setClock(new Clock(1n, NOW, 0n, 0n, NOW));

    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      env.program.programId
    );

    // Initialize with member_valor_id=10, leadership_valor_id=10 (same valor for simplicity)
    await env.program.methods
      .initialize(
        governor.publicKey,
        Keypair.generate().publicKey,
        Array.from(new Uint8Array(32)),
        new anchor.BN(memberValorId),
        new anchor.BN(memberValorId)
      )
      .accounts({ payer: env.payer.publicKey, config: configPda } as any)
      .rpc();

    // Register a badge definition for valor_id=1 (rarity=10, track=trackId)
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(memberValorId)],
      env.program.programId
    );
    await env.program.methods
      .setValor(
        new anchor.BN(memberValorId),
        new anchor.BN(10),
        new anchor.BN(0),
        new anchor.BN(trackId.toString()),
        "Member"
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

    // Register creditAuth for trackId
    const authPda = creditAuthPda(env.program, creditAuth.publicKey);
    await env.program.methods
      .setCreditAuthority(creditAuth.publicKey, [new anchor.BN(trackId.toString())])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        creditAuthority: authPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────

  it("credits activity and updates activity_level + activity_expiry", async () => {
    const recipient = fundedKeypair(env);
    await mintMemberTo(recipient);

    const statsPda = userStatsPda(env.program, recipient.publicKey);
    const statsBefore = await env.program.account.userStats.fetch(statsPda);
    expect(statsBefore.activityLevel.toNumber()).to.equal(0);

    await creditActivity(recipient.publicKey, 50n);

    const statsAfter = await env.program.account.userStats.fetch(statsPda);
    expect(statsAfter.activityLevel.toNumber()).to.equal(50);
    // activity_expiry = NOW + ACTIVITY_PERIOD
    const expectedExpiry = Number(NOW + ACTIVITY_PERIOD);
    expect(statsAfter.activityExpiry.toNumber()).to.equal(expectedExpiry);
  });

  // ── 2. Circuit breaker ────────────────────────────────────────────────────

  it("rejects credit_activity when credit_paused == true", async () => {
    const recipient = fundedKeypair(env);
    await mintMemberTo(recipient);

    // Pause credits
    await env.program.methods
      .pauseCredit()
      .accounts({ governor: governor.publicKey, config: configPda } as any)
      .signers([governor])
      .rpc();

    try {
      await creditActivity(recipient.publicKey, 10n);
      expect.fail("expected ActivityCreditPaused error");
    } catch (e: any) {
      expect(e.toString()).to.include("ActivityCreditPaused");
    } finally {
      // Always resume so subsequent tests are not affected
      await env.program.methods
        .resumeCredit()
        .accounts({ governor: governor.publicKey, config: configPda } as any)
        .signers([governor])
        .rpc();
    }
  });

  // ── 3. Authority track check ──────────────────────────────────────────────

  it("rejects when credit authority is not registered for track", async () => {
    const recipient = fundedKeypair(env);
    await mintMemberTo(recipient);

    const wrongAuth = fundedKeypair(env);
    // Register wrongAuth for a different track (trackId + 1)
    const wrongTrack = trackId + 1n;
    const wrongAuthPda = creditAuthPda(env.program, wrongAuth.publicKey);
    await env.program.methods
      .setCreditAuthority(wrongAuth.publicKey, [new anchor.BN(wrongTrack.toString())])
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        creditAuthority: wrongAuthPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();

    // wrongAuth tries to credit for trackId (not in its allowlist)
    const windowPda = creditWindowPda(env.program, recipient.publicKey);
    const statsPda = userStatsPda(env.program, recipient.publicKey);
    try {
      await env.program.methods
        .creditActivity(recipient.publicKey, new anchor.BN(trackId.toString()), new anchor.BN(10))
        .accounts({
          authority: wrongAuth.publicKey,
          config: configPda,
          creditAuthority: wrongAuthPda,
          creditWindow: windowPda,
          userStats: statsPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([wrongAuth])
        .rpc();
      expect.fail("expected CreditAuthorityUnauthorized error");
    } catch (e: any) {
      expect(e.toString()).to.include("CreditAuthorityUnauthorized");
    }
  });

  // ── 4. Cap enforcement ────────────────────────────────────────────────────

  it("caps effective_amount at ACTIVITY_CREDIT_CAP (200) when amount=300", async () => {
    const recipient = fundedKeypair(env);
    await mintMemberTo(recipient);

    const statsPda = userStatsPda(env.program, recipient.publicKey);

    await creditActivity(recipient.publicKey, 300n);

    const stats = await env.program.account.userStats.fetch(statsPda);
    expect(stats.activityLevel.toNumber()).to.equal(Number(ACTIVITY_CREDIT_CAP));
  });

  // ── 5. Rolling window reset ───────────────────────────────────────────────

  it("resets window after 30d and allows full cap again", async () => {
    const recipient = fundedKeypair(env);
    await mintMemberTo(recipient);

    // Fill cap in current window
    await creditActivity(recipient.publicKey, 200n);

    // Additional credit in the same window should have no effect
    await creditActivity(recipient.publicKey, 50n);
    const statsMid = await env.program.account.userStats.fetch(
      userStatsPda(env.program, recipient.publicKey)
    );
    expect(statsMid.activityLevel.toNumber()).to.equal(200);

    // Advance clock past 30d window
    const newNow = NOW + ACTIVITY_CREDIT_CAP_PERIOD + 1n;
    env.context.setClock(new Clock(1n, newNow, 0n, 0n, newNow));

    // After reset, another 100 credits should apply
    await creditActivity(recipient.publicKey, 100n);
    const statsAfter = await env.program.account.userStats.fetch(
      userStatsPda(env.program, recipient.publicKey)
    );
    // 200 (old accumulated level) + 100 (new credit after reset)
    expect(statsAfter.activityLevel.toNumber()).to.equal(300);

    // Restore clock
    env.context.setClock(new Clock(1n, NOW, 0n, 0n, NOW));
  });

  // ── 6. Partial credit ─────────────────────────────────────────────────────

  it("credits only remaining cap when window is partially used", async () => {
    const recipient = fundedKeypair(env);
    await mintMemberTo(recipient);

    // Use 150 of 200 capacity
    await creditActivity(recipient.publicKey, 150n);

    // Try to add 100 more — only 50 should land
    await creditActivity(recipient.publicKey, 100n);

    const stats = await env.program.account.userStats.fetch(
      userStatsPda(env.program, recipient.publicKey)
    );
    expect(stats.activityLevel.toNumber()).to.equal(200); // 150 + 50 (capped)
  });

  // ── 7. Non-member rejection ───────────────────────────────────────────────

  it("rejects credit_activity for an account with no UserStats", async () => {
    const stranger = Keypair.generate(); // never registered
    const authPda = creditAuthPda(env.program, creditAuth.publicKey);
    const windowPda = creditWindowPda(env.program, stranger.publicKey);
    const statsPda = userStatsPda(env.program, stranger.publicKey);

    try {
      await env.program.methods
        .creditActivity(stranger.publicKey, new anchor.BN(trackId.toString()), new anchor.BN(10))
        .accounts({
          authority: creditAuth.publicKey,
          config: configPda,
          creditAuthority: authPda,
          creditWindow: windowPda,
          userStats: statsPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creditAuth])
        .rpc();
      expect.fail("expected error for non-member");
    } catch (e: any) {
      // Anchor fails to deserialize an uninitialized UserStats account
      expect(e).to.exist;
    }
  });
});
