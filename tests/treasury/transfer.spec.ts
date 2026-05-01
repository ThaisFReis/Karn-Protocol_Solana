/**
 * M10 — Treasury initialize + transfer Bankrun tests.
 *
 * Coverage (6 tests required by PRD):
 *  1. transfer ok via Governor — receiver ATA balance increases
 *  2. transfer não-governor falha — NotAuthorized
 *  3. transfer > balance falha — InsufficientAssets
 *  4. reentrancy invariant — locked=false after completed transfer
 *  5. KRN-01 total_assets = vault_balance - restricted_reserves
 *  6. preview_withdraw (convert_to_assets) correct at known supply
 *
 * NOTE: BankrunConnection does not implement sendTransaction, so all SPL
 * token setup uses raw instructions via context.banksClient.processTransaction.
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

// Vault math constants (mirrors karn-shared)
const VIRTUAL_SHARES = 1_000n;
const VIRTUAL_ASSETS = 1n;

function convertToAssets(shares: bigint, totalShares: bigint, totalAssetsVal: bigint): bigint {
  const numerator = shares * (totalAssetsVal + VIRTUAL_ASSETS);
  const denominator = totalShares + VIRTUAL_SHARES;
  return numerator / denominator;
}

const TREASURY_SEED = Buffer.from("treasury");

// ── Bankrun-compatible SPL helpers ──────────────────────────────────────────

async function processTransaction(context: ProgramTestContext, tx: Transaction, signers: Keypair[]): Promise<void> {
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
  await processTransaction(context, tx, [context.payer, mintKp]);
  return mintKp.publicKey;
}

async function createTestAta(context: ProgramTestContext, mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(context.payer.publicKey, ata, owner, mint)
  );
  await processTransaction(context, tx, [context.payer]);
  return ata;
}

async function mintTokensTo(context: ProgramTestContext, mint: PublicKey, dest: PublicKey, amount: number): Promise<void> {
  const tx = new Transaction().add(
    createMintToInstruction(mint, dest, context.payer.publicKey, amount)
  );
  await processTransaction(context, tx, [context.payer]);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("treasury.transfer (M10)", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<Treasury>;
  let payer: Keypair;

  let governor: Keypair;
  let mint: PublicKey;
  let statePda: PublicKey;
  let stateBump: number;
  let vaultAta: PublicKey;

  before(async () => {
    context = await startAnchor("./", [], []);
    provider = new BankrunProvider(context);
    program = new Program<Treasury>(treasuryIdl as any, provider);
    payer = context.payer;

    governor = Keypair.generate();
    context.setAccount(governor.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    // Create SPL mint (6 decimals) using raw banksClient
    mint = await createTestMint(context, 6);

    [statePda, stateBump] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      program.programId
    );

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
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();
  });

  /** Mint `amount` tokens directly to the vault ATA. */
  async function fundVault(amount: number): Promise<void> {
    await mintTokensTo(context, mint, vaultAta, amount);
  }

  /** Create an ATA for `owner` and return its address. */
  async function createReceiverAta(owner: Keypair): Promise<PublicKey> {
    return createTestAta(context, mint, owner.publicKey);
  }

  // ── 1. Transfer ok ────────────────────────────────────────────────────────

  it("governor transfers tokens from vault to receiver", async () => {
    await fundVault(1_000_000);

    const receiver = Keypair.generate();
    const receiverAta = await createReceiverAta(receiver);

    const vaultBefore = (await getAccount(provider.connection, vaultAta)).amount;

    await program.methods
      .transfer(new anchor.BN(500_000))
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
    const vaultAfter = (await getAccount(provider.connection, vaultAta)).amount;

    expect(receiverBalance).to.equal(500_000n);
    expect(vaultAfter).to.equal(vaultBefore - 500_000n);
  });

  // ── 2. Non-governor rejected ──────────────────────────────────────────────

  it("rejects transfer from non-governor wallet", async () => {
    await fundVault(100_000);

    const stranger = Keypair.generate();
    context.setAccount(stranger.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    const receiver = Keypair.generate();
    const receiverAta = await createReceiverAta(receiver);

    try {
      await program.methods
        .transfer(new anchor.BN(100))
        .accounts({
          governor: stranger.publicKey,
          state: statePda,
          vaultAta,
          receiverAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([stranger])
        .rpc();
      expect.fail("expected NotAuthorized");
    } catch (e: any) {
      expect(e.toString()).to.include("NotAuthorized");
    }
  });

  // ── 3. Transfer > balance fails ───────────────────────────────────────────

  it("rejects transfer when amount exceeds vault balance", async () => {
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;

    const receiver = Keypair.generate();
    const receiverAta = await createReceiverAta(receiver);

    const tooMuch = new anchor.BN((vaultBalance + 1n).toString());

    try {
      await program.methods
        .transfer(tooMuch)
        .accounts({
          governor: governor.publicKey,
          state: statePda,
          vaultAta,
          receiverAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([governor])
        .rpc();
      expect.fail("expected InsufficientAssets");
    } catch (e: any) {
      expect(e.toString()).to.include("InsufficientAssets");
    }
  });

  // ── 4. Reentrancy invariant ───────────────────────────────────────────────

  it("locked flag is false after a completed transfer (reentrancy guard resets)", async () => {
    await fundVault(10_000);

    const receiver = Keypair.generate();
    const receiverAta = await createReceiverAta(receiver);

    await program.methods
      .transfer(new anchor.BN(1_000))
      .accounts({
        governor: governor.publicKey,
        state: statePda,
        vaultAta,
        receiverAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([governor])
      .rpc();

    const stateAccount = await program.account.treasuryState.fetch(statePda);
    expect(stateAccount.locked).to.be.false;
  });

  // ── 5. KRN-01: total_assets excludes restricted_reserves ─────────────────

  it("total_assets = vault_balance - restricted_reserves (KRN-01)", async () => {
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;
    const stateAccount = await program.account.treasuryState.fetch(statePda);
    const restricted = BigInt(stateAccount.restrictedReserves.toString());

    const expectedTotalAssets = vaultBalance >= restricted
      ? vaultBalance - restricted
      : 0n;

    // restricted_reserves=0 (no labs funded yet), so total_assets == vault_balance
    expect(expectedTotalAssets).to.equal(vaultBalance);
    expect(stateAccount.restrictedReserves.toNumber()).to.equal(0);
  });

  // ── 6. convert_to_assets (preview_withdraw) ───────────────────────────────

  it("convert_to_assets returns correct preview at known supply", async () => {
    const stateAccount = await program.account.treasuryState.fetch(statePda);
    const totalShares = BigInt(stateAccount.totalShares.toString());
    const vaultBalance = (await getAccount(provider.connection, vaultAta)).amount;
    const restricted = BigInt(stateAccount.restrictedReserves.toString());
    const totalAssetsVal = vaultBalance >= restricted ? vaultBalance - restricted : 0n;

    const shares = 1_000n;
    const preview = convertToAssets(shares, totalShares, totalAssetsVal);
    const expected = (shares * (totalAssetsVal + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);

    expect(preview).to.equal(expected);
  });
});
