import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

describe("valocracy.initialize", () => {
  let env: BootstrapResult;
  let configPda: PublicKey;

  const governor = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const signerKey = Array.from(new Uint8Array(32).fill(7));
  const memberValorId = new anchor.BN(0);
  const leadershipValorId = new anchor.BN(10);

  before(async () => {
    env = await bootstrapValocracy();
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      env.program.programId
    );

    await env.program.methods
      .initialize(governor, treasury, signerKey, memberValorId, leadershipValorId)
      .accounts({
        payer: env.payer.publicKey,
        config: configPda,
      } as any)
      .rpc();
  });

  it("creates Config singleton with all fields populated", async () => {
    const config = await env.program.account.config.fetch(configPda);
    expect(config.governor.toBase58()).to.equal(governor.toBase58());
    expect(config.treasury.toBase58()).to.equal(treasury.toBase58());
    expect(config.memberValorId.toNumber()).to.equal(0);
    expect(config.leadershipValorId.toNumber()).to.equal(10);
  });

  it("initializes total_supply to 0", async () => {
    const config = await env.program.account.config.fetch(configPda);
    expect(config.totalSupply.toNumber()).to.equal(0);
  });

  it("initializes credit_paused to false", async () => {
    const config = await env.program.account.config.fetch(configPda);
    expect(config.creditPaused).to.equal(false);
  });

  it("stores the ed25519 backend signer pubkey", async () => {
    const config = await env.program.account.config.fetch(configPda);
    expect(Array.from(config.signer)).to.deep.equal(signerKey);
  });

  it("rejects double initialization", async () => {
    let errored = false;
    try {
      await env.program.methods
        .initialize(governor, treasury, signerKey, memberValorId, leadershipValorId)
        .accounts({
          payer: env.payer.publicKey,
          config: configPda,
        } as any)
        .rpc();
    } catch (_) {
      errored = true;
    }
    expect(errored, "second initialize must fail").to.equal(true);
  });
});
