# ADR-0004 — Splitting `mint` por categoria de auth

**Data:** 2026-04-30
**Status:** Implementado
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

**Agora implementado:**

- `mint_community(valor_id, token_id)` — qualquer member com `credential_level > 0` minta para outro account em Community range.

Comunidade agora é exercida em testes Bankrun dedicados, sem alterar o shape estático de accounts do path Governor.

## Alternativas consideradas

- **A — `Option<Account>` em `mint`.** Considerada. Anchor 0.30+ suporta, mas semântica "passe Pubkey default = None" é frágil em testes; SDK Codama em M15 traduz menos limpo. Rejeitada.
- **B — Implementar `mint_community` agora.** Considerada. Acabou sendo o caminho adotado depois da estabilização do core, mantendo `mint` Governor-only e adicionando uma instrução dedicada para Community.
- **C — `mint` único Governor-only + `mint_community` adiado.** Foi a decisão inicial de escopo, mas deixou de valer após a implementação da instrução dedicada.

## Consequências

- **Positiva:** M4 fica focado e testável. Cada instrução tem uma única auth path → testes diretos.
- **Positiva:** `apply_mint` helper extraído em `mint.rs` foi reutilizado por `guardian_mint`, `mint_community` e `self_register`.
- **Positiva:** o path Community ficou testado sem introduzir `Option<Account>` no shape Governor.
- **Risco mitigado:** a divergência temporária da PRD foi encerrada com uma instrução dedicada de baixo acoplamento.

## Implementação final

O path final ficou exatamente no formato previsto:

- `programs/valocracy/src/instructions/mint_community.rs`
- `minter_stats: Account<'info, UserStats>` nas Accounts
- auth check `credential_level > 0`
- restrição explícita para `BadgeCategory::Community`
- reuso de `apply_mint`
- cobertura Bankrun para happy path e rejects

## Referências

- PRD §3 Módulo 4
- CONFIG.md → "Decisões Arquiteturais"
- `programs/valocracy/src/instructions/mint.rs` (apply_mint helper)
- `programs/valocracy/src/instructions/guardian_mint.rs`
- ADR-0003 (decisão correlata: split de bootstrap genesis)
