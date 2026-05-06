//! M14 — cast_vote + execute + get_proposal_state Bankrun tests.
//!
//! Coverage (12 tests per PRD):
//!  1.  cast_vote FOR — for_votes incremented
//!  2.  cast_vote AGAINST — against_votes incremented
//!  3.  VotingNotStarted — vote before start_time fails
//!  4.  VotingEnded — vote after end_time fails
//!  5.  AlreadyVoted — double vote fails (Vote PDA already exists)
//!  6.  NoVotingPower — voter with no UserStats fails
//!  7.  get_proposal_state Pending — before start_time
//!  8.  get_proposal_state Succeeded — after sufficient votes
//!  9.  execute: UpdateGovernanceConfig updates params PDA directly
//! 10.  execute: ValocracyPauseCredit CPI sets credit_paused = true
//! 11.  execute: ProposalAlreadyExecuted — second execute fails
//! 12.  execute: ProposalNotSucceeded — Defeated proposal fails

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";

import { Governor } from "../../target/types/governor";
import governorIdl from "../../target/idl/governor.json";

// ─── Seeds ─────────────────────────────────────────────────────────────────

const GOV_CONFIG_SEED      = Buffer.from("gov_config");
const GOV_PARAMS_SEED      = Buffer.from("gov_params");
const PROPOSAL_SEED        = Buffer.from("proposal");
const VOTE_SEED            = Buffer.from("vote");
const USER_STATS_SEED      = Buffer.from("user_stats");
const VALOCRACY_CONFIG_SEED = Buffer.from("config");

const VALOCRACY_PROGRAM_ID = new PublicKey("6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf");

// Anchor discriminators (from target/idl/*.json)
const USER_STATS_DISC: number[] = [176, 223, 136, 27, 122, 79, 32, 227];
const CONFIG_DISC: number[]     = [155, 12, 170, 224, 30, 250, 204, 130];

// ─── karn-shared constants ──────────────────────────────────────────────────

const MEMBER_FLOOR    = 5n;
const VACANCY_PERIOD  = 15_552_000n; // 180 days
const VOTING_DELAY    = 86_400n;     // 1 day (DEFAULT_VOTING_DELAY)
const VOTING_PERIOD   = 604_800n;    // 7 days (DEFAULT_VOTING_PERIOD)

// Base timestamp for all tests.
const EPOCH_T = 1_000_000n;

// Far-future credential expiry → full Mana (avoids decay in snapshot).
const FAR_FUTURE_EXPIRY = 4_102_444_800n; // year 2100

// Total supply injected into the synthetic Valocracy Config.
const TOTAL_SUPPLY = 1_000n;

// High credential level → mana >> proposal_threshold (100) and >> 4% participation.
const HIGH_CRED_LEVEL = 200n;

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
    Buffer.from([0]),          // verified = false
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
  creditPaused: boolean;
  bump: number;
}): Buffer {
  return Buffer.concat([
    Buffer.from(CONFIG_DISC),
    p.governor.toBuffer(),           // governor
    Keypair.generate().publicKey.toBuffer(), // treasury (unused here)
    Buffer.alloc(32, 0),             // signer (32 bytes, unused)
    leUint64(0n),                    // member_valor_id
    leUint64(10n),                   // leadership_valor_id
    leUint64(p.totalSupply),
    Buffer.from([p.creditPaused ? 1 : 0]),
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
  creditPaused = false,
): void {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [VALOCRACY_CONFIG_SEED],
    VALOCRACY_PROGRAM_ID,
  );
  context.setAccount(pda, {
    lamports: 10_000_000_000,
    data: serializeValocracyConfig({ governor: govKey, totalSupply, creditPaused, bump }),
    owner: VALOCRACY_PROGRAM_ID,
    executable: false,
  });
}

// ─── Reusable actions ──────────────────────────────────────────────────────

const pauseCreditAction = { valocracyPauseCredit: {} };
const treasuryTransferAction = {
  treasuryTransfer: { receiver: Keypair.generate().publicKey, amount: new anchor.BN(1) },
};

function expectGovernorError(err: unknown, errorName: string, errorCode: number): void {
  const message = err instanceof Error ? err.message : String(err);
  const codeHex = `0x${errorCode.toString(16)}`;

  expect(message).to.satisfy(
    (text: string) =>
      text.includes(errorName) ||
      text.includes(`Error Number: ${errorCode}`) ||
      text.includes(`custom program error: ${codeHex}`),
    `expected error to include ${errorName}, Error Number: ${errorCode}, or custom program error: ${codeHex}; got:\n${message}`,
  );
}

// ─── Test suite ────────────────────────────────────────────────────────────

describe("governor.cast_vote + execute + get_proposal_state (M14)", () => {
  let context: ProgramTestContext;
  let program: Program<Governor>;
  let payer: Keypair;

  let govConfigPda: PublicKey;
  let govParamsPda: PublicKey;
  let valocracyConfigPda: PublicKey;

  // Monotonic proposal counter shared across tests in this suite.
  let nextProposalId = 0;

  /** Create a proposal from the perspective of `proposer` (must have injected stats). */
  async function propose(
    proposer: Keypair,
    action: object,
  ): Promise<PublicKey> {
    const proposalId = nextProposalId++;
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [PROPOSAL_SEED, leUint64(BigInt(proposalId))],
      program.programId,
    );
    const [statsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, proposer.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID,
    );
    await program.methods
      .propose("M14 test", action as any)
      .accounts({
        proposer: proposer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposerStats: statsPda,
        valocracyConfig: valocracyConfigPda,
        proposal: proposalPda,
      } as any)
      .signers([proposer])
      .rpc();
    return proposalPda;
  }

  /** Cast a vote as `voter` on a specific proposal. */
  async function castVote(
    voter: Keypair,
    proposalPda: PublicKey,
    proposalId: number,
    support: boolean,
  ): Promise<void> {
    const [statsPda] = PublicKey.findProgramAddressSync(
      [USER_STATS_SEED, voter.publicKey.toBuffer()],
      VALOCRACY_PROGRAM_ID,
    );
    const [votePda] = PublicKey.findProgramAddressSync(
      [VOTE_SEED, leUint64(BigInt(proposalId)), voter.publicKey.toBuffer()],
      program.programId,
    );
    await program.methods
      .castVote(new anchor.BN(proposalId), support)
      .accounts({
        voter: voter.publicKey,
        config: govConfigPda,
        proposal: proposalPda,
        voterStats: statsPda,
        vote: votePda,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([voter])
      .rpc();
  }

  before(async () => {
    context = await startAnchor("./", [], []);
    const provider = new BankrunProvider(context);
    program = new Program<Governor>(governorIdl as any, provider);
    payer = context.payer;

    [govConfigPda] = PublicKey.findProgramAddressSync([GOV_CONFIG_SEED], program.programId);
    [govParamsPda] = PublicKey.findProgramAddressSync([GOV_PARAMS_SEED], program.programId);
    [valocracyConfigPda] = PublicKey.findProgramAddressSync([VALOCRACY_CONFIG_SEED], VALOCRACY_PROGRAM_ID);

    // Initialize governor.
    await program.methods
      .initialize(VALOCRACY_PROGRAM_ID)
      .accounts({ payer: payer.publicKey, config: govConfigPda, params: govParamsPda } as any)
      .rpc();

    // Inject valocracy Config with governor = gov_config_pda (needed for execute CPI).
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));
    injectValocracyConfig(context, govConfigPda, TOTAL_SUPPLY);
  });

  // ── 1. cast_vote FOR ─────────────────────────────────────────────────────

  it("cast_vote: FOR vote increments for_votes", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    // Advance into voting window.
    const voteTime = EPOCH_T + VOTING_DELAY + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));

    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, true);

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.forVotes.toNumber()).to.be.greaterThan(0);
    expect(proposal.againstVotes.toNumber()).to.equal(0);
  });

  // ── 2. cast_vote AGAINST ────────────────────────────────────────────────

  it("cast_vote: AGAINST vote increments against_votes", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    const voteTime = EPOCH_T + VOTING_DELAY + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));

    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, false);

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.againstVotes.toNumber()).to.be.greaterThan(0);
    expect(proposal.forVotes.toNumber()).to.equal(0);
  });

  // ── 3. VotingNotStarted ─────────────────────────────────────────────────

  it("cast_vote: rejects vote before start_time (VotingNotStarted)", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    // Still at EPOCH_T — voting hasn't started (start_time = EPOCH_T + VOTING_DELAY).
    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    let threw = false;
    try {
      await castVote(voter, proposalPda, proposalId, true);
    } catch (e: any) {
      threw = true;
      expect((e.message ?? String(e))).to.include("VotingNotStarted");
    }
    expect(threw, "expected VotingNotStarted").to.be.true;
  });

  // ── 4. VotingEnded ──────────────────────────────────────────────────────

  it("cast_vote: rejects vote after end_time (VotingEnded)", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    // Advance past end_time.
    const afterEnd = EPOCH_T + VOTING_DELAY + VOTING_PERIOD + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, afterEnd));

    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    let threw = false;
    try {
      await castVote(voter, proposalPda, proposalId, true);
    } catch (e: any) {
      threw = true;
      expect((e.message ?? String(e))).to.include("VotingEnded");
    }
    expect(threw, "expected VotingEnded").to.be.true;
  });

  // ── 5. AlreadyVoted ─────────────────────────────────────────────────────

  it("cast_vote: rejects double vote (AlreadyVoted)", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    const voteTime = EPOCH_T + VOTING_DELAY + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));

    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, true);

    let threw = false;
    try {
      await castVote(voter, proposalPda, proposalId, true);
    } catch (e: any) {
      threw = true;
      // Anchor raises an error when init fails because the account already exists.
      const msg = e.message ?? String(e);
      expect(msg).to.match(/already in use|AlreadyVoted|custom program error/i);
    }
    expect(threw, "expected double-vote to fail").to.be.true;
  });

  // ── 6. NoVotingPower (no UserStats) ─────────────────────────────────────

  it("cast_vote: rejects voter with no UserStats (AccountNotInitialized)", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    const voteTime = EPOCH_T + VOTING_DELAY + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));

    const noMemberVoter = fundedKeypair(context);
    // No UserStats injection — PDA does not exist.

    let threw = false;
    try {
      await castVote(noMemberVoter, proposalPda, proposalId, true);
    } catch (e: any) {
      threw = true;
      const msg = e.message ?? String(e);
      expect(msg).to.match(/AccountNotInitialized|account discriminator|not found/i);
    }
    expect(threw, "expected AccountNotInitialized for non-member").to.be.true;
  });

  // ── 7. get_proposal_state: Pending ──────────────────────────────────────

  it("get_proposal_state: returns Pending (0) before start_time", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    const state = await program.methods
      .getProposalState(new anchor.BN(proposalId))
      .accounts({ proposal: proposalPda } as any)
      .signers([payer])
      .view();

    expect(state).to.equal(0); // 0 = Pending
  });

  // ── 8. get_proposal_state: Succeeded ────────────────────────────────────

  it("get_proposal_state: returns Succeeded (2) after sufficient votes", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    // Vote FOR.
    const voteTime = EPOCH_T + VOTING_DELAY + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));

    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, true);

    // Advance past end.
    const afterEnd = EPOCH_T + VOTING_DELAY + VOTING_PERIOD + 1n;
    context.setClock(new Clock(3n, EPOCH_T, 0n, 0n, afterEnd));

    const state = await program.methods
      .getProposalState(new anchor.BN(proposalId))
      .accounts({ proposal: proposalPda } as any)
      .signers([payer])
      .view();

    expect(state).to.equal(2); // 2 = Succeeded
  });

  // ── 9. execute: UpdateGovernanceConfig ─────────────────────────────────

  it("execute: UpdateGovernanceConfig updates GovernanceConfig PDA directly", async () => {
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);

    const newVotingDelay = 172800; // 2 days
    const updateConfigAction = {
      updateGovernanceConfig: {
        votingDelay: new anchor.BN(newVotingDelay),
        votingPeriod: new anchor.BN(604800),
        proposalThreshold: new anchor.BN(100),
        quorumPercentage: new anchor.BN(51),
        participationThreshold: new anchor.BN(4),
      },
    };

    const proposalPda = await propose(proposer, updateConfigAction);
    const proposalId = nextProposalId - 1;

    // Vote and advance to succeeded state.
    const voteTime = EPOCH_T + VOTING_DELAY + 1n;
    context.setClock(new Clock(2n, EPOCH_T, 0n, 0n, voteTime));
    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, true);

    const afterEnd = EPOCH_T + VOTING_DELAY + VOTING_PERIOD + 1n;
    context.setClock(new Clock(3n, EPOCH_T, 0n, 0n, afterEnd));

    await program.methods
      .execute(new anchor.BN(proposalId))
      .accounts({
        executor: payer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposal: proposalPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    // Voting delay should be updated.
    const params = await program.account.governanceConfig.fetch(govParamsPda);
    expect(params.votingDelay.toNumber()).to.equal(newVotingDelay);

    // Reset voting delay back to default so subsequent tests aren't affected.
    // (Use raw account write since we can't easily propose again.)
    // Simpler: re-initialize won't work. Leave the changed delay for the rest of the suite.
    // Tests that need VOTING_DELAY must account for the new 172800s delay.
    // To avoid this, we'll reset the clock accounting for the new delay.
    // Actually, the remaining tests define VOTING_DELAY_EFFECTIVE below.
  });

  // ── 10. execute: ValocracyPauseCredit CPI ───────────────────────────────

  it("execute: ValocracyPauseCredit CPI sets credit_paused = true", async () => {
    // Re-inject valocracy Config (credit_paused = false) to start fresh.
    injectValocracyConfig(context, govConfigPda, TOTAL_SUPPLY, false);

    // Use a fresh epoch so timing is clean. Account for the updated VOTING_DELAY (172800).
    const T = 2_000_000n;
    const effectiveDelay = 172_800n; // updated by test 9
    context.setClock(new Clock(1n, T, 0n, 0n, T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, pauseCreditAction);
    const proposalId = nextProposalId - 1;

    // Vote FOR inside the new window.
    const voteTime = T + effectiveDelay + 1n;
    context.setClock(new Clock(2n, T, 0n, 0n, voteTime));

    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, true);

    // Advance past end_time.
    const afterEnd = T + effectiveDelay + VOTING_PERIOD + 1n;
    context.setClock(new Clock(3n, T, 0n, 0n, afterEnd));

    // Execute with remaining_accounts = [valocracy_program, valocracy_config (mut)].
    await program.methods
      .execute(new anchor.BN(proposalId))
      .accounts({
        executor: payer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposal: proposalPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([
        { pubkey: VALOCRACY_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: valocracyConfigPda, isSigner: false, isWritable: true },
      ])
      .rpc();

    // Verify credit_paused = true at byte offset 128 in the valocracy Config data.
    const configAccount = await context.banksClient.getAccount(valocracyConfigPda);
    expect(configAccount, "valocracy Config account must exist after CPI").to.not.be.null;
    const creditPaused = configAccount!.data[128] === 1;
    expect(creditPaused, "credit_paused should be true after ValocracyPauseCredit").to.be.true;

    // Restore credit_paused = false for subsequent tests.
    injectValocracyConfig(context, govConfigPda, TOTAL_SUPPLY, false);
  });

  // ── 11. execute: ProposalAlreadyExecuted ────────────────────────────────

  it("execute: rejects already-executed proposal (ProposalAlreadyExecuted)", async () => {
    const T = 3_000_000n;
    const effectiveDelay = 172_800n;
    context.setClock(new Clock(1n, T, 0n, 0n, T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, pauseCreditAction);
    const proposalId = nextProposalId - 1;

    const voteTime = T + effectiveDelay + 1n;
    context.setClock(new Clock(2n, T, 0n, 0n, voteTime));
    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    await castVote(voter, proposalPda, proposalId, true);

    const afterEnd = T + effectiveDelay + VOTING_PERIOD + 1n;
    context.setClock(new Clock(3n, T, 0n, 0n, afterEnd));

    // First execute — succeeds.
    await program.methods
      .execute(new anchor.BN(proposalId))
      .accounts({
        executor: payer.publicKey,
        config: govConfigPda,
        params: govParamsPda,
        proposal: proposalPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .remainingAccounts([
        { pubkey: VALOCRACY_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: valocracyConfigPda, isSigner: false, isWritable: true },
      ])
      .rpc();

    // Second execute — must fail.
    const secondExecutor = fundedKeypair(context);
    let threw = false;
    try {
      await program.methods
        .execute(new anchor.BN(proposalId))
        .accounts({
          executor: secondExecutor.publicKey,
          config: govConfigPda,
          params: govParamsPda,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts([
          { pubkey: VALOCRACY_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: valocracyConfigPda, isSigner: false, isWritable: true },
        ])
        .signers([secondExecutor])
        .rpc();
    } catch (e: any) {
      threw = true;
      expectGovernorError(e, "ProposalAlreadyExecuted", 6009);
    }
    expect(threw, "expected ProposalAlreadyExecuted").to.be.true;

    // Restore for next test.
    injectValocracyConfig(context, govConfigPda, TOTAL_SUPPLY, false);
  });

  // ── 12. execute: ProposalNotSucceeded ───────────────────────────────────

  it("execute: rejects Defeated proposal (ProposalNotSucceeded)", async () => {
    // Create a proposal where no one votes → participation = 0% → Defeated.
    const T = 4_000_000n;
    const effectiveDelay = 172_800n;
    context.setClock(new Clock(1n, T, 0n, 0n, T));

    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, HIGH_CRED_LEVEL, FAR_FUTURE_EXPIRY);
    const proposalPda = await propose(proposer, treasuryTransferAction);
    const proposalId = nextProposalId - 1;

    // Advance past end without voting — proposal will be Defeated (no votes).
    const afterEnd = T + effectiveDelay + VOTING_PERIOD + 1n;
    context.setClock(new Clock(2n, T, 0n, 0n, afterEnd));

    let threw = false;
    try {
      await program.methods
        .execute(new anchor.BN(proposalId))
        .accounts({
          executor: payer.publicKey,
          config: govConfigPda,
          params: govParamsPda,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    } catch (e: any) {
      threw = true;
      expect((e.message ?? String(e))).to.include("ProposalNotSucceeded");
    }
    expect(threw, "expected ProposalNotSucceeded").to.be.true;
  });
});
