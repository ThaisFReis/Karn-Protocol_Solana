# ADR-0004 — Splitting `mint` por categoria de auth

**Data:** 2026-04-30
**Status:** Aceito
**Decisor:** Solo developer
**Contexto:** M4 — Mintagem de Badges

## Contexto

Stellar implementa `valocracy.mint(minter, recipient, valor_id)` como uma única função que dispatcheia o check de autorização internamente baseado na categoria do `valor_id`:

- Member / Founder: rejeitado (`BadgeNotMintable`)
- Leadership / Track / Governance: requer `minter == config.governor`
- Community: requer `minter` ter `credential_level > 0` (é membro)

Em Solana, cada path requer um shape de `Accounts` diferente:

- **Governor path:** sem `minter_stats` (governor pode não ter UserStats; é um Pubkey de programa em última instância).
- **Member path (Community):** precisa de `minter_stats: Account<'info, UserStats>` para verificar credential_level.

Anchor exige declaração estática de accounts. `Option<Account>` existe mas adiciona complicação (cliente passa Pubkey default para "None"; típo errado em testes vira NPE silencioso).

## Decisão

**M4 ship:**

- `mint(valor_id, token_id)` — Governor-only path; cobre Leadership/Track/Governance. Comunidade rejeitada nessa instrução com `MintNotAuthorized`.
- `guardian_mint(valor_id, token_id)` — Track-domain via Guardian dual-auth (KRN-05).
- `set_guardian_tracks` / `remove_guardian` — auth Guardian.

**Adiado para M5+ (provavelmente bundled com `self_register` ou novo módulo):**

- `mint_community(valor_id, token_id)` — qualquer member com credential_level > 0 minta para outro account em Community range.

Comunidade ainda não é exercida em testes; o demo do hackathon foca em fluxo Governor + Guardian + (futuro) self_register, que cobrem 100% da história Valocracia.

## Alternativas consideradas

- **A — `Option<Account>` em `mint`.** Considerada. Anchor 0.30+ suporta, mas semântica "passe Pubkey default = None" é frágil em testes; SDK Codama em M15 traduz menos limpo. Rejeitada.
- **B — Implementar `mint_community` agora.** Considerada. Cabe no escopo de M4 mas a fila de tests fica grande. Rejeitada por escopo; a lógica é trivialmente uma cópia de `mint` com auth check diferente, então o atraso é baixo risco.
- **C — `mint` único Governor-only + `mint_community` adiado (escolhida).** Aceita. Ship M4 com path Governor + Guardian; Community adiada.

## Consequências

- **Positiva:** M4 fica focado e testável. Cada instrução tem uma única auth path → testes diretos.
- **Positiva:** `apply_mint` helper extraído em `mint.rs` é reutilizável por `guardian_mint` (e por `mint_community` quando vier, e por `self_register` em M5).
- **Negativa:** Community minting fica não-testado até ser implementado. Para o hackathon, isso é aceitável — a tese se demonstra com Governor + Guardian. Se em M5 ou depois ficar claro que Community é central pra demo, priorizar.
- **Risco mitigado:** divergência da PRD documentada explicitamente (não é descoberta tarde).

## Como reverter (se necessário)

Trivial: criar `programs/valocracy/src/instructions/mint_community.rs` que duplica `mint.rs` com:

- Adiciona `minter_stats: Account<'info, UserStats>` nas Accounts
- Auth check: `require!(minter_stats.credential_level > 0, MintNotAuthorized);`
- Restringe `match category` para aceitar apenas `Community`

Wire em `lib.rs` como `pub fn mint_community(...)`. Custo estimado: ~1h incluindo testes.

## Referências

- PRD §3 Módulo 4
- CONFIG.md → "Decisões Arquiteturais"
- `programs/valocracy/src/instructions/mint.rs` (apply_mint helper)
- `programs/valocracy/src/instructions/guardian_mint.rs`
- ADR-0003 (decisão correlata: split de bootstrap genesis)
