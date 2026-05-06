# Karn Protocol Solana — Checklist Executável

**Data:** 2026-05-06
**Escopo:** fechar gaps restantes após estabilização da Fase 1
**Status base:** `cargo test --workspace` verde, `npm test` verde, CI corrigido

---

## Como usar

Execute os itens em ordem. Não pule a validação de cada fase.

Critério de avanço:
- código alterado
- validação local verde
- documentação mínima atualizada

---

## Fase 1 — Estabilização

### Objetivo

Manter a base confiável antes de mexer em deploy/demo.

### Status

- [x] Corrigir suíte Rust
- [x] Corrigir suíte Bankrun
- [x] Remover mascaramento de falhas no CI
- [x] Atualizar README do subprojeto

### Comandos de validação

```bash
cargo test --workspace
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node /home/dalekthai/.nvm/versions/node/v24.14.1/bin/npm test
```

---

## Fase 2 — Deploy Reproduzível

### Objetivo

Implementar o deploy real de devnet para fechar a parte operacional do M18.

### Arquivos-alvo

- `migrations/deploy.ts`
- `deployments/devnet.json`
- `README.md`

### Tarefas

- [x] Substituir o stub de `migrations/deploy.ts` por fluxo real
- [x] Inicializar `valocracy`
- [x] Inicializar `governor`
- [x] Inicializar `treasury`
- [x] Criar seed data mínima de demo
- [x] Persistir addresses e PDAs relevantes em `deployments/devnet.json`
- [x] Documentar variáveis/envs necessárias
- [x] Rotacionar `valocracy.governor` para `gov_config`
- [x] Rotacionar `treasury.governor` para `gov_config`
- [x] Atualizar `valocracy.treasury` para a `TreasuryState` PDA

### Seed data mínima

- [x] 5 `Valor`
- [x] 1 Guardian
- [x] 1 CreditAuthority
- [x] 1 Lab de bolsa

### Critério de aceite

- [x] `anchor deploy --provider.cluster devnet` executa sem passos manuais fora da wallet
- [x] `migrations/deploy.ts` popula o protocolo em estado utilizável de demo
- [x] `deployments/devnet.json` é gerado/atualizado com os endereços corretos
- [x] o handoff final de autoridade acontece on-chain ao fim do bootstrap

### Comandos de validação

```bash
anchor build
anchor deploy --provider.cluster devnet
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node ./migrations/deploy.ts
cat deployments/devnet.json
```

---

## Fase 3 — CLI Demo Harness

### Objetivo

Fechar o substituto de M16/M17 para hackathon: fluxo end-to-end reproduzível por CLI.

### Arquivos-alvo

- `scripts/demo.ts`
- `package.json`
- `README.md`

### Tarefas

- [x] Criar `scripts/demo.ts`
- [x] Conectar provider/wallet devnet
- [x] Executar `self_register`
- [x] Executar `mint`/`guardian_mint` de demonstração
- [x] Criar proposta
- [x] Votar
- [x] Executar proposta
- [x] Aprovar e sacar scholarship
- [x] Emitir logs legíveis para gravação

### Critério de aceite

- [x] Um único comando executa o fluxo completo
- [x] O output é legível e demonstra a tese do protocolo
- [x] O fluxo usa os programas já deployados em devnet

### Comandos de validação

```bash
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node ./scripts/demo.ts
```

---

## Fase 4 — SDK Consumível

### Objetivo

Fechar o M15 de forma operacional, não apenas estrutural.

### Arquivos-alvo

- `sdk/package.json`
- `sdk/tsconfig.json`
- `sdk/src/index.ts`
- `sdk/README.md`
- `sdk/dist/*`

### Tarefas

- [x] Adicionar build de distribuição para `sdk/`
- [x] Gerar saída em `dist/`
- [x] Corrigir `main`, `types` e possivelmente `exports`
- [x] Confirmar import em projeto externo mínimo
- [x] Documentar fluxo de build/publicação

### Critério de aceite

- [x] `npm pack` gera pacote utilizável
- [x] `import { ValocracyClient } from "@karn_lat/protocol-sdk-solana"` funciona fora do monorepo

### Comandos de validação

```bash
cd sdk
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node /home/dalekthai/.nvm/versions/node/v24.14.1/bin/npm run lint
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node /home/dalekthai/.nvm/versions/node/v24.14.1/bin/npm test
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node /home/dalekthai/.nvm/versions/node/v24.14.1/bin/npm pack
```

---

## Fase 5 — Gap Funcional Residual

### Objetivo

Decidir e, se necessário, implementar `mint_community`.

### Arquivos-alvo

- `programs/valocracy/src/instructions/mint_community.rs`
- `programs/valocracy/src/lib.rs`
- `programs/valocracy/src/instructions/mod.rs`
- `tests/valocracy/*`
- `docs/modules/`

### Tarefas

- [x] Decidir se entra antes do demo final
- [x] Implementar path de auth por membro
- [x] Adicionar testes de autorização e happy path
- [x] Atualizar docs/ADR se necessário

### Critério de aceite

- [x] Member badge holder consegue mintar Community badge conforme regra definida

---

## Fase 6 — Documentação Final

### Objetivo

Eliminar drift entre código, docs e estado operacional.

### Arquivos-alvo

- `README.md`
- `docs/modules/M18.md`
- `docs/README.md`
- `docs/IMPLEMENTATION_CHECKLIST.md`

### Tarefas

- [x] Atualizar status de módulos
- [x] Registrar conclusão real do M18
- [x] Incluir comandos reais de deploy/demo
- [x] Documentar limites conhecidos

---

## Ordem Recomendada

1. Fase 2 — Deploy reproduzível
2. Fase 3 — CLI demo harness
3. Fase 4 — SDK consumível
4. Fase 5 — `mint_community` se ainda fizer sentido
5. Fase 6 — documentação final

---

## Definição de pronto

O restante estará realmente fechado quando:

- [x] `cargo test --workspace` continuar verde
- [x] `npm test` continuar verde
- [x] `anchor deploy --provider.cluster devnet` + `migrations/deploy.ts` forem reproduzíveis
- [x] `scripts/demo.ts` rodar o fluxo completo
- [x] `deployments/devnet.json` existir e estar atualizado
- [x] o SDK puder ser empacotado/importado fora do monorepo
