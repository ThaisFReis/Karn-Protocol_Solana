# PDA Conventions

**Data:** 2026-04-30
**Status:** Vivo (atualizar quando seeds forem adicionadas/removidas)
**Source de verdade:** `crates/karn-shared/src/seeds.rs`

Toda PDA do protocolo deriva de uma constante declarada em `crates/karn-shared/src/seeds.rs`. **Byte literais inline (`b"foo"`) nas instruções são proibidos** — quebra a ferramenta de busca, vira fonte de regressão silenciosa.

---

## Regras de derivação

1. **Toda struct on-chain inclui `pub bump: u8`** (canonical bump retornado por `Pubkey::find_program_address`).
2. **Singleton PDAs** (que existem 1× por programa) usam apenas o prefixo de seed; sem segundo seed.
3. **PDAs por entidade** combinam o prefixo + identificador da entidade (Pubkey de 32 bytes ou inteiro pequeno em little-endian).
4. **Inteiros como seed**: sempre `to_le_bytes()`, nunca string (`format!`). Off-chain reproduz com `Buffer.from(uint64.toString())` errado.
5. **Cap de tamanho**: cada componente individual de seed ≤ 32 bytes. Os prefixos são curtos por convenção (`b"user_stats"` etc.); inteiros u64 ocupam 8 bytes.

---

## Tabela canônica

### Valocracy

| PDA | Seeds | Tipo | Conteúdo |
|---|---|---|---|
| `Config` (singleton) | `[b"config"]` | `Config` | governor, treasury, signer, member_valor_id, leadership_valor_id, total_supply, credit_paused, bump |
| `Valor(valor_id)` | `[b"valor", valor_id.to_le_bytes()]` | `Valor` | rarity, secondary_rarity, track_id, metadata, bump |
| `UserStats(account)` | `[b"user_stats", account.as_ref()]` | `UserStats` | credential_level, permanent_level, credential_expiry, verified, primary_track_id, primary_valor_id, activity_level, activity_expiry, bump |
| `TokenOwner(token_id)` | `[b"token_owner", token_id.to_le_bytes()]` | `TokenOwner` | owner, bump |
| `TokenValorId(token_id)` | `[b"token_valor", token_id.to_le_bytes()]` | `TokenValorId` | valor_id, bump |
| `GuardianTracks(authority)` | `[b"guardian", authority.as_ref()]` | `GuardianTracks` | track_ids (cap 32), bump |
| `CreditAuthority(authority)` | `[b"credit_auth", authority.as_ref()]` | `CreditAuthority` | track_ids (cap 32), bump |
| `CreditWindow(account)` | `[b"credit_window", account.as_ref()]` | `CreditWindow` | credits, period_start, bump |
| `UsedNonce(account, nonce)` | `[b"nonce", account.as_ref(), nonce.to_le_bytes()]` | `UsedNonce` | bump (existência = consumido) |

### Governor

| PDA | Seeds | Tipo | Conteúdo |
|---|---|---|---|
| `GovernorConfigPda` (singleton) | `[b"gov_config"]` | `GovernorConfigPda` | valocracy, proposal_count, locked, bump |
| `GovernanceConfig` (singleton) | `[b"gov_params"]` | `GovernanceConfig` | voting_delay, voting_period, proposal_threshold, quorum_percentage, participation_threshold, bump |
| `Proposal(id)` | `[b"proposal", id.to_le_bytes()]` | `Proposal` | proposer, description, creation/start/end_time, for/against, action, total_mana_at_creation, executed, bump |
| `Vote(proposal_id, voter)` | `[b"vote", proposal_id.to_le_bytes(), voter.as_ref()]` | `Vote` | support, bump |

### Treasury

| PDA | Seeds | Tipo | Conteúdo |
|---|---|---|---|
| `TreasuryState` (singleton) | `[b"treasury"]` | `TreasuryState` | governor, valocracy, asset_mint, total_shares, restricted_reserves, lab_counter, locked, bump |
| `UserShares(account)` | `[b"shares", account.as_ref()]` | `UserShares` | shares, bump |
| `Lab(lab_id)` | `[b"lab", lab_id.to_le_bytes()]` | `Lab` | id, funder, total_amount, scholarship_per_member, status, bump |
| `Claimable(member)` | `[b"claimable", member.as_ref()]` | `Claimable` | amount, bump |

---

## Cross-program references

PDAs frequentemente lidas por outros programas — convenção de leitura direta (DT-04 do PRD), não CPI:

- **Governor → Valocracy.UserStats(voter)**: snapshot de Mana via `cast_vote` lê o account direto e calcula localmente.
- **Governor → Valocracy.Config**: para snapshot de `total_supply` no `propose`.
- **Treasury.deposit**: chamado por CPI **assinada pelo Valocracy PDA** (DT-05). Treasury verifica que `signer = TreasuryState.valocracy`.
- **Treasury.transfer**, **Treasury.approve_scholarship**, e mutações `valocracy.*` governadas: chamadas por CPI **assinada pelo Governor PDA** (`seeds=[b"gov_config", bump]`).

---

## Anti-patterns

- ❌ `seeds = [b"foo", &user.key().to_bytes()]` — usar `user.key().as_ref()`
- ❌ `seeds = [b"proposal", &id.to_string().as_bytes()]` — usar `&id.to_le_bytes()`
- ❌ Derivar uma PDA com seeds que mudam em runtime de forma que o cliente off-chain não reproduz
- ❌ Misturar canonical bump com bump arbitrário; sempre `find_program_address` (on-chain) ↔ `findProgramAddress` (TS) com mesmo prefixo
- ❌ Reutilizar o mesmo prefixo para entidades diferentes — quebra a invariante testada em `seeds::tests::all_seeds_are_unique`

---

## Quando adicionar uma nova PDA

1. Declarar a constante em `crates/karn-shared/src/seeds.rs`.
2. Adicionar à lista `ALL_SEEDS` no módulo de testes (a invariante de unicidade vai exigir).
3. Adicionar uma linha à tabela acima.
4. Criar a struct `#[account]` no programa correspondente (M3+ vai materializar).
5. Cliente off-chain (SDK em M15) ganha um helper `findFooAddress(...)` na geração Codama.

---

## Referências

- `crates/karn-shared/src/seeds.rs` (source of truth)
- PRD §3 Módulo 2
- ADR-0001 — `karn-shared` em `crates/`, não em `programs/`
- CONFIG.md → "Convenções de PDA"
