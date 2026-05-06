// KRN-02 — Snapshot voting: mana computed at proposal.creation_time, not vote_time.
//
// Voter credential: level=200, expiry = EPOCH_T + VOTING_DELAY + 1
//   Mana at creation_time (EPOCH_T)              = 5 + floor(195 * 86401 / 15552000) = 6
//   Mana at vote_time    (EPOCH_T+VOTING_DELAY+100) = 5  (expired → floor only)
//
// cast_vote must record for_votes = 6 (snapshot), not 5 (current).

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

const MEMBER_FLOOR    = 5n;
const VACANCY_PERIOD  = 15_552_000n;
const VOTING_DELAY    = 86_400n;
const VOTING_PERIOD   = 604_800n;

const EPOCH_T           = 5_000_000n;
const FAR_FUTURE_EXPIRY = 4_102_444_800n;
const TOTAL_SUPPLY      = 1_000n;

// Voter's credential expires VOTING_DELAY + 1 seconds after proposal creation.
// Mana at creation_time (EPOCH_T):
//   extra = 200 - 5 = 195
//   time_remaining = (EPOCH_T + VOTING_DELAY + 1) - EPOCH_T = 86_401
//   credential_bonus = floor(195 * 86401 / 15552000) = floor(1.0832) = 1
//   Mana = 5 + 1 = 6
const SNAPSHOT_CRED_LEVEL  = 200n;
const SNAPSHOT_CRED_EXPIRY = EPOCH_T + VOTING_DELAY + 1n;
const EXPECTED_SNAPSHOT_MANA = 6;
const EXPECTED_CURRENT_MANA  = 5; // floor only, after credential expires

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

describe("KRN-02 — Snapshot voting: mana computed at creation_time", () => {
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

    injectValocracyConfig(context, govConfigPda, TOTAL_SUPPLY);
  });

  it("for_votes equals mana at creation_time (6), not mana at vote_time (5)", async () => {
    // Establish proposal creation at EPOCH_T.
    context.setClock(new Clock(1n, EPOCH_T, 0n, 0n, EPOCH_T));

    // Proposer: non-decaying credential — mana >> proposal_threshold (100).
    const proposer = fundedKeypair(context);
    injectUserStats(context, proposer.publicKey, 200n, FAR_FUTURE_EXPIRY);

    // Voter: credential expires at EPOCH_T + VOTING_DELAY + 1.
    //   creation_time mana = 6  (small bonus remaining)
    //   vote_time mana     = 5  (expired → floor only)
    const voter = fundedKeypair(context);
    injectUserStats(context, voter.publicKey, SNAPSHOT_CRED_LEVEL, SNAPSHOT_CRED_EXPIRY);

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
      .propose("KRN-02 snapshot test", { valocracyPauseCredit: {} } as any)
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

    // Advance to vote_time: 100 seconds past credential expiry, inside voting window.
    // At this point calculate_mana(voter, now) = 5 (floor only).
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

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.forVotes.toNumber()).to.equal(
      EXPECTED_SNAPSHOT_MANA,
      `KRN-02: for_votes must equal snapshot mana (${EXPECTED_SNAPSHOT_MANA}) at creation_time, not current mana (${EXPECTED_CURRENT_MANA})`,
    );
    expect(proposal.forVotes.toNumber()).to.not.equal(
      EXPECTED_CURRENT_MANA,
      "for_votes must not equal current mana — snapshot semantics required",
    );
  });
});
