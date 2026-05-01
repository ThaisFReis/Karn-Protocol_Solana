# ADR-0001 — `karn-shared` em `crates/`, não em `programs/`

**Data:** 2026-04-30
**Status:** Aceito
**Decisor:** Solo developer
**Contexto:** M1 — Workspace Anchor + Tooling

## Contexto

O PRD (Módulo 1) e a versão original do `CONFIG.md` previam que a crate compartilhada `karn-shared` ficaria em `programs/karn-shared/` ao lado dos 3 programs Anchor. A intenção era: tudo que é "código de protocolo" mora em `programs/`.

Durante a execução do M1, `anchor build` falhou com:

```
Error: `idl-build` feature is missing. To solve, add
[features]
idl-build = ["anchor-lang/idl-build"]
in `programs/karn-shared/Cargo.toml`.
```

Após adicionar a feature, o erro virou:

```
Error: IDL doesn't exist
```

A causa raiz é que **Anchor itera sobre todos os subdirs de `programs/` e tenta extrair IDL de cada um como se fosse um programa**. `karn-shared` é uma lib crate sem `#[program]` nem entrypoint, então não tem IDL pra extrair, e o build quebra.

Detalhes em [errors/karn-shared-idl-extraction.md](../errors/karn-shared-idl-extraction.md).

## Decisão

**`karn-shared` vive em `crates/karn-shared/`, não em `programs/karn-shared/`.**

Convenção do repo a partir daqui:

- `programs/` — somente Anchor programs (`crate-type = ["cdylib", "lib"]` + `#[program]`)
- `crates/` — libs compartilhadas (regular `lib`, sem `cdylib`, sem `#[program]`)

`Cargo.toml` workspace passa a ter `members = ["programs/*", "crates/*"]`. Cada program declara `karn-shared = { path = "../../crates/karn-shared" }`.

## Alternativas consideradas

- **A — Manter em `programs/karn-shared/` e adicionar exclusão em `Anchor.toml`.** Rejeitada: Anchor 0.32.1 não tem mecanismo limpo de excluir um membro do build IDL. Exigiria patches ou hacks.
- **B — Manter em `programs/karn-shared/` e fingir que é um program (vazio).** Rejeitada: introduz cdylib desnecessário, gera artifacts que nunca são deployados, polui IDL output, confunde leitor.
- **C — Mover para `crates/karn-shared/`.** **Escolhida.** Convenção limpa, padrão de muitos workspaces Anchor da comunidade (ex: Squads, Drift), separação semântica forte ("aqui são programas, ali são libs").
- **D — Fundir `karn-shared` no `lib.rs` de cada program.** Rejeitada: força triplicação de constantes, seeds, e helpers — exatamente o problema que justifica ter a crate.

## Consequências

- **Positiva:** convenção clara `programs/* = Anchor program`, `crates/* = lib`. Anchor build não interfere com lib crates. Padrão alinhado com workspaces Solana de referência.
- **Positiva:** se precisarmos de outras libs no futuro (ex: `karn-test-utils`), elas já têm onde morar.
- **Negativa:** path em cada program Cargo.toml fica `../../crates/karn-shared` (1 nível a mais). Custo cosmético.
- **Risco mitigado:** futuros desenvolvedores não precisam re-aprender o erro Anchor — o CONFIG.md tem a regra explícita.

## Como reverter (se necessário)

1. `mv crates/karn-shared programs/karn-shared`
2. Atualizar `members` no `Cargo.toml` raiz para só `["programs/*"]`
3. Atualizar `path = "../karn-shared"` em cada program Cargo.toml
4. Encontrar mecanismo de exclusão de Anchor IDL (provável fork de Anchor ou monkey-patch)

Não recomendado.

## Referências

- PRD seção 3 Módulo 1
- CONFIG.md, "Estrutura do Repositório" e Regra 13
- Erro original: `errors/karn-shared-idl-extraction.md`
