# Karn Protocol — Solana

> Implementação Solana/Anchor do [Karn Protocol](https://github.com/ThaisFReis/karn-protocol), em paralelo à versão Stellar/Soroban existente.
>
> Submission para a **Solana Frontier** hackathon (Colosseum).

---

## O que é

Karn Protocol é uma infraestrutura de governança baseada em contribuição: **identidade soulbound + reputação por mérito + tesouro coletivo controlado por governança**. Substitui o modelo "1 token = 1 voto" por um modelo onde poder de voto (Mana) vem de contribuições verificáveis e decai com inatividade.

Esta versão Solana/Anchor é uma segunda implementação **em paralelo** à versão Stellar — não é migração. As duas redes coexistem com a mesma tese.

---

## Programas

| Programa | Endereço (Devnet) | Responsabilidade |
|---|---|---|
| `valocracy` | `6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf` | Identidade, soulbound badges, Mana com decay |
| `governor` | `6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm` | Propostas, voting com snapshot, execution |
| `treasury` | `97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV` | Vault SPL, transfers governance-only, scholarships |

---

## Stack

- **Framework:** Anchor 0.32.1
- **Solana CLI:** Agave 3.1+
- **Rust:** 1.94+
- **Cluster alvo:** Devnet (mainnet pós-hackathon)
- **Asset token:** USDC devnet
- **Crate compartilhada:** `karn-shared` (constants, seeds, math puro)

---

## Quick start

```bash
# build dos 3 programas
anchor build

# testes Rust
cargo test --workspace

# testes de integração (Bankrun)
npm test

# deploy em devnet (após `solana airdrop` na sua keypair)
anchor deploy --provider.cluster devnet
```

### Bootstrap de devnet

O deploy script em [`migrations/deploy.ts`](migrations/deploy.ts) agora faz o seed operacional de devnet:

- inicializa `valocracy`, `governor` e `treasury`
- cria ou reutiliza o `asset_mint`
- popula 5 `Valor`
- registra 1 `Guardian`
- registra 1 `CreditAuthority`
- minta 1 badge de liderança para o membro de demo
- cria 1 `Lab` de scholarship
- faz o handoff final de `valocracy` e `treasury` para `gov_config`
- escreve snapshot em `deployments/devnet.json`

Variáveis úteis:

- `KARN_ASSET_MINT`: reutiliza um mint SPL existente em vez de criar um novo
- `KARN_BACKEND_SIGNER`: pubkey usada em `Config.signer`
- `KARN_GUARDIAN`: pubkey do Guardian seeded
- `KARN_CREDIT_AUTHORITY`: pubkey da CreditAuthority seeded
- `KARN_DEMO_MEMBER`: pubkey que recebe o badge de liderança de demo

### CLI demo

```bash
/home/dalekthai/.nvm/versions/node/v24.14.1/bin/node /home/dalekthai/.nvm/versions/node/v24.14.1/bin/npm run demo:devnet
```

O script em [`scripts/demo.ts`](scripts/demo.ts) consome `deployments/devnet.json` e executa o fluxo real disponível hoje:

- funding do newcomer
- `self_register`
- `guardian_mint` de badge Tech
- criação de proposta para `TreasuryApproveScholarship`
- continuação automática para `vote`, `execute` e `withdraw` quando a janela temporal do Governor já estiver aberta/encerrada

Limitação atual do fluxo RPC:

- com os defaults atuais do Governor, `voting_delay = 1 dia` e `voting_period = 7 dias`
- então um fluxo completo `propose -> vote -> execute` não fecha na mesma sessão devnet sem fast-forward de clock ou parâmetros menores
- o script detecta isso e imprime os timestamps exatos de abertura e encerramento

Observação operacional:

- o deploy ainda usa uma wallet humana só durante o bootstrap
- ao final do seed, `valocracy.governor` e `treasury.governor` são rotacionados on-chain para `gov_config`
- `valocracy.treasury` passa a apontar para a `TreasuryState` PDA, não para o program id

---

## Estrutura

```
.
├── programs/
│   ├── valocracy/         # identity + badges + Mana
│   ├── governor/          # proposals + voting + execute
│   ├── treasury/          # SPL vault + scholarships
│   └── karn-shared/       # types, seeds, math (lib crate)
├── tests/                 # Bankrun + integration
├── migrations/            # deploy scripts
├── sdk/                   # thin TypeScript clients + helpers
└── target/                # build artifacts (ignored)
```

---

## Status

Primeira implementação funcional do protocolo Solana/Anchor. O roadmap canônico está em [`docs/PRD.md`](docs/PRD.md).

- **Entregue:** M1–M16 (core protocol + SDK + camada React, incluindo `mint_community`)
- **Pendente:** M17 (demo dApp), agora scaffoldado em `app/` mas ainda não validado em runtime neste checkout
- **Entregue:** M18 (deploy reproduzível, harness CLI e handoff final de autoridade para governança on-chain)

### Demo dApp scaffold

O diretório [`app/`](app/) agora contém um scaffold Next.js para o M17:

- painel de conexão de wallet
- `/api/sign-register`
- perfil com `self_register` + Mana
- painel de propostas
- painel de treasury/labs

Validação já feita:

- dependências instaladas em `app/`
- `tsc --noEmit` verde
- `next build` verde

Ainda falta a validação manual real com wallet de navegador em devnet.

---

## Licença

MIT — mesmo da versão Stellar.
