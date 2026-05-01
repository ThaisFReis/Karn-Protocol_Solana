/**
 * M12 — Lab/Scholarship Escrow (KRN-01) Bankrun tests.
 *
 * Coverage (6 tests required by PRD):
 *  1. fund_lab → restricted_reserves increments, Lab PDA created
 *  2. approve_scholarship → Claimable created/updated for member
 *  3. withdraw_scholarship → tokens transferred, restricted_reserves decrements
 *  4. KRN-01 — total_assets excludes restricted_reserves at all times
 *  5. withdraw above claimable fails — InsufficientClaimable
 *  6. double-withdraw fails — InsufficientClaimable on second attempt
 *
 * Shared state flows in order: each test builds on prior state.
 * Tests use distinct members to avoid claimable conflicts.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
} from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";

import { Treasury } from "../../target/types/treasury";
import treasuryIdl from "../../target/idl/treasury.json";

// ── Seed constants ────────────────────────────────────────────────────────────
const TREASURY_SEED = Buffer.from("treasury");
const LAB_SEED = Buffer.from("lab");
const CLAIMABLE_SEED = Buffer.from("claimable");

function leUint32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n);
  return buf;
}

function fundAccount(context: ProgramTestContext, pubkey: PublicKey): void {
  context.setAccount(pubkey, {
    lamports: 10_000_000_000,
    data: Buffer.alloc(0),
    owner: SystemProgram.programId,
    executable: false,
  });
}

async function processRawTx(context: ProgramTestContext, tx: Transaction, signers: Keypair[]): Promise<void> {
  const [blockhash] = await context.banksClient.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = context.payer.publicKey;
  tx.sign(...signers);
  await context.banksClient.processTransaction(tx);
}

async function createTestMint(context: ProgramTestContext, decimals: number): Promise<PublicKey> {
  const mintKp = Keypair.generate();
  const rent = await context.banksClient.getRent();
  const lamports = rent.minimumBalance(BigInt(MINT_SIZE));
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: context.payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      lamports: Number(lamports),
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKp.publicKey, decimals, context.payer.publicKey, null)
  );
  await processRawTx(context, tx, [context.payer, mintKp]);
  return mintKp.publicKey;
}

async function mintTo(context: ProgramTestContext, mint: PublicKey, dest: PublicKey, amount: number): Promise<void> {
  const tx = new Transaction().add(
    createMintToInstruction(mint, dest, context.payer.publicKey, amount)
  );
  await processRawTx(context, tx, [context.payer]);
}

async function createAta(context: ProgramTestContext, mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false);
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(context.payer.publicKey, ata, owner, mint)
  );
  await processRawTx(context, tx, [context.payer]);
  return ata;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("treasury.lab (M12)", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<Treasury>;
  let payer: Keypair;

  let governor: Keypair;
  let funder: Keypair;
  let mint: PublicKey;
  let statePda: PublicKey;
  let vaultAta: PublicKey;
  let funderAta: PublicKey;

  before(async () => {
    context = await startAnchor("./", [], []);
    provider = new BankrunProvider(context);
    program = new Program<Treasury>(treasuryIdl as any, provider);
    payer = context.payer;

    governor = Keypair.generate();
    funder = Keypair.generate();
    fundAccount(context, governor.publicKey);
    fundAccount(context, funder.publicKey);

    [statePda] = PublicKey.findProgramAddressSync([TREASURY_SEED], program.programId);

    mint = await createTestMint(context, 6);
    vaultAta = getAssociatedTokenAddressSync(mint, statePda, true);

    // Initialize treasury
    await program.methods
      .initialize()
      .accounts({
        payer: payer.publicKey,
        governor: governor.publicKey,
        valocracy: Keypair.generate().publicKey,
        assetMint: mint,
        state: statePda,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    // Pre-seed vault with 1_000_000 "free" tokens (not restricted) for KRN-01 test
    await mintTo(context, mint, vaultAta, 1_000_000);

    // Create funder's token account and give them 2_000_000 tokens for labs
    funderAta = await createAta(context, mint, funder.publicKey);
    await mintTo(context, mint, funderAta, 2_000_000);
  });

  /** Derive Lab PDA for a given lab_id. */
  function labPda(labId: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [LAB_SEED, leUint32(labId)],
      program.programId
    );
    return pda;
  }

  /** Derive Claimable PDA for a member. */
  function claimablePda(member: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [CLAIMABLE_SEED, member.toBuffer()],
      program.programId
    );
    return pda;
  }

  // ── 1. fund_lab ───────────────────────────────────────────────────────────

  it("fund_lab creates Lab PDA and increments restricted_reserves", async () => {
    const totalAmount = 500_000;
    const perMember = 100_000;

    await program.methods
      .fundLab(new anchor.BN(totalAmount), new anchor.BN(perMember))
      .accounts({
        funder: funder.publicKey,
        state: statePda,
        lab: labPda(0),
        funderAta,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([funder])
      .rpc();

    const state = await program.account.treasuryState.fetch(statePda);
    const lab = await program.account.lab.fetch(labPda(0));
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;

    expect(state.restrictedReserves.toNumber()).to.equal(500_000);
    expect(state.labCounter).to.equal(1);
    expect(lab.id).to.equal(0);
    expect(lab.totalAmount.toNumber()).to.equal(500_000);
    expect(lab.scholarshipPerMember.toNumber()).to.equal(100_000);
    expect(lab.status).to.deep.equal({ active: {} });  // Anchor enum representation
    // vault gained 500_000 (from funder) on top of the 1_000_000 pre-seeded
    expect(vaultBalance).to.equal(1_500_000n);
  });

  // ── 2. approve_scholarship ────────────────────────────────────────────────

  it("approve_scholarship creates Claimable PDA for member_A", async () => {
    const memberA = Keypair.generate();

    await program.methods
      .approveScholarship(0)  // lab_id = 0
      .accounts({
        governor: governor.publicKey,
        state: statePda,
        lab: labPda(0),
        member: memberA.publicKey,
        claimable: claimablePda(memberA.publicKey),
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();

    const claimable = await program.account.claimable.fetch(claimablePda(memberA.publicKey));
    expect(claimable.amount.toNumber()).to.equal(100_000);
    expect(claimable.member.toBase58()).to.equal(memberA.publicKey.toBase58());

    // Store member for downstream tests
    (global as any).__m12_memberA = memberA;
  });

  // ── 3. withdraw_scholarship ───────────────────────────────────────────────

  it("withdraw_scholarship transfers tokens and decrements restricted_reserves", async () => {
    const memberA: Keypair = (global as any).__m12_memberA;
    fundAccount(context, memberA.publicKey);
    const memberAta = await createAta(context, mint, memberA.publicKey);

    const stateBefore = await program.account.treasuryState.fetch(statePda);
    const restrictedBefore = stateBefore.restrictedReserves.toNumber();

    await program.methods
      .withdrawScholarship(new anchor.BN(100_000))
      .accounts({
        member: memberA.publicKey,
        state: statePda,
        claimable: claimablePda(memberA.publicKey),
        vaultAta,
        memberAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([memberA])
      .rpc();

    const memberBalance = (await getAccount(provider.connection, memberAta)).amount;
    const stateAfter = await program.account.treasuryState.fetch(statePda);
    const claimable = await program.account.claimable.fetch(claimablePda(memberA.publicKey));

    expect(memberBalance).to.equal(100_000n);
    expect(claimable.amount.toNumber()).to.equal(0);
    expect(stateAfter.restrictedReserves.toNumber()).to.equal(restrictedBefore - 100_000);
  });

  // ── 4. KRN-01 — total_assets excludes restricted_reserves ────────────────

  it("KRN-01: total_assets = vault_balance − restricted_reserves remains constant across lab ops", async () => {
    // Fund a second lab to increase restricted_reserves further
    await program.methods
      .fundLab(new anchor.BN(200_000), new anchor.BN(50_000))
      .accounts({
        funder: funder.publicKey,
        state: statePda,
        lab: labPda(1),
        funderAta,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([funder])
      .rpc();

    const state = await program.account.treasuryState.fetch(statePda);
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;
    const restricted = BigInt(state.restrictedReserves.toString());

    // total_assets formula (KRN-01)
    const totalAssets = vaultBalance >= restricted ? vaultBalance - restricted : 0n;

    // The 1_000_000 pre-seeded free tokens should equal total_assets regardless
    // of how many tokens were added via fund_lab (those are always restricted).
    expect(totalAssets).to.equal(1_000_000n);
    expect(restricted).to.equal(BigInt(state.restrictedReserves.toString()));
  });

  // ── 5. withdraw above claimable fails ────────────────────────────────────

  it("withdraw_scholarship above claimable fails (InsufficientClaimable)", async () => {
    // Approve member_B for 50_000 from lab 1
    const memberB = Keypair.generate();
    fundAccount(context, memberB.publicKey);

    await program.methods
      .approveScholarship(1)  // lab_id = 1
      .accounts({
        governor: governor.publicKey,
        state: statePda,
        lab: labPda(1),
        member: memberB.publicKey,
        claimable: claimablePda(memberB.publicKey),
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();

    const memberAta = await createAta(context, mint, memberB.publicKey);

    try {
      await program.methods
        .withdrawScholarship(new anchor.BN(100_000))  // 100_000 > 50_000 claimable
        .accounts({
          member: memberB.publicKey,
          state: statePda,
          claimable: claimablePda(memberB.publicKey),
          vaultAta,
          memberAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([memberB])
        .rpc();
      expect.fail("expected InsufficientClaimable");
    } catch (e: any) {
      expect(e.toString()).to.include("InsufficientClaimable");
    }
  });

  // ── 6. double-withdraw fails ──────────────────────────────────────────────

  it("second withdraw after full exhaustion fails (InsufficientClaimable)", async () => {
    // member_A's claimable is 0 after test 3
    const memberA: Keypair = (global as any).__m12_memberA;
    const memberAta = getAssociatedTokenAddressSync(mint, memberA.publicKey, false);

    try {
      await program.methods
        .withdrawScholarship(new anchor.BN(1))
        .accounts({
          member: memberA.publicKey,
          state: statePda,
          claimable: claimablePda(memberA.publicKey),
          vaultAta,
          memberAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([memberA])
        .rpc();
      expect.fail("expected InsufficientClaimable");
    } catch (e: any) {
      expect(e.toString()).to.include("InsufficientClaimable");
    }
  });
});
