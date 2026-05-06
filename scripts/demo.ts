import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";
import nacl from "tweetnacl";

import governorIdl from "../target/idl/governor.json";
import treasuryIdl from "../target/idl/treasury.json";
import valocracyIdl from "../target/idl/valocracy.json";
import type { Governor } from "../target/types/governor";
import type { Treasury } from "../target/types/treasury";
import type { Valocracy } from "../target/types/valocracy";
import {
  buildEd25519PreInstruction,
  buildExecuteRemainingAccounts,
  buildSelfRegisterAccounts,
  buildSelfRegisterPayload,
} from "../sdk/src";

type WalletWithPayer = anchor.Wallet & { payer: web3.Keypair };

type DeploymentSnapshot = {
  cluster: string;
  generatedAt: string;
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

const CONFIG_SEED = Buffer.from("config");
const VALOR_SEED = Buffer.from("valor");
const USER_STATS_SEED = Buffer.from("user_stats");
const TOKEN_OWNER_SEED = Buffer.from("token_owner");
const TOKEN_VALOR_SEED = Buffer.from("token_valor");
const TREASURY_SEED = Buffer.from("treasury");
const USER_SHARES_SEED = Buffer.from("shares");
const CLAIMABLE_SEED = Buffer.from("claimable");
const PROPOSAL_SEED = Buffer.from("proposal");

const DEFAULT_TRACK_ID = 1n;
const DEMO_LAB_ID = 0;
const DEMO_SCHOLARSHIP_WITHDRAW = 50_000_000n;

function logStep(step: string, message: string): void {
  console.log(`[${step}] ${message}`);
}

function leUint64(n: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function loadSnapshot(): DeploymentSnapshot {
  const snapshotPath = path.resolve(__dirname, "../deployments/devnet.json");
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Deployment snapshot not found: ${snapshotPath}`);
  }
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as DeploymentSnapshot;
}

function loadKeypairFromEnv(varName: string): web3.Keypair | null {
  const value = process.env[varName];
  if (!value) return null;

  if (fs.existsSync(value)) {
    return web3.Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(value, "utf8")) as number[]),
    );
  }

  return web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(value) as number[]),
  );
}

function ensureKeypairFile(filePath: string): web3.Keypair {
  if (fs.existsSync(filePath)) {
    return web3.Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")) as number[]),
    );
  }

  const keypair = web3.Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)) + "\n");
  return keypair;
}

async function ensureFunded(
  connection: web3.Connection,
  payer: web3.Keypair,
  recipient: web3.PublicKey,
): Promise<void> {
  const balance = await connection.getBalance(recipient);
  if (balance >= web3.LAMPORTS_PER_SOL / 20) return;

  try {
    const sig = await connection.requestAirdrop(recipient, web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    logStep("fund", `Airdropped 1 SOL to ${recipient.toBase58()}`);
    return;
  } catch {
    // fall through to payer transfer
  }

  const tx = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: web3.LAMPORTS_PER_SOL / 10,
    }),
  );
  await web3.sendAndConfirmTransaction(connection, tx, [payer]);
  logStep("fund", `Transferred 0.1 SOL to ${recipient.toBase58()}`);
}

function derive(addressSeed: Buffer, programId: web3.PublicKey): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync([addressSeed], programId)[0];
}

async function main(): Promise<void> {
  const snapshot = loadSnapshot();
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as WalletWithPayer;
  const payer = wallet.payer;
  const connection = provider.connection;

  const valocracyProgram = new Program<Valocracy>(valocracyIdl as any, provider);
  const governorProgram = new Program<Governor>(governorIdl as any, provider);
  const treasuryProgram = new Program<Treasury>(treasuryIdl as any, provider);

  const newcomerFile = path.resolve(__dirname, "../deployments/demo-newcomer.json");
  const newcomer = ensureKeypairFile(newcomerFile);

  const backendSignerKp =
    loadKeypairFromEnv("KARN_BACKEND_SIGNER_SECRET") ??
    (snapshot.authorities.backendSigner === payer.publicKey.toBase58() ? payer : null);
  if (!backendSignerKp) {
    throw new Error(
      "Backend signer secret unavailable. Set KARN_BACKEND_SIGNER_SECRET to a JSON secret key or path.",
    );
  }

  const guardianSigner =
    loadKeypairFromEnv("KARN_GUARDIAN_SECRET") ??
    (snapshot.authorities.guardian === payer.publicKey.toBase58() ? payer : null);
  if (!guardianSigner) {
    throw new Error(
      "Guardian signer secret unavailable. Set KARN_GUARDIAN_SECRET to a JSON secret key or path.",
    );
  }

  const demoMemberSigner =
    loadKeypairFromEnv("KARN_DEMO_MEMBER_SECRET") ??
    (snapshot.authorities.demoMember === payer.publicKey.toBase58() ? payer : null);
  if (!demoMemberSigner) {
    throw new Error(
      "Demo member signer unavailable. Set KARN_DEMO_MEMBER_SECRET to a JSON secret key or path.",
    );
  }

  const valocracyConfig = new web3.PublicKey(snapshot.addresses.valocracyConfig);
  const governorConfig = new web3.PublicKey(snapshot.addresses.governorConfig);
  const governorParams = new web3.PublicKey(snapshot.addresses.governorParams);
  const treasuryState = new web3.PublicKey(snapshot.addresses.treasuryState);
  const vaultAta = new web3.PublicKey(snapshot.addresses.vaultAta);
  const assetMint = new web3.PublicKey(snapshot.addresses.assetMint);
  const demoLab = new web3.PublicKey(snapshot.addresses.demoLab);

  const memberValor = new web3.PublicKey(
    snapshot.valors.find((valor) => valor.id === 0)?.address ?? derive(Buffer.concat([VALOR_SEED, leUint64(0)]), valocracyProgram.programId).toBase58(),
  );
  const techValor = new web3.PublicKey(
    snapshot.valors.find((valor) => valor.id === 20)?.address ?? derive(Buffer.concat([VALOR_SEED, leUint64(20)]), valocracyProgram.programId).toBase58(),
  );

  const newcomerStats = web3.PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, newcomer.publicKey.toBuffer()],
    valocracyProgram.programId,
  )[0];
  const newcomerUserShares = web3.PublicKey.findProgramAddressSync(
    [USER_SHARES_SEED, newcomer.publicKey.toBuffer()],
    treasuryProgram.programId,
  )[0];
  const newcomerClaimable = web3.PublicKey.findProgramAddressSync(
    [CLAIMABLE_SEED, newcomer.publicKey.toBuffer()],
    treasuryProgram.programId,
  )[0];

  logStep("snapshot", `Cluster RPC: ${snapshot.cluster}`);
  logStep("snapshot", `Newcomer keypair file: ${newcomerFile}`);

  await ensureFunded(connection, payer, newcomer.publicKey);

  if ((await connection.getAccountInfo(newcomerStats)) === null) {
    const nonce = BigInt(Date.now());
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const config = await valocracyProgram.account.config.fetch(valocracyConfig);
    const tokenId = BigInt(config.totalSupply.toString()) + 1n;
    const payload = buildSelfRegisterPayload(newcomer.publicKey, nonce, expiry, DEFAULT_TRACK_ID);
    const signature = nacl.sign.detached(payload, backendSignerKp.secretKey);
    const preIx = buildEd25519PreInstruction({
      caller: newcomer.publicKey,
      nonce,
      expiry,
      trackId: DEFAULT_TRACK_ID,
      tokenId,
      backendSignature: signature,
      backendPublicKey: backendSignerKp.publicKey.toBytes(),
    });

    await valocracyProgram.methods
      .selfRegister(
        new anchor.BN(DEFAULT_TRACK_ID.toString()),
        new anchor.BN(nonce.toString()),
        new anchor.BN(expiry.toString()),
        new anchor.BN(tokenId.toString()),
      )
      .accounts(buildSelfRegisterAccounts(
        { caller: newcomer.publicKey, nonce, tokenId },
        valocracyProgram.programId,
        memberValor,
      ) as any)
      .preInstructions([preIx])
      .signers([newcomer])
      .rpc();
    logStep("register", `Self-register concluído para ${newcomer.publicKey.toBase58()}`);
  } else {
    logStep("register", "Newcomer já possui UserStats; pulando self_register.");
  }

  const newcomerStatsAccount = await valocracyProgram.account.userStats.fetch(newcomerStats);
  logStep("mana", `credential_level=${newcomerStatsAccount.credentialLevel.toString()}`);

  const guardianTokenId = BigInt((await valocracyProgram.account.config.fetch(valocracyConfig)).totalSupply.toString()) + 1n;
  const guardianTokenOwner = web3.PublicKey.findProgramAddressSync(
    [TOKEN_OWNER_SEED, leUint64(guardianTokenId)],
    valocracyProgram.programId,
  )[0];
  const guardianTokenValor = web3.PublicKey.findProgramAddressSync(
    [TOKEN_VALOR_SEED, leUint64(guardianTokenId)],
    valocracyProgram.programId,
  )[0];

  try {
    await valocracyProgram.methods
      .guardianMint(new anchor.BN(20), new anchor.BN(guardianTokenId.toString()))
      .accounts({
        guardian: guardianSigner.publicKey,
        account: newcomer.publicKey,
        config: valocracyConfig,
        valor: techValor,
        guardianTracks: new web3.PublicKey(snapshot.addresses.guardianTracks),
        userStats: newcomerStats,
        tokenOwner: guardianTokenOwner,
        tokenValor: guardianTokenValor,
        systemProgram: web3.SystemProgram.programId,
      } as any)
      .signers([guardianSigner, newcomer])
      .rpc();
    logStep("mint", "guardian_mint executado para badge Tech Contributor.");
  } catch (error) {
    logStep("mint", `guardian_mint pulado/indisponível: ${error instanceof Error ? error.message : String(error)}`);
  }

  const govConfig = await governorProgram.account.governorConfigPda.fetch(governorConfig);
  const proposalId = BigInt(govConfig.proposalCount.toString());
  const proposalPda = web3.PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, leUint64(proposalId)],
    governorProgram.programId,
  )[0];

  const approveScholarshipAction = {
    treasuryApproveScholarship: {
      labId: DEMO_LAB_ID,
      member: newcomer.publicKey,
    },
  };

  await governorProgram.methods
    .propose("Release scholarship to newcomer demo member", approveScholarshipAction as any)
    .accounts({
      proposer: demoMemberSigner.publicKey,
      config: governorConfig,
      params: governorParams,
      proposerStats: new web3.PublicKey(snapshot.addresses.userStats),
      valocracyConfig,
      proposal: proposalPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([demoMemberSigner])
    .rpc();
  logStep("propose", `Proposta ${proposalId.toString()} criada.`);

  const proposal = await governorProgram.account.proposal.fetch(proposalPda);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const start = BigInt(proposal.startTime.toString());
  const end = BigInt(proposal.endTime.toString());

  if (now < start) {
    logStep("vote", `Bloqueado pelo protocolo: voting_delay ainda não passou.`);
    logStep("vote", `Vote abre em ${new Date(Number(start) * 1000).toISOString()}`);
    logStep("vote", `Vote encerra em ${new Date(Number(end) * 1000).toISOString()}`);
    logStep("note", "O fluxo RPC completo em uma única sessão ainda depende de parâmetros menores ou fast-forward de clock.");
    return;
  }

  const votePda = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), leUint64(proposalId), demoMemberSigner.publicKey.toBuffer()],
    governorProgram.programId,
  )[0];
  await governorProgram.methods
    .castVote(new anchor.BN(proposalId.toString()), true)
    .accounts({
      voter: demoMemberSigner.publicKey,
      config: governorConfig,
      proposal: proposalPda,
      vote: votePda,
      voterStats: new web3.PublicKey(snapshot.addresses.userStats),
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .signers([demoMemberSigner])
    .rpc();
  logStep("vote", "Voto FOR enviado.");

  if (BigInt(Math.floor(Date.now() / 1000)) <= end) {
    logStep("execute", `Bloqueado pelo protocolo: voting_period ainda não encerrou.`);
    logStep("execute", `Execute disponível após ${new Date(Number(end + 1n) * 1000).toISOString()}`);
    return;
  }

  await governorProgram.methods
    .execute(new anchor.BN(proposalId.toString()))
    .accounts({
      executor: payer.publicKey,
      config: governorConfig,
      params: governorParams,
      proposal: proposalPda,
      systemProgram: web3.SystemProgram.programId,
    } as any)
    .remainingAccounts(
      buildExecuteRemainingAccounts(approveScholarshipAction as any),
    )
    .rpc();
  logStep("execute", "Proposta executada.");

  const newcomerAta = await getOrCreateAssociatedTokenAccount(connection, payer, assetMint, newcomer.publicKey);
  await treasuryProgram.methods
    .withdrawScholarship(new anchor.BN(DEMO_SCHOLARSHIP_WITHDRAW.toString()))
    .accounts({
      member: newcomer.publicKey,
      state: treasuryState,
      claimable: newcomerClaimable,
      vaultAta,
      memberAta: newcomerAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .signers([newcomer])
    .rpc();
  logStep("withdraw", `Scholarship sacada: ${DEMO_SCHOLARSHIP_WITHDRAW.toString()}`);

  const claimable = await treasuryProgram.account.claimable.fetch(newcomerClaimable);
  logStep("final", `Claimable restante: ${claimable.amount.toString()}`);
  logStep("final", `Lab utilizado: ${demoLab.toBase58()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
