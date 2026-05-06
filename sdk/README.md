# @karn_lat/protocol-sdk-solana

TypeScript SDK for the **Karn Protocol** on Solana — thin clients for the three Anchor programs (Valocracy, Governor, Treasury) plus client-side helpers.

## Install

```bash
npm install @karn_lat/protocol-sdk-solana @coral-xyz/anchor @solana/web3.js
```

For the optional React hooks layer:

```bash
npm install react
```

## Three programs

| Client | Program | Address (Devnet) |
|---|---|---|
| `ValocracyClient` | Identity, soulbound badges, Mana | `6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf` |
| `GovernorClient` | Proposals, voting, execution | `6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm` |
| `TreasuryClient` | SPL vault, labs, scholarships | `97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV` |

---

## React hooks (`./react`)

The package now exposes an optional React layer at:

```typescript
import {
  KarnSolanaProvider,
  useValocracy,
  useGovernor,
  useTreasury,
} from "@karn_lat/protocol-sdk-solana/react";
```

High-level contract:

- `KarnSolanaProvider` accepts `clients` or `programs`
- `useValocracy()` exposes `{ stats, mana, refresh, register, mint, mintCommunity, guardianMint, ... }`
- `useGovernor()` exposes `{ config, params, refresh, propose, vote, execute, ... }`
- `useTreasury()` exposes `{ state, shares, claimable, refresh, fundLab, withdrawScholarship, ... }`

Minimal example:

```typescript
import { KarnSolanaProvider, useValocracy } from "@karn_lat/protocol-sdk-solana/react";

function Profile() {
  const { stats, mana, refresh } = useValocracy();
  return null;
}
```

---

## Example 1 — Register a member

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import {
  ValocracyClient,
  buildSelfRegisterPayload,
  buildEd25519PreInstruction,
  buildSelfRegisterAccounts,
} from "@karn_lat/protocol-sdk-solana";
import valocracyIdl from "./target/idl/valocracy.json";

// Set up Anchor provider + program
const connection = new Connection("https://api.devnet.solana.com");
const wallet = new anchor.Wallet(Keypair.generate()); // use actual wallet
const provider = new anchor.AnchorProvider(connection, wallet, {});
const program = new anchor.Program(valocracyIdl as any, provider);
const client = new ValocracyClient(program);

// Backend signs the register payload
const backendKeypair = nacl.sign.keyPair(); // from env in production
const callerPubkey = wallet.publicKey;
const nonce = BigInt(Date.now());
const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
const trackId = 1n; // Tech track

const payload = buildSelfRegisterPayload(callerPubkey, nonce, expiry, trackId);
const signature = nacl.sign.detached(payload, backendKeypair.secretKey);

// Fetch next token ID from config
const config = await client.getConfig();
const tokenId = BigInt(config.totalSupply) + 1n;

// Derive member valor PDA
const [memberValorPda] = client.valorPda(config.memberValorId);

// Build and send transaction
const sigIx = Ed25519Program.createInstructionWithPublicKey({
  publicKey: backendKeypair.publicKey,
  message: payload,
  signature,
});

const accounts = buildSelfRegisterAccounts(
  { caller: callerPubkey, nonce, tokenId },
  program.programId,
  memberValorPda,
);

await client.selfRegister(trackId, nonce, expiry, tokenId)
  .accounts(accounts as any)
  .preInstructions([sigIx])
  .rpc();

console.log("Registered! UserStats:", await client.getUserStats(callerPubkey));
```

---

## Example 2 — Create a proposal

```typescript
import * as anchor from "@coral-xyz/anchor";
import { GovernorClient } from "@karn_lat/protocol-sdk-solana";
import governorIdl from "./target/idl/governor.json";

const program = new anchor.Program(governorIdl as any, provider);
const governor = new GovernorClient(program);

const [govConfigPda] = governor.configPda();
const [govParamsPda] = governor.paramsPda();

// Proposer must have Mana >= 100 (proposal_threshold)
const proposalId = (await governor.getConfig()).proposalCount;
const [proposalPda] = governor.proposalPda(proposalId);

// Action: pause activity credits via governance
const action = { valocracyPauseCredit: {} };

await governor.propose("Pause activity credits temporarily", action)
  .accounts({
    proposer:        wallet.publicKey,
    config:          govConfigPda,
    params:          govParamsPda,
    proposal:        proposalPda,
    valocracyConfig: valocracyConfigPda, // from valocracy client.configPda()
    systemProgram:   anchor.web3.SystemProgram.programId,
  } as any)
  .rpc();
```

---

## Example 3 — Vote on a proposal

```typescript
import * as anchor from "@coral-xyz/anchor";
import { GovernorClient } from "@karn_lat/protocol-sdk-solana";

const governor = new GovernorClient(program);

const proposalId = 0n;
const [proposalPda] = governor.proposalPda(proposalId);
const [votePda]     = governor.votePda(proposalId, wallet.publicKey);
const [statsPda]    = valocracyClient.userStatsPda(wallet.publicKey);

await governor.castVote(proposalId, true /* FOR */)
  .accounts({
    voter:       wallet.publicKey,
    config:      (await governor.configPda())[0],
    proposal:    proposalPda,
    vote:        votePda,
    voterStats:  statsPda,
    systemProgram: anchor.web3.SystemProgram.programId,
  } as any)
  .rpc();

// Check state client-side
const proposal = await governor.getProposal(proposalId);
const now = BigInt(Math.floor(Date.now() / 1000));
console.log("Proposal state:", governor.computeProposalState(proposal!, now));
```

---

## calculateMana

Client-side replica of the on-chain Mana formula. Use to display decaying reputation without a network call.

```typescript
import { calculateMana, calculateManaFromStats, MEMBER_FLOOR, VACANCY_PERIOD } from "@karn_lat/protocol-sdk-solana";

const now = BigInt(Math.floor(Date.now() / 1000));
const mana = calculateMana({
  credentialLevel:  50n,
  permanentLevel:   0n,
  credentialExpiry: now + VACANCY_PERIOD,
  activityLevel:    100n,
  activityExpiry:   now + 7_776_000n, // 90 days
  currentTime:      now,
});
// → 150n

// Or from a fetched UserStats object:
const stats = await valocracyClient.getUserStats(wallet.publicKey);
const mana2 = calculateManaFromStats(stats!, now);
```

---

## PDA derivation

All PDAs are derivable without a network call:

```typescript
import { userStatsPda, proposalPda, treasuryStatePda, VALOCRACY_PROGRAM_ID } from "@karn_lat/protocol-sdk-solana";
import { PublicKey } from "@solana/web3.js";

const valocracyId = new PublicKey(VALOCRACY_PROGRAM_ID);
const [statsPda] = userStatsPda(wallet.publicKey, valocracyId);
```

---

## Tests

```bash
cd sdk
npm install
npm test
```

React layer smoke-check:

```bash
cd sdk
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node ../node_modules/typescript/bin/tsc --noEmit
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node ../node_modules/typescript/bin/tsc -p ./tsconfig.build.json
```

20 unit tests covering `calculateMana` with fixtures cross-validated against `crates/karn-shared/src/mana.rs`.
