import type { AccountMeta, PublicKey } from "@solana/web3.js";

import { buildEd25519PreInstruction, buildSelfRegisterAccounts, type SelfRegisterParams } from "../helpers/self-register";
import type { ValocracyClient } from "../clients/valocracy";
import type { SendMethodOptions } from "./types";

export function toBigIntLike(value: any): bigint {
  return BigInt(value?.toString ? value.toString() : value);
}

export async function sendMethod(builder: any, options: SendMethodOptions = {}) {
  let chain = builder;

  if (options.accounts) {
    chain = chain.accounts(options.accounts as any);
  }
  if (options.remainingAccounts?.length) {
    chain = chain.remainingAccounts(options.remainingAccounts as AccountMeta[]);
  }
  if (options.preInstructions?.length) {
    chain = chain.preInstructions(options.preInstructions as any[]);
  }
  if (options.signers?.length) {
    chain = chain.signers(options.signers as any[]);
  }

  return chain.rpc();
}

export async function buildRegisterAccounts(
  client: ValocracyClient,
  params: Pick<SelfRegisterParams, "caller" | "nonce" | "tokenId">,
) {
  const config = await client.getConfig();
  const [memberValorPda] = client.valorPda(toBigIntLike(config.memberValorId));
  return buildSelfRegisterAccounts(params, client.programId, memberValorPda);
}

export function walletKeyOrThrow(publicKey: PublicKey | null): PublicKey {
  if (!publicKey) {
    throw new Error("Wallet not connected.");
  }
  return publicKey;
}

export function buildRegisterPreInstruction(params: SelfRegisterParams) {
  return buildEd25519PreInstruction(params);
}
