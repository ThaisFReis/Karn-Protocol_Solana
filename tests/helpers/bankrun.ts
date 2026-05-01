import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";

import { Valocracy } from "../../target/types/valocracy";
import valocracyIdl from "../../target/idl/valocracy.json";

export interface BootstrapResult {
  context: ProgramTestContext;
  provider: BankrunProvider;
  program: Program<Valocracy>;
  payer: anchor.web3.Keypair;
}

/**
 * Boot a fresh in-memory test environment with the Valocracy program loaded.
 * Each call returns an isolated context — ideal for `before` hooks where
 * tests must not leak state into siblings.
 */
export async function bootstrapValocracy(): Promise<BootstrapResult> {
  const context = await startAnchor("./", [], []);
  const provider = new BankrunProvider(context);
  // The IDL is the Anchor 0.32 format. anchor-bankrun's BankrunProvider
  // wraps the bankrun BanksClient with an Anchor-compatible interface.
  const program = new Program<Valocracy>(valocracyIdl as any, provider);
  return {
    context,
    provider,
    program,
    payer: context.payer,
  };
}
