# PRD — Karn Protocol Solana (Solana Frontier Hackathon Edition)

| Campo | Valor |
|---|---|
| Versão do documento | 1.0 |
| Data | 2026-04-30 |
| Autor | Solo developer |
| Rede alvo | Solana Devnet (mainnet pós-hackathon) |
| Framework | Anchor |
| Escopo | Implementação completa do Karn Protocol em Solana, em paralelo à versão Stellar/Soroban existente |
| Janela de execução | 10 dias úteis até submission |
| Submission | Solana Frontier (Colosseum) |

---

## Context

A versão Stellar/Soroban do Karn Protocol já existe, está hardened (KRN-01 a KRN-05 resolvidos, 53 testes passando) e continua sendo o protocolo de referência. Este PRD especifica uma **segunda implementação na rede Solana**, usando o framework Anchor, para submission na Solana Frontier hackathon (Colosseum).

**Não é migração.** Os dois protocolos coexistem. A versão Stellar permanece mantida; a versão Solana é uma expansão de ecossistema com a mesma tese (Valocracia: poder = contribuição verificável, não capital).

**O que motiva este documento:**
- Hackathon = janela curta (10 dias úteis) e desenvolvedor solo. Sem escopo escrito, o risco real é não chegar ao demo final.
- A superfície completa do Karn (3 contratos, 50+ funções públicas, 5 KRN mitigations, sistema v2 de tracks/activity) precisa ser mapeada para Solana antes de codar — modelos de execução são fundamentalmente diferentes (PDAs, CPI, signers), e improvisar custa dias.
- A submission é avaliada por demo funcional + tese clara + código limpo. O PRD garante que a implementação cubra a história completa Valocracia (mint → Mana → propose → vote → execute → decay) sem ambiguidades.

**Resultado pretendido:** três programas Anchor deployados em devnet com 5/5 mitigações KRN replicadas, SDK TypeScript publicada, e demo end-to-end reproduzível pelos juízes.

---

## 1. Visão do Produto

O Karn Protocol Solana é uma infraestrutura de governança baseada em contribuição: **identidade soulbound + reputação por mérito + tesouro coletivo controlado por governança**. Substitui o modelo "1 token = 1 voto" por um modelo onde poder de voto (Mana) vem de contribuições verificáveis e decai com inatividade.

A tese é a mesma da versão Stellar; o que muda é a rede: o ecossistema Solana ganha um primitivo de Valocracia que não existe lá nativamente.

### Problemas que resolvemos

- DAOs com voting power concentrado em whales que compraram tokens, sem incentivo a contribuir
- Reputação off-chain em comunidades (planilhas, Discord, Notion) que não plugam em decisões on-chain
- Tesouros DAO geridos por multisigs centralizadas, sem accountability programática
- Ausência de framework SBT que combine identidade + decay + governança no mesmo protocolo
- Falta de governança baseada em mérito multi-domínio (Tech, Design, Marketing, Legal, Finance) com escopo de autoridade por área

### Princípios de Design

- **Contribuição > capital**: voting power é função de badges conquistadas, não de tokens comprados
- **Decay enforcement**: presença ativa importa; influência sem participação degrada linearmente
- **Soulbound identity**: badges não-transferíveis, sem mercado secundário
- **Coletivo > individual**: tesouro só se movimenta via proposta de governança aprovada
- **Paridade com Stellar**: mesma fórmula de Mana, mesmas mitigações KRN, mesma taxonomia de badges

---

## 2. Arquitetura Técnica

### 2.1 Stack Tecnológico

| Camada | Tecnologia |
|---|---|
| Blockchain | Solana (devnet inicial, mainnet pós-hackathon) |
| Framework de programas | Anchor 0.30+ |
| Linguagem on-chain | Rust |
| Token padrão | SPL Token (USDC devnet como asset de Treasury) |
| SBT | PDA custom (não Token-2022, ver DT-01) |
| Auth de assinatura backend | Ed25519 SigVerify precompile + Instructions sysvar |
| Cross-program calls | CPI assinada por PDA (`invoke_signed`) para writes; leitura direta de account para reads |
| Storage | PDAs (Program Derived Addresses) por entidade |
| Cliente TypeScript | Codama (gerado a partir do IDL Anchor) |
| Wallet integration | Solana Wallet Standard (Phantom, Backpack, Solflare) |
| React layer | Hooks tipados (`useValocracy`, `useGovernor`, `useTreasury`) |
| Testes unitários | LiteSVM + cargo test |
| Testes de integração | Bankrun (Anchor) |
| RPC devnet | Helius ou QuickNode (gratuito para hackathon) |
| Demo harness | CLI script (Bankrun-driven) — substitui demo dApp full |
| Repositório | Mesmo repo Karn, dir novo `solana/` |

### 2.2 Arquitetura de Alto Nível

**Camada de Programas Solana** — três programas Anchor deployados independentemente, com endereços conhecidos cross-referenciados via PDA configs. Cada programa tem responsabilidade isolada: Valocracy gerencia identidade e Mana; Governor gerencia ciclo de vida de propostas; Treasury gerencia ativos coletivos. Comunicação via CPI assinada por PDA quando há mutação cross-program; leitura direta de account quando é apenas query.

**Camada SDK** — pacote `@karn_lat/protocol-sdk-solana` (irmão do SDK Stellar atual). Clients gerados via Codama a partir dos IDLs Anchor + thin wrappers tipados. Replica a API conceitual do SDK Stellar (`ValocracyClient`, `GovernorClient`, `TreasuryClient`) para que aplicações cross-chain compartilhem mental model.

**Camada de Demo** — para o hackathon, substituída por uma CLI Bankrun-driven que executa o fluxo completo (register → mint → propose → vote → execute → withdraw) em &lt; 5 minutos. Demo dApp web fica como stretch goal.

### 2.3 Fluxo de Identidade

1. Usuário conecta wallet via Solana Wallet Standard (Phantom, Backpack ou Solflare)
2. Backend (chave configurada no `Valocracy.Config`) assina payload `[caller, nonce, expiry, track_id]` via Ed25519 e devolve a assinatura
3. Cliente monta transação com **duas instruções**: (a) `Ed25519SigVerify` precompile validando o payload, (b) `valocracy.self_register` que lê o resultado do precompile via Instructions sysvar
4. Programa cria PDA `UserStats(caller)` com `credential_level=member_rarity`, `primary_track_id=track_id`, `credential_expiry=now+180d`; marca PDA `UsedNonce(caller, nonce)` para anti-replay
5. CPI para `Treasury.deposit(caller, member_rarity)` aloca shares iniciais
6. Recovery: se a wallet for perdida, o usuário não recupera identidade — soulbound é por design. Para a v1, perda de wallet = perda de Mana acumulada (documentado como trade-off)

---

## 3. Módulos Funcionais

A implementação é dividida em **18 módulos agrupados em 7 fases**. Fases são ordenadas por capacidade técnica + jornada do usuário. Módulos must-have entregam o protocolo end-to-end; stretch goals (Seção 9) são features de escopo real que podem ser cortadas se o prazo apertar.

### Tabela de Módulos

| # | Nome | Fase | Effort | Tier |
|---|---|---|---|---|
| 1 | Workspace Anchor + Tooling | Fundamentos | S | Must-have |
| 2 | Convenções de PDA, Erros e Eventos | Fundamentos | S | Must-have |
| 3 | Programa Valocracy: Estado e Inicialização | Core | M | Must-have |
| 4 | Mintagem de Badges (RBAC + Guardian) | Core | M | Must-have |
| 5 | Self-Register com Ed25519 Precompile | Core | M | Must-have |
| 6 | Cálculo de Mana com Decay | Reputação | S | Must-have |
| 7 | Activity Level e Credit Authority | Reputação | M | Must-have |
| 8 | Identidade Primária Mutável | Reputação | S | Must-have |
| 9 | Revoke + Verified Flag | Reputação | S | Must-have |
| 10 | Programa Treasury: Vault SPL | Tesouraria | M | Must-have |
| 11 | Allocation de Shares (CPI Valocracy → Treasury) | Tesouraria | S | Must-have |
| 12 | Lab/Scholarship Escrow (KRN-01) | Tesouraria | M | Must-have |
| 13 | Programa Governor: Proposals + Config | Governança | M | Must-have |
| 14 | Voting + Execution + Cross-Program Auth | Governança | L | Must-have |
| 15 | TypeScript SDK (Codama + Thin Clients) | Integração | M | Must-have |
| 16 | Wallet Adapter (Solana Wallet Standard) | Integração | S | Stretch* |
| 17 | Demo dApp (Next.js) | Demo | L | Stretch |
| 18 | Suite de Testes Bankrun + Devnet Deploy | Demo | M | Must-have |

*M16 é Must-have apenas se M17 (Demo dApp) também for; em modo stretch, a CLI de demo do M18 substitui ambos.

---

### MÓDULO 1 — Workspace Anchor + Tooling

**Goal:** Bootstrappar workspace Anchor compilável e testável com os três program shells, crate compartilhada e CI mínimo.

***Escopo***
- `solana/Anchor.toml` declarando `valocracy`, `governor`, `treasury`
- Cargo workspace com `karn-shared` crate para types reutilizáveis
- Scripts: `anchor build`, `anchor test`, `anchor deploy --provider.cluster devnet`
- GitHub Actions rodando `anchor build` + Bankrun em PRs que tocam `solana/`

***Fluxo Técnico***
1. `anchor init solana` no root do repo
2. Adicionar 3 programs via `anchor new <name>`
3. Criar `solana/programs/karn-shared/` com `Cargo.toml` exportando types comuns
4. Configurar `Anchor.toml` para devnet com keypair em `~/.config/solana/id.json`
5. Adicionar workflow CI em `.github/workflows/solana-ci.yml`

***Modelo de Dados***
```
solana/
├── programs/
│   ├── valocracy/
│   ├── governor/
│   ├── treasury/
│   └── karn-shared/   (lib crate)
├── tests/
├── migrations/
├── Anchor.toml
└── Cargo.toml
```

***Entregáveis***
- `anchor build` verde nos 3 programs
- `anchor test` rodando com pelo menos 1 teste smoke por program
- CI passando em pull requests
- README mínimo em `solana/README.md`

***Critério de Aceite***
- `anchor build && anchor test` retorna 0 sem warnings
- IDLs JSON gerados em `solana/target/idl/`

---

### MÓDULO 2 — Convenções de PDA, Erros e Eventos

**Goal:** Documentar e implementar a convenção de seeds, taxonomia de erros e padrão de emissão de eventos espelhando o código Stellar.

***Escopo***
- Tabela de seeds canônica (toda PDA do projeto)
- Mapeamento 1:1 dos 18 erros Valocracy + 13 Governor + 11 Treasury para `#[error_code]`
- 15 eventos Valocracy + 5 Governor + 7 Treasury via `#[event]` + `emit!`

***Fluxo Técnico***
1. Definir tabela de seeds em `karn-shared/src/seeds.rs` como `pub const`s
2. Replicar enums de erro do Stellar em `<program>/src/errors.rs` com mesmos códigos
3. Definir structs `#[event]` com mesmos topics do Stellar
4. Documentar tabela de seeds em `solana/docs/PDA_CONVENTIONS.md`

***Modelo de Dados***
```
// karn-shared/src/seeds.rs
pub const VALOCRACY_CONFIG: &[u8] = b"config";
pub const VALOR: &[u8] = b"valor";              // + valor_id.to_le_bytes()
pub const USER_STATS: &[u8] = b"user_stats";    // + pubkey
pub const TOKEN_OWNER: &[u8] = b"token_owner";  // + token_id.to_le_bytes()
pub const TOKEN_VALOR: &[u8] = b"token_valor";  // + token_id.to_le_bytes()
pub const GUARDIAN_TRACKS: &[u8] = b"guardian"; // + pubkey
pub const CREDIT_AUTHORITY: &[u8] = b"credit_auth"; // + pubkey
pub const CREDIT_WINDOW: &[u8] = b"credit_window";  // + pubkey
pub const USED_NONCE: &[u8] = b"nonce";         // + pubkey + nonce.to_le_bytes()
pub const PROPOSAL: &[u8] = b"proposal";        // + id.to_le_bytes()
pub const VOTE: &[u8] = b"vote";                // + proposal_id.to_le_bytes() + pubkey
pub const GOVERNOR_CONFIG: &[u8] = b"gov_config";
pub const TREASURY_STATE: &[u8] = b"treasury";
pub const USER_SHARES: &[u8] = b"shares";       // + pubkey
pub const LAB: &[u8] = b"lab";                  // + lab_id.to_le_bytes()
pub const CLAIMABLE: &[u8] = b"claimable";      // + pubkey
```

***Entregáveis***
- `karn-shared/src/seeds.rs` com todas as constantes
- `errors.rs` em cada program com enums idênticas ao Stellar
- `events.rs` em cada program com structs `#[event]`
- `solana/docs/PDA_CONVENTIONS.md` com tabela legível

***Critério de Aceite***
- `cargo doc` gera referência completa para `karn-shared`
- Cada erro Stellar tem correspondente Solana com mesmo código numérico

---

### MÓDULO 3 — Programa Valocracy: Estado e Inicialização

**Goal:** Implementar PDAs de configuração, badges (Valor) e estatísticas de usuário com inicialização por genesis.

***Escopo***
- `Config` PDA singleton (governor, treasury, signer ed25519, member_valor_id, total_supply, leadership_valor_id, name, symbol)
- `Valor` PDA por valor_id (rarity, secondary_rarity, track_id, metadata)
- `UserStats` PDA por wallet (8 campos do v2 Stellar)
- Instrução `initialize` aceitando lista de genesis members + lista de valores

***Fluxo Técnico***
1. Caller (genesis_members[0]) assina tx
2. Programa cria `Config` PDA com governor, treasury, signer (32 bytes)
3. Loop sobre `valor_ids` cria N PDAs `Valor` com `track_id=0`, `secondary_rarity=0` (taxonomia v2 vem em propostas posteriores)
4. Loop sobre genesis_members cria PDA `UserStats` para cada um, com `credential_level=leadership_rarity`, `credential_expiry=now+180d`, `permanent_level=0`
5. Para cada genesis member: aloca PDA `TokenOwner(token_id)` e `TokenValorId(token_id)`, emite `MintEvent`
6. Define `total_supply = N`; emite `InitializedEvent`

***Modelo de Dados***
```rust
#[account]
pub struct Config {
    pub governor: Pubkey,
    pub treasury: Pubkey,
    pub signer: [u8; 32],         // ed25519 public key
    pub member_valor_id: u64,
    pub leadership_valor_id: u64,
    pub total_supply: u64,
    pub credit_paused: bool,
    pub bump: u8,
}

#[account]
pub struct Valor {
    pub rarity: u64,
    pub secondary_rarity: u64,
    pub track_id: u64,
    pub metadata: String,         // max 200 bytes
    pub bump: u8,
}

#[account]
pub struct UserStats {
    pub credential_level: u64,
    pub permanent_level: u64,     // mantido por paridade, sempre 0 em v2
    pub credential_expiry: i64,
    pub verified: bool,
    pub primary_track_id: Option<u64>,
    pub primary_valor_id: Option<u64>,
    pub activity_level: u64,
    pub activity_expiry: i64,
    pub bump: u8,
}

#[account]
pub struct TokenOwner { pub owner: Pubkey, pub bump: u8 }
#[account]
pub struct TokenValorId { pub valor_id: u64, pub bump: u8 }
```

***Entregáveis***
- `programs/valocracy/src/state.rs`, `instructions/initialize.rs`
- 3 testes Bankrun: initialize válido, double-init falha, genesis vazio falha

***Critério de Aceite***
- Após initialize, `Config.total_supply == genesis_members.len()`
- `UserStats(member).credential_level` corresponde a `leadership_rarity`
- Re-execução de `initialize` retorna erro `AlreadyInitialized`

---

### MÓDULO 4 — Mintagem de Badges (RBAC + Guardian)

**Goal:** Mintar SBTs com autorização baseada em categoria de badge e Guardian por track, replicando o RBAC do Stellar (`check_mint_authorization`).

***Escopo***
- `mint(minter, recipient, valor_id)` com check de categoria
- `guardian_mint(guardian, account, valor_id)` com dual-auth (KRN-05) e checagem de `GuardianTracks`
- Função `effective_rarity_for(account, valor)` aplicando regra primary/secondary
- `set_guardian_tracks(guardian, track_ids)` (Governor-only)
- `remove_guardian(guardian)` (Governor-only)

***Fluxo Técnico***
1. Para `mint`: minter assina; programa lê `Valor(valor_id)` e classifica via `get_badge_category`
2. Match: Member/Founder → erro `BadgeNotMintable`; Leadership/Track/Governance → check minter == governor; Community → check minter tem `credential_level > 0`
3. Calcula `effective_rarity` lendo `UserStats(recipient).primary_track_id` e comparando com `Valor.track_id`
4. Aloca `TokenOwner(new_token_id)`, atualiza `UserStats` (incrementa credential_level, reseta credential_expiry); CPI para `Treasury.deposit(recipient, effective_rarity)`
5. Emite `MintEvent`; incrementa `total_supply`
6. Para `guardian_mint`: `guardian` E `account` ambos signers (KRN-05); verifica `Valor.track_id != 0` e `GuardianTracks(guardian)` contém esse track_id; depois mesmo fluxo do mint

***Modelo de Dados***
```rust
#[account]
pub struct GuardianTracks {
    pub authority: Pubkey,
    pub track_ids: Vec<u64>,      // cap 32 (DT-08)
    pub bump: u8,
}

pub enum BadgeCategory {
    Member,        // 0
    Founder,       // 1
    Leadership,    // 10..=19
    Track,         // 20..=59
    Community,     // 60..=69
    Governance,    // 70..=79
}
```

***Entregáveis***
- `instructions/mint.rs`, `instructions/guardian_mint.rs`, `instructions/set_guardian_tracks.rs`, `instructions/remove_guardian.rs`
- 6 testes Bankrun: mint Governor para Track ok, mint não-Governor para Track falha, mint Community por member ok, guardian_mint sem track autorizado falha, **KRN-05** (guardian == account permitido pelos signers mas... verificar política), Member/Founder mint falha

***Critério de Aceite***
- `MintNotAuthorized` quando minter não corresponde à categoria
- `GuardianTrackUnauthorized` quando guardian não tem o track_id
- Saldo de shares no Treasury aumenta exatamente em `effective_rarity` após mint

---

### MÓDULO 5 — Self-Register com Ed25519 Precompile

**Goal:** Permitir cadastro de membro via assinatura de backend, sem proposta de governança, usando o precompile Ed25519 nativo do Solana.

***Escopo***
- Instrução `self_register(track_id, nonce, expiry, sig_index)` no Valocracy
- Validação do precompile via Instructions sysvar
- PDA `UsedNonce(caller, nonce)` para anti-replay
- Setando `primary_track_id = Some(track_id)` no registro (Decisão D3 opção A)

***Fluxo Técnico***
1. Backend assina payload `caller_pubkey || nonce_le_bytes || expiry_le_bytes || track_id_le_bytes` com chave ed25519 cuja public key está em `Config.signer`
2. Cliente monta tx com 2 instruções: (a) `Ed25519SigVerify` (program ID `Ed25519SigVerify111111111111111111111111111`), (b) `valocracy.self_register`
3. Programa carrega Instructions sysvar, lê instrução em índice `sig_index`, valida que program_id é Ed25519SigVerify, e que data contém: signer == `Config.signer`, message == payload reconstruído, signature presente
4. Verifica `expiry > Clock::unix_timestamp` e que PDA `UsedNonce` ainda não existe
5. Cria `UsedNonce(caller, nonce)` PDA (init); cria `UserStats(caller)` com member_rarity, primary_track_id=Some(track_id), credential_expiry=now+180d
6. Aloca token, CPI para `Treasury.deposit(caller, member_rarity)`, emite eventos

***Modelo de Dados***
```rust
#[account]
pub struct UsedNonce { pub bump: u8 }    // existência da PDA = nonce consumido

// Payload assinado pelo backend (idêntico ao Stellar exceto por track_id ao final)
struct SelfRegisterPayload {
    caller: [u8; 32],
    nonce: [u8; 8],
    expiry: [u8; 8],
    track_id: [u8; 8],
}
```

***Entregáveis***
- `instructions/self_register.rs` com validação completa do precompile
- Helper `build_payload()` em `karn-shared` para reconstrução determinística
- 5 testes Bankrun: registro válido, precompile ausente falha, signer divergente falha, nonce reusado falha, expiry vencido falha

***Critério de Aceite***
- Após `self_register`, `UserStats(caller).primary_track_id == Some(track_id)`
- Mesmo payload reusado retorna erro `NonceUsed`
- Tx sem instrução Ed25519 anterior retorna erro `InvalidSignature`

---

### MÓDULO 6 — Cálculo de Mana com Decay

**Goal:** Implementar fórmula v2 de Mana com componentes credential e activity, suportando consulta histórica para snapshot voting.

***Escopo***
- Função pura `calculate_mana(...)` em `karn-shared` (com mesma signature do Stellar)
- Instrução read-only `get_votes(account)` retornando Mana atual
- Instrução read-only `get_votes_at(account, timestamp)` retornando Mana em timestamp histórico
- Aritmética `u128` interna (KRN-04)

***Fluxo Técnico***
1. Carrega `UserStats(account)`; se não existe, retorna 0
2. Calcula `credential_bonus`:
   - Se `now < credential_expiry`: `extra = level - MEMBER_FLOOR(5)`; resultado = `(extra * (expiry - now)) / VACANCY_PERIOD` em u128
   - Senão se `permanent_level > 0`: `permanent_level` (fallback Stellar; em v2-Solana sempre 0)
   - Senão: 0
3. Calcula `activity_bonus`:
   - Se `activity_level > 0` e `now < activity_expiry`: `(activity_level * (expiry - now)) / ACTIVITY_PERIOD` em u128
   - Senão: 0
4. Retorna `MEMBER_FLOOR + credential_bonus + activity_bonus`

***Modelo de Dados***
```rust
pub const VACANCY_PERIOD: i64 = 180 * 86_400;
pub const ACTIVITY_PERIOD: i64 = 90 * 86_400;
pub const MEMBER_FLOOR: u64 = 5;

pub fn calculate_mana(
    credential_level: u64,
    permanent_level: u64,
    credential_expiry: i64,
    activity_level: u64,
    activity_expiry: i64,
    current_time: i64,
) -> u64 { /* ... */ }
```

***Entregáveis***
- `karn-shared/src/mana.rs`
- Instruções `get_votes` e `get_votes_at` em Valocracy
- 8 testes em `karn-shared` cobrindo bordas: pre-expiry, post-expiry, decay linear, overflow protection, activity contribution, floor preservation

***Critério de Aceite***
- `calculate_mana` produz exatamente o mesmo resultado que a versão Stellar para os mesmos inputs (testado com fixtures cruzadas)
- Sem overflow para `level = u64::MAX, time_remaining = VACANCY_PERIOD`

---

### MÓDULO 7 — Activity Level e Credit Authority

**Goal:** Permitir que autoridades por track creditem atividade com cap rolante de 200/30d e circuit breaker global.

***Escopo***
- `credit_activity(authority, account, track_id, amount)` com 3 checks (pause, autoridade, cap)
- `set_credit_authority(authority, track_ids)` (Governor-only)
- `revoke_credit_authority(authority)` (Governor-only)
- `pause_credit()` / `resume_credit()` (Governor-only)
- PDA `CreditWindow(account)` com `credits` + `period_start`

***Fluxo Técnico***
1. Authority assina tx
2. Programa verifica `Config.credit_paused == false`, senão erro `ActivityCreditPaused`
3. Verifica `CreditAuthority(authority)` existe e contém `track_id`, senão `CreditAuthorityUnauthorized`
4. Carrega `CreditWindow(account)`; se `now >= period_start + 30d`, reseta para `credits=0, period_start=now`
5. `remaining_cap = ACTIVITY_CREDIT_CAP(200) - window.credits`; `effective_amount = min(amount, remaining_cap)`
6. Atualiza `window.credits += effective_amount`; persiste
7. Atualiza `UserStats.activity_level += effective_amount`, `activity_expiry = now + 90d`
8. Emite `ActivityCreditedEvent { account, track_id, amount, effective_amount }`

***Modelo de Dados***
```rust
pub const ACTIVITY_CREDIT_CAP: u64 = 200;
pub const ACTIVITY_CREDIT_CAP_PERIOD: i64 = 30 * 86_400;

#[account]
pub struct CreditAuthority {
    pub authority: Pubkey,
    pub track_ids: Vec<u64>,    // cap 32
    pub bump: u8,
}

#[account]
pub struct CreditWindow {
    pub credits: u64,
    pub period_start: i64,
    pub bump: u8,
}
```

***Entregáveis***
- 5 instruções (`credit_activity`, `set_credit_authority`, `revoke_credit_authority`, `pause_credit`, `resume_credit`)
- 7 testes Bankrun: credit ok, pausado falha, authority sem track falha, cap respeitado, janela rolante reseta, partial credit (acima do cap), credit a non-member falha

***Critério de Aceite***
- Após `credit_activity(amount=300)` em janela limpa, `activity_level += 200` (cap aplicado) e `effective_amount = 200`
- `pause_credit` bloqueia toda chamada subsequente até `resume_credit`

---

### MÓDULO 8 — Identidade Primária Mutável

**Goal:** Permitir atualização de `primary_track_id` e `primary_valor_id` via Governor (proposta).

***Escopo***
- Instrução `update_primary(account, new_track_id, new_valor_id)` chamável apenas pelo Governor PDA
- Re-cálculo automático de `effective_rarity` em mints subsequentes (já implementado em M4)

***Fluxo Técnico***
1. Governor PDA assina via CPI no `execute()` (ver M14)
2. Carrega `UserStats(account)`; atualiza `primary_track_id = Some(new_track_id)`, `primary_valor_id = Some(new_valor_id)`
3. Persiste; emite `PrimaryUpdatedEvent`

***Modelo de Dados*** — reaproveita `UserStats` do M3.

***Entregáveis***
- `instructions/update_primary.rs`
- 2 testes Bankrun: chamada não-governor falha, chamada governor atualiza ambos campos

***Critério de Aceite***
- `update_primary` chamado por wallet arbitrária retorna `NotAuthorized`
- Após update, `effective_rarity_for(account, valor)` reflete novo track

---

### MÓDULO 9 — Revoke + Verified Flag

**Goal:** Implementar revogação de badge e flag de KYC, ambos Governor-only.

***Escopo***
- `revoke(token_id)` decrementa `credential_level` e `permanent_level`
- `set_verified(member, bool)` atualiza flag
- Limpeza dos PDAs `TokenOwner` e `TokenValorId` em revoke (close account, recupera rent)

***Fluxo Técnico***
1. Para `revoke`: Governor assina; programa lê `TokenOwner(token_id)` e `TokenValorId(token_id)`; lê `Valor(valor_id)` e calcula `effective_rarity` para o owner
2. `UserStats(owner).credential_level -= effective_rarity` (saturating); fecha PDAs do token
3. Emite `RevokeEvent { owner, token_id, valor_id, new_level }`
4. Para `set_verified`: Governor assina; atualiza `UserStats(member).verified`; emite `VerificationChangedEvent`

***Modelo de Dados*** — reaproveita estruturas do M3.

***Entregáveis***
- `instructions/revoke.rs`, `instructions/set_verified.rs`
- 4 testes Bankrun: revoke ok, revoke não-governor falha, set_verified ok, set_verified em non-member falha

***Critério de Aceite***
- Após revoke, `UserStats.credential_level` é exatamente decrementado por `effective_rarity`
- PDAs do token revogado são fechadas (rent retornado)

---

### MÓDULO 10 — Programa Treasury: Vault SPL

**Goal:** Cofre comunitário com ATA owned-by-PDA, governance-only transfers e math ERC4626 com virtual offsets.

***Escopo***
- `Treasury` state PDA (governor, valocracy, asset_mint, total_shares, restricted_reserves, locked)
- ATA do asset_mint owned-by-Treasury PDA
- `transfer(receiver, amount)` Governor-only com reentrancy lock
- `total_assets()` retorna `vault_balance - restricted_reserves` (KRN-01)
- Vault math (`convert_to_assets`, `convert_to_shares`) com virtual offsets

***Fluxo Técnico***
1. Initialize: cria `Treasury` PDA + ATA via Anchor `init` com `token::Token` program
2. Para `transfer`: Governor PDA assina (via CPI signed); programa verifica `locked == false`, set `locked=true`
3. Verifica `vault_balance >= amount`; senão erro `InsufficientAssets`, `locked=false`
4. CPI para `spl_token::transfer` com seeds `[b"treasury", bump]` autorizando transfer da ATA → receiver
5. Emite `Transfer { receiver, amount }`; `locked=false`

***Modelo de Dados***
```rust
#[account]
pub struct TreasuryState {
    pub governor: Pubkey,
    pub valocracy: Pubkey,
    pub asset_mint: Pubkey,
    pub total_shares: u128,
    pub restricted_reserves: u64,
    pub locked: bool,
    pub bump: u8,
}

pub const MIN_INITIAL_DEPOSIT: u128 = 1000;
pub const VIRTUAL_SHARES: u128 = 1000;
pub const VIRTUAL_ASSETS: u128 = 1;
```

***Entregáveis***
- `programs/treasury/src/state.rs`, `instructions/initialize.rs`, `instructions/transfer.rs`
- Helpers de vault math em `karn-shared/src/vault.rs`
- 6 testes Bankrun: transfer ok via Governor, transfer não-governor falha, transfer > balance falha, reentrancy bloqueada, **KRN-01** (restricted excluído de total_assets), preview_withdraw correto

***Critério de Aceite***
- `transfer(amount)` por wallet não-governor retorna `NotAuthorized`
- `total_assets() == vault_ata_balance - restricted_reserves`

---

### MÓDULO 11 — Allocation de Shares (CPI Valocracy → Treasury)

**Goal:** Permitir que Valocracy aloque shares em mints, mantendo o vínculo contribuição → ownership econômica.

***Escopo***
- `deposit(receiver, shares)` chamável apenas via CPI assinada pelo Valocracy PDA
- Validação `MIN_INITIAL_DEPOSIT = 1000` no primeiro deposit (`total_shares == 0`)
- PDA `UserShares(account)` com saldo de shares

***Fluxo Técnico***
1. Valocracy.mint_internal monta CPI: `treasury.deposit(receiver, effective_rarity)` com seeds Valocracy `[b"valocracy", bump]`
2. Programa Treasury verifica que o signer da CPI é o PDA do Valocracy (lookup em `TreasuryState.valocracy`)
3. Se `total_shares == 0` e `shares < MIN_INITIAL_DEPOSIT`, erro `InsufficientShares`
4. Cria/atualiza `UserShares(receiver)`; incrementa `total_shares`
5. Emite `Deposit { receiver, shares }`

***Modelo de Dados***
```rust
#[account]
pub struct UserShares {
    pub owner: Pubkey,
    pub shares: u128,
    pub bump: u8,
}
```

***Entregáveis***
- `instructions/deposit.rs` no Treasury
- Atualização de `mint` no Valocracy para emitir CPI
- 4 testes Bankrun: deposit via Valocracy CPI ok, deposit direto (não-CPI) falha, primeiro deposit < min falha, depósitos acumulam corretamente

***Critério de Aceite***
- Chamada direta `treasury.deposit(...)` por wallet arbitrária retorna `NotAuthorized`
- Após N mints, `sum(UserShares) == TreasuryState.total_shares`

---

### MÓDULO 12 — Lab/Scholarship Escrow (KRN-01)

**Goal:** Funder cria Lab; Governor aprova bolsa; membro retira sob seu próprio sign.

***Escopo***
- `fund_lab(funder, total_amount, scholarship_per_member)` cria PDA `Lab(id)` + incrementa restricted_reserves
- `approve_scholarship(lab_id, member)` (Governor) atualiza `Claimable(member)`
- `withdraw_scholarship(amount)` (member) decrementa restricted e transfere via SPL
- Counter `lab_counter` no `TreasuryState`

***Fluxo Técnico***
1. Para `fund_lab`: funder assina; CPI para `spl_token::transfer(funder → vault_ata, total_amount)`; aloca PDA `Lab` com status=Active; incrementa `restricted_reserves`; emite `LabFunded`
2. Para `approve_scholarship`: Governor PDA assina via CPI; carrega `Lab(lab_id)` (deve estar Active); cria/atualiza `Claimable(member)` somando `scholarship_per_member`; emite `ScholarshipReleased`
3. Para `withdraw_scholarship`: member assina; verifica `Claimable(member).amount >= requested`; decrementa claimable e restricted_reserves; CPI `spl_token::transfer(vault → member, amount)` com seeds Treasury PDA; emite `ScholarshipWithdrawn`

***Modelo de Dados***
```rust
#[account]
pub struct Lab {
    pub id: u32,
    pub funder: Pubkey,
    pub total_amount: u64,
    pub scholarship_per_member: u64,
    pub status: LabStatus,    // Active | Cancelled | Completed
    pub bump: u8,
}

#[account]
pub struct Claimable {
    pub member: Pubkey,
    pub amount: u64,
    pub bump: u8,
}
```

***Entregáveis***
- 3 instruções (`fund_lab`, `approve_scholarship`, `withdraw_scholarship`)
- 6 testes Bankrun: fluxo completo lab → approve → withdraw, lab não-existe falha, withdraw acima do claimable falha, **KRN-01** (shareholder não consegue redimir restricted), restricted decrementa em withdraw, double-withdraw falha

***Critério de Aceite***
- Em qualquer ponto, `restricted_reserves == sum(Claimable.amount) + sum(Lab.total_remaining)`
- `total_assets()` permanece independente de scholarships pendentes

---

### MÓDULO 13 — Programa Governor: Proposals + Config

**Goal:** Criar e listar propostas com snapshot voting (KRN-02) e participation threshold (KRN-03).

***Escopo***
- `Proposal` PDA por id (proposer, description, start/end, for/against, total_mana_at_creation, action, executed)
- `propose(description, action)` checa `proposal_threshold` lendo UserStats direto
- `GovernanceConfig` PDA com defaults idênticos ao Stellar
- Counter `proposal_count` no `Config`

***Fluxo Técnico***
1. Proposer assina; programa lê `UserStats(proposer)` direto (sem CPI; ver DT-04) e calcula Mana via `calculate_mana(...)`
2. Verifica `mana >= GovernanceConfig.proposal_threshold(100)`; senão `NoVotingPower`
3. Snapshot total Mana: lê `Config.total_supply` do Valocracy (account direta) e calcula `total_mana = total_supply * MEMBER_FLOOR`
4. Aloca `Proposal(id)` com creation_time=now, start=now+voting_delay, end=start+voting_period
5. Emite `ProposalCreated`

***Modelo de Dados***
```rust
#[account]
pub struct GovernorConfigPda {
    pub valocracy: Pubkey,
    pub proposal_count: u64,
    pub locked: bool,
    pub bump: u8,
}

#[account]
pub struct GovernanceConfig {
    pub voting_delay: i64,         // 86400
    pub voting_period: i64,        // 604800
    pub proposal_threshold: u64,   // 100
    pub quorum_percentage: u64,    // 51
    pub participation_threshold: u64, // 4
    pub bump: u8,
}

#[account]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub description: String,        // max 500 bytes
    pub creation_time: i64,
    pub start_time: i64,
    pub end_time: i64,
    pub for_votes: u64,
    pub against_votes: u64,
    pub executed: bool,
    pub action: ProposalAction,     // enum tipado (DT-02)
    pub total_mana_at_creation: u64,
    pub bump: u8,
}

pub enum ProposalAction {
    TreasuryTransfer { receiver: Pubkey, amount: u64 },
    TreasuryApproveScholarship { lab_id: u32, member: Pubkey },
    ValocracySetValor { valor_id: u64, rarity: u64, secondary_rarity: u64, track_id: u64, metadata: String },
    ValocracySetGuardianTracks { guardian: Pubkey, track_ids: Vec<u64> },
    ValocracyUpdatePrimary { account: Pubkey, new_track_id: u64, new_valor_id: u64 },
    ValocracySetCreditAuthority { authority: Pubkey, track_ids: Vec<u64> },
    ValocracyRevoke { token_id: u64 },
    ValocracyPauseCredit,
    ValocracyResumeCredit,
    UpdateGovernanceConfig { config: GovernanceConfig },
}
```

***Entregáveis***
- `programs/governor/src/state.rs`, `instructions/initialize.rs`, `instructions/propose.rs`
- 5 testes Bankrun: propose válido, propose abaixo do threshold falha, propose por non-member falha, snapshot de total_mana correto, KRN-03 prep (verifica que `total_mana_at_creation` é gravado)

***Critério de Aceite***
- `Proposal.total_mana_at_creation == valocracy.total_supply * MEMBER_FLOOR` no momento da criação
- `propose` por wallet com Mana < 100 retorna `NoVotingPower`

---

### MÓDULO 14 — Voting + Execution + Cross-Program Auth

**Goal:** Votar com snapshot histórico, calcular state, e executar `ProposalAction` via CPI assinada por PDA Governor.

***Escopo***
- `cast_vote(proposal_id, support)` com snapshot voting (KRN-02)
- `get_proposal_state(proposal_id)` aplicando participation threshold antes de quorum (KRN-03)
- `execute(proposal_id)` faz dispatch do enum `ProposalAction` via CPI
- Reentrancy lock no `GovernorConfigPda.locked`

***Fluxo Técnico***
1. Para `cast_vote`: voter assina; carrega `Proposal`; verifica `start_time <= now <= end_time`; verifica `Vote(proposal_id, voter)` PDA não existe (anti-double-vote)
2. Set `locked=true`; calcula `voting_power = calculate_mana(...)` em `proposal.creation_time` (snapshot, KRN-02)
3. Se `voting_power == 0`: erro `NoVotingPower`, libera lock
4. Atualiza `for_votes` ou `against_votes`; cria PDA `Vote`; emite `VoteCast`; libera lock

5. Para `execute`: anyone assina; carrega `Proposal`; verifica `executed == false` e `state == Succeeded`
6. Set `locked=true`; marca `executed=true`
7. Match `ProposalAction`: cada variante monta CPI específica com seeds Governor `[b"gov_config", bump]`
   - `TreasuryTransfer` → CPI `treasury.transfer`
   - `ValocracyRevoke` → CPI `valocracy.revoke`
   - etc. (10 variantes)
8. Emite `ProposalExecuted`; libera lock

9. Para `get_proposal_state`: pure function on top of `Proposal`
   - Pending se now < start_time
   - Active se now <= end_time
   - Else: total_votes = for + against; if total == 0 → Defeated
   - Calcula `participation = (total_votes * 100) / total_mana_at_creation`; se < 4% → Defeated (KRN-03)
   - `for_pct = (for_votes * 100) / total_votes`; se >= 51% → Succeeded, senão Defeated
   - Se `executed` → Executed

***Modelo de Dados***
```rust
#[account]
pub struct Vote {
    pub support: bool,
    pub bump: u8,
}

pub enum ProposalState { Pending, Active, Succeeded, Defeated, Executed }
```

***Entregáveis***
- `instructions/cast_vote.rs`, `instructions/execute.rs`
- 12 testes Bankrun: vote válido, vote pre-start falha, vote post-end falha, double-vote falha, **KRN-02** (Mana calculada em creation_time), **KRN-03** (4% participation enforced), execute Succeeded ok, execute Defeated falha, execute already-executed falha, reentrancy bloqueada, dispatch TreasuryTransfer ok, dispatch ValocracyPauseCredit ok

***Critério de Aceite***
- Voto com Mana mintada DEPOIS de creation_time não é contado (snapshot fiel)
- Proposta com 1 voto mas `participation < 4%` permanece `Defeated` independente do for_percentage
- `execute(TreasuryTransfer{...})` move fundos corretamente do vault para receiver

---

### MÓDULO 15 — TypeScript SDK (Codama + Thin Clients)

**Goal:** Pacote `@karn_lat/protocol-sdk-solana` com clients para os três programas e helpers de Mana client-side.

***Escopo***
- IDL → cliente via Codama
- Wrappers `ValocracyClient`, `GovernorClient`, `TreasuryClient` espelhando API conceitual da SDK Stellar
- `calculateMana()` no SDK reproduzindo lógica on-chain
- Tipos exportados: `UserStats`, `Valor`, `ProposalAction`, `GovernanceConfig`

***Fluxo Técnico***
1. `npx codama generate solana/target/idl/*.json --out solana-sdk/src/generated`
2. Escreve thin clients que carregam `Connection` + `wallet`, chamam factories Codama, e expõem métodos high-level
3. Implementa helpers `buildSelfRegisterTx(payload, signature)` que monta as duas instruções
4. Helper `buildExecuteTx(proposalId)` resolve `remaining_accounts` por variante de `ProposalAction`

***Modelo de Dados***
```typescript
export class ValocracyClient {
  selfRegister(trackId: bigint, signature: Uint8Array, nonce: bigint, expiry: bigint): TxBuilder;
  guardianMint(account: PublicKey, valorId: bigint): TxBuilder;
  getUserStats(account: PublicKey): Promise<UserStats>;
  getVotes(account: PublicKey): Promise<bigint>;
  getVotesAt(account: PublicKey, timestamp: bigint): Promise<bigint>;
  // ...
}
export function calculateMana(stats: UserStats, currentTime: bigint): bigint;
```

***Entregáveis***
- Pacote npm `@karn_lat/protocol-sdk-solana@0.1.0-alpha.1` publicado
- README com 3 exemplos: register, propose, vote
- Testes Jest cobrindo `calculateMana` com fixtures cruzadas Stellar/Solana

***Critério de Aceite***
- `npm install @karn_lat/protocol-sdk-solana && import { ValocracyClient }` funciona em projeto vazio
- `calculateMana` retorna mesmo valor que a versão Rust para 20 fixtures de teste

---

### MÓDULO 16 — Wallet Adapter (Solana Wallet Standard)

**Goal:** Hook React `useWallet` integrado ao Solana Wallet Standard cobrindo Phantom, Backpack, Solflare. **Stretch para hackathon — escopo cortado se M17 também for.**

***Escopo***
- `KarnSolanaProvider` wrapping `WalletProvider` + `ConnectionProvider`
- Hooks `useValocracy`, `useGovernor`, `useTreasury` reutilizando assinatura conceitual da SDK Stellar
- Auto-detect cluster via env

***Fluxo Técnico***
1. Provider compõe `ConnectionProvider` (RPC) + `WalletProvider` (Wallet Standard adapters) + `KarnSDKProvider` (instâncias dos 3 clients)
2. `useValocracy` retorna `{ stats, mana, register, mint, ... }`
3. `useGovernor` retorna `{ proposals, propose, vote, execute, ... }`
4. `useTreasury` retorna `{ shares, claimable, fundLab, withdrawScholarship, ... }`

***Modelo de Dados*** — reaproveita types do M15.

***Entregáveis***
- `solana-sdk/src/react/`
- 1 exemplo Storybook por hook

***Critério de Aceite***
- App de exemplo conecta via Phantom devnet sem código adicional

---

### MÓDULO 17 — Demo dApp (Next.js)

**Goal:** App enxuta cobrindo a jornada completa. **Stretch para hackathon — substituído por CLI demo (M18) se cronograma apertar.**

***Escopo***
- Telas: Connect, Profile (badges + Mana com decay visual), Proposals list/detail, Create Proposal (form por ProposalAction variant), Lab/Scholarship dashboard
- Backend signing endpoint `/api/sign-register` (Next.js API route)
- Deploy Vercel; cluster devnet

***Fluxo Técnico***
1. App Next.js + Tailwind + shadcn/ui
2. API route `/api/sign-register` lê chave privada de env, retorna `{ signature, nonce, expiry, trackId }`
3. Frontend usa M16 hooks para construir e submeter txs
4. Mana decay renderizada com animação (re-fetch a cada 5s e interpolação client-side)

***Modelo de Dados*** — reaproveita types do M15/M16.

***Entregáveis***
- App deployada em URL pública (Vercel)
- Vídeo de demo (3-5 min) walking through user journey
- Repo `app/` no monorepo

***Critério de Aceite***
- Juiz consegue, em &lt; 10 min: conectar wallet → registrar → ver Mana → criar proposta → votar → executar → ver transferência

---

### MÓDULO 18 — Suite de Testes Bankrun + Devnet Deploy

**Goal:** Bateria de testes determinísticos cobrindo todas as KRN, mais script reprodutível de deploy em devnet com seed data.

***Escopo***
- ~50 testes Bankrun (paridade com 53 Soroban)
- Cobertura explícita das 5 mitigações KRN
- Script `migrations/deploy.ts` que faz initialize dos 3 programas + seed inicial de 5 valores + 1 Guardian + 1 Credit Authority de demo
- Snapshot de endereços em `solana/deployments/devnet.json`
- **CLI Demo Harness:** script TS que executa o fluxo completo (register → mint → propose → vote → execute → withdraw scholarship) end-to-end via SDK em devnet, gravável para o vídeo de submission

***Fluxo Técnico***
1. Estrutura `tests/{valocracy,governor,treasury,integration,krn}.spec.ts`
2. Helpers compartilhados: `setupBankrun()`, `bootstrapKarn()` que faz initialize completo
3. Cada KRN tem arquivo dedicado com 1+ teste demonstrando a vulnerabilidade pre-fix e o fix funcionando
4. `migrations/deploy.ts` lê env, deploya 3 programs em devnet, calcula PDAs determinísticas, faz initialize, popula seed
5. CLI Demo Harness em `solana/scripts/demo.ts` executa flow completo com logs verbosos para gravação

***Modelo de Dados*** — N/A (testes e scripts).

***Entregáveis***
- ≥ 50 testes Bankrun verdes
- Deploy reproduzível em devnet
- `deployments/devnet.json` com endereços dos 3 programs
- Script `demo.ts` que gera vídeo-friendly logs do fluxo completo
- Vídeo de submission (3-5 min) gravado a partir do CLI demo

***Critério de Aceite***
- `anchor test` retorna 0 com 50+ testes
- Re-execução de `deploy.ts` em wallet limpa produz endereços determinísticos
- Os 5 KRNs têm pelo menos 1 teste cada que falha sem o fix e passa com ele

---

## 4. Cronograma

10 dias úteis, solo dev, ritmo serial. Phase 5 (M16+M17 demo dApp) cortados para stretch; M18 (Bankrun + CLI demo) substitui para a submission.

| Dia | Fase | Módulos | Marcos de Entrega |
|---|---|---|---|
| 1 | Fundamentos | M1, M2 | Workspace compilando, seeds documentadas, errors/events shells |
| 2 | Core | M3 | Valocracy initialize + state PDAs com testes |
| 3 | Core | M4 | Mint + guardian_mint funcionais; KRN-05 testado |
| 4 | Core | M5 | Self-register com Ed25519 precompile validado |
| 5 | Reputação | M6, M7 | Mana + decay + activity credits + circuit breaker |
| 6 | Reputação + Tesouraria | M8, M9, M10 | update_primary, revoke, set_verified, Treasury vault |
| 7 | Tesouraria | M11, M12 | CPI Valocracy → Treasury, Lab/Scholarship com KRN-01 |
| 8 | Governança | M13 | Governor propose + config + snapshot |
| 9 | Governança | M14 | Voting + execute + KRN-02 + KRN-03 + dispatch ProposalAction |
| 10 | Integração + Demo | M15 (mínimo) + M18 | SDK alpha, suite Bankrun completa, devnet deploy, CLI demo gravado, submission |

**Buffer:** zero. Se algum módulo estourar, **drop priority order**: M16/M17 (já fora) → M15 polish → M9 (set_verified pode virar próx-versão).

**Paralelizações impossíveis (solo):** todas. Cronograma é serial.

---

## 5. Equipe

| Papel | Pessoa | Responsabilidade |
|---|---|---|
| Solo developer | (você) | On-chain Rust (Anchor), TypeScript SDK, testes, deploy, demo, submission |

Sem time. Implicações:
- Sem code review interno — compensar com testes Bankrun cobrindo KRNs explicitamente
- Sem designer — Demo dApp (M17) fica como stretch; CLI demo é fallback
- Sem PM — este PRD é o backlog; cronograma da Seção 4 é a única source of truth de progresso
- Cuidados: dormir, não acumular dívidas técnicas que custem 1+ dia para limpar (o cronograma não tem buffer)

---

## 6. Decisões Técnicas e Premissas

| ID | Decisão | Justificativa |
|---|---|---|
| DT-01 | SBT como PDA custom (não Token-2022) | Paridade conceitual com Stellar; estado custom é necessário de qualquer forma; UX de "não aparece em Phantom" é aceitável para hackathon |
| DT-02 | ProposalAction como enum tipado (10 variantes) | Determinismo de accounts em CPI; Bankrun-friendly; UI render por variante; CPI genérica via Instruction fica para v2 |
| DT-03 | Self-register via Ed25519 precompile + Instructions sysvar | Replica fielmente o backend signing do Stellar; precompile é nativo e barato; preserva narrativa de onboarding |
| DT-04 | Cross-program **reads** sem CPI; **writes** via CPI signed-by-PDA | CPI custa CU; reads de UserStats/Valor são puros e podem ser feitos lendo a account direto; writes precisam de CPI para auth |
| DT-05 | Governor PDA assina CPI no `execute` via `seeds=[b"gov_config", bump]` | Substitui o `require_auth(governor)` do Soroban; Governor PDA é o único caller autorizado de mutações governadas |
| DT-06 | Reentrancy via `locked: bool` em state PDAs (Treasury + Governor) | Mesmo padrão do Soroban; necessário porque execute faz CPI e poderia ser reentrante via ações maliciosas |
| DT-07 | Aritmética: `u128` em mana e vault math; `checked_*` em monetário | Mantém mitigação KRN-04 do Stellar |
| DT-08 | Storage: PDAs com `init`; `realloc` apenas para `Vec<u64>` em GuardianTracks/CreditAuthority com cap de 32 | Solana cobra rent uma vez (não tem TTL Soroban); cap evita explosão de space |
| DT-09 | Taxonomia de IDs e tracks idêntica ao Stellar v2 | Badges 0/1/10-19/20-59/60-69/70-79; tracks 1=Tech, 2=Design, 3=Marketing, 4=Legal, 5=Finance |
| DT-10 | Resolução das contradições v2: D1=Founder decai como qualquer outra; D2=`(level - floor) × ratio`; D3=`self_register` aceita track_id no payload | Decisão limpa para a versão Solana, sem arrastar débito da v2 Stellar; documentar divergência se aparecer |
| DT-11 | Asset token padrão = USDC devnet | Ativo conhecido pelos juízes; demo realista; configurável no init para mainnet |
| DT-12 | Cluster devnet para hackathon; upgrade authority = chave do dev (não Governor PDA na v1) | Evita complicação de governance-controlled upgrade na primeira versão; transferência de upgrade authority documentada como follow-up |

---

## 7. Riscos e Mitigações

| ID | Risco | Probabilidade | Mitigação |
|---|---|---|---|
| R1 | Compute budget estourado em `execute` (CPI + SPL transfer + reentrancy state) | Média | Profilar com `solana-bench` no Dia 9; se estourar 200k CU, requisitar 400k; pior caso, dividir em `prepare_execute` + `finalize_execute` |
| R2 | Dispatch de `ProposalAction` exigir `remaining_accounts` por variante torna client complexo | Alta | SDK fornece helper por variante (M15) que monta o array; sem isso, demo não roda |
| R3 | Ed25519 precompile mal-validado deixa rota de bypass em `self_register` | Média | 5 testes negativos no M5 cobrindo: precompile ausente, payload divergente, signer ≠ Config.signer, nonce reusado, expiry vencido |
| R4 | `Vec<u64>` em GuardianTracks/CreditAuthority excede space alocado | Baixa | Cap de 32 tracks por authority; realloc dinâmico só sob o cap; rejeição em set_* se ultrapassar |
| R5 | Diferença sutil de timestamp (slot-based Solana via Clock vs ledger Soroban) corromper testes de decay | Média | Toda lógica usa `Clock::get()?.unix_timestamp` (i64); helper Bankrun fixa o clock; fixtures de Mana cruzadas Stellar↔Solana |
| R6 | Cronograma de 10 dias estourar | Alta | Cut-line definida: M17 demo dApp → CLI demo (M18); M16 hooks React → omitir; M15 SDK → mínimo viável (sem React, só clients tipados) |
| R7 | Backend signing key vazada no Next.js demo | Baixa | Stretch goal (M17) usaria chave dedicada de devnet, rotacionada antes da apresentação; documentar como "demo-only key" |

---

## 8. Métricas de Sucesso do MVP

Avaliáveis no momento da submission:

1. **3/3 programas Anchor** com `cargo build-sbf` verde e IDLs publicados em `solana/target/idl/`
2. **≥ 50 testes Bankrun** passando (paridade com 53 testes Soroban)
3. **5/5 mitigações KRN** demonstráveis com teste dedicado (1+ teste por KRN-01..05)
4. **End-to-end demo** em devnet: `self_register → guardian_mint → propose → vote → execute → treasury.transfer` em &lt; 5 minutos de wall-clock
5. **Compute budget**: nenhuma instrução excede 200k CU; `execute` &lt; 350k CU em pior caso
6. **SDK npm publicado** (`@karn_lat/protocol-sdk-solana@0.1.0-alpha.1`) com tipos exportados e ≥ 1 exemplo funcional
7. **Devnet deploy reproduzível**: re-execução de `deploy.ts` produz endereços determinísticos e seed data idêntica
8. **Vídeo de submission** (3-5 min) gravado a partir do CLI demo (M18) cobrindo a jornada completa

---

## 9. Escopo Futuro / Implementar Se Houver Tempo

Estas são features de **escopo real do protocolo** que cabem cortar do MVP do hackathon sem comprometer a tese Valocracia. Ordenadas por leverage para a submission:

1. **Demo dApp Next.js completa (M17)** — substitui o CLI demo por interface visual; alto impacto na avaliação dos juízes; custo ~2 dias
2. **Wallet Adapter + Hooks React (M16)** — pré-requisito da Demo dApp; sem ele a dApp tem boilerplate de Wallet Standard; custo ~0.5 dia
3. **Token-2022 NonTransferable mirror dos badges PDA** — para que SBTs apareçam em Phantom/Backpack; mantém PDA como source of truth, espelha como token; custo ~1 dia
4. **Generic ProposalAction** — variante `RawCpi { instruction: Instruction, accounts: Vec<AccountMeta> }` ao lado do enum tipado, para CPIs arbitrárias; custo ~1.5 dia
5. **Suite de upgrades de programa governada** — Governor PDA chama BPF Loader Upgradeable; substitui upgrade authority do dev; custo ~1 dia
6. **Indexador GraphQL** (Helius/Triton webhooks → Postgres) para listar histórico de proposals e badges; custo ~2 dias
7. **Squads multisig** como upgrade authority alternativo enquanto governance bootstrapa; custo ~0.5 dia
8. **Compressed NFTs (cNFTs)** para badges Community (range 60–69), reduzindo rent de mints frequentes; custo ~2 dias
9. **Anchor IDL versionado on-chain** + auto-discovery no SDK; custo ~1 dia
10. **DAO mobile companion** (React Native + Solana Mobile Stack) com seed vault; custo ~3-5 dias
11. **Cross-chain identity bridge (Wormhole)** lendo Mana do Stellar Karn para um DAO Solana, e vice-versa; custo ~5+ dias (escopo de v2 do protocolo)
12. **Monitoring dashboards** (Grafana + Solana RPC node metrics) para o dia da apresentação; custo ~0.5 dia

---

## 10. Verification

Após implementação, validar end-to-end com os passos abaixo. Cada passo é executável e produz output verificável.

### 10.1 Verificação local (workspace)

```bash
cd solana
anchor build                            # 3 programs compilam
anchor test                             # 50+ testes Bankrun passam
cargo test -p karn-shared               # testes de mana/vault math
```

Esperado: 0 errors, 0 warnings nos programs; suite reporta KRN-01..05 explicitamente.

### 10.2 Verificação devnet

```bash
solana config set --url devnet
solana airdrop 10                       # wallet de deploy
anchor deploy --provider.cluster devnet
ts-node migrations/deploy.ts            # initialize + seed
ts-node scripts/demo.ts                 # CLI demo end-to-end
```

Esperado: 3 endereços de program em `deployments/devnet.json`; CLI demo imprime cada step com tx signature; jornada completa &lt; 5 min wall-clock.

### 10.3 Verificação SDK

```bash
cd solana-sdk
npm test                                # Jest cross-fixtures Stellar↔Solana
npm pack                                # gera tarball
cd /tmp && mkdir karn-test && cd karn-test
npm init -y && npm install /caminho/karn-protocol-sdk-solana-*.tgz
echo 'import { ValocracyClient } from "@karn_lat/protocol-sdk-solana"; console.log(ValocracyClient);' > test.mjs
node test.mjs                           # imprime [class ValocracyClient]
```

Esperado: pacote instalável em projeto vazio, exports tipados.

### 10.4 Verificação KRN (5 testes dedicados)

Cada KRN tem um arquivo `tests/krn/krn-0X.spec.ts`:
- **KRN-01:** demonstra que shareholder não consegue redimir restricted reserves
- **KRN-02:** demonstra que vote conta Mana em `creation_time`, não em vote time
- **KRN-03:** demonstra que proposta com participation &lt; 4% é Defeated independente de for_pct
- **KRN-04:** demonstra que `calculate_mana` não overflow para inputs extremos
- **KRN-05:** demonstra que `guardian_mint` exige dual-auth (guardian + account ambos signers)

`anchor test --tests krn` deve retornar 5/5 verdes.

### 10.5 Verificação para submission

- [ ] Repo público no GitHub com README explicando dual-implementation Stellar+Solana
- [ ] `deployments/devnet.json` commitado com endereços reais
- [ ] Vídeo de submission (3-5 min) com link no README
- [ ] PRD (este documento) commitado em `docs/solana/PRD.md`
- [ ] Tag git `solana-frontier-submission` apontando para o commit final

---

## 11. Arquivos Críticos de Referência (paridade Stellar)

Os módulos deste PRD traduzem 1:1 funcionalidade já implementada e auditada na versão Stellar. Os arquivos abaixo são a **fonte de verdade canônica** para cada decisão de paridade — se houver dúvida sobre comportamento esperado, ler o Soroban antes de improvisar:

| Arquivo Stellar | Cobertura no PRD |
|---|---|
| `contracts/valocracy/src/lib.rs` | Módulos 3, 4, 5, 6, 7, 8, 9 |
| `contracts/valocracy/src/types.rs` | Modelos de dados M3, M6 |
| `contracts/valocracy/src/storage.rs` | Convenções de PDA M2 (mapping de keys) |
| `contracts/valocracy/src/errors.rs` | Erros M2 |
| `contracts/governor/src/lib.rs` | Módulos 13, 14 |
| `contracts/governor/src/proposal.rs` | ProposalAction enum (DT-02), Proposal struct (M13) |
| `contracts/governor/src/voting.rs` | Lógica de cast_vote e state (M14) |
| `contracts/treasury/src/lib.rs` | Módulos 10, 11, 12 |
| `contracts/treasury/src/vault.rs` | Vault math com virtual offsets (M10) |
| `docs/karn-protocol-update-v2.md` | Especificação v2 (tracks, activity, secondary_rarity) |
| `docs/V2_REMAINING_WORK.md` | Decisões D1, D2, D3 (resolvidas em DT-10) |
| `docs/SECURITY_HARDENING.md` | Referência canônica para KRN-01..05 |
| `sdk/src/clients/ValocracyClient.ts` | Padrão de API que SDK Solana espelha (M15) |

---

## Anexo A — Tabela de Mapeamento Stellar → Solana

| Conceito Stellar | Equivalente Solana |
|---|---|
| `#[contract]` com storage interno | Programa Anchor + PDAs por entidade |
| `Env::storage().instance/persistent` | PDAs derivadas de seeds canônicos (M2) |
| `Address` | `Pubkey` |
| `require_auth()` | `Signer<'info>` (Anchor) + check explícito quando PDA |
| `env.invoke_contract(addr, fn, args)` | `invoke_signed(...)` (CPI) com lista explícita de accounts |
| `#[contractevent]` + `.publish()` | `#[event]` + `emit!(...)` |
| `to_xdr` | Borsh serialize |
| `env.crypto().ed25519_verify` | Ed25519 SigVerify precompile + Instructions sysvar (M5) |
| `extend_instance_ttl` | Anchor `init` com rent-exempt (paga 1x, fica) |
| `update_current_contract_wasm` | `solana program deploy` (BPF Loader Upgradeable) |
| `token::TokenClient` (SAC) | SPL Token via `token::Token` Anchor program |
| Soulbound: check em código | Custom PDA (DT-01); Token-2022 NonTransferable é stretch |

---

**Fim do PRD.** Próximo passo após aprovação: sair do plan mode e iniciar M1 (Workspace Anchor) no Dia 1.
