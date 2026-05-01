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

# testes (Bankrun)
anchor test

# deploy em devnet (após `solana airdrop` na sua keypair)
anchor deploy --provider.cluster devnet
```

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
├── app/                   # frontend stub (stretch goal — Module 17)
└── target/                # build artifacts (ignored)
```

---

## Status

Primeira implementação. Ver o **PRD em `docs/solana/PRD.md`** no repo Stellar para roadmap completo (18 módulos, 7 fases, cronograma de 10 dias).

**Módulo atual:** M1 — Workspace + Tooling.

---

## Licença

MIT — mesmo da versão Stellar.
