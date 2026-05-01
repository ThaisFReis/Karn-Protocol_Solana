# docs/

Catálogo de documentação operacional do Karn Protocol Solana. **Tudo que afeta entendimento futuro do código vive aqui.**

Esta pasta é obrigatória por regra (ver `CONFIG.md` Regra 18). Sem documentação correspondente, uma implementação não está concluída.

---

## Estrutura

```
docs/
├── README.md           # este arquivo (índice + templates)
├── modules/            # log de implementação por módulo do PRD
├── decisions/          # ADRs (Architecture Decision Records)
├── errors/             # journal de erros + soluções
└── logs/               # deploy, profiling, benchmark
```

---

## Quando documentar

| Situação | Pasta | Nome do arquivo |
|---|---|---|
| Concluí um módulo do PRD (M1, M2, ...) | `modules/` | `M<N>.md` |
| Tomei uma decisão estrutural (design, alternativas, divergência) | `decisions/` | `<NNNN>-<slug-kebab>.md` (incrementar) |
| Encontrei erro não-trivial (>15 min resolvendo) | `errors/` | `<slug-kebab>.md` |
| Output de deploy / benchmark / profiling relevante | `logs/` | `<YYYY-MM-DD>-<slug>.md` |

---

## Regras gerais

- Toda entrada começa com **data ISO** (`YYYY-MM-DD`) no header.
- **ADRs são imutáveis** uma vez aceitos. Para reverter ou substituir, criar nova ADR que referencia a antiga (campo `Substitui:` ou `Substituído por:`).
- **Cross-link** entre arquivos: o módulo deve linkar para ADRs e errors que aconteceram durante ele.
- Linguagem: PT-BR, formal-direta. Sem emoji. Voz ativa.

---

## Templates

### `modules/M<N>.md`

```markdown
# M<N> — <Nome>

**Data:** YYYY-MM-DD
**Status:** Concluído | Em andamento | Bloqueado
**PRD:** [link para seção do PRD]
**Owner:** <nome>

## Escopo entregue
- Bullets do que foi implementado, com paths.

## Critério de aceite (do PRD)
- [x] Critério 1 (link para teste que prova)
- [x] Critério 2
- [ ] Critério 3 (se ainda pendente, nota explicando)

## Decisões tomadas
- ADR-NNNN — <Título> ([link](../decisions/NNNN-slug.md))

## Erros encontrados
- [<Título>](../errors/slug.md) — 1 frase de resumo

## Comandos de verificação
\`\`\`bash
anchor build
anchor test --tests <module>
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
\`\`\`

## Caveats / dívidas técnicas
- Coisas conhecidas que ficam pendentes para módulos futuros.

## Próximo
- M<N+1> — <Nome>
```

### `decisions/<NNNN>-<slug>.md`

```markdown
# ADR-<NNNN> — <Título curto e factual>

**Data:** YYYY-MM-DD
**Status:** Aceito | Substituído por ADR-NNNN | Revertido
**Decisor:** <nome>
**Contexto:** M<N> ou área (ex: "Workspace setup", "PDA conventions")

## Contexto
Por que essa decisão precisou ser tomada? Qual o problema concreto?

## Decisão
O que foi decidido. **Uma frase** seguida do detalhe.

## Alternativas consideradas
- **A — <opção>:** <breve descrição>. Rejeitada porque <motivo>.
- **B — <opção>:** <breve descrição>. Rejeitada porque <motivo>.
- **C — <opção escolhida>:** <breve descrição>. **Escolhida** porque <motivo>.

## Consequências
- **Positiva:** ...
- **Negativa:** ...
- **Risco mitigado:** ...
- **Risco assumido:** ...

## Como reverter (se necessário)
Passos para desfazer essa decisão se ela se mostrar errada.

## Referências
- PRD seção X
- CONFIG.md DT-NN
- Issue/PR/commit relacionado
```

### `errors/<slug>.md`

```markdown
# <Título do erro — uma frase>

**Data:** YYYY-MM-DD
**Módulo:** M<N>
**Severidade:** Bloqueante | Alta | Média | Baixa
**Tempo gasto:** ~<minutos>

## Sintoma
O que aconteceu. Mensagem de erro literal entre code blocks.

\`\`\`
<error output>
\`\`\`

## Root cause
Por que aconteceu. Qual o pressuposto que estava errado?

## Fix aplicado
O que foi feito para resolver. Diff conceitual ou bullets.

## Como evitar de novo
Padrão a seguir para não cair na mesma armadilha.

## Decisão relacionada
(se aplicável) ADR-NNNN
```

### `logs/<YYYY-MM-DD>-<slug>.md`

```markdown
# <Tipo do log — Título>

**Data:** YYYY-MM-DD
**Tipo:** Deploy | Benchmark | Profiling | Audit | Outro
**Cluster:** Devnet | Mainnet | Local

## Contexto
Por que esse log existe (o que motivou rodar isso).

## Comando
\`\`\`bash
<comando exato>
\`\`\`

## Output relevante
\`\`\`
<output filtrado>
\`\`\`

## Conclusões
- O que isso significa.
- O que precisa ser feito como follow-up (se algo).
```

---

## Referências de arquitetura

Documentos vivos que descrevem padrões do protocolo (não são logs):

- [PDA_CONVENTIONS.md](PDA_CONVENTIONS.md) — tabela canônica de seeds + regras de derivação

## Índice (atualizar a cada nova entrada)

### Módulos
- [M1 — Workspace Anchor + Tooling](modules/M1.md)
- [M2 — Convenções de PDA, Erros e Eventos](modules/M2.md)
- [M3 — Programa Valocracy: Estado e Inicialização](modules/M3.md)
- [M4 — Mintagem de Badges (RBAC + Guardian + KRN-05)](modules/M4.md)
- [M5 — Self-Register com Ed25519 Precompile](modules/M5.md)

### Decisões
- [ADR-0001 — `karn-shared` em `crates/`, não em `programs/`](decisions/0001-karn-shared-location.md)
- [ADR-0002 — Mapping de códigos de erro entre Stellar e Anchor](decisions/0002-error-code-offset-mapping.md)
- [ADR-0003 — Splitting genesis bootstrap into discrete instructions](decisions/0003-genesis-instruction-split.md)
- [ADR-0004 — Splitting `mint` por categoria de auth](decisions/0004-mint-instruction-split.md)

### Erros
- [karn-shared IDL extraction failure](errors/karn-shared-idl-extraction.md)
- [Ambiguous glob re-export entre handlers](errors/ambiguous-glob-reexport.md)

### Logs
- (vazio)
