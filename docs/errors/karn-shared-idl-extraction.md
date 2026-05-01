# `karn-shared` IDL extraction failure no `anchor build`

**Data:** 2026-04-30
**Módulo:** M1
**Severidade:** Bloqueante (build não passa)
**Tempo gasto:** ~10 minutos

## Sintoma

Após criar `programs/karn-shared/` como crate compartilhada (sem `#[program]`, sem `cdylib`), `anchor build` falhou primeiro com:

```
Error: `idl-build` feature is missing. To solve, add

[features]
idl-build = ["anchor-lang/idl-build"]

in `"/home/dalekthai/Documentos/Workspace/Karn-Protocol-Solana/programs/karn-shared/Cargo.toml"`.
```

Após adicionar a feature, o build avançou mais e parou com:

```
Compiling karn-shared v0.1.0 (.../programs/karn-shared)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 12.41s
     Running unittests src/lib.rs (.../target/debug/deps/karn_shared-da24a55d640aed23)
Error: IDL doesn't exist
```

## Root cause

Anchor 0.32.1 trata todos os subdirs de `programs/` como **Anchor programs** durante `anchor build`. O pipeline:

1. Faz `cargo build-sbf` em cada um (passa, mesmo sendo lib regular).
2. Em seguida tenta extrair IDL via macros expansion + reflection.
3. Lib crate sem `#[program]` não exporta IDL → "IDL doesn't exist".

Não há flag de exclusão por membro em `Anchor.toml` 0.32. O pipeline assume contrato "tudo em `programs/` é program".

## Fix aplicado

Movido `karn-shared` para fora de `programs/`:

```bash
mkdir -p crates
mv programs/karn-shared crates/karn-shared
```

Atualizações:

- `Cargo.toml` (workspace): `members = ["programs/*", "crates/*"]`
- `programs/{valocracy,governor,treasury}/Cargo.toml`: `karn-shared = { path = "../../crates/karn-shared" }`

`anchor build` passa limpo, IDLs corretos gerados em `target/idl/{valocracy,governor,treasury}.json`.

## Como evitar de novo

**Regra:** `programs/` contém **apenas Anchor programs**. Lib crates compartilhadas vão em `crates/`.

Documentado em:

- `CONFIG.md` → "Estrutura do Repositório" (regra explícita) + Regra Imutável 13
- ADR-0001 — `karn-shared` em `crates/`, não em `programs/`

## Decisão relacionada

[ADR-0001](../decisions/0001-karn-shared-location.md)
