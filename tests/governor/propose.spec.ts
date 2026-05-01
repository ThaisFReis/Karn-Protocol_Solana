//! Governor.propose — 5 BDD tests covering KRN-02 snapshot voting (M13).
//!
//! Uses Bankrun + synthetic Valocracy account injection so the test is
//! self-contained without requiring the full Ed25519 self_register dance.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";

import { Governor } from "../../target/types/governor";
import governorIdl from "../../target/idl/governor.json";

// ─── Seeds ─────────────────────────────────────────────────────────────────

const GOV_CONFIG_SEED  = Buffer.from("gov_config");
const GOV_PARAMS_SEED  = Buffer.from("gov_params");
const PROPOSAL_SEED    = Buffer.from("proposal");
const USER_STATS_SEED  = Buffer.from("user_stats");
const VALOCRACY_CONFIG_SEED = Buffer.from("config");

// Valocracy program ID (must match declare_id! in programs/valocracy/src/lib.rs)
const VALOCRACY_PROGRAM_ID = new PublicKey("6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf");

// Anchor discriminators from target/idl/valocracy.json
const USER_STATS_DISC: number[] = [176, 223, 136, 27, 122, 79, 32, 227];
const CONFIG_DISC: number[]     = [155, 12, 170, 224, 30, 250, 204, 130];

// karn-shared constants (must stay in sync with crates/karn-shared/src/constants.rs)
const MEMBER_FLOOR     = 5n;
const VACANCY_PERIOD   = 15_552_000n; // 180 days in seconds

// DEFAULT_PROPOSAL_THRESHOLD = 100 → proposer needs mana ≥ 100.
const HIGH_CRED_LEVEL  = 200n; // gives mana = 200 (well above threshold)
const LOW_CRED_LEVEL   = 5n;   // gives mana = 5 = MEMBER_FLOOR (below threshold)

const TOTAL_SUPPLY     = 1_000n;

// ─── Helpers ───────────────────────────────────────────────────────────────

function leUint64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function leInt64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

/**
 * Serialize a UserStats account as Anchor would (8-byte disc + Borsh fields).
 *
 * Layout (matches programs/valocracy/src/state.rs::UserStats):
 *   credential_level  : u64
 *   permanent_level   : u64
 *   credential_expiry : i64
 *   verified          : bool
 *   primary_track_id  : Option<u64>  (0x00 = None)
 *   primary_valor_id  : Option<u64>  (0x00 = None)
 *   activity_level    : u64
 *   activity_expiry   : i64
 *   bump              : u8
 */
function serializeUserStats(params: {
  credentialLevel: bigint;
  permanentLevel: bigint;
  credentialExpiry: bigint;
  activityLevel: bigint;
  activityExpiry: bigint;
  bump: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from(USER_STATS_DISC),
    leUint64(params.credentialLevel),
    leUint64(params.permanentLevel),
    leInt64(params.credentialExpiry),
    Buffer.from([0]),              // verified = false
    Buffer.from([0]),              // primary_track_id = None
    Buffer.from([0]),              // primary_valor_id = None
    leUint64(params.activityLevel),
    leInt64(params.activityExpiry),
    Buffer.from([params.bump]),
  ]);
}

/**
 * Serialize a Valocracy Config account (8-byte disc + Borsh fields).
 *
 * Layout (matches programs/valocracy/src/state.rs::Config):
 *   governor           : Pubkey
 *   treasury           : Pubkey
 *   signer             : [u8; 32]
 *   member_valor_id    : u64
 *   leadership_valor_id: u64
 *   total_supply       : u64
 *   credit_paused      : bool
 *   bump               : u8
 */
function serializeValocracyConfig(params: {
  governor: PublicKey;
  treasury: PublicKey;
  totalSupply: bigint;
  bump: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from(CONFIG_DISC),
    params.governor.toBuffer(),
    params.treasury.toBuffer(),
    Buffer.alloc(32, 0),       // signer (unused by governor)
    leUint64(0n),              // member_valor_id
    leUint64(10n),             // leadership_valor_id
    leUint64(params.totalSupply),
    Buffer.from([0]),          // credit_paused = false
    Buffer.from([params.bump]),
  ]);
}

/** Fund an account and return its keypair. */
function fundedKeypair(context: ProgramTestContext): Keypair {
  const kp = Keypair.generate();
  context.setAccount(kp.publicKey, {
    lamports: 10_000_000_000,
    data: Buffer.alloc(0),
    owner: SystemProgram.programId,
    executable: false,
  });
  return kp;
}

/**
 * Inject a synthetic UserStats PDA into the Bankrun ledger.
 *
 * @param credLevel  – credential_level to set (mana ≈ credLevel when fresh)
 * @param expiry     – credential_expiry (set to now + VACANCY_PERIOD for full power)
 */
function injectUserStats(
  context: ProgramTestContext,
  member: PublicKey,
  credLevel: bigint,
  expiry: bigint
): void {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, member.toBuffer()],
    VALOCRACY_PROGRAM_ID
  );
  const data = serializeUserStats({
    credentialLevel: credLevel,
    permanentLevel: 0n,
    credentialExpiry: expiry,
    activityLevel: 0n,
    activityExpiry: 0n,
    bump,
  });
  context.setAccount(pda, {
    lamports: 10_000_000_000,
    data,
    owner: VALOCRACY_PROGRAM_ID,
    executable: false,
  });
}

/**
 * Inject a synthetic Valocracy Config PDA into the Bankrun ledger.
 */
function injectValocracyConfig(
  context: ProgramTestContext,
  totalSupply: bigint
): void {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [VALOCRACY_CONFIG_SEED],
    VALOCRACY_PROGRAM_ID
  );
  const data = serializeValocracyConfig({
    governor: Keypair.generate().publicKey,
    treasury: Keypair.generate().publicKey,
    totalSupply,
    bump,
  });
  context.setAccount(pda, {
    lamports: 10_000_000_000,
    data,
    owner: VALOCRACY_PROGRAM_ID,
    executable: false,
  });
}

// ─── Test suite ────────────────────────────────────────────────────────────

describe("governor.propose (M13 — KRN-02 snapshot voting)", () => {
  let context: ProgramTestContext;
  let program: Program<Governor>;
  let payer: Keypair;

  let govConfigPda: PublicKey;
  let govParamsPda: PublicKey;
  let valocracyConfigPda: PublicKey;

  // Expiry = year 2100; clamps to VACANCY_PERIOD inside calculate_mana.
  const FAR_FUTURE_EXPIRY = 4_102_444_800n;

  // A TreasuryTransfer action — simplest variant for testing.
  const sampleAction = {
    treasuryTransfer: { receiver: Keypair.generate().publicKey, amount: new anchor.BN(1000) },
  };

  before(async () => {
    context = await startAnchor("./", [], []);
    const provider = new BankrunProvider(context);
    program = new Program<Governor>(governorIdl as any, provider);
    payer = context.payer;

    // Derive PDAs
    [govConfigPda] = PublicKey.findProgramAddressSync([GOV_CONFIG_SEED], program.programId);
    [govParamsPda] = PublicKey.findProgramAddressSync([GOV_PARAMS_SEED], program.programId);
    [valocracyConfigPda] = PublicKey.findProgramAddressSync([VALOCRACY_CONFIG_SEED], VALOCRACY_PROGRAM_ID);

    // Initialize Governor (creates GovernorConfigPda + GovernanceConfig)
    await program.methods
      .initialize(VALOCRACY_PROGRAM_ID)
      .accounts({ payer: payer.publicKey, config: govConfigPda, params: govParamsPda } as any)
      .rpc();

    // Inject synthetic Valocracy accounts into the in-memory ledger
    injectValocracyConfig(context, TOTAL_SUPPLY);
  });

  // ── Test 1: valid propose succeeds ─────────────────────────────────────

  it("creates a Proposal account when mana ≥ threshold", async () => {
    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    const [proposerStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, proposer.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID
    );
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, Buffer.from(leUint64(0n))],
      program.programId
    );

    await program.methods
      .propose("Test proposal — M13 integration", sampleAction as any)
      .accounts({
        proposer: proposer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposerStats: proposerStatsPda,
        valocracyConfig: valocracyConfigPda,
        proposal: proposalPda,
      } as any)
      .signers([proposer])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.id.toNumber()).to.equal(0);
    expect(proposal.proposer.toBase58()).to.equal(proposer.publicKey.toBase58());
    expect(proposal.description).to.equal("Test proposal — M13 integration");
    expect(proposal.executed).to.equal(false);
    expect(proposal.forVotes.toNumber()).to.equal(0);
    expect(proposal.againstVotes.toNumber()).to.equal(0);
  });

  // ── Test 2: proposal_count increments after each proposal ─────────────

  it("increments proposal_count on the GovernorConfigPda after propose", async () => {
    const configBefore = await program.account.governorConfigPda.fetch(govConfigPda);
    const countBefore: number = configBefore.proposalCount.toNumber();

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    const [proposerStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, proposer.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID
    );
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, Buffer.from(leUint64(BigInt(countBefore)))],
      program.programId
    );

    await program.methods
      .propose("Second proposal — count test", sampleAction as any)
      .accounts({
        proposer: proposer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposerStats: proposerStatsPda,
        valocracyConfig: valocracyConfigPda,
        proposal: proposalPda,
      } as any)
      .signers([proposer])
      .rpc();

    const configAfter = await program.account.governorConfigPda.fetch(govConfigPda);
    expect(configAfter.proposalCount.toNumber()).to.equal(countBefore + 1);
  });

  // ── Test 3: KRN-02 — total_mana_at_creation = total_supply × MEMBER_FLOOR

  it("KRN-02: snapshots total_mana_at_creation = total_supply × MEMBER_FLOOR", async () => {
    const configState = await program.account.governorConfigPda.fetch(govConfigPda);
    const nextId = configState.proposalCount.toNumber();

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    const [proposerStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, proposer.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID
    );
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, Buffer.from(leUint64(BigInt(nextId)))],
      program.programId
    );

    await program.methods
      .propose("KRN-02 snapshot test", sampleAction as any)
      .accounts({
        proposer: proposer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposerStats: proposerStatsPda,
        valocracyConfig: valocracyConfigPda,
        proposal: proposalPda,
      } as any)
      .signers([proposer])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    const expected = Number(TOTAL_SUPPLY * MEMBER_FLOOR);
    expect(proposal.totalManaAtCreation.toNumber()).to.equal(expected);
  });

  // ── Test 4: below proposal_threshold → NoVotingPower ──────────────────

  it("rejects proposer whose mana is below proposal_threshold (NoVotingPower)", async () => {
    const weakProposer = fundedKeypair(context);
    // LOW_CRED_LEVEL = 5 = MEMBER_FLOOR → mana = 5 < 100 threshold
    injectUserStats(context, weakProposer.publicKey, LOW_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    const configState = await program.account.governorConfigPda.fetch(govConfigPda);
    const nextId = configState.proposalCount.toNumber();

    const [proposerStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, weakProposer.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID
    );
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, Buffer.from(leUint64(BigInt(nextId)))],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .propose("Should be rejected", sampleAction as any)
        .accounts({
          proposer: weakProposer.publicKey,
          config: govConfigPda,
          params: govParamsPda,
          proposerStats: proposerStatsPda,
          valocracyConfig: valocracyConfigPda,
          proposal: proposalPda,
        } as any)
        .signers([weakProposer])
        .rpc();
    } catch (e: any) {
      threw = true;
      expect(e.message ?? String(e)).to.include("NoVotingPower");
    }
    expect(threw, "expected NoVotingPower to be thrown").to.be.true;
  });

  // ── Test 5: non-member → AccountNotInitialized ─────────────────────────

  it("rejects a proposer who has no UserStats (not a Valocracy member)", async () => {
    const nonMember = fundedKeypair(context);
    // No injectUserStats call — the PDA does not exist in the ledger.

    const configState = await program.account.governorConfigPda.fetch(govConfigPda);
    const nextId = configState.proposalCount.toNumber();

    const [proposerStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, nonMember.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID
    );
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, Buffer.from(leUint64(BigInt(nextId)))],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .propose("Non-member proposal attempt", sampleAction as any)
        .accounts({
          proposer: nonMember.publicKey,
          config: govConfigPda,
          params: govParamsPda,
          proposerStats: proposerStatsPda,
          valocracyConfig: valocracyConfigPda,
          proposal: proposalPda,
        } as any)
        .signers([nonMember])
        .rpc();
    } catch (e: any) {
      threw = true;
      // Anchor raises AccountNotInitialized when a required PDA is missing
      const msg = e.message ?? String(e);
      expect(msg).to.match(/AccountNotInitialized|account discriminator|not found/i);
    }
    expect(threw, "expected account-not-initialized error for non-member").to.be.true;
  });
});
