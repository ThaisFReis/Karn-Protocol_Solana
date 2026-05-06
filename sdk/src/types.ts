import type { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

export type NumericLike = BN | bigint | number;

export interface ValocracyConfig {
  governor: PublicKey;
  treasury: PublicKey;
  signer: number[];
  memberValorId: BN;
  leadershipValorId: BN;
  totalSupply: BN;
  creditPaused: boolean;
  bump: number;
}

export interface UserStats {
  credentialLevel: BN;
  permanentLevel: BN;
  credentialExpiry: BN;
  verified: boolean;
  primaryTrackId: BN | null;
  primaryValorId: BN | null;
  activityLevel: BN;
  activityExpiry: BN;
  bump: number;
}

export interface Valor {
  rarity: BN;
  secondaryRarity: BN;
  trackId: BN;
  metadata: string;
  bump: number;
}

export interface TokenOwner {
  owner: PublicKey;
  bump: number;
}

export interface CreditAuthority {
  authority: PublicKey;
  trackIds: BN[];
  bump: number;
}

export interface CreditWindow {
  credits: BN;
  periodStart: BN;
  bump: number;
}

export interface GovernorConfigPda {
  valocracy: PublicKey;
  proposalCount: BN;
  locked: boolean;
  bump: number;
}

export interface GovernanceConfig {
  votingDelay: BN;
  votingPeriod: BN;
  proposalThreshold: BN;
  quorumPercentage: BN;
  participationThreshold: BN;
  bump: number;
}

export type ProposalAction =
  | { treasuryTransfer: { receiver: PublicKey; amount: BN } }
  | { treasuryApproveScholarship: { labId: number; member: PublicKey } }
  | { treasuryUpdateGovernor: { newGovernor: PublicKey } }
  | { valocracySetValor: { valorId: BN; rarity: BN; secondaryRarity: BN; trackId: BN; metadata: string } }
  | { valocracySetGuardianTracks: { guardian: PublicKey; trackIds: BN[] } }
  | { valocracyUpdateGovernor: { newGovernor: PublicKey } }
  | { valocracyUpdateTreasury: { newTreasury: PublicKey } }
  | { valocracyUpdatePrimary: { account: PublicKey; newTrackId: BN; newValorId: BN } }
  | { valocracySetCreditAuthority: { authority: PublicKey; trackIds: BN[] } }
  | { valocracyRevoke: { tokenId: BN } }
  | { valocracyPauseCredit: Record<string, never> }
  | { valocracyResumeCredit: Record<string, never> }
  | {
      updateGovernanceConfig: {
        votingDelay: BN;
        votingPeriod: BN;
        proposalThreshold: BN;
        quorumPercentage: BN;
        participationThreshold: BN;
      };
    };

export interface Proposal {
  id: BN;
  proposer: PublicKey;
  description: string;
  creationTime: BN;
  startTime: BN;
  endTime: BN;
  forVotes: BN;
  againstVotes: BN;
  executed: boolean;
  action: ProposalAction;
  totalManaAtCreation: BN;
  bump: number;
}

export interface Vote {
  support: boolean;
  bump: number;
}

export enum ProposalState {
  Pending = "Pending",
  Active = "Active",
  Succeeded = "Succeeded",
  Defeated = "Defeated",
  Executed = "Executed",
}

export interface TreasuryState {
  governor: PublicKey;
  valocracy: PublicKey;
  assetMint: PublicKey;
  totalShares: BN;
  restrictedReserves: BN;
  locked: boolean;
  bump: number;
  labCounter: number;
}

export interface UserShares {
  owner: PublicKey;
  shares: BN;
  bump: number;
}

export interface Lab {
  id: number;
  funder: PublicKey;
  totalAmount: BN;
  scholarshipPerMember: BN;
  status: { active?: Record<string, never>; cancelled?: Record<string, never>; completed?: Record<string, never> };
  bump: number;
}

export interface Claimable {
  member: PublicKey;
  amount: BN;
  bump: number;
}
