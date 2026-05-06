import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

describe("valocracy authority rotation", () => {
  let env: BootstrapResult;
  let configPda: PublicKey;
  let governorKp: Keypair;

  beforeEach(async () => {
    env = await bootstrapValocracy();
    governorKp = Keypair.generate();

    env.context.setAccount(governorKp.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      env.program.programId,
    );

    await env.program.methods
      .initialize(
        governorKp.publicKey,
        Keypair.generate().publicKey,
        Array.from(new Uint8Array(32)),
        new anchor.BN(0),
        new anchor.BN(10),
      )
      .accounts({
        payer: env.payer.publicKey,
        config: configPda,
      } as any)
      .rpc();
  });

  it("updates the governor when called by the current governor", async () => {
    const newGovernor = Keypair.generate().publicKey;

    await env.program.methods
      .updateGovernor(newGovernor)
      .accounts({
        governor: governorKp.publicKey,
        config: configPda,
      } as any)
      .signers([governorKp])
      .rpc();

    const config = await env.program.account.config.fetch(configPda);
    expect(config.governor.toBase58()).to.equal(newGovernor.toBase58());
  });

  it("updates the treasury reference when called by the current governor", async () => {
    const newTreasury = Keypair.generate().publicKey;

    await env.program.methods
      .updateTreasury(newTreasury)
      .accounts({
        governor: governorKp.publicKey,
        config: configPda,
      } as any)
      .signers([governorKp])
      .rpc();

    const config = await env.program.account.config.fetch(configPda);
    expect(config.treasury.toBase58()).to.equal(newTreasury.toBase58());
  });

  it("rejects authority rotation from a non-governor signer", async () => {
    const intruder = Keypair.generate();
    env.context.setAccount(intruder.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    try {
      await env.program.methods
        .updateGovernor(Keypair.generate().publicKey)
        .accounts({
          governor: intruder.publicKey,
          config: configPda,
        } as any)
        .signers([intruder])
        .rpc();
      expect.fail("expected NotAuthorized");
    } catch (e: any) {
      expect(e.message ?? String(e)).to.match(/NotAuthorized|custom program error/i);
    }
  });
});
