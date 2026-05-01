# ADR-0003 — Splitting genesis bootstrap into discrete instructions

**Data:** 2026-04-30
**Status:** Aceito
**Decisor:** Solo developer
**Contexto:** M3 — Programa Valocracy: Estado e Inicialização

## Contexto

A versão Stellar/Soroban do Karn implementa `valocracy.initialize` como uma única função que aceita listas de genesis members + listas de valores e processa tudo em um único call:

```rust
pub fn initialize(
    env: Env,
    genesis_members: Vec<Address>,
    governor: Address,
    treasury: Address,
    member_valor_id: u64,
    valor_ids: Vec<u64>,
    valor_rarities: Vec<u64>,
    valor_metadatas: Vec<String>,
    leadership_valor_id: u64,
    signer: BytesN<32>,
) -> Result<(), ValocracyError>
```

Esse pattern funciona em Soroban porque não há compute budget agressivo nem limite de tamanho de transação que apertem nesse caso de uso.

Em Solana, dois limites apertam:

1. **Compute budget:** ~200k CU default (1.4M CU max). Iterar sobre `valor_ids` + `genesis_members` e alocar ~4 PDAs por member (UserStats, TokenOwner, TokenValorId, eventos de mint) custa ~10–20k CU por entidade. Para 5 members + 5 valors = ~150–200k CU, no limite.
2. **Transaction size:** 1232 bytes incluindo todas as account metas, instruction data e signatures. Listas de Pubkey (32 bytes cada) + listas de strings de metadata enchem rápido.

O PRD §3 (mapping Soroban→Solana) já antecipa: *"Loop de genesis no `initialize`: ... vira `initialize` + N × `add_genesis_member` + N × `set_valor`."*

## Decisão

**M3 implementa o split mínimo: `initialize` (singleton Config) + `set_valor` (per-valor, governor-only).**

Genesis members **não são processados em M3.** A criação dos primeiros badges acontece via `mint` regular (M4), chamado pelo deploy script o número necessário de vezes pelo governor. Isso aproveita a mesma instrução que será usada para mints normais (RBAC + effective_rarity + UserStats creation), sem duplicar lógica.

Concretamente:

- **M3 entrega:**
  - `initialize(governor, treasury, signer, member_valor_id, leadership_valor_id)` — Config singleton; `total_supply = 0`, `credit_paused = false`
  - `set_valor(valor_id, rarity, secondary_rarity, track_id, metadata)` — Governor-only, `init_if_needed` para create+update
- **M4 absorve:**
  - `mint(governor → genesis_member, leadership_valor_id)` chamado N vezes pelo deploy script
  - Esse path já é necessário para mints regulares; não precisa de instrução `add_genesis_member` separada

## Alternativas consideradas

- **A — `initialize` aceitando todas as listas (paridade Soroban literal).** Rejeitada: estoura compute budget e tx size para qualquer N realista. Viola o aviso explícito do PRD §3.
- **B — `initialize` + `add_genesis_member` (instrução separada).** Considerada: `add_genesis_member` seria essencialmente `mint` com auth diferente (open enquanto `genesis_open=true`). **Rejeitada:** duplica lógica que M4 já vai implementar. M4's `mint` chamado pelo governor com `valor_id == leadership_valor_id` produz o mesmo efeito. Manter uma instrução só reduz superfície de erro.
- **C — `initialize` + `set_valor` + `mint` em M4 (escolhida).** **Aceita.** Cada instrução tem responsabilidade única; bootstrap = `initialize` once + `set_valor` × N + `mint` × N (todos governor-signed durante deploy).

## Consequências

- **Positiva:** cada instrução cabe folgada nos limites de tx + compute. Loop de bootstrap fica do lado do deploy script (TS), não on-chain.
- **Positiva:** sem instrução `add_genesis_member` paralela ao `mint` — uma única lógica de mint exercitada em produção desde o dia 1.
- **Negativa:** o critério "Após initialize, `Config.total_supply == genesis_members.len()`" do PRD M3 não é mais válido para o módulo M3 isoladamente. A contagem fica `0` após `initialize` apenas. O critério é re-mapeado para M4 ("após N mint calls de leadership_valor_id por governor, total_supply == N").
- **Risco mitigado:** qualquer drift entre genesis mint e mint regular (que existiria se fossem instruções diferentes) está prevenido.

## Como reverter (se necessário)

Improvável precisar. Se uma instrução `add_genesis_member` virar útil (por exemplo, para janela de bootstrap fechável), criar como nova instrução em M4+ sem afetar M3.

## Referências

- PRD §3 (mapping note: *"compute budget e tx size forçam batching"*)
- PRD §3 Módulo 3 (Critério de Aceite — re-mapeado para M4)
- `programs/valocracy/src/instructions/initialize.rs`
- `programs/valocracy/src/instructions/set_valor.rs`
- `docs/modules/M3.md`
