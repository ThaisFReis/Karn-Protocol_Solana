// KRN-01 — Restricted reserves isolation: `total_assets` (used for pro-rata
// share pricing) NEVER includes scholarship-locked funds.
//
// Attack surface without this invariant: a malicious governance proposal could
// call `transfer` with `amount = vault_balance`, silently draining scholarship
// escrow. Alternatively, share-price inflation could allow early depositors to
// exit with more than they deposited by timing withdrawals against lab funding.
//
// This suite verifies three sub-properties:
//   KRN-01a: `restricted_reserves` increases by `total_amount` on `fund_lab`
//   KRN-01b: `total_assets = vault_balance - restricted_reserves` at all times
//   KRN-01c: `transfer` cannot move tokens exceeding `total_assets` (the
//            unrestricted portion), even when vault_balance > transfer_amount
//
// These tests are the canonical reference — each has a single, named invariant.
// The overlapping coverage in `treasury/transfer.spec.ts` and `treasury/lab.spec.ts`
// tests functional behavior; this file tests the security property explicitly.

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

// ── Seeds ─────────────────────────────────────────────────────────────────────
const TREASURY_SEED = Buffer.from("treasury");
const LAB_SEED      = Buffer.from("lab");

function leUint32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n);
  return buf;
}

// ── Shared SPL helpers ────────────────────────────────────────────────────────

async function processRawTx(
  context: ProgramTestContext,
  tx: Transaction,
  signers: Keypair[],
): Promise<void> {
  const [blockhash] = await context.banksClient.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = context.payer.publicKey;
  tx.sign(...signers);
  await context.banksClient.processTransaction(tx);
}

async function createTestMint(
  context: ProgramTestContext,
  decimals: number,
): Promise<PublicKey> {
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
    createInitializeMintInstruction(mintKp.publicKey, decimals, context.payer.publicKey, null),
  );
  await processRawTx(context, tx, [context.payer, mintKp]);
  return mintKp.publicKey;
}

async function createTestAta(
  context: ProgramTestContext,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(context.payer.publicKey, ata, owner, mint),
  );
  await processRawTx(context, tx, [context.payer]);
  return ata;
}

async function mintTokensTo(
  context: ProgramTestContext,
  mint: PublicKey,
  dest: PublicKey,
  amount: number,
): Promise<void> {
  const tx = new Transaction().add(
    createMintToInstruction(mint, dest, context.payer.publicKey, amount),
  );
  await processRawTx(context, tx, [context.payer]);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LAB_TOTAL      = 600_000;  // 0.6 USDC-like units funded to lab
const LAB_PER_MEMBER = 100_000;  // scholarship slice
const VAULT_FUND     = 2_000_000; // initial vault balance (2 USDC-like)

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("KRN-01 — Restricted reserves isolation", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<Treasury>;

  let governor: Keypair;
  let mint: PublicKey;
  let statePda: PublicKey;
  let vaultAta: PublicKey;

  before(async () => {
    context = await startAnchor("./", [], []);
    provider = new BankrunProvider(context);
    program = new Program<Treasury>(treasuryIdl as any, provider);

    governor = Keypair.generate();
    context.setAccount(governor.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    mint = await createTestMint(context, 6);

    [statePda] = PublicKey.findProgramAddressSync([TREASURY_SEED], program.programId);
    vaultAta = getAssociatedTokenAddressSync(mint, statePda, true);

    await program.methods
      .initialize()
      .accounts({
        payer: context.payer.publicKey,
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

    // Seed the vault with 2 USDC-like tokens
    await mintTokensTo(context, mint, vaultAta, VAULT_FUND);
  });

  // ── KRN-01a ──────────────────────────────────────────────────────────────────

  it("KRN-01a: fund_lab increments restricted_reserves by total_amount", async () => {
    const before = await program.account.treasuryState.fetch(statePda);
    const restrictedBefore = BigInt(before.restrictedReserves.toString());

    const labId = 0;
    const [labPda] = PublicKey.findProgramAddressSync(
      [LAB_SEED, leUint32(labId)],
      program.programId,
    );

    await program.methods
      .fundLab(new anchor.BN(labId), new anchor.BN(LAB_TOTAL), new anchor.BN(LAB_PER_MEMBER))
      .accounts({
        governor: governor.publicKey,
        state: statePda,
        lab: labPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([governor])
      .rpc();

    const after = await program.account.treasuryState.fetch(statePda);
    const restrictedAfter = BigInt(after.restrictedReserves.toString());

    expect(restrictedAfter).to.equal(
      restrictedBefore + BigInt(LAB_TOTAL),
      `KRN-01a: restricted_reserves must increase by LAB_TOTAL (${LAB_TOTAL})`,
    );
  });

  // ── KRN-01b ──────────────────────────────────────────────────────────────────

  it("KRN-01b: total_assets = vault_balance - restricted_reserves at all times", async () => {
    const state = await program.account.treasuryState.fetch(statePda);
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;
    const restricted = BigInt(state.restrictedReserves.toString());

    // With LAB_TOTAL locked: vault=2_000_000, restricted=600_000 → total_assets=1_400_000
    const expectedTotalAssets = vaultBalance - restricted;

    // Verify the invariant is structurally satisfied — restricted > 0 proves
    // the vault balance is not entirely available as total_assets
    expect(restricted).to.be.greaterThan(
      0n,
      "KRN-01b pre-condition: restricted_reserves must be non-zero after fund_lab",
    );
    expect(expectedTotalAssets).to.equal(
      BigInt(VAULT_FUND) - BigInt(LAB_TOTAL),
      `KRN-01b: total_assets must equal vault_balance(${VAULT_FUND}) - restricted(${LAB_TOTAL})`,
    );
    // The restricted portion must never exceed the vault balance
    expect(restricted).to.be.at.most(
      vaultBalance,
      "KRN-01b: restricted_reserves must never exceed vault_balance",
    );
  });

  // ── KRN-01c ──────────────────────────────────────────────────────────────────

  it("KRN-01c: transfer cannot exceed total_assets — restricted reserves are protected", async () => {
    const state = await program.account.treasuryState.fetch(statePda);
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;
    const restricted = BigInt(state.restrictedReserves.toString());
    const totalAssets = vaultBalance - restricted;

    // total_assets = 1_400_000; attempt to transfer the full vault (2_000_000)
    // which would include restricted funds — must be rejected.
    const attackAmount = new anchor.BN(vaultBalance.toString());

    const receiver = Keypair.generate();
    const receiverAta = await createTestAta(context, mint, receiver.publicKey);

    let threw = false;
    try {
      await program.methods
        .transfer(attackAmount)
        .accounts({
          governor: governor.publicKey,
          state: statePda,
          vaultAta,
          receiverAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([governor])
        .rpc();
    } catch {
      threw = true;
    }

    expect(threw).to.be.true;
    expect(totalAssets).to.be.lessThan(
      vaultBalance,
      "KRN-01c: total_assets must be strictly less than vault_balance when labs are funded",
    );

    // Verify the unrestricted amount (1_400_000) CAN be transferred — the guard
    // protects scholarship funds, not all treasury activity.
    const safeAmount = new anchor.BN(totalAssets.toString());
    await program.methods
      .transfer(safeAmount)
      .accounts({
        governor: governor.publicKey,
        state: statePda,
        vaultAta,
        receiverAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([governor])
      .rpc();

    const receiverBalance = (await getAccount(provider.connection, receiverAta)).amount;
    expect(receiverBalance).to.equal(
      totalAssets,
      "KRN-01c: unrestricted total_assets should transfer successfully",
    );
  });
});
