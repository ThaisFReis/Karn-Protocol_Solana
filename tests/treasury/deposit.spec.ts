/**
 * M11 — Shares allocation via Valocracy CPI.
 *
 * Coverage (4 tests required by PRD):
 *  1. direct deposit (non-CPI) fails — NotAuthorized
 *  2. first deposit < MIN_INITIAL_DEPOSIT fails — InsufficientShares
 *  3. deposit via Valocracy mint CPI ok — receiver gets shares
 *  4. deposits accumulate correctly — sum(user_shares) == total_shares
 *
 * Architecture: valocracy.mint passes 3 remaining_accounts to Treasury CPI:
 *   [0] treasury_program, [1] treasury_state (mut), [2] user_shares (mut)
 * The mint instruction signs the CPI as the Valocracy Config PDA.
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
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
} from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";

import { Valocracy } from "../../target/types/valocracy";
import valocracyIdl from "../../target/idl/valocracy.json";
import { Treasury } from "../../target/types/treasury";
import treasuryIdl from "../../target/idl/treasury.json";

// ── Seed constants ────────────────────────────────────────────────────────────
const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");
const TREASURY_SEED = Buffer.from("treasury");
const USER_SHARES_SEED = Buffer.from("shares");

function leUint64(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("treasury.deposit (M11)", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let valocracyProgram: Program<Valocracy>;
  let treasuryProgram: Program<Treasury>;
  let payer: Keypair;

  let governor: Keypair;
  let configPda: PublicKey;
  let statePda: PublicKey;
  let mint: PublicKey;
  let vaultAta: PublicKey;

  // Leadership badge with secondary_rarity < 1000 — triggers InsufficientShares on first deposit
  const smallValorId = 10;
  // Leadership badge with secondary_rarity = 2000 — passes first-deposit minimum
  const bigValorId = 11;

  before(async () => {
    context = await startAnchor("./", [], []);
    provider = new BankrunProvider(context);
    valocracyProgram = new Program<Valocracy>(valocracyIdl as any, provider);
    treasuryProgram = new Program<Treasury>(treasuryIdl as any, provider);
    payer = context.payer;

    governor = Keypair.generate();
    fundAccount(context, governor.publicKey);

    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      valocracyProgram.programId
    );

    [statePda] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      treasuryProgram.programId
    );

    mint = await createTestMint(context, 6);
    vaultAta = getAssociatedTokenAddressSync(mint, statePda, true);

    // Initialize valocracy. The `treasury` field in Config stores the address
    // that the mint instruction uses as the treasury program ID for CPI.
    await valocracyProgram.methods
      .initialize(
        governor.publicKey,
        treasuryProgram.programId,
        Array.from(new Uint8Array(32)),
        new anchor.BN(0),   // member_valor_id (not used here)
        new anchor.BN(10)   // leadership_valor_id
      )
      .accounts({
        payer: payer.publicKey,
        config: configPda,
      } as any)
      .rpc();

    // Initialize treasury. `valocracy` = Config PDA (the valocracy_authority signer).
    await treasuryProgram.methods
      .initialize()
      .accounts({
        payer: payer.publicKey,
        governor: governor.publicKey,
        valocracy: configPda,
        assetMint: mint,
        state: statePda,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    // Create valor_small: Leadership (id=10), secondary_rarity=5 → effective=5 < 1000
    const [smallValorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(smallValorId)],
      valocracyProgram.programId
    );
    await valocracyProgram.methods
      .setValor(
        new anchor.BN(smallValorId),
        new anchor.BN(5),    // rarity (primary, unused when no primary track)
        new anchor.BN(5),    // secondary_rarity → effective_rarity when no primary track
        new anchor.BN(0),    // track_id = 0 (domain-agnostic Leadership)
        "SmallBadge"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: smallValorPda,
      } as any)
      .signers([governor])
      .rpc();

    // Create valor_big: Leadership (id=11), secondary_rarity=2000 → effective=2000 >= 1000
    const [bigValorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(bigValorId)],
      valocracyProgram.programId
    );
    await valocracyProgram.methods
      .setValor(
        new anchor.BN(bigValorId),
        new anchor.BN(2000),
        new anchor.BN(2000),
        new anchor.BN(0),
        "BigBadge"
      )
      .accounts({
        governor: governor.publicKey,
        config: configPda,
        valor: bigValorPda,
      } as any)
      .signers([governor])
      .rpc();
  });

  /** Derive PDAs for a mint call to avoid repetition. */
  function mintPdas(recipient: PublicKey, valorId: number, tokenId: number) {
    const [valorPda] = PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valorId)],
      valocracyProgram.programId
    );
    const [statsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, recipient.toBuffer()],
      valocracyProgram.programId
    );
    const [tokenOwnerPda] = PublicKey.findProgramAddressSync(
      [TOKEN_OWNER_SEED, leUint64(tokenId)],
      valocracyProgram.programId
    );
    const [tokenValorPda] = PublicKey.findProgramAddressSync(
      [TOKEN_VALOR_SEED, leUint64(tokenId)],
      valocracyProgram.programId
    );
    const [userSharesPda] = PublicKey.findProgramAddressSync(
      [USER_SHARES_SEED, recipient.toBuffer()],
      treasuryProgram.programId
    );
    return { valorPda, statsPda, tokenOwnerPda, tokenValorPda, userSharesPda };
  }

  // ── 1. Direct deposit rejected ────────────────────────────────────────────

  it("direct deposit call (non-CPI) fails with NotAuthorized", async () => {
    const stranger = Keypair.generate();
    fundAccount(context, stranger.publicKey);

    const recipient = Keypair.generate();
    const [userSharesPda] = PublicKey.findProgramAddressSync(
      [USER_SHARES_SEED, recipient.publicKey.toBuffer()],
      treasuryProgram.programId
    );

    try {
      await treasuryProgram.methods
        .deposit(new anchor.BN(2000))
        .accounts({
          valocracyAuthority: stranger.publicKey,  // not the Config PDA
          state: statePda,
          receiver: recipient.publicKey,
          userShares: userSharesPda,
          payer: stranger.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([stranger])
        .rpc();
      expect.fail("expected NotAuthorized");
    } catch (e: any) {
      expect(e.toString()).to.include("NotAuthorized");
    }
  });

  // ── 2. First deposit < MIN_INITIAL_DEPOSIT fails ──────────────────────────

  it("first deposit < MIN_INITIAL_DEPOSIT fails (InsufficientShares)", async () => {
    const recipient = Keypair.generate();
    const tokenId = 1;
    const { valorPda, statsPda, tokenOwnerPda, tokenValorPda, userSharesPda } =
      mintPdas(recipient.publicKey, smallValorId, tokenId);

    try {
      await valocracyProgram.methods
        .mint(new anchor.BN(smallValorId), new anchor.BN(tokenId))
        .accounts({
          minter: governor.publicKey,
          recipient: recipient.publicKey,
          config: configPda,
          valor: valorPda,
          recipientStats: statsPda,
          tokenOwner: tokenOwnerPda,
          tokenValor: tokenValorPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: treasuryProgram.programId, isWritable: false, isSigner: false },
          { pubkey: statePda, isWritable: true, isSigner: false },
          { pubkey: userSharesPda, isWritable: true, isSigner: false },
        ])
        .signers([governor])
        .rpc();
      expect.fail("expected InsufficientShares");
    } catch (e: any) {
      expect(e.toString()).to.include("InsufficientShares");
    }
  });

  // ── 3. Deposit via Valocracy CPI succeeds ────────────────────────────────

  it("mint with treasury CPI allocates shares to receiver", async () => {
    const recipient = Keypair.generate();
    fundAccount(context, recipient.publicKey);

    const tokenId = 1;  // total_supply is still 0 (test 2 failed, no state change)
    const { valorPda, statsPda, tokenOwnerPda, tokenValorPda, userSharesPda } =
      mintPdas(recipient.publicKey, bigValorId, tokenId);

    await valocracyProgram.methods
      .mint(new anchor.BN(bigValorId), new anchor.BN(tokenId))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: valorPda,
        recipientStats: statsPda,
        tokenOwner: tokenOwnerPda,
        tokenValor: tokenValorPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([
        { pubkey: treasuryProgram.programId, isWritable: false, isSigner: false },
        { pubkey: statePda, isWritable: true, isSigner: false },
        { pubkey: userSharesPda, isWritable: true, isSigner: false },
      ])
      .signers([governor])
      .rpc();

    const treasuryState = await treasuryProgram.account.treasuryState.fetch(statePda);
    const userShares = await treasuryProgram.account.userShares.fetch(userSharesPda);

    expect(treasuryState.totalShares.toString()).to.equal("2000");
    expect(userShares.shares.toString()).to.equal("2000");
    expect(userShares.owner.toBase58()).to.equal(recipient.publicKey.toBase58());
  });

  // ── 4. Deposits accumulate correctly ─────────────────────────────────────

  it("second mint adds shares — sum(user_shares) == total_shares", async () => {
    const recipient = Keypair.generate();
    fundAccount(context, recipient.publicKey);

    // First mint for this recipient (token_id=2 since total_supply=1 after test 3)
    const tokenId1 = 2;
    const pdas1 = mintPdas(recipient.publicKey, bigValorId, tokenId1);

    await valocracyProgram.methods
      .mint(new anchor.BN(bigValorId), new anchor.BN(tokenId1))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: pdas1.valorPda,
        recipientStats: pdas1.statsPda,
        tokenOwner: pdas1.tokenOwnerPda,
        tokenValor: pdas1.tokenValorPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([
        { pubkey: treasuryProgram.programId, isWritable: false, isSigner: false },
        { pubkey: statePda, isWritable: true, isSigner: false },
        { pubkey: pdas1.userSharesPda, isWritable: true, isSigner: false },
      ])
      .signers([governor])
      .rpc();

    // Second mint for same recipient (token_id=3)
    const tokenId2 = 3;
    const pdas2 = mintPdas(recipient.publicKey, bigValorId, tokenId2);

    await valocracyProgram.methods
      .mint(new anchor.BN(bigValorId), new anchor.BN(tokenId2))
      .accounts({
        minter: governor.publicKey,
        recipient: recipient.publicKey,
        config: configPda,
        valor: pdas2.valorPda,
        recipientStats: pdas2.statsPda,
        tokenOwner: pdas2.tokenOwnerPda,
        tokenValor: pdas2.tokenValorPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([
        { pubkey: treasuryProgram.programId, isWritable: false, isSigner: false },
        { pubkey: statePda, isWritable: true, isSigner: false },
        { pubkey: pdas1.userSharesPda, isWritable: true, isSigner: false },  // same user_shares PDA
      ])
      .signers([governor])
      .rpc();

    const treasuryState = await treasuryProgram.account.treasuryState.fetch(statePda);
    const userShares = await treasuryProgram.account.userShares.fetch(pdas1.userSharesPda);

    // 2000 (test 3) + 2000 (first mint here) + 2000 (second mint here) = 6000
    expect(treasuryState.totalShares.toString()).to.equal("6000");
    expect(userShares.shares.toString()).to.equal("4000");
  });
});
