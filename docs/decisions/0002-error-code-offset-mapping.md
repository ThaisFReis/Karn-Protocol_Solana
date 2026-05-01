# ADR-0002 — Mapping de códigos de erro entre Stellar e Anchor

**Data:** 2026-04-30
**Status:** Aceito
**Decisor:** Solo developer
**Contexto:** M2 — Convenções de PDA, Erros e Eventos

## Contexto

A versão Stellar/Soroban do Karn usa `#[contracterror]` com `#[repr(u32)]` e atribui códigos explícitos: `AlreadyInitialized = 1`, `NotInitialized = 2`, etc. SDKs Stellar decodificam erros pelo número.

O PRD (M2 Critério de Aceite) pede: *"Cada erro Stellar tem correspondente Solana com mesmo código numérico"*.

Anchor 0.32.1 implementa erros via `#[error_code]` macro, que:

- Não permite atribuir discriminantes explícitos como Soroban (`= 1`, `= 2`).
- Adiciona automaticamente um **offset de 6000** quando o erro é convertido para `anchor_lang::error::Error` (formato visível ao cliente).
- O cliente vê códigos `6000, 6001, 6002, ...`, não `1, 2, 3, ...`.

Tentativas de bypass:

- **`#[error_code(offset = 0)]`**: disponível, faz códigos virarem `0, 1, 2, ...`. Conflita com erros built-in de Anchor que vivem em `0..=99` e `100..=999` (`InstructionMissing = 100`, etc.). Tecnicamente possível mas anti-idiomático e quebra logs/parsers.
- **Custom `From` impls**: faria decodificação cliente fora do padrão Anchor. SDK Codama-gerada não saberia mapear.

## Decisão

**Manter Anchor's default offset (6000) e tratar a paridade como mapping de fórmula, não de igualdade numérica.**

A regra de paridade vira:

```
solana_anchor_code = 6000 + variant_index
stellar_code       = variant_index + 1
solana_anchor_code = stellar_code + 5999
```

A invariante real preservada é:

1. **Variant names** mirroreiam o Stellar 1:1 (mesmo nome do erro).
2. **Variant order** é idêntica (variante 0 do Solana = código 1 do Stellar).
3. **Quantidade total** é idêntica (18 valocracy, 13 governor, 11 treasury).

Tests automatizados (`first_and_last_variants_at_expected_index` e `variant_count_is_*`) cobrem essas três invariantes.

## Alternativas consideradas

- **A — Forçar `offset = 0` para igualdade exata.** Rejeitada: colide com Anchor built-ins, anti-idiomático, quebra ferramentas de log/parsing comuns.
- **B — Custom error type fora de Anchor.** Rejeitada: perde toda a ergonomia (`require!`, `err!`, msg!, etc.), perde IDL integration.
- **C — Aceitar offset 6000 + documentar mapping.** **Escolhida.** Menor surface de mudança, mantém ergonomia Anchor, SDK Codama mapeia corretamente, paridade preservada via nomes + ordering.

## Consequências

- **Positiva:** código permanece idiomático Anchor; macros `require!`, `err!`, `msg!` funcionam sem custom plumbing.
- **Positiva:** SDK Codama-gerada (M15) decodifica erros automaticamente sem tabela manual.
- **Negativa:** PRD critério "mesmo código numérico" não é literal — é via fórmula. Update no PRD reflete isso.
- **Negativa leve:** clientes cross-chain que loggam erros precisam saber a fórmula (ou usar mapping helper na SDK).
- **Risco mitigado:** testes em `programs/<each>/src/errors.rs::tests` falham se ordering/contagem mudar silenciosamente.

## Como reverter (se necessário)

1. Avaliar uso de `#[error_code(offset = 1)]` se Anchor 0.33+ permitir não-conflitar com built-ins.
2. Atualizar `programs/<each>/src/errors.rs` headers e tests.
3. Atualizar SDK Codama (M15) para novo offset.

Não recomendado a menos que a SDK cross-chain explicitamente exija parity numérica.

## Referências

- PRD §3 Módulo 2 (Critério de Aceite)
- CONFIG.md → "Decisões Arquiteturais" e "Documentação Obrigatória"
- `programs/valocracy/src/errors.rs` (header doc + testes)
- `programs/governor/src/errors.rs`
- `programs/treasury/src/errors.rs`
- Stellar reference: `~/Documentos/Workspace/Karn Protocol/contracts/valocracy/src/errors.rs`
