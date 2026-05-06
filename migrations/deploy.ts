import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";

import governorIdl from "../target/idl/governor.json";
import treasuryIdl from "../target/idl/treasury.json";
import valocracyIdl from "../target/idl/valocracy.json";
import type { Governor } from "../target/types/governor";
import type { Treasury } from "../target/types/treasury";
import type { Valocracy } from "../target/types/valocracy";

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const GUARDIAN_TRACKS_SEED = Buffer.from("guardian");
const CREDIT_AUTHORITY_SEED = Buffer.from("credit_auth");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");
const TREASURY_SEED = Buffer.from("treasury");
const USER_SHARES_SEED = Buffer.from("shares");
const GOV_CONFIG_SEED = Buffer.from("gov_config");
const GOV_PARAMS_SEED = Buffer.from("gov_params");
const LAB_SEED = Buffer.from("lab");

const DEFAULT_DECIMALS = 6;
const DEMO_LAB_TOTAL_AMOUNT = 1_000_000_000n;
const DEMO_SCHOLARSHIP_PER_MEMBER = 100_000_000n;

const DEFAULT_VALORS = [
  { id: 0, rarity: 5, secondaryRarity: 5, trackId: 0, metadata: "Member" },
  { id: 10, rarity: 2_000, secondaryRarity: 2_000, trackId: 0, metadata: "Leadership" },
  { id: 20, rarity: 1_000, secondaryRarity: 500, trackId: 1, metadata: "Tech Contributor" },
  { id: 21, rarity: 1_000, secondaryRarity: 500, trackId: 2, metadata: "Design Contributor" },
  { id: 70, rarity: 250, secondaryRarity: 250, trackId: 0, metadata: "Governance Contributor" },
] as const;

type WalletWithPayer = anchor.Wallet & { payer: web3.Keypair };

type DeploymentSnapshot = {
  cluster: string;
  generatedAt: string;
  authorityMode: "governance-pda";
  notes: string[];
  programs: {
    valocracy: string;
    governor: string;
    treasury: string;
  };
  authorities: {
    bootstrapAuthority: string;
    backendSigner: string;
    guardian: string;
    creditAuthority: string;
    demoMember: string;
  };
  addresses: {
    valocracyConfig: string;
    governorConfig: string;
    governorParams: string;
    treasuryState: string;
    vaultAta: string;
    assetMint: string;
    guardianTracks: string;
    creditAuthority: string;
    userStats: string;
    userShares: string;
    demoLab: string;
  };
  valors: Array<{
    id: number;
    address: string;
    rarity: number;
    secondaryRarity: number;
    trackId: number;
    metadata: string;
  }>;
};

function leUint64(n: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function parsePubkey(value: string | undefined, fallback: web3.PublicKey): web3.PublicKey {
  return value ? new web3.PublicKey(value) : fallback;
}

async function accountExists(connection: web3.Connection, address: web3.PublicKey): Promise<boolean> {
  return (await connection.getAccountInfo(address)) !== null;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function ensureMint(
  connection: web3.Connection,
  payer: web3.Keypair,
  requestedMint: string | undefined,
): Promise<{ mint: web3.PublicKey; created: boolean }> {
  if (requestedMint) {
    return { mint: new web3.PublicKey(requestedMint), created: false };
  }

  const mint = await createMint(connection, payer, payer.publicKey, null, DEFAULT_DECIMALS);
  return { mint, created: true };
}

async function initializeValocracy(
  valocracy: Program<Valocracy>,
  bootstrapAuthority: web3.Keypair,
  configPda: web3.PublicKey,
  treasuryStatePda: web3.PublicKey,
  backendSigner: web3.PublicKey,
): Promise<void> {
  await valocracy.methods
    .initialize(
      bootstrapAuthority.publicKey,
      treasuryStatePda,
      Array.from(backendSigner.toBytes()),
      new anchor.BN(0),
      new anchor.BN(10),
    )
    .accounts({
      payer: bootstrapAuthority.publicKey,
      config: configPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function initializeGovernor(
  governor: Program<Governor>,
  bootstrapAuthority: web3.Keypair,
  governorConfigPda: web3.PublicKey,
  governorParamsPda: web3.PublicKey,
  valocracyProgramId: web3.PublicKey,
): Promise<void> {
  await governor.methods
    .initialize(valocracyProgramId)
    .accounts({
      payer: bootstrapAuthority.publicKey,
      config: governorConfigPda,
      params: governorParamsPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function initializeTreasury(
  treasury: Program<Treasury>,
  bootstrapAuthority: web3.Keypair,
  treasuryStatePda: web3.PublicKey,
  assetMint: web3.PublicKey,
  vaultAta: web3.PublicKey,
  valocracyConfigPda: web3.PublicKey,
): Promise<void> {
  await treasury.methods
    .initialize()
    .accounts({
      payer: bootstrapAuthority.publicKey,
      governor: bootstrapAuthority.publicKey,
      valocracy: valocracyConfigPda,
      assetMint,
      state: treasuryStatePda,
      vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function upsertValor(
  valocracy: Program<Valocracy>,
  bootstrapAuthority: web3.Keypair,
  configPda: web3.PublicKey,
  valorPda: web3.PublicKey,
  valor: (typeof DEFAULT_VALORS)[number],
): Promise<void> {
  await valocracy.methods
    .setValor(
      new anchor.BN(valor.id),
      new anchor.BN(valor.rarity),
      new anchor.BN(valor.secondaryRarity),
      new anchor.BN(valor.trackId),
      valor.metadata,
    )
    .accounts({
      governor: bootstrapAuthority.publicKey,
      config: configPda,
      valor: valorPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function upsertGuardianTracks(
  valocracy: Program<Valocracy>,
  bootstrapAuthority: web3.Keypair,
  configPda: web3.PublicKey,
  guardianPda: web3.PublicKey,
  guardian: web3.PublicKey,
): Promise<void> {
  await valocracy.methods
    .setGuardianTracks(guardian, [new anchor.BN(1)])
    .accounts({
      governor: bootstrapAuthority.publicKey,
      config: configPda,
      guardianTracks: guardianPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function upsertCreditAuthority(
  valocracy: Program<Valocracy>,
  bootstrapAuthority: web3.Keypair,
  configPda: web3.PublicKey,
  creditAuthorityPda: web3.PublicKey,
  creditAuthority: web3.PublicKey,
): Promise<void> {
  await valocracy.methods
    .setCreditAuthority(creditAuthority, [new anchor.BN(1)])
    .accounts({
      governor: bootstrapAuthority.publicKey,
      config: configPda,
      creditAuthority: creditAuthorityPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function mintDemoLeadershipIfNeeded(
  valocracy: Program<Valocracy>,
  bootstrapAuthority: web3.Keypair,
  configPda: web3.PublicKey,
  treasuryProgramId: web3.PublicKey,
  treasuryStatePda: web3.PublicKey,
  userSharesPda: web3.PublicKey,
  demoMember: web3.PublicKey,
): Promise<void> {
  const config = await valocracy.account.config.fetch(configPda);
  const nextTokenId = BigInt(config.totalSupply.toString()) + 1n;

  const [userStatsPda] = web3.PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, demoMember.toBuffer()],
    valocracy.programId,
  );

  if (await accountExists(valocracy.provider.connection, userStatsPda)) {
    return;
  }

  const [valorPda] = web3.PublicKey.findProgramAddressSync(
    [VALOR_SEED, leUint64(10)],
    valocracy.programId,
  );
  const [tokenOwnerPda] = web3.PublicKey.findProgramAddressSync(
    [TOKEN_OWNER_SEED, leUint64(nextTokenId)],
    valocracy.programId,
  );
  const [tokenValorPda] = web3.PublicKey.findProgramAddressSync(
    [TOKEN_VALOR_SEED, leUint64(nextTokenId)],
    valocracy.programId,
  );

  await valocracy.methods
    .mint(new anchor.BN(10), new anchor.BN(nextTokenId.toString()))
    .accounts({
      minter: bootstrapAuthority.publicKey,
      recipient: demoMember,
      config: configPda,
      valor: valorPda,
      recipientStats: userStatsPda,
      tokenOwner: tokenOwnerPda,
      tokenValor: tokenValorPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .remainingAccounts([
      { pubkey: treasuryProgramId, isSigner: false, isWritable: false },
      { pubkey: treasuryStatePda, isSigner: false, isWritable: true },
      { pubkey: userSharesPda, isSigner: false, isWritable: true },
    ])
    .signers([bootstrapAuthority])
    .rpc();
}

async function ensureDemoLab(
  treasury: Program<Treasury>,
  bootstrapAuthority: web3.Keypair,
  treasuryStatePda: web3.PublicKey,
  vaultAta: web3.PublicKey,
  funderAta: web3.PublicKey,
  labPda: web3.PublicKey,
): Promise<void> {
  const state = await treasury.account.treasuryState.fetch(treasuryStatePda);
  if (Number(state.labCounter) > 0) {
    return;
  }

  await treasury.methods
    .fundLab(
      new anchor.BN(DEMO_LAB_TOTAL_AMOUNT.toString()),
      new anchor.BN(DEMO_SCHOLARSHIP_PER_MEMBER.toString()),
    )
    .accounts({
      funder: bootstrapAuthority.publicKey,
      state: treasuryStatePda,
      lab: labPda,
      funderAta,
      vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([bootstrapAuthority])
    .rpc();
}

async function finalizeGovernanceHandoff(
  valocracy: Program<Valocracy>,
  treasury: Program<Treasury>,
  bootstrapAuthority: web3.Keypair,
  valocracyConfigPda: web3.PublicKey,
  governorConfigPda: web3.PublicKey,
  treasuryStatePda: web3.PublicKey,
): Promise<void> {
  const valocracyConfig = await valocracy.account.config.fetch(valocracyConfigPda);
  if (!valocracyConfig.treasury.equals(treasuryStatePda)) {
    await valocracy.methods
      .updateTreasury(treasuryStatePda)
      .accounts({
        governor: bootstrapAuthority.publicKey,
        config: valocracyConfigPda,
      } as any)
      .signers([bootstrapAuthority])
      .rpc();
  }

  if (!valocracyConfig.governor.equals(governorConfigPda)) {
    await valocracy.methods
      .updateGovernor(governorConfigPda)
      .accounts({
        governor: bootstrapAuthority.publicKey,
        config: valocracyConfigPda,
      } as any)
      .signers([bootstrapAuthority])
      .rpc();
  }

  const treasuryState = await treasury.account.treasuryState.fetch(treasuryStatePda);
  if (!treasuryState.governor.equals(governorConfigPda)) {
    await treasury.methods
      .updateGovernor(governorConfigPda)
      .accounts({
        governor: bootstrapAuthority.publicKey,
        state: treasuryStatePda,
      } as any)
      .signers([bootstrapAuthority])
      .rpc();
  }
}

async function main(provider: anchor.AnchorProvider): Promise<void> {
  anchor.setProvider(provider);

  const wallet = provider.wallet as WalletWithPayer;
  const payer = wallet.payer;
  const connection = provider.connection;

  const valocracy = new Program<Valocracy>(valocracyIdl as Idl, provider);
  const governor = new Program<Governor>(governorIdl as Idl, provider);
  const treasury = new Program<Treasury>(treasuryIdl as Idl, provider);

  const bootstrapAuthority = payer;
  const backendSigner = parsePubkey(process.env.KARN_BACKEND_SIGNER, bootstrapAuthority.publicKey);
  const guardian = parsePubkey(process.env.KARN_GUARDIAN, bootstrapAuthority.publicKey);
  const creditAuthority = parsePubkey(process.env.KARN_CREDIT_AUTHORITY, bootstrapAuthority.publicKey);
  const demoMember = parsePubkey(process.env.KARN_DEMO_MEMBER, bootstrapAuthority.publicKey);

  const [valocracyConfigPda] = web3.PublicKey.findProgramAddressSync([CONFIG_SEED], valocracy.programId);
  const [governorConfigPda] = web3.PublicKey.findProgramAddressSync([GOV_CONFIG_SEED], governor.programId);
  const [governorParamsPda] = web3.PublicKey.findProgramAddressSync([GOV_PARAMS_SEED], governor.programId);
  const [treasuryStatePda] = web3.PublicKey.findProgramAddressSync([TREASURY_SEED], treasury.programId);
  const [guardianTracksPda] = web3.PublicKey.findProgramAddressSync(
    [GUARDIAN_TRACKS_SEED, guardian.toBuffer()],
    valocracy.programId,
  );
  const [creditAuthorityPda] = web3.PublicKey.findProgramAddressSync(
    [CREDIT_AUTHORITY_SEED, creditAuthority.toBuffer()],
    valocracy.programId,
  );
  const [userStatsPda] = web3.PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, demoMember.toBuffer()],
    valocracy.programId,
  );
  const [userSharesPda] = web3.PublicKey.findProgramAddressSync(
    [USER_SHARES_SEED, demoMember.toBuffer()],
    treasury.programId,
  );
  const [demoLabPda] = web3.PublicKey.findProgramAddressSync(
    [LAB_SEED, Buffer.alloc(4, 0)],
    treasury.programId,
  );
  const treasuryAlreadyInitialized = await accountExists(connection, treasuryStatePda);

  let assetMint: web3.PublicKey;
  let createdMint = false;
  if (treasuryAlreadyInitialized) {
    const state = await treasury.account.treasuryState.fetch(treasuryStatePda);
    assetMint = state.assetMint;
  } else {
    const ensured = await ensureMint(connection, payer, process.env.KARN_ASSET_MINT);
    assetMint = ensured.mint;
    createdMint = ensured.created;
  }
  const vaultAta = getAssociatedTokenAddressSync(assetMint, treasuryStatePda, true);

  if (!(await accountExists(connection, valocracyConfigPda))) {
    console.log("Initializing valocracy config...");
    await initializeValocracy(valocracy, bootstrapAuthority, valocracyConfigPda, treasuryStatePda, backendSigner);
  } else {
    console.log("Valocracy config already exists, skipping initialize.");
  }

  if (!(await accountExists(connection, governorConfigPda))) {
    console.log("Initializing governor config...");
    await initializeGovernor(governor, bootstrapAuthority, governorConfigPda, governorParamsPda, valocracy.programId);
  } else {
    console.log("Governor config already exists, skipping initialize.");
  }

  if (!(await accountExists(connection, treasuryStatePda))) {
    console.log("Initializing treasury state...");
    await initializeTreasury(
      treasury,
      bootstrapAuthority,
      treasuryStatePda,
      assetMint,
      vaultAta,
      valocracyConfigPda,
    );
  } else {
    console.log("Treasury state already exists, skipping initialize.");
  }

  console.log("Upserting seed valors...");
  const valorSnapshots: DeploymentSnapshot["valors"] = [];
  for (const valor of DEFAULT_VALORS) {
    const [valorPda] = web3.PublicKey.findProgramAddressSync(
      [VALOR_SEED, leUint64(valor.id)],
      valocracy.programId,
    );
    await upsertValor(valocracy, bootstrapAuthority, valocracyConfigPda, valorPda, valor);
    valorSnapshots.push({
      id: valor.id,
      address: valorPda.toBase58(),
      rarity: valor.rarity,
      secondaryRarity: valor.secondaryRarity,
      trackId: valor.trackId,
      metadata: valor.metadata,
    });
  }

  console.log("Upserting guardian and credit authority...");
  await upsertGuardianTracks(valocracy, bootstrapAuthority, valocracyConfigPda, guardianTracksPda, guardian);
  await upsertCreditAuthority(valocracy, bootstrapAuthority, valocracyConfigPda, creditAuthorityPda, creditAuthority);

  console.log("Minting demo leadership badge if needed...");
  await mintDemoLeadershipIfNeeded(
    valocracy,
    bootstrapAuthority,
    valocracyConfigPda,
    treasury.programId,
    treasuryStatePda,
    userSharesPda,
    demoMember,
  );

  console.log("Ensuring funder ATA + minting demo assets...");
  const funderAta = await getOrCreateAssociatedTokenAccount(connection, payer, assetMint, bootstrapAuthority.publicKey);
  if (createdMint) {
    await mintTo(connection, payer, assetMint, funderAta.address, payer, Number(DEMO_LAB_TOTAL_AMOUNT));
  } else {
    console.log("Using pre-existing asset mint; assuming bootstrap authority already holds demo funds.");
  }

  console.log("Funding demo lab if needed...");
  await ensureDemoLab(
    treasury,
    bootstrapAuthority,
    treasuryStatePda,
    vaultAta,
    funderAta.address,
    demoLabPda,
  );

  console.log("Finalizing governance handoff...");
  await finalizeGovernanceHandoff(
    valocracy,
    treasury,
    bootstrapAuthority,
    valocracyConfigPda,
    governorConfigPda,
    treasuryStatePda,
  );

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  ensureDir(deploymentsDir);

  const snapshot: DeploymentSnapshot = {
    cluster: provider.connection.rpcEndpoint,
    generatedAt: new Date().toISOString(),
    authorityMode: "governance-pda",
    notes: [
      "Bootstrap authority seeds the protocol and then hands Valocracy and Treasury control to the Governor config PDA.",
      "Valocracy stores the TreasuryState PDA reference, and Treasury stores the Governor config PDA as the only post-bootstrap authority.",
      "backendSigner defaults to the bootstrap authority unless KARN_BACKEND_SIGNER is provided.",
    ],
    programs: {
      valocracy: valocracy.programId.toBase58(),
      governor: governor.programId.toBase58(),
      treasury: treasury.programId.toBase58(),
    },
    authorities: {
      bootstrapAuthority: bootstrapAuthority.publicKey.toBase58(),
      backendSigner: backendSigner.toBase58(),
      guardian: guardian.toBase58(),
      creditAuthority: creditAuthority.toBase58(),
      demoMember: demoMember.toBase58(),
    },
    addresses: {
      valocracyConfig: valocracyConfigPda.toBase58(),
      governorConfig: governorConfigPda.toBase58(),
      governorParams: governorParamsPda.toBase58(),
      treasuryState: treasuryStatePda.toBase58(),
      vaultAta: vaultAta.toBase58(),
      assetMint: assetMint.toBase58(),
      guardianTracks: guardianTracksPda.toBase58(),
      creditAuthority: creditAuthorityPda.toBase58(),
      userStats: userStatsPda.toBase58(),
      userShares: userSharesPda.toBase58(),
      demoLab: demoLabPda.toBase58(),
    },
    valors: valorSnapshots,
  };

  const outPath = path.join(deploymentsDir, "devnet.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");

  console.log(`Deployment snapshot written to ${outPath}`);
  console.log(JSON.stringify(snapshot, null, 2));
}

module.exports = async function (provider: anchor.AnchorProvider) {
  await main(provider);
};
