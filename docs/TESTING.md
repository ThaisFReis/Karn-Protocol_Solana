# Como testar o Karn Protocol Solana

Guia prático passo a passo para validar **todas as funcionalidades** do protocolo: contratos Anchor, SDK TypeScript, CLI demo e dApp Next.js. Voltado para juízes do Frontier Hackathon, contributors e revisores.

> Tempo total estimado: **15–25 min** seguindo o caminho do meio (apenas o dApp em devnet). Se quiser rodar tudo (testes Rust + Bankrun + CLI + dApp), reserve **45–60 min**.

---

## Sumário

- [0. Pré-requisitos](#0-pré-requisitos)
- [1. Camada de contratos (offline, sem rede)](#1-camada-de-contratos-offline-sem-rede)
- [2. Camada de integração (Bankrun, sem rede)](#2-camada-de-integração-bankrun-sem-rede)
- [3. Camada de devnet (CLI demo, com rede)](#3-camada-de-devnet-cli-demo-com-rede)
- [4. Camada de dApp (interface visual)](#4-camada-de-dapp-interface-visual)
- [5. Camada de SDK (consumo externo)](#5-camada-de-sdk-consumo-externo)
- [6. Mitigações de segurança (KRN-01..05)](#6-mitigações-de-segurança-krn-0105)
- [7. Troubleshooting](#7-troubleshooting)

---

## 0. Pré-requisitos

### Toolchain

| Ferramenta | Versão mínima | Verificar |
|---|---|---|
| Rust | 1.94+ | `rustc --version` |
| Solana CLI (Agave) | 3.1+ | `solana --version` |
| Anchor | 0.32.1 | `anchor --version` |
| Node.js | 20+ | `node --version` |
| npm | 10+ | `npm --version` |

Se faltar algo, ver instruções em [`README.md`](../README.md#stack).

### Configurar Solana CLI

```bash
solana config set --url devnet
solana config get               # confirme RPC URL = https://api.devnet.solana.com
```

Verifique sua keypair (será usada pra deploy e como bootstrap authority do dApp):

```bash
solana address                  # exibe sua pubkey
solana balance --url devnet     # precisa de ~10 SOL pra deploy completo
```

Se o saldo estiver baixo:

1. Abra https://faucet.solana.com em um navegador
2. Cole sua pubkey
3. Login com GitHub permite até 10 SOL/dia
4. CLI faucet (`solana airdrop 2`) costuma estar rate-limited

### Wallet de browser (para testar o dApp)

Instale **Phantom**, **Backpack** ou **Solflare** como extensão do Chrome/Firefox. No menu da wallet, troque a rede para **Devnet**. Você pode usar a mesma keypair do CLI (importando o secret key) ou uma nova carteira separada.

---

## 1. Camada de contratos (offline, sem rede)

Validar que os 3 programas Anchor compilam e que a aritmética de Mana/Vault está correta — **sem precisar de devnet**.

### 1.1 Build dos 3 programas

```bash
cd apps/Karn-Protocol-Solana
anchor build
```

**Esperado:** sem warnings, IDLs gerados em `target/idl/{valocracy,governor,treasury}.json`, binários `.so` em `target/deploy/`.

### 1.2 Testes Rust (matemática pura)

```bash
cargo test --workspace
```

**Esperado:** ~44 testes passando, cobrindo:
- `crates/karn-shared/src/mana.rs` — fórmula de decay, floor, overflow protection (KRN-04)
- `crates/karn-shared/src/vault.rs` — convert_to_assets/shares com virtual offsets, anti-inflation (KRN-04)
- Validação de IDs de badges, taxonomia de tracks, edge cases de aritmética

Esses testes são determinísticos e independem de qualquer rede.

---

## 2. Camada de integração (Bankrun, sem rede)

Testes **end-to-end** dos programas em uma máquina virtual Solana local (sem precisar deployar). Inclui as 5 mitigações KRN.

### 2.1 Rodar suite Bankrun completa

```bash
npm test
```

**Esperado:** 87 testes passando, agrupados em:

| Pasta | Cobertura |
|---|---|
| `tests/valocracy/` | initialize, mint, guardian_mint, self_register, get_votes, credit_activity, set_valor, update_primary, mint_community, revoke + set_verified, update_authority |
| `tests/governor/` | propose, cast_vote |
| `tests/treasury/` | deposit, transfer, lab (fund/approve/withdraw), update_governor |
| `tests/krn/` | KRN-02 (snapshot voting), KRN-03 (4% participation threshold), KRN-05 (dual-auth guardian_mint) |

> **Nota:** os testes KRN-01 e KRN-04 não têm arquivo dedicado em `tests/krn/`. KRN-01 (restricted reserves) está coberto em `tests/treasury/lab.spec.ts`. KRN-04 (overflow) está em `cargo test -p karn-shared`.

### 2.2 Rodar um único arquivo (debugging)

```bash
npx ts-mocha -p ./tsconfig.json -t 60000 "tests/governor/cast_vote.spec.ts"
```

---

## 3. Camada de devnet (CLI demo, com rede)

Validar o protocolo **rodando ao vivo** na devnet. Aqui você precisa de **~10 SOL** na sua keypair.

### 3.1 Verificar deploy existente

Os programas já estão deployados em devnet a partir do trabalho anterior:

```bash
cat deployments/devnet.json | head -20
```

**Esperado:** snapshot com 3 program IDs, asset mint, e PDAs:

```
valocracy : 6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf
governor  : 6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm
treasury  : 97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV
```

Confirme que estão vivos:

```bash
for prog in 6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf 6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm 97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV; do
  solana program show $prog --url devnet 2>&1 | head -2
done
```

**Esperado:** `Program Id: ...` + `Owner: BPFLoaderUpgradeable...` para os 3.

### 3.2 (Opcional) Rebootstrap completo

Se quiser zerar e refazer o seed de devnet:

```bash
anchor deploy --provider.cluster devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
KARN_BACKEND_SIGNER=G3NKSdLdhtzDLjb7JPvBANC9Cf1pFkbArTD9mMB7k3Aj \
npx ts-node --transpile-only migrations/run.ts
```

**Esperado:** logs de inicialização, criação de 5 Valors, 1 Guardian, 1 CreditAuthority, 1 Lab; ao final, snapshot escrito em `deployments/devnet.json`.

### 3.3 CLI demo end-to-end

Roda o fluxo `self_register → guardian_mint → propose → (vote → execute → withdraw quando o tempo permite)` com logs verbosos:

```bash
node ./scripts/demo.ts
```

**Esperado:** cada passo imprime um header com tx signature; ao final, links para o explorer.

> **Limitação conhecida:** `voting_delay = 1 dia` e `voting_period = 7 dias` no GovernanceConfig. Por isso a fase `vote → execute` não cabe em uma única sessão de devnet — é por isso que existe a suite Bankrun (clock-controlled). Para gravação de demo, use Bankrun ou pré-crie a proposta horas antes.

---

## 4. Camada de dApp (interface visual)

A jornada **principal para juízes**: `localhost:3000`.

### 4.1 Setup

```bash
cd apps/Karn-Protocol-Solana/app
npm install
```

Crie `app/.env.local` com as variáveis:

```bash
KARN_BACKEND_SECRET_KEY_JSON=[<64 bytes do backend signer>]
KARN_REGISTER_DEFAULT_TRACK_ID=1
```

> O secret key 64-byte JSON está em `~/.config/solana/karn/backend-signer.json` se você seguiu o setup do trabalho anterior. Caso contrário, gere um novo:
>
> ```bash
> solana-keygen new --no-bip39-passphrase --silent --outfile /tmp/karn-signer.json
> # use o conteúdo desse arquivo como KARN_BACKEND_SECRET_KEY_JSON
> ```
>
> A pubkey correspondente precisa ser igual à `Config.signer` do contrato Valocracy. Se diferir, refaça o bootstrap do passo 3.2 com `KARN_BACKEND_SIGNER=<nova pubkey>`.

### 4.2 Subir o dev server

```bash
npm run dev
```

Acesse **http://localhost:3000**. Esperado: hero "A vote that can't be bought." com connect-card à direita.

### 4.3 Jornada visual (sem wallet)

Mesmo sem conectar uma wallet, **role a página** para ver as 5 seções:

| Seção | Conteúdo | O que validar |
|---|---|---|
| 01 Hero | Headline + connect-card | Logo grande no header sticky, scroll snap encaixa na seção |
| 02 What this is | "A primitive for governance, not a token." + callout Beanstalk $182M | Texto editorial em Lora serif lê limpo |
| 03 How it works | 3 protections numerados | Numeração mono `01/02/03` à esquerda |
| 04 See it live | Sample profile panel (Mana 73) | Mana number gigante com `mana.` italic purple |
| 05 Plug | Footer ink full-bleed com Discord/GitHub/X | Border-top 8px ink, cluster de CTAs com shadows assimétricos |

Clique nos links da nav (`What`, `How`, `Live`, `Plug`) — devem rolar suavemente até a seção e o link ativo ganha border-bottom 4px ink.

### 4.4 Conectar wallet

1. Clique **"Connect Wallet"** no connect-card (seção 01)
2. Phantom/Backpack/Solflare abre prompt de permissão — aprovar
3. Connect-card agora exibe sua pubkey shorten (`A6Xs…iKGj`)
4. Botão muda para `Disconnect`

**Validar:** se a wallet retornar `publicKey`, a seção 04 (Live) deixa de mostrar o sample e mostra ou:
- O **register form** (se a wallet ainda não foi registrada)
- O **profile real** (se já está registrada)

### 4.5 Self-register (primeira vez)

Na seção 04, com wallet conectada e ainda não registrada:

1. Verifique o campo `Primary track id` — default `1` (Tech). Pode trocar para 2 (Design), 3 (Marketing), 4 (Legal), 5 (Finance), ou `0` (sem track)
2. Clique **"Register wallet"**
3. Frontend chama `POST /api/sign-register` (rota Next.js que assina Ed25519 com o backend signer)
4. SDK monta uma transação com 2 instruções: (a) `Ed25519SigVerify` precompile, (b) `valocracy.self_register`
5. Phantom abre prompt — aprovar
6. Após confirmação na devnet, refresh automático carrega `UserStats` da blockchain
7. UI alterna do form para a view registered

**Esperado após registro:**
- Mana number = **5** (Member Floor)
- Ledger lista 3 linhas:
  - **Member Floor** (5, Active) — todo membro tem
  - **Credential Level** (5, Active) — você tem só o member badge agora
  - **Activity Level** (0, Idle) — sem credit activity ainda
- Decay bar cheia (~180 days remaining)

### 4.6 Inspecionar profile

A seção Live faz auto-refresh a cada 5s. Você pode:

- Clicar **"Refresh"** para forçar
- Observar o número de Mana atualizando se você ganhar um badge ou activity credit
- Ver as 4 Valors disponíveis no protocolo (Member, Leadership, Tech Contributor, Design Contributor, Governance) — embora você só tenha o que foi mintado pra você

### 4.7 Criar proposta (Governance)

Role até o painel `Governance` (renderiza junto com o Profile quando a wallet está conectada). Para criar a proposta mais simples:

1. **Description:** "Pause activity credit while governance recalibrates" (default)
2. **Action variant:** `ValocracyPauseCredit` (default — não precisa de fields extra)
3. **Proposal id:** ignore por enquanto (esse campo é pra vote/execute)
4. Clique **"Create proposal"**
5. Phantom assina, transação é submetida

**Esperado:** feedback box verde "Proposal submitted." A lista de proposals atualiza com `#0` (ou o próximo ID) no topo.

> **Importante:** o campo `proposal_threshold` da GovernanceConfig é 100. **Você precisa ter ≥ 100 Mana pra criar uma proposta.** Como o member floor é só 5, vai falhar com `NoVotingPower` — é por design. Para testar end-to-end, você precisa receber um badge primeiro (via `guardian_mint` ou `mint`). Use a CLI demo do passo 3.3 para isso, ou rode manualmente via SDK.

### 4.8 Variantes de proposta (referência)

Cada variante tem um conjunto diferente de fields que aparece quando você seleciona o `Action variant`:

| Variant | Fields | O que faz |
|---|---|---|
| `ValocracyPauseCredit` | nenhum | Para o circuit breaker de credit_activity |
| `ValocracyResumeCredit` | nenhum | Reativa o credit_activity |
| `TreasuryTransfer` | `Receiver` (pubkey), `Amount` (u64) | Move tokens do vault pra um endereço |
| `TreasuryFundLab` | `Total amount`, `Per member` | (Não usado em propostas — fund_lab é ação direta do funder) |
| `TreasuryApproveScholarship` | `Lab id`, `Member` (pubkey) | Libera saldo claimable pra um membro de uma Lab existente |

### 4.9 Votar

Após criar uma proposta, ela entra em estado `Pending` por `voting_delay` (1 dia em devnet). Depois disso:

1. No campo **"Proposal id"**, digite o ID da proposta (ex: `0`)
2. Clique **"Vote for"** ou **"Vote against"**
3. Phantom assina

**Esperado:** feedback verde, e a vote bar da proposta correspondente atualiza com a proporção For/Against em teal/rose.

> Vote weight é capturado em **snapshot no momento de creation_time** (KRN-02). Se você ganhar Mana extra depois da criação, ele NÃO conta na proposta — é por design.

### 4.10 Executar

Depois que a proposta está `Succeeded` (passou de 51% pra For e ≥ 4% de participation, KRN-03):

1. **Proposal id:** o mesmo ID
2. Para `TreasuryTransfer` é necessário preencher `receiverAta` e `vaultAta` no objeto de extra accounts (não exposto no UI atual — limitação conhecida; usar SDK direto pra isso)
3. Clique **"Execute"** (botão rose)
4. A transação faz CPI signed pelo Governor PDA pra mutar o estado

**Esperado:** estado da proposta vira `Executed`, ledger pill fica preto.

### 4.11 Treasury — Fund a scholarship lab

Painel `Treasury`. Como funder direto (sem proposta):

1. **Total amount:** quantidade total da lab (ex: `500000`)
2. **Per member:** quanto cada bolsista recebe (ex: `100000`)
3. Clique **"Fund lab"**
4. Phantom assina

**Esperado:** o vault recebe `total_amount`, `restricted_reserves` aumenta nesse mesmo valor (KRN-01 — ele fica fora do `total_assets` reportado pros shareholders), e uma nova `Lab` PDA é criada.

### 4.12 Treasury — Withdraw scholarship

Se uma Lab foi `approve_scholarship` para a sua wallet (via proposta executada), você terá um `Claimable` PDA com saldo.

1. **Withdraw amount:** valor a sacar (ex: `100000`, max = claimable)
2. Clique **"Withdraw"**
3. Phantom assina; o vault transfere via SPL pro seu ATA

**Esperado:** `Your claimable` no painel decai em `restricted_reserves` decrementa.

### 4.13 Disconnect

Clique **"Disconnect"** no connect-card. A seção Live volta ao sample mock.

---

## 5. Camada de SDK (consumo externo)

Validar que o SDK npm é consumível por um app externo.

### 5.1 Build do SDK

```bash
cd apps/Karn-Protocol-Solana/sdk
npm install
npm run build              # gera dist/
npm test                   # roda Jest com fixtures
```

**Esperado:** `dist/index.js`, `dist/react/index.js`, e seus `.d.ts` companions.

### 5.2 Empacotar

```bash
npm pack                   # gera karn_lat-protocol-sdk-solana-0.1.0-alpha.1.tgz
```

### 5.3 Importar em projeto vazio

```bash
mkdir /tmp/karn-test && cd /tmp/karn-test
npm init -y
npm install /caminho/karn_lat-protocol-sdk-solana-0.1.0-alpha.1.tgz @solana/web3.js @coral-xyz/anchor
cat > test.mjs <<'EOF'
import { ValocracyClient, GovernorClient, TreasuryClient, calculateMana } from "@karn_lat/protocol-sdk-solana";
console.log(typeof ValocracyClient, typeof calculateMana);
EOF
node test.mjs
```

**Esperado:** imprime `function function`.

---

## 6. Mitigações de segurança (KRN-01..05)

Cada mitigação tem prova explícita:

| KRN | O que mitiga | Onde validar |
|---|---|---|
| KRN-01 | Shareholder não pode redimir reserves restritas | `tests/treasury/lab.spec.ts` — cenário "shareholder cannot withdraw restricted" |
| KRN-02 | Voto conta Mana em `creation_time` (snapshot), não em vote time | `tests/krn/krn-02.spec.ts` |
| KRN-03 | Proposta com `participation < 4%` é Defeated mesmo com 100% For | `tests/krn/krn-03.spec.ts` |
| KRN-04 | `calculate_mana` não overflow para inputs extremos | `cargo test -p karn-shared` |
| KRN-05 | `guardian_mint` exige dual-auth (guardian + account ambos signers) | `tests/krn/krn-05.spec.ts` |

Rode todos juntos:

```bash
npx ts-mocha -p ./tsconfig.json -t 60000 "tests/krn/*.spec.ts"
cargo test -p karn-shared
```

---

## 7. Troubleshooting

### `Module not found: Package path ./react is not exported`

O `next/font` ou o consumidor está cachado com a versão antiga do `sdk/package.json`.

```bash
cd apps/Karn-Protocol-Solana/app
rm -rf .next
npm run dev
```

### `airdrop request failed` no CLI

A torneira pública da devnet bate rate limit diário. Use https://faucet.solana.com no browser (login GitHub libera 10 SOL/dia).

### `KARN_BACKEND_SECRET_KEY_JSON is missing`

A rota `/api/sign-register` precisa do secret key 64-byte. Confirme que `app/.env.local` existe e contém:

```
KARN_BACKEND_SECRET_KEY_JSON=[1,2,3,...,64]
```

### `NoVotingPower` ao criar proposta

Você só tem 5 Mana (Member Floor). O `proposal_threshold` é 100. Receba um badge antes (via `guardian_mint` da CLI demo ou via SDK direto).

### `voting_delay` ainda não passou

O default em devnet é 1 dia. Para testar `vote → execute` em segundos, use Bankrun (`tests/governor/cast_vote.spec.ts` mostra o padrão de avançar o clock).

### Phantom não detecta devnet

Settings → Developer Settings → Testnet Mode → Devnet (não Mainnet ou Testnet).

### Painel `Profile` não atualiza após register

O auto-refresh é a cada 5s. Force com `Refresh`. Se ainda não aparecer, verifique no [Solana Explorer](https://explorer.solana.com/?cluster=devnet) se a tx foi confirmada.

---

## Checklist final

Marque conforme valida:

- [ ] `cargo test --workspace` verde (44 testes)
- [ ] `npm test` verde (87 testes Bankrun)
- [ ] 3 programas vivos em devnet (passo 3.1)
- [ ] CLI demo executa (passo 3.3)
- [ ] dApp boota local em http://localhost:3000 (passo 4.2)
- [ ] Hero + 5 seções renderizam corretamente (passo 4.3)
- [ ] Connect wallet funciona (passo 4.4)
- [ ] Self-register completa (passo 4.5)
- [ ] Profile carrega Mana real (passo 4.6)
- [ ] Treasury fund_lab funciona (passo 4.11)
- [ ] SDK empacota e importa em projeto externo (passo 5.3)
- [ ] 5/5 KRN têm provas executáveis (passo 6)

---

**Próximas etapas sugeridas para submission:**
1. Gravar vídeo de demo (3–5 min) seguindo o passo 4 do dApp
2. Commitar `deployments/devnet.json` (já está no .gitignore — decisão de quando fazer)
3. Tag git `solana-frontier-submission`
