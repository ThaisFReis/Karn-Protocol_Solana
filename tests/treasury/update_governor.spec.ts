import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";

import { Treasury } from "../../target/types/treasury";
import treasuryIdl from "../../target/idl/treasury.json";

const TREASURY_SEED = Buffer.from("treasury");

async function processTransaction(
  context: ProgramTestContext,
  tx: anchor.web3.Transaction,
  signers: Keypair[],
): Promise<void> {
  const [blockhash] = await context.banksClient.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = context.payer.publicKey;
  tx.sign(...signers);
  await context.banksClient.processTransaction(tx);
}

async function createTestMint(context: ProgramTestContext): Promise<PublicKey> {
  const mintKp = Keypair.generate();
  const rent = await context.banksClient.getRent();
  const lamports = rent.minimumBalance(BigInt(MINT_SIZE));

  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: context.payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      lamports: Number(lamports),
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKp.publicKey, 6, context.payer.publicKey, null),
  );

  await processTransaction(context, tx, [context.payer, mintKp]);
  return mintKp.publicKey;
}

describe("treasury.update_governor", () => {
  let context: ProgramTestContext;
  let program: Program<Treasury>;
  let payer: Keypair;
  let governor: Keypair;
  let statePda: PublicKey;
  let mint: PublicKey;
  let vaultAta: PublicKey;

  beforeEach(async () => {
    context = await startAnchor("./", [], []);
    const provider = new BankrunProvider(context);
    program = new Program<Treasury>(treasuryIdl as any, provider);
    payer = context.payer;

    governor = Keypair.generate();
    context.setAccount(governor.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    mint = await createTestMint(context);
    [statePda] = PublicKey.findProgramAddressSync([TREASURY_SEED], program.programId);
    vaultAta = getAssociatedTokenAddressSync(mint, statePda, true);

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

  it("updates the treasury governor when called by the current governor", async () => {
    const newGovernor = Keypair.generate().publicKey;

    await program.methods
      .updateGovernor(newGovernor)
      .accounts({
        governor: governor.publicKey,
        state: statePda,
      } as any)
      .signers([governor])
      .rpc();

    const state = await program.account.treasuryState.fetch(statePda);
    expect(state.governor.toBase58()).to.equal(newGovernor.toBase58());
  });

  it("rejects rotation from a non-governor signer", async () => {
    const intruder = Keypair.generate();
    context.setAccount(intruder.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    try {
      await program.methods
        .updateGovernor(Keypair.generate().publicKey)
        .accounts({
          governor: intruder.publicKey,
          state: statePda,
        } as any)
        .signers([intruder])
        .rpc();
      expect.fail("expected NotAuthorized");
    } catch (e: any) {
      expect(e.message ?? String(e)).to.match(/NotAuthorized|custom program error/i);
    }
  });
});
