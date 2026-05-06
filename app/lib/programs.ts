"use client";

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

import type { KarnPrograms, KarnWallet } from "@karn_lat/protocol-sdk-solana/react";

import governorIdl from "../../target/idl/governor.json";
import treasuryIdl from "../../target/idl/treasury.json";
import valocracyIdl from "../../target/idl/valocracy.json";

export function createPrograms(connection: Connection, wallet: KarnWallet | null): KarnPrograms | null {
  if (!wallet?.publicKey) return null;

  const provider = new anchor.AnchorProvider(
    connection,
    wallet as any,
    anchor.AnchorProvider.defaultOptions(),
  );

  return {
    valocracy: new Program(valocracyIdl as any, provider),
    governor: new Program(governorIdl as any, provider),
    treasury: new Program(treasuryIdl as any, provider),
  };
}
