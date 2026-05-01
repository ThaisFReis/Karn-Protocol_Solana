import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { bootstrapValocracy, BootstrapResult } from "../helpers/bankrun";

describe("valocracy.set_valor", () => {
  let env: BootstrapResult;
  let configPda: PublicKey;
  let governorKp: Keypair;

  before(async () => {
    env = await bootstrapValocracy();
    governorKp = Keypair.generate();

    // Fund governor (init pays + needs lamports for tx fee).
    env.context.setAccount(governorKp.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      env.program.programId
    );

    await env.program.methods
      .initialize(
        governorKp.publicKey,
        Keypair.generate().publicKey,
        Array.from(new Uint8Array(32)),
        new anchor.BN(0),
        new anchor.BN(10)
      )
      .accounts({
        payer: env.payer.publicKey,
        config: configPda,
      } as any)
      .rpc();
  });

  it("creates a Valor PDA when called by the governor", async () => {
    const valorId = new anchor.BN(20);
    const [valorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("valor"), valorId.toArrayLike(Buffer, "le", 8)],
      env.program.programId
    );

    await env.program.methods
      .setValor(valorId, new anchor.BN(25), new anchor.BN(8), new anchor.BN(1), "Rust Developer")
      .accounts({
        governor: governorKp.publicKey,
        config: configPda,
        valor: valorPda,
      } as any)
      .signers([governorKp])
      .rpc();

    const valor = await env.program.account.valor.fetch(valorPda);
    expect(valor.rarity.toNumber()).to.equal(25);
    expect(valor.secondaryRarity.toNumber()).to.equal(8);
    expect(valor.trackId.toNumber()).to.equal(1);
    expect(valor.metadata).to.equal("Rust Developer");
  });

  it("rejects calls from a non-governor signer", async () => {
    const intruder = Keypair.generate();
    env.context.setAccount(intruder.publicKey, {
      lamports: 10_000_000_000,
      data: Buffer.alloc(0),
      owner: anchor.web3.SystemProgram.programId,
      executable: false,
    });

    const valorId = new anchor.BN(21);
    const [valorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("valor"), valorId.toArrayLike(Buffer, "le", 8)],
      env.program.programId
    );

    let errored = false;
    try {
      await env.program.methods
        .setValor(valorId, new anchor.BN(30), new anchor.BN(10), new anchor.BN(1), "Soroban")
        .accounts({
          governor: intruder.publicKey,
          config: configPda,
          valor: valorPda,
        } as any)
        .signers([intruder])
        .rpc();
    } catch (_) {
      errored = true;
    }
    expect(errored, "non-governor must fail").to.equal(true);
  });

  it("overwrites existing fields when called twice for the same valor_id", async () => {
    const valorId = new anchor.BN(22);
    const [valorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("valor"), valorId.toArrayLike(Buffer, "le", 8)],
      env.program.programId
    );

    await env.program.methods
      .setValor(valorId, new anchor.BN(20), new anchor.BN(7), new anchor.BN(1), "Frontend Web3")
      .accounts({
        governor: governorKp.publicKey,
        config: configPda,
        valor: valorPda,
      } as any)
      .signers([governorKp])
      .rpc();

    await env.program.methods
      .setValor(valorId, new anchor.BN(22), new anchor.BN(8), new anchor.BN(1), "Frontend Web3 v2")
      .accounts({
        governor: governorKp.publicKey,
        config: configPda,
        valor: valorPda,
      } as any)
      .signers([governorKp])
      .rpc();

    const valor = await env.program.account.valor.fetch(valorPda);
    expect(valor.rarity.toNumber()).to.equal(22);
    expect(valor.metadata).to.equal("Frontend Web3 v2");
  });
});
