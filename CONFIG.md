# CONFIG — Karn Protocol Solana

> **Fonte de verdade para qualquer IA (ou humano) que vá implementar, modificar, ou revisar este protocolo.** Antes de propor qualquer mudança, ler este arquivo inteiro. Em caso de conflito entre este arquivo e qualquer outra fonte (memórias, exemplos, padrões "comuns"), **este arquivo prevalece**.

---

## Autoridade

### PRD canônico

`~/Documentos/Workspace/Karn Protocol/docs/solana/PRD.md` (no repo Stellar irmão).

Toda decisão de implementação deve alinhar com o PRD. Em dúvida, **reler o PRD antes de adicionar complexidade**. O PRD descreve 18 módulos, 7 fases, 12 decisões técnicas (DT-01 a DT-12), 5 mitigações KRN, e o cronograma de 10 dias.

### Paridade com a versão Stellar

Este protocolo é a **segunda implementação** do Karn (a primeira está em Stellar/Soroban). A versão Stellar é a referência canônica de comportamento. Para qualquer função que tenha equivalente Stellar, ler primeiro o código Soroban antes de improvisar:

| Comportamento | Arquivo Stellar de referência |
|---|---|
| Identidade, badges, Mana | `~/Documentos/Workspace/Karn Protocol/contracts/valocracy/src/lib.rs` |
| Propostas, voting, execute | `~/Documentos/Workspace/Karn Protocol/contracts/governor/src/lib.rs` |
| Treasury, scholarship, vault math | `~/Documentos/Workspace/Karn Protocol/contracts/treasury/src/lib.rs` |
| Mitigações KRN-01..05 | `~/Documentos/Workspace/Karn Protocol/docs/SECURITY_HARDENING.md` |
| Decisões v2 (D1, D2, D3) | `~/Documentos/Workspace/Karn Protocol/docs/V2_REMAINING_WORK.md` |

**Divergências intencionais** desta versão Solana em relação à Stellar estão documentadas em DT-10 (ver Decisões Arquiteturais abaixo) e devem ser preservadas — não "consertar" para alinhar com Stellar sem proposta explícita de mudança.

---

## Stack e Versões (pinned)

| Componente | Versão | Comando de verificação |
|---|---|---|
| Anchor CLI | `0.32.1` | `anchor --version` |
| Solana CLI | `3.1.12` (Agave) | `solana --version` |
| Rust toolchain | `1.94.1` | `rustc --version` |
| `anchor-lang` | `0.32.1` | em todos os Cargo.toml de program |
| `anchor-spl` | `0.32.1` | em todos os Cargo.toml de program |
| Cluster alvo (hackathon) | `devnet` | `Anchor.toml [provider]` |
| Asset token (default) | USDC devnet | parâmetro de `treasury.initialize` |

**Não atualizar nenhuma dessas versões sem proposta explícita.** Mudanças de versão de Anchor/Solana têm efeito em IDL, geração de código, e formato de account, e custam tempo que o cronograma do hackathon não tem.

---

## Endereços dos Programas

| Programa | Endereço (Localnet & Devnet) |
|---|---|
| `valocracy` | `6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf` |
| `governor` | `6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm` |
| `treasury` | `97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV` |

Os keypairs ficam em `target/deploy/<program>-keypair.json` (gitignored). **Não regenerar** — todos os PDAs são derivados desses program IDs e regenerar quebra qualquer state já deployado e qualquer endereço derivado documentado.

Se um keypair for perdido em devnet: gerar novo, atualizar `Anchor.toml` em `[programs.localnet]` e `[programs.devnet]`, atualizar `declare_id!` em `programs/<program>/src/lib.rs`, e atualizar este arquivo.

---

## Estrutura do Repositório

```
.
├── programs/                   # SOMENTE programas Solana (cdylib + lib)
│   ├── valocracy/              # identidade, badges, Mana
│   ├── governor/               # propostas, voting, execute
│   └── treasury/               # SPL vault, scholarships
├── crates/                     # libs compartilhadas (NUNCA cdylib, NUNCA program)
│   └── karn-shared/            # seeds, constantes, math puro, error mappings
├── tests/                      # Bankrun + integration
├── migrations/                 # deploy scripts (Anchor)
├── deployments/                # snapshots de deploy (commit só do .gitkeep)
├── app/                        # frontend stub (M17 stretch)
├── .github/workflows/          # CI
├── Anchor.toml                 # config Anchor (programs.{localnet,devnet})
├── Cargo.toml                  # workspace: programs/* + crates/*
├── package.json                # scripts: build, test, deploy:devnet
├── rust-toolchain.toml         # pin de Rust
├── README.md                   # overview do repo
└── CONFIG.md                   # este arquivo
```

**Regras de localização:**

- Tudo em `programs/*` deve ser um Anchor program (com `#[program]` e `crate-type = ["cdylib", "lib"]`). Lib crates compartilhadas vão em `crates/*` (Anchor tenta extrair IDL de `programs/*` e quebra se não for program).
- `crates/karn-shared` é `no_std`. Não adicionar dependência de `std`. Não adicionar `#[program]` nem entrypoint.
- Mudanças no schema de PDA (seeds, layout de account) são **breaking** — exigem novo deploy. Documentar em changelog antes de aplicar.

---

## Decisões Arquiteturais (resumo do PRD §6)

| ID | Regra | Não inverter sem proposta |
|---|---|---|
| **DT-01** | SBT é PDA custom, não Token-2022 | Token-2022 NonTransferable mirror é stretch goal (PRD §9) |
| **DT-02** | `ProposalAction` é enum tipado com ~10 variantes; CPI dispatch determinístico | Generic `Instruction` CPI é stretch goal |
| **DT-03** | `self_register` valida assinatura via Ed25519 SigVerify precompile + Instructions sysvar | Não trocar por OpenZeppelin-style nem mover para off-chain |
| **DT-04** | Cross-program **reads** sem CPI (lê account direta); **writes** via CPI signed-by-PDA | Não fazer CPI para queries — custa CU desnecessariamente |
| **DT-05** | Governor PDA assina CPI no `execute` via `seeds=[b"gov_config", bump]` | Não usar wallet humana como signer de mutação governada |
| **DT-06** | Reentrancy via flag `locked: bool` em state PDA, set/clear no início/fim de `execute` e `transfer` | Mesmo padrão Soroban — não remover |
| **DT-07** | Aritmética: `u128` em `calculate_mana` e vault math (KRN-04); `checked_*` em todas operações monetárias | `wrapping_*` proibido em contexto monetário |
| **DT-08** | PDAs alocadas com `init` Anchor; `realloc` apenas para `Vec<u64>` em GuardianTracks/CreditAuthority com cap de 32 | Sem TTL (Solana = pay-once rent) |
| **DT-09** | Taxonomia de IDs: 0=Member, 1=Founder, 10–19=Leadership, 20–59=Track, 60–69=Community, 70–79=Governance. Tracks: 1=Tech, 2=Design, 3=Marketing, 4=Legal, 5=Finance | Mesma do v2 Stellar |
| **DT-10** | **Resolução das contradições v2:**<br>• **D1:** Founder badge decai como qualquer outra; `permanent_level` mantido em `UserStats` por paridade mas sempre `0` em v2-Solana<br>• **D2:** `CredentialBonus = (level − MEMBER_FLOOR) × (expiry − now) / VACANCY_PERIOD` (subtrai floor)<br>• **D3:** `self_register` aceita `track_id` no payload assinado | Estas decisões são divergências intencionais da doc v2 Stellar — **manter** |
| **DT-11** | Asset token padrão = USDC devnet; `asset_mint` é parâmetro de `treasury.initialize` | Não hardcodear mint pubkey |
| **DT-12** | Cluster devnet para hackathon; upgrade authority = chave do dev (transfer para Governor PDA é stretch) | Mainnet exige checklist separado |

---

## Mitigações KRN (obrigatórias)

Cada KRN abaixo é uma vulnerabilidade resolvida na versão Stellar e **deve ser preservada** na versão Solana com **pelo menos 1 teste dedicado** que falharia sem o fix.

| KRN | Vulnerabilidade | Fix obrigatório | Localização do teste |
|---|---|---|---|
| **KRN-01** | Shareholders podem redimir scholarship funds | `restricted_reserves` em `TreasuryState`; `total_assets()` exclui restricted; `withdraw_scholarship` decrementa restricted | `tests/krn/krn-01.spec.ts` |
| **KRN-02** | "Buy-in" durante voting delay (vote-buying) | `cast_vote` calcula `voting_power = calculate_mana(stats, proposal.creation_time)` — snapshot histórico, não atual | `tests/krn/krn-02.spec.ts` |
| **KRN-03** | Single-vote hijacking de proposta | `get_proposal_state` checa `participation = (total_votes * 100) / total_mana_at_creation`; abaixo de 4% → `Defeated` independente de for_pct | `tests/krn/krn-03.spec.ts` |
| **KRN-04** | Overflow em `calculate_mana` | `u128` intermediário: `((u128::from(extra) * u128::from(time_remaining)) / u128::from(VACANCY_PERIOD)) as u64` | `tests/krn/krn-04.spec.ts` |
| **KRN-05** | Guardian griefing (mint não-solicitado) | `guardian_mint` exige `Signer<'info>` em **ambos** `guardian` e `account` | `tests/krn/krn-05.spec.ts` |

**Regra:** se um PR remove ou enfraquece qualquer um desses testes, é rejeição automática. Se a refatoração for justificada, **o teste muda de forma, nunca enfraquece a invariante**.

---

## Status dos Módulos

Atualizar a cada módulo concluído. Manter este bloco como histórico cronológico.

### M1 — Workspace Anchor + Tooling — ✅ Concluído (2026-04-30)

- Workspace Anchor com 3 programs (`valocracy`, `governor`, `treasury`) compilando
- `karn-shared` em `crates/` (movido de `programs/` durante M1 — ver [ADR-0001](docs/decisions/0001-karn-shared-location.md))
- 3 IDLs gerados em `target/idl/`
- CI configurado em `.github/workflows/ci.yml`
- README + package.json com scripts (`build`, `test`, `deploy:devnet`)
- `.gitignore` estendido (.env, IDE, deployments/)

Doc: [`docs/modules/M1.md`](docs/modules/M1.md)

### M2 — Convenções de PDA, Erros e Eventos — ✅ Concluído (2026-04-30)

- 17 seed constants em `crates/karn-shared/src/seeds.rs` (com testes de unicidade, tamanho, parity pins)
- Constantes numéricas em `crates/karn-shared/src/constants.rs` (time windows, Mana, vault math, governance defaults) + 2 invariantes compile-time
- 18 + 13 + 11 erros em `programs/{valocracy,governor,treasury}/src/errors.rs` com `#[error_code]` (paridade Stellar via nome+ordem; fórmula numérica em [ADR-0002](docs/decisions/0002-error-code-offset-mapping.md))
- 15 + 5 + 7 eventos em `programs/{valocracy,governor,treasury}/src/events.rs`
- [`docs/PDA_CONVENTIONS.md`](docs/PDA_CONVENTIONS.md) com tabela completa
- 16 unit tests verdes; `anchor build`, `cargo fmt`, `cargo clippy -D warnings` clean

Doc: [`docs/modules/M2.md`](docs/modules/M2.md)

### M3 — Programa Valocracy: Estado e Inicialização — ✅ Concluído (2026-04-30)

- 5 state structs (`Config`, `Valor`, `UserStats`, `TokenOwner`, `TokenValorId`) em `programs/valocracy/src/state.rs`
- `initialize` (singleton Config) e `set_valor` (Governor-only, init_if_needed) em `programs/valocracy/src/instructions/`
- 8 testes Bankrun verdes (5 initialize + 3 set_valor); compute usage 9–14k CU
- Genesis member processing **adiado para M4** via `mint` regular — ver [ADR-0003](docs/decisions/0003-genesis-instruction-split.md)
- Test infra Bankrun montada (anchor-bankrun + solana-bankrun via `--legacy-peer-deps`); npm scripts `test`, `test:rust`, `test:full`

Doc: [`docs/modules/M3.md`](docs/modules/M3.md)

### M4 — Mintagem de Badges (RBAC + Guardian + KRN-05) — ✅ Concluído (2026-04-30)

- `GuardianTracks` PDA + 2 erros Solana-only (`InvalidTokenId`, `GuardianSelfMintForbidden`)
- `helpers.rs` com `BadgeCategory`, `get_badge_category`, `effective_rarity` (Stellar parity)
- 4 novas instructions: `mint` (Governor → Leadership/Track/Governance), `guardian_mint` (dual-auth + KRN-05), `set_guardian_tracks` / `remove_guardian` (Governor)
- KRN-05 reforçado via `require_keys_neq!(guardian, account)` (dual `Signer` sozinho não basta)
- `mint_community` deferred — ver [ADR-0004](docs/decisions/0004-mint-instruction-split.md)
- 22 unit tests + 21 Bankrun tests verdes; KRN-05 com test dedicado em `tests/krn/krn-05.spec.ts`
- Treasury CPI no `apply_mint` aguarda M11

Doc: [`docs/modules/M4.md`](docs/modules/M4.md)

### M5 — Self-Register com Ed25519 Precompile — ✅ Concluído (2026-04-30)

- `karn-shared::payload` com `build_self_register_payload` determinístico (56 bytes: caller + nonce + expiry + track_id LE) + 5 unit tests
- `UsedNonce` PDA (anti-replay via `init` constraint)
- `self_register(track_id, nonce, expiry, token_id)` valida via Ed25519 precompile (Instructions sysvar) — content-match scan, não índice (resistente a precompile-decoy attacks)
- D3-A aplicada: `primary_track_id` setado direto no register (sem `update_primary` follow-up)
- 5 testes Bankrun: registro válido, precompile ausente, signer divergente, replay, expiry vencido
- Compute usage `self_register` ~42k CU; sig math offloaded ao precompile

Doc: [`docs/modules/M5.md`](docs/modules/M5.md)

### M6 — Cálculo de Mana com Decay — ✅ Concluído (2026-05-01)

- `calculate_mana` em `crates/karn-shared/src/mana.rs` — função pura com KRN-04 (u128 intermediário)
- Paridade Stellar: fórmula DT-10 D2 (`CredentialBonus = (level − MEMBER_FLOOR) × time_remaining / VACANCY_PERIOD`)
- Fallback `permanent_level` preservado por paridade Stellar (sempre 0 em v2-Solana, DT-10 D1)
- `get_votes(account)` e `get_votes_at(account, timestamp)` em `programs/valocracy/src/instructions/`
- Ambas instruções são read-only views (via `.view()` no SDK); usam `UncheckedAccount` + `data_is_empty()` para contas não-registradas
- 8 testes Rust em `karn-shared` (floor, credential completo, decay 50%, expiry, permanent fallback, activity completo, activity decay 50%, KRN-04 overflow)
- 5 testes Bankrun TypeScript em `tests/valocracy/get_votes.spec.ts`
- `cargo test -p karn-shared`: 21 testes verdes; `anchor test`: 31 testes verdes

### M7 — Activity Level e Credit Authority — ✅ Concluído (2026-05-01)

- `CreditAuthority` e `CreditWindow` structs em `programs/valocracy/src/state.rs`
- 5 instruções: `credit_activity`, `set_credit_authority`, `revoke_credit_authority`, `pause_credit`, `resume_credit`
- Fluxo de 3 guards em ordem: circuit breaker → track auth → cap rolante 30d (ACTIVITY_CREDIT_CAP=200)
- `pause_credit`/`resume_credit` alternam `Config.credit_paused`; `credit_activity` rejeita quando pausado
- 7 testes Bankrun TypeScript em `tests/valocracy/credit_activity.spec.ts`
- `anchor test`: 38 testes verdes (0 falhas)

Doc: [`docs/modules/M7.md`](docs/modules/M7.md)

### M8 — Identidade Primária Mutável — ✅ Concluído (2026-05-01)

- `update_primary(account, new_track_id, new_valor_id)` em `programs/valocracy/src/instructions/update_primary.rs`
- Governor-only via `has_one = governor` no Config PDA
- Atualiza `UserStats.primary_track_id` e `primary_valor_id`; emite `PrimaryUpdatedEvent`
- Efeito imediato em `effective_rarity` dos mints subsequentes (implementado em M4)
- 2 testes Bankrun TypeScript em `tests/valocracy/update_primary.spec.ts`
- `anchor test`: 40 testes verdes (0 falhas)

Doc: [`docs/modules/M8.md`](docs/modules/M8.md)

### M9 — Revoke + Verified Flag — ✅ Concluído (2026-05-01)

- `revoke(token_id)` em `programs/valocracy/src/instructions/revoke.rs` — fecha `TokenOwner` e `TokenValorId`, decrementa `credential_level` por `effective_rarity`
- `set_verified(member, verified)` em `programs/valocracy/src/instructions/set_verified.rs` — toggle KYC flag, Governor-only
- 4 testes Bankrun TypeScript em `tests/valocracy/revoke_set_verified.spec.ts`
- `anchor test`: 44 testes verdes (0 falhas)

Doc: [`docs/modules/M9.md`](docs/modules/M9.md)

### M10 — ✅ Concluído — Treasury Vault SPL (initialize + transfer)

**Data:** 2026-05-01

**Entregáveis:**
- `crates/karn-shared/src/vault.rs` — `total_assets`, `convert_to_assets`, `convert_to_shares` (u128, offsets virtuais)
- `programs/treasury/src/state.rs` — `TreasuryState` (SIZE=122): governor, valocracy, asset_mint, total_shares u128, restricted_reserves u64, locked bool, bump
- `programs/treasury/src/instructions/initialize.rs` — PDA `[TREASURY_STATE]` + vault ATA (associated_token::authority=state)
- `programs/treasury/src/instructions/transfer.rs` — Governor-only, reentrancy guard (locked), InsufficientAssets check, SPL CPI com PDA signer seeds, emite `Transfer` event
- `tests/treasury/transfer.spec.ts` — 6 testes Bankrun (50 total passando)

**KRN-01 coberto:** `total_assets = vault_balance - restricted_reserves` (restricted_reserves=0 enquanto sem labs)

**Nota técnica:** `BankrunConnection` não implementa `sendTransaction`; helpers SPL (`createMint`, `mintTo`, `createAccount`) foram substituídos por instruções raw via `context.banksClient.processTransaction`.

Doc: [`docs/modules/M10.md`](docs/modules/M10.md)

### M11 — ✅ Concluído — Allocation de Shares (CPI Valocracy → Treasury)

**Data:** 2026-05-01

**Entregáveis:**
- `programs/treasury/src/state.rs` — `UserShares` struct (SIZE=49, seeds: `[b"shares", owner]`)
- `programs/treasury/src/instructions/deposit.rs` — Valocracy-CPI-only, `NotAuthorized` para chamadas diretas, `InsufficientShares` quando `total_shares==0 && shares < 1000`, `init_if_needed` UserShares
- `programs/valocracy/src/instructions/mint.rs` — `apply_mint` retorna `Result<u64>`, CPI via `remaining_accounts[0..3]` (opcional, backward-compat), signer seeds `[b"config", &[bump]]`
- `programs/valocracy/Cargo.toml` — `treasury = { features = ["cpi"] }`
- `programs/treasury/Cargo.toml` — `anchor-lang = { features = ["init-if-needed"] }`
- `tests/treasury/deposit.spec.ts` — 4 testes Bankrun (54 total passando)

**Nota técnica:** Lifetime fix `pub fn mint<'info>(ctx: Context<'_, '_, '_, 'info, Mint<'info>>)` + `lib.rs` necessário para usar `config.to_account_info()` após borrow mutável em `apply_mint`.

Doc: [`docs/modules/M11.md`](docs/modules/M11.md)

### M12 — ✅ Concluído — Lab/Scholarship Escrow (KRN-01)

**Data:** 2026-05-01

**Entregáveis:**
- `state.rs` — `LabStatus` enum, `Lab` (SIZE=54, seeds `[b"lab", id_le4]`), `Claimable` (SIZE=41, seeds `[b"claimable", member]`); `TreasuryState.lab_counter: u32` (SIZE 122→126)
- `instructions/fund_lab.rs` — SPL CPI funder→vault, init Lab, `restricted_reserves += total_amount`, `lab_counter += 1`
- `instructions/approve_scholarship.rs` — Governor-only, valida Lab Active, `init_if_needed` Claimable, `claimable.amount += scholarship_per_member`
- `instructions/withdraw_scholarship.rs` — member sign, `claimable.amount >= amount`, SPL CPI vault→member com PDA seeds, decrementa restricted_reserves
- `tests/treasury/lab.spec.ts` — 6 testes Bankrun (60 total passando)

**KRN-01 verificado:** `total_assets = vault_balance − restricted_reserves` permanece constante através de todas as operações de lab/scholarship.

Doc: [`docs/modules/M12.md`](docs/modules/M12.md)

### M13 — ✅ Concluído — Governor: Proposals + Config

**Data:** 2026-05-01

**Entregáveis:**
- `programs/governor/src/state.rs` — `GovernorConfigPda` (SIZE=42), `GovernanceConfig` (SIZE=41), `ProposalAction` (10 variantes), `Proposal` (MAX_SIZE=900)
- `programs/governor/src/instructions/initialize.rs` — cria ambos os PDAs com defaults de `karn-shared`
- `programs/governor/src/instructions/propose.rs` — lê `UserStats` e `Config` da Valocracy via `seeds::program` (DT-04, sem CPI); verifica mana ≥ threshold; snapshot KRN-02 (`total_mana_at_creation = total_supply × MEMBER_FLOOR`)
- `programs/governor/src/instructions/mod.rs` — glob re-exports para o `#[program]` macro
- `programs/governor/src/lib.rs` — dispatchers `initialize` e `propose`
- `tests/governor/propose.spec.ts` — 5 testes Bankrun com injeção de contas sintéticas (65 total passando)

**KRN-02 verificado:** `total_mana_at_creation = total_supply × MEMBER_FLOOR` snapshot na criação da proposta.

Doc: [`docs/modules/M13.md`](docs/modules/M13.md)

### M14..M18 — ⏳ Pendentes

Ver PRD §3 e cronograma §4.

---

## Regras Imutáveis (Key Rules — Do Not Change)

Estas regras **não podem ser alteradas** sem proposta explícita do owner do projeto. Mesmo se o código atual parecer violar, a regra prevalece e o código é que está errado.

1. **PRD prevalece** sobre qualquer outra fonte. Em dúvida, ler `~/Documentos/Workspace/Karn Protocol/docs/solana/PRD.md`.
2. **Soulbound é invariante.** Não existe `transfer_token` no Valocracy. Badges não podem mudar de owner. Revoke é a única forma de "remover" (e fecha as PDAs).
3. **Treasury é coletivo.** A função `withdraw` individual retorna `NotAuthorized` por design. Toda saída de fundos passa por proposta de Governor (`transfer` Governor-only).
4. **Genesis Council é fixado em init.** Genesis members não podem ser adicionados depois. Founder badge decai como qualquer outra (DT-10 D1).
5. **Self-mint Guardian é proibido.** Em `guardian_mint`, se `guardian == account`, deve falhar — o dual-auth do KRN-05 não é suficiente porque uma única wallet satisfaria os dois `Signer`. Implementar check explícito.
6. **Activity credits têm cap rolante.** 200 créditos / 30 dias / participante. Não desabilitar nem aumentar sem proposta.
7. **`pause_credit` é circuit breaker, não política.** Quando pausado, `credit_activity` falha. Não adicionar bypass.
8. **Aritmética monetária usa `checked_*`.** `wrapping_*` é proibido em contexto monetário. `u128` em `calculate_mana` e vault math (KRN-04).
9. **Decay formula é exatamente:**
   ```
   Mana = MEMBER_FLOOR(5)
        + ((credential_level − MEMBER_FLOOR) × (credential_expiry − now)) / VACANCY_PERIOD(180d)
        + (activity_level × (activity_expiry − now)) / ACTIVITY_PERIOD(90d)
   ```
   onde cada termo é zero se o tempo já expirou. Não inventar variações.
10. **Snapshot voting é em `creation_time`**, não `start_time` nem `now` (KRN-02).
11. **Participation threshold (4%) é checado ANTES de quorum** (KRN-03). Proposta com participation insuficiente é `Defeated` independente de for_percentage.
12. **PDAs nunca são fechadas em uso ativo.** A única função que `close` é `revoke` (fecha `TokenOwner`/`TokenValorId` do token revogado). Outras account closures exigem proposta.
13. **`crates/karn-shared` é `no_std`** e nunca tem `#[program]`. Lógica de programa fica em `programs/*`.
14. **Endereços dos programas não mudam.** Regenerar keypair é destrutivo — só com proposta explícita.
15. **Nada de chaves privadas no repo.** Backend signing key, deploy key, mint authority — tudo em env / secrets manager. `.env` é gitignored.
16. **DB / state off-chain só atualiza APÓS sucesso on-chain.** (Quando o backend signing service for criado em M5/M17, ele escreve em DB só depois de ver o nonce consumido on-chain.)
17. **TDD é mandatório.** Testes ANTES de qualquer implementação. Mudança em teste após o código passar exige aprovação humana explícita com justificativa estrutural (não semântica). Detalhes em "TDD / Testes".
18. **Documentação obrigatória em `docs/`.** Toda implementação concluída, erro não-trivial encontrado, decisão estrutural tomada, ou log importante (deploy, profiling, benchmark) deve ter entrada em `docs/`. Detalhes em "Documentação Obrigatória em `docs/`".

---

## Checklist de Conclusão de Módulo (mandatório)

Após cada módulo (M1, M2, ...), nesta ordem exata:

1. **Testes do módulo passando.** Os "Critério de Aceite" do PRD são testes obrigatórios.
2. **`anchor build`** verde, sem warnings críticos.
3. **`cargo fmt --all -- --check`** verde.
4. **`cargo clippy --workspace --all-targets -- -D warnings`** verde.
5. **`anchor test`** passa todos os testes do módulo + os já existentes.
6. **Criar `docs/modules/M<N>.md`** com escopo entregue, critério de aceite checado, decisões tomadas, erros encontrados, comandos de verificação, caveats. Templates em [`docs/README.md`](docs/README.md).
7. **Criar entradas em `docs/decisions/` e `docs/errors/`** se aplicável (decisão estrutural, erro não-trivial). Cross-link com o `M<N>.md`.
8. **Atualizar este arquivo (`CONFIG.md`)** — mover o módulo para "✅ Concluído" com 1–3 bullets + link para `docs/modules/M<N>.md`.
9. **Commit** scoped ao módulo: `feat(<program>): M<N> — <descrição>`. Exemplos:
   - `feat(valocracy): M3 — config + valor + user_stats PDAs`
   - `feat(treasury): M10 — vault + transfer + KRN-01 reserves`
10. **Atualizar PRD** SE houver divergência intencional descoberta durante implementação. Não é falha — é documentar.

---

## TDD / Testes (regra forte)

### TDD é obrigatório — testes vêm primeiro, sempre

Para cada implementação, mesmo a menor, este é o ciclo **não-negociável**:

1. **Ler** o "Critério de Aceite" do módulo correspondente no PRD.
2. **Escrever os testes** que cobrem cada critério — incluindo casos negativos (erros esperados) e o teste de KRN quando aplicável.
3. **Rodar os testes — eles devem falhar** (red). Se passarem antes do código existir, os testes estão errados (provavelmente testando nada).
4. **Implementar o código mínimo** para os testes ficarem verdes (green).
5. **Refatorar** se houver duplicação ou clareza ruim, mantendo os testes verdes.

**Não existe "implemento agora e teste depois".** Se for tentador pular essa ordem, a complexidade do módulo provavelmente está mal compreendida — voltar ao PRD antes de codar.

### Mudanças em teste após o código existir

**Regra rígida:** uma vez que um teste passe, ele só pode mudar por **problema estrutural objetivo**:

- Parâmetro de função renomeado
- Signature de instrução mudou
- Import path errado / fixture file movido
- Tipo concreto de retorno mudou

**Mudanças semânticas são proibidas:** afrouxar uma asserção, remover um caso de teste, mudar o valor esperado, fazer o teste cobrir menos do que cobria.

**Antes de qualquer mudança em teste:** parar e abrir conversa com o owner humano explicando:

1. **Qual teste** vai mudar (path + nome).
2. **Qual a mudança** proposta (diff conceitual).
3. **Por que é estrutural e não semântica** (qual sinal de paridade que o teste protegia continua protegido depois da mudança).

Esperar **aprovação explícita** antes de tocar no arquivo. Sem aprovação, não mexer.

Se um teste falha após implementação: **o código está errado, não o teste.** Tests são fonte de verdade.

### KRN tests primeiro

Para cada KRN-01..05, escrever o teste que demonstra a vulnerabilidade **pré-fix** antes de implementar o fix. Isso garante que o teste realmente testa o que diz testar (e não passa por acidente). É barato apagar um stub vulnerável depois de confirmar que o teste captura a falha; é caro descobrir tarde que um "teste de proteção" nunca cobriu o ataque.

### Cross-fixtures Stellar↔Solana

`calculate_mana` deve produzir o mesmo output que a versão Soroban para os mesmos inputs. Os fixtures vivem em `crates/karn-shared/src/mana/fixtures.rs` e são usados em ambos lados.

### Tipos de teste

| Tipo | Localização | Quando usar |
|---|---|---|
| Unit (Rust puro) | `crates/karn-shared/src/**/tests` | Math (Mana, vault), pure helpers |
| Program unit (Anchor) | `programs/<program>/src/test.rs` | Lógica que exige `Context` mas não cross-program |
| Integration (Bankrun) | `tests/<area>/*.spec.ts` | Cross-program, account state, eventos |
| KRN | `tests/krn/krn-0X.spec.ts` | 1 arquivo por mitigação; demonstra o ataque pré-fix |

Testes de execução (`anchor test`) usam Bankrun, não localnet — mais rápido, determinístico, controla `Clock`.

---

## Documentação Obrigatória em `docs/`

Toda implementação, erro não-trivial, decisão estrutural ou log relevante **precisa** ter entrada em `docs/`. Sem documentação, não considerar a tarefa fechada.

### Estrutura

```
docs/
├── README.md           # índice + templates
├── modules/            # M1.md, M2.md, ... — log por módulo
├── decisions/          # ADRs estruturais (NNNN-slug.md)
├── errors/             # journal de erros (slug.md)
└── logs/               # deploy / profiling / benchmark (YYYY-MM-DD-slug.md)
```

### Quando documentar

| Situação | Onde | Obrigatório? |
|---|---|---|
| Concluí um módulo do PRD | `docs/modules/M<N>.md` | **Sim** — parte do checklist de conclusão |
| Tomei uma decisão estrutural (mudou design, escolha entre alternativas, divergência do Stellar) | `docs/decisions/<NNNN>-<slug>.md` | **Sim** |
| Encontrei um erro não-trivial e gastei mais de 15 min resolvendo | `docs/errors/<slug>.md` | **Sim** |
| Rodei deploy / benchmark / profiling com output que vai ser referenciado depois | `docs/logs/<YYYY-MM-DD>-<slug>.md` | **Sim** |
| Erro trivial (typo, syntax) resolvido em &lt; 5 min | — | Não |
| Decisão de implementação local (nome de variável, ordem de fields) | — | Não |

### Regras

- **Toda entrada começa com data ISO** (`YYYY-MM-DD`) no header.
- **ADRs são imutáveis** uma vez aceitos. Para reverter ou substituir, criar nova ADR que referencia a antiga (`Substitui ADR-0001`).
- **Cross-link entre arquivos:** o log do módulo (`modules/M3.md`) deve linkar para as ADRs e errors relacionadas que aconteceram durante o módulo.
- **Templates** vivem em `docs/README.md` — usar.

### Por que isso existe

A versão Stellar do Karn tem 5 mitigações KRN documentadas em `SECURITY_HARDENING.md` que sobreviveram refactors. Sem o doc, ninguém saberia por que `(level - floor) × ratio` em vez de `level × ratio` (DT-10 D2). Decisões viram lei e contexto morre sem documentação.

---

## Convenções de PDA

A tabela canônica vai em `crates/karn-shared/src/seeds.rs` (a ser criada em M2). **Toda seed deve ser const** ali — nada de `b"foo"` literal espalhado pelo código.

Resumo do que vai existir:

```
Valocracy:
  [b"config"]                                  → Config (singleton)
  [b"valor", valor_id_le_bytes]                → Valor (por badge type)
  [b"user_stats", pubkey]                      → UserStats (por wallet)
  [b"token_owner", token_id_le_bytes]          → TokenOwner
  [b"token_valor", token_id_le_bytes]          → TokenValorId
  [b"guardian", pubkey]                        → GuardianTracks
  [b"credit_auth", pubkey]                     → CreditAuthority
  [b"credit_window", pubkey]                   → CreditWindow
  [b"nonce", pubkey, nonce_le_bytes]           → UsedNonce

Governor:
  [b"gov_config"]                              → GovernorConfigPda (singleton)
  [b"gov_params"]                              → GovernanceConfig (tunables)
  [b"proposal", id_le_bytes]                   → Proposal
  [b"vote", proposal_id_le_bytes, voter]       → Vote (receipt)

Treasury:
  [b"treasury"]                                → TreasuryState (singleton)
  [b"shares", pubkey]                          → UserShares
  [b"lab", lab_id_le_bytes]                    → Lab
  [b"claimable", pubkey]                       → Claimable
```

**Regras:**

- Sempre incluir `bump: u8` no struct e usar `Pubkey::find_program_address` (canonical bump).
- Para PDA "singleton" (não parametrizada por entidade), checar que a derivação confere com `Config.governor` / `Config.treasury` etc.
- Nunca derivar PDA com seeds calculadas dinamicamente em runtime que não sejam reproduzíveis off-chain — quebra clientes.

---

## Comandos Úteis

```bash
# Build dos 3 programas
anchor build

# Testes (Bankrun)
anchor test

# Testes só de um KRN
anchor test --tests krn-01

# Gerar/atualizar IDLs
anchor build && ls target/idl/

# Deploy em devnet (após `solana airdrop` na keypair de deploy)
anchor deploy --provider.cluster devnet

# Ver pubkeys dos programas
solana-keygen pubkey target/deploy/valocracy-keypair.json
solana-keygen pubkey target/deploy/governor-keypair.json
solana-keygen pubkey target/deploy/treasury-keypair.json

# Validar formato + lints (CI roda isso)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings

# Comparação rápida com Stellar (paridade)
diff <(grep -E '^pub fn' ~/Documentos/Workspace/Karn\ Protocol/contracts/valocracy/src/lib.rs) <(grep -E '^pub fn' programs/valocracy/src/lib.rs)
```

---

## Como atualizar este arquivo

- **Módulo concluído:** mover para "Status dos Módulos > ✅ Concluído" com 1–3 bullets + data ISO. Não apagar histórico.
- **Decisão arquitetural nova:** propor como `DT-13`, `DT-14` etc. e adicionar à tabela em "Decisões Arquiteturais". Atualizar o PRD em paralelo.
- **Divergência intencional do Stellar descoberta:** documentar em DT-10 ou criar novo DT. Nunca silenciosa.
- **Regra imutável nova:** discutir com owner antes. Adicionar com motivação clara.
- **Versão de tooling:** mudar APENAS com proposta + `cargo update --dry-run` para entender impacto. Atualizar CI workflow em paralelo.

Não usar este arquivo como diário pessoal. Ele é uma especificação executiva, não um log de pensamentos.
