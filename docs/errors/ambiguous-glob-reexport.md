# Ambiguous glob re-export entre `initialize::handler` e `set_valor::handler`

**Data:** 2026-04-30
**Módulo:** M3
**Severidade:** Bloqueante (clippy `-D warnings` reprova)
**Tempo gasto:** ~5 minutos

## Sintoma

Após criar `programs/valocracy/src/instructions/{initialize,set_valor}.rs` cada um com `pub fn handler(...)`, e fazer `pub use initialize::*; pub use set_valor::*;` em `instructions/mod.rs`:

```
error: ambiguous glob re-exports
   --> programs/valocracy/src/instructions/mod.rs:5:9
    |
5   | pub use initialize::*;
    |         ^^^^^^^^^^^^^ the name `handler` in the value namespace
                          is first re-exported here
6   | pub use set_valor::*;
    |         ^^^^^^^^^^^^ but the name `handler` in the value namespace
                          is also re-exported here
    |
    = note: `-D ambiguous-glob-reexports` implied by `-D warnings`
```

## Root cause

Cada submódulo de `instructions/` define sua própria `pub fn handler(...)`. Glob re-export traz ambas para o mesmo namespace, e clippy detecta a colisão potencial.

A ambiguidade é **benigna** no nosso caso porque todas as chamadas qualificam o path (`instructions::initialize::handler(ctx, ...)` em `lib.rs`), mas clippy não consegue verificar uso a uso — ele reprova no ponto da re-exportação.

Tentativa intermediária: re-exportar apenas as Accounts structs (`pub use initialize::Initialize; pub use set_valor::SetValor;`) sem glob. Isso quebrou o macro `#[program]` porque ele precisa do módulo auto-gerado `__client_accounts_<name>` em scope, que vem junto com o glob re-export.

## Fix aplicado

Manter o glob re-export e silenciar o lint **localmente** com justificativa em comment:

```rust
// programs/valocracy/src/instructions/mod.rs

#[allow(ambiguous_glob_reexports)]
pub use initialize::*;
#[allow(ambiguous_glob_reexports)]
pub use set_valor::*;
```

A doc-comment do módulo explica por que o `#[allow]` é seguro:

> Multiple modules export `handler`, but every call site qualifies the path
> (`instructions::initialize::handler`) — the glob ambiguity is benign and
> we silence the lint locally.

## Como evitar de novo

Quando M4+ adicionar mais instruções (cada uma com seu `handler`), considerar **renomear** as funções para evitar a colisão:

```rust
// instructions/initialize.rs
pub fn run(...) -> Result<()> { ... }

// instructions/set_valor.rs
pub fn run(...) -> Result<()> { ... }
```

Aí `instructions::initialize::run`, `instructions::set_valor::run` — sem ambiguidade. Mas isso diverge da convenção Anchor que ensina `handler` em todos os tutoriais. Manter `handler` + `#[allow]` é menos surpresa.

Outra alternativa: in-line a chamada do handler em `lib.rs` em vez de delegar para `instructions::<name>::handler`. Mais código no `#[program]` mas elimina a necessidade de re-exportar.

## Decisão relacionada

Não justifica ADR — é decisão local de estilo, não estrutural.
