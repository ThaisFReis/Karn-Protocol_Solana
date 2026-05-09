import Link from "next/link";
import styles from "./landing.module.css";

export const metadata = {
  title: "Karn Protocol — Solana | Governance module",
  description:
    "Um módulo de governança para Solana. Voto vem de contribuição, não de capital. Live na devnet.",
};

const VALOCRACY = "6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf";
const GOVERNOR = "6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm";
const TREASURY = "97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV";

export default function LandingPage() {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.logo}>KARN<span className={styles.logoDot}>.</span></span>
          <nav className={styles.nav}>
            <a href="#problem" className={styles.navLink}>Problema</a>
            <a href="#primitives" className={styles.navLink}>Primitivas</a>
            <a href="#compose" className={styles.navLink}>Composabilidade</a>
            <a href="#status" className={styles.navLink}>Devnet</a>
          </nav>
          <Link href="/" className={styles.navCta}>Abrir dApp →</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.shell}>
          <p className={styles.eyebrow}>Solana · Anchor · MIT · Live na devnet</p>
          <h1 className={styles.heroTitle}>
            Voto de contribuição,<br />
            <em>não de carteira.</em>
          </h1>
          <p className={styles.heroSub}>
            Karn é um módulo de governança para Solana. Substitui{" "}
            <em>1 token = 1 voto</em> por peso baseado em mérito verificável on-chain.
            Plugue no seu Realms, futarchy ou multisig — não substitui nada.
          </p>
          <div className={styles.heroCtas}>
            <a
              href="https://github.com/ThaisFReis/karn-protocol"
              className={styles.ctaPrimary}
              target="_blank"
              rel="noreferrer"
            >
              Ver no GitHub
            </a>
            <Link href="/" className={styles.ctaSecondary}>
              Abrir demo dApp
            </Link>
          </div>
        </div>
      </section>

      <section id="problem" className={styles.section}>
        <div className={styles.shell}>
          <p className={styles.kicker}>01 · O Problema</p>
          <h2 className={styles.sectionTitle}>
            Governança em Solana hoje é <em>plutocracia</em>.
          </h2>
          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <span className={styles.statNum}>1%</span>
              <span className={styles.statLabel}>das carteiras decidem</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>90%</span>
              <span className={styles.statLabel}>das propostas</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>800+</span>
              <span className={styles.statLabel}>orgs no Realms</span>
            </div>
          </div>
          <p className={styles.body}>
            Toda governança em Solana segue a mesma régua: o voto pesa pelo token.
            Token-weighted é capturável por design e não escala para tesouros
            críticos. A pergunta deixou de ser <em>se existe alternativa</em> —
            virou <em>qual alternativa, e quantas vão coexistir.</em>
          </p>
        </div>
      </section>

      <section id="primitives" className={styles.sectionAlt}>
        <div className={styles.shell}>
          <p className={styles.kicker}>02 · Três primitivas</p>
          <h2 className={styles.sectionTitle}>
            Voto que pesa pelo que <em>cada conta contribuiu.</em>
          </h2>

          <div className={styles.primGrid}>
            <article className={styles.primCard}>
              <span className={styles.primNum}>01</span>
              <h3 className={styles.primTitle}>Badges soulbound</h3>
              <p className={styles.primBody}>
                Emitidos em PDA não-transferível. Sem mercado secundário, sem
                aluguel de voto, sem captura por capital.
              </p>
              <code className={styles.primCode}>valocracy::guardian_mint</code>
            </article>

            <article className={styles.primCard}>
              <span className={styles.primNum}>02</span>
              <h3 className={styles.primTitle}>Mana com decay</h3>
              <p className={styles.primBody}>
                Decaimento linear em <em>180 dias</em>. Conta inativa perde peso
                automaticamente. Member floor de 5 garantido a qualquer membro.
              </p>
              <code className={styles.primCode}>vacancy_period = 15_552_000s</code>
            </article>

            <article className={styles.primCard}>
              <span className={styles.primNum}>03</span>
              <h3 className={styles.primTitle}>Governança adminless</h3>
              <p className={styles.primBody}>
                Zero admin pós-deploy. Mintagem por política on-chain, quórum de
                revisores. Tesouro só move por proposta executada.
              </p>
              <code className={styles.primCode}>governor::execute</code>
            </article>
          </div>
        </div>
      </section>

      <section id="compose" className={styles.section}>
        <div className={styles.shell}>
          <p className={styles.kicker}>03 · Composabilidade</p>
          <h2 className={styles.sectionTitle}>
            Karn é uma <em>peça do stack</em> — não o stack todo.
          </h2>
          <p className={styles.body}>
            Karn não pede que você escolha. É um módulo de peso de voto que
            conecta na sua organização em três passos:
          </p>

          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum}>1.</span>
              <span><strong>Instale o SDK.</strong> <code>@karn_lat/protocol-sdk-solana</code></span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>2.</span>
              <span><strong>Defina seus Valors</strong> on-chain via <code>guardian</code> seed.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>3.</span>
              <span><strong>Conecte no Realms</strong> como fonte de voting weight.</span>
            </li>
          </ol>

          <p className={styles.pullQuote}>
            “Sua organização pode rodar Karn pra membership, futarchy pra
            orçamento, multisig pra emergência. <em>Cada decisão na régua certa.</em>”
          </p>
        </div>
      </section>

      <section id="status" className={styles.sectionAlt}>
        <div className={styles.shell}>
          <p className={styles.kicker}>04 · Status</p>
          <h2 className={styles.sectionTitle}>
            Três programas Anchor, <em>live na devnet.</em>
          </h2>

          <div className={styles.programGrid}>
            <div className={styles.programCard}>
              <span className={styles.programLabel}>valocracy</span>
              <span className={styles.programDesc}>
                identidade · soulbound badges · Mana com decay
              </span>
              <code className={styles.programAddr}>{VALOCRACY}</code>
            </div>
            <div className={styles.programCard}>
              <span className={styles.programLabel}>governor</span>
              <span className={styles.programDesc}>
                propostas · voting com snapshot · execute
              </span>
              <code className={styles.programAddr}>{GOVERNOR}</code>
            </div>
            <div className={styles.programCard}>
              <span className={styles.programLabel}>treasury</span>
              <span className={styles.programDesc}>
                vault SPL · transfers governance-only · scholarships
              </span>
              <code className={styles.programAddr}>{TREASURY}</code>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.shell}>
          <h2 className={styles.ctaTitle}>
            Open source. MIT. <em>Live na devnet hoje.</em>
          </h2>
          <p className={styles.ctaSub}>
            Conecte na sua governança e devolva a decisão a quem realmente
            constrói.
          </p>
          <div className={styles.heroCtas}>
            <a
              href="https://github.com/ThaisFReis/karn-protocol"
              className={styles.ctaPrimary}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <Link href="/" className={styles.ctaSecondary}>
              Abrir dApp
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.shell}>
          <span className={styles.footerLabel}>
            Karn Protocol · Solana implementation · Frontier Hackathon (Colosseum)
          </span>
          <span className={styles.footerLabel}>
            Construído por <strong>Thais Reis</strong> & <strong>Jessica Marconi</strong>
          </span>
        </div>
      </footer>
    </main>
  );
}
