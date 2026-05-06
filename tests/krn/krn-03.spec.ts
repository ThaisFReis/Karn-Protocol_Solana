// KRN-03 — Participation threshold: < 4% of total_mana_at_creation → Defeated.
//
// total_mana_at_creation = total_supply × MEMBER_FLOOR = 1000 × 5 = 5000
// Required participation: 4% × 5000 = 200 mana
//
// Voter mana at creation_time (snapshot, KRN-02) = 6 < 200.
// Even with 100% FOR votes, participation = floor(6 × 100 / 5000) = 0% < 4%.
// Proposal must be Defeated regardless of for/against split.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";

import { Governor } from "../../target/types/governor";
import governorIdl from "../../target/idl/governor.json";

// ─── Seeds ─────────────────────────────────────────────────────────────────

const GOV_CONFIG_SEED       = Buffer.from("gov_config");
const GOV_PARAMS_SEED       = Buffer.from("gov_params");
const PROPOSAL_SEED         = Buffer.from("proposal");
const VOTE_SEED             = Buffer.from("vote");
const USER_STATS_SEED       = Buffer.from("user_stats");
const VALOCRACY_CONFIG_SEED = Buffer.from("config");

const VALOCRACY_PROGRAM_ID = new PublicKey("6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf");

const USER_STATS_DISC: number[] = [176, 223, 136, 27, 122, 79, 32, 227];
const CONFIG_DISC: number[]     = [155, 12, 170, 224, 30, 250, 204, 130];

// ─── Constants ──────────────────────────────────────────────────────────────

const MEMBER_FLOOR   = 5n;
const VOTING_DELAY   = 86_400n;
const VOTING_PERIOD  = 604_800n;

const EPOCH_T           = 6_000_000n;
const FAR_FUTURE_EXPIRY = 4_102_444_800n;

// total_supply = 1000 → total_mana_at_creation = 1000 × 5 = 5000
// participation_threshold = 4% → min participation = 200 mana
const TOTAL_SUPPLY = 1_000n;
const TOTAL_MANA   = TOTAL_SUPPLY * MEMBER_FLOOR; // 5000

// Voter credential: same decay setup as KRN-02.
//   Mana at creation_time (EPOCH_T): 5 + floor(195 × 86401 / 15552000) = 6
//   6 < 200 (= 4% of 5000) → participation insufficient
const VOTER_CRED_LEVEL  = 200n;
const VOTER_CRED_EXPIRY = EPOCH_T + VOTING_DELAY + 1n;
const VOTER_MANA_AT_CREATION = 6;

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

function serializeUserStats(p: {
  credentialLevel: bigint;
  credentialExpiry: bigint;
  bump: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from(USER_STATS_DISC),
    leUint64(p.credentialLevel),
    leUint64(0n),              // permanent_level
    leInt64(p.credentialExpiry),
    Buffer.from([0]),          // verified
    Buffer.from([0]),          // primary_track_id = None
    Buffer.from([0]),          // primary_valor_id = None
    leUint64(0n),              // activity_level
    leInt64(0n),               // activity_expiry
    Buffer.from([p.bump]),
  ]);
}

function serializeValocracyConfig(p: {
  governor: PublicKey;
  totalSupply: bigint;
  bump: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from(CONFIG_DISC),
    p.governor.toBuffer(),
    Keypair.generate().publicKey.toBuffer(), // treasury (unused here)
    Buffer.alloc(32, 0),                     // signer (32 bytes)
    leUint64(0n),                            // member_valor_id
    leUint64(10n),                           // leadership_valor_id
    leUint64(p.totalSupply),
    Buffer.from([0]),                        // credit_paused = false
    Buffer.from([p.bump]),
  ]);
}

function injectUserStats(
  context: ProgramTestContext,
  member: PublicKey,
  credLevel: bigint,
  expiry: bigint,
): void {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [USER_STATS_SEED, member.toBuffer()],
    VALOCRACY_PROGRAM_ID,
  );
  context.setAccount(pda, {
    lamports: 10_000_000_000,
    data: serializeUserStats({ credentialLevel: credLevel, credentialExpiry: expiry, bump }),
    owner: VALOCRACY_PROGRAM_ID,
    executable: false,
  });
}

function injectValocracyConfig(
  context: ProgramTestContext,
  govKey: PublicKey,
  totalSupply: bigint,
): void {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [VALOCRACY_CONFIG_SEED],
    VALOCRACY_PROGRAM_ID,
  );
  context.setAccount(pda, {
    lamports: 10_000_000_000,
    data: serializeValocracyConfig({ governor: govKey, totalSupply, bump }),
    owner: VALOCRACY_PROGRAM_ID,
    executable: false,
  });
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("KRN-03 — Participation threshold: < 4% total_mana → Defeated", () => {
  let context: ProgramTestContext;
  let program: Program<Governor>;
  let payer: Keypair;
  let govConfigPda: PublicKey;
  let govParamsPda: PublicKey;
  let valocracyConfigPda: PublicKey;

  before(async () => {
    context = await startAnchor("./", [], []);
    const provider = new BankrunProvider(context);
    program = new Program<Governor>(governorIdl as any, provider);
    payer = context.payer;

    [govConfigPda] = PublicKey.findProgramAddressSync([GOV_CONFIG_SEED], program.programId);
    [govParamsPda] = PublicKey.findProgramAddressSync([GOV_PARAMS_SEED], program.programId);
    [valocracyConfigPda] = PublicKey.findProgramAddressSync(
      [VALOCRACY_CONFIG_SEED],
      VALOCRACY_PROGRAM_ID,
    );

    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    await program.methods
      .initialize(VALOCRACY_PROGRAM_ID)
      .accounts({ payer: payer.publicKey, config: govConfigPda, params: govParamsPda } as any)
      .rpc();

    // total_supply = 1000 → total_mana_at_creation = 5000 when a proposal is created.
    injectValocracyConfig(context, govConfigPda, TOTAL_SUPPLY);
  });

  it("proposal with 100% FOR votes but < 4% participation is Defeated", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    // Proposer: non-decaying, mana >> proposal_threshold (100).
    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, 200n, FAR_FUTURE_EXPIRY);

    // Voter: mana at creation_time = 6 (< 200 = 4% of total_mana 5000).
    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, VOTER_CRED_LEVEL, VOTER_CRED_EXPIRY);

    const proposalId = 0;
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, leUint64(BigInt(proposalId))],
      program.programId,
    );
    const [proposerStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, proposer.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID,
    );

    await program.methods
      .propose("KRN-03 participation test", { valocracyPauseCredit: {} } as any)
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

    // Verify total_mana_at_creation = 1000 × 5 = 5000.
    const proposalBefore = await program.account.proposal.fetch(proposalPda);
    expect(proposalBefore.totalManaAtCreation.toNumber()).to.equal(
      Number(TOTAL_MANA),
      `total_mana_at_creation must be ${TOTAL_MANA} (total_supply=${TOTAL_SUPPLY} × MEMBER_FLOOR=5)`,
    );

    // Cast 100% FOR vote. KRN-02 applies: mana = 6 (snapshot at creation_time).
    const voteTime = EPOCH_T + VOTING_DELAY + 100n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));

    const [voterStatsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, voter.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID,
    );
    const [votePda] = PublicKey.findProgramAddressSync(
      [VOTE_SEED, leUint64(BigInt(proposalId)), voter.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .castVote(new anchor.BN(proposalId), true)
      .accounts({
        voter: voter.publicKey,
        config: govConfigPda,
        proposal: proposalPda,
        voterStats: voterStatsPda,
        vote: votePda,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([voter])
      .rpc();

    // Advance past end_time.
    const afterEnd = EPOCH_T + VOTING_DELAY + VOTING_PERIOD + 1n;
    context.setClock(new Clock(3n, EPOCH_T, 0n, 0n, afterEnd));

    // KRN-03: participation = floor(6 × 100 / 5000) = 0 < 4 → Defeated.
    const state = await program.methods
      .getProposalState(new anchor.BN(proposalId))
      .accounts({ proposal: proposalPda } as any)
      .signers([payer])
      .view();

    expect(state).to.equal(3, "proposal must be Defeated (state=3): participation < 4% even with 100% FOR votes");

    // Verify the exact numbers driving the Defeated outcome.
    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.forVotes.toNumber()).to.equal(
      VOTER_MANA_AT_CREATION,
      `for_votes must equal ${VOTER_MANA_AT_CREATION} (snapshot mana)`,
    );
    expect(proposal.againstVotes.toNumber()).to.equal(0, "no against votes cast");
    const participation = Math.floor(proposal.forVotes.toNumber() * 100 / proposal.totalManaAtCreation.toNumber());
    expect(participation).to.be.lessThan(4, `participation (${participation}%) must be < 4%`);
  });
});
