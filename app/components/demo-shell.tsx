"use client";

import { Header } from "@/components/header";

import styles from "./karn.module.css";

const VALOCRACY = "6WEzighM5X9pCbwLpbnC3SHc8E92YtNcH7SsBDksLHgf";
const GOVERNOR = "6RfCxo65k9KZaJZvpHDEaav1ahDcx7hn13XBdmDtdLRm";
const TREASURY = "97LKXR8q7yg8GmQAYQzpZNLnttyaHbZhR61q6ANw3dbV";

const STEPS = [
  {
    title: "Your seat is yours alone.",
    plain: "Voting power is tied to you. It can't be sold, lent, or borrowed.",
  },
  {
    title: "Everyone has a voice.",
    plain:
      "Every member starts with a baseline. Contributing makes it louder. Inactivity softens it, but never to zero.",
  },
  {
    title: "No admins. No backdoors.",
    plain: "Once live, the protocol obeys only itself.",
  },
];

const SAMPLE_BADGES = [
  { name: "Leadership", track: "Granted at genesis", weight: 2000, status: "active" as const, label: "Active" },
  { name: "Tech Contributor", track: "From a verified contribution", weight: 1000, status: "active" as const, label: "Active" },
  { name: "Governance Voter", track: "From past proposals", weight: 250, status: "decaying" as const, label: "Decaying" },
  { name: "Member Floor", track: "Everyone gets this", weight: 5, status: "active" as const, label: "Active" },
];

const MARQUEE = [
  "Merit > Capital",
  "Non-transferable",
  "Soulbound badges",
  "180-day decay",
  "Zero admin",
  "Live on devnet",
];

const PROGRAMS = [
  {
    name: "valocracy",
    desc: "Identity · soulbound badges · Mana with decay",
    addr: VALOCRACY,
  },
  {
    name: "governor",
    desc: "Proposals · snapshot voting · execute",
    addr: GOVERNOR,
  },
  {
    name: "treasury",
    desc: "SPL vault · governance-only transfers · scholarships",
    addr: TREASURY,
  },
];

export function DemoShell() {
  return (
    <div className={styles.root}>
      <Header />
      <div className={styles.shell}>
        <Hero />
        <WhatIsKarn />
      </div>
      <MarqueeStrip />
      <div className={styles.shell}>
        <HowItWorks />
        <SeeItLive />
      </div>
      <Closing />
    </div>
  );
}

/* ─────────────────────────────────────────── HERO */

function Hero() {
  return (
    <section id="hero" className={`${styles.snap} ${styles.hero}`}>
      <div className={styles.heroDots} aria-hidden />
      <span className={styles.heroSticker} aria-hidden>
        <span className={styles.heroStickerDot} />
        Devnet · Live
      </span>
      <div className={styles.heroGrid}>
        <div>
          <p className={styles.heroIntro}>Karn Protocol · Solana Devnet</p>

          <h1 className={styles.headline}>
            A vote that can&rsquo;t be{" "}
            <span className={styles.emphasis}>bought.</span>
          </h1>

          <p className={styles.subhead}>
            Karn is a <strong>governance module for Solana</strong>. It replaces
            token-weighted voting with non-transferable credentials. Power
            belongs to the people in the room, not to whoever shows up with the
            most capital.
          </p>

          <div className={styles.ctaRow}>
            <a
              href="https://github.com/ThaisFReis/Karn-Protocol_Solana"
              target="_blank"
              rel="noreferrer"
              className={styles.btn}
              style={{ textDecoration: "none" }}
            >
              Read the source →
            </a>
            <span className={styles.ctaHint}>Open · MIT · Live on devnet</span>
          </div>
        </div>

        <SummaryCard />
      </div>
    </section>
  );
}

function MarqueeStrip() {
  const items = [...MARQUEE, ...MARQUEE, ...MARQUEE];
  return (
    <div className={styles.marquee} aria-hidden>
      <div className={styles.marqueeTrack}>
        {items.map((label, i) => (
          <span key={`${label}-${i}`} className={styles.marqueeItem}>
            <span className={styles.marqueeDot} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SummaryCard() {
  return (
    <aside className={styles.connectCard}>
      <div>
        <p className={styles.connectLabel}>Live on devnet</p>
        <h3 className={styles.connectTitle}>Three Anchor programs.</h3>
      </div>

      <div className={styles.walletList}>
        {PROGRAMS.map((p) => (
          <div key={p.name} className={`${styles.walletRow} ${styles.walletRowActive}`}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {p.name}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
              {p.addr.slice(0, 4)}…{p.addr.slice(-4)}
            </span>
          </div>
        ))}
      </div>

      <p className={styles.connectFootnote}>
        Plug Karn into any Realms DAO as a voting-weight source. No fund
        migration. No lock-in.
      </p>
    </aside>
  );
}

/* ─────────────────────────────────────────── WHAT IS KARN */

function WhatIsKarn() {
  return (
    <section id="what" className={`${styles.snap} ${styles.section}`}>
      <p className={styles.sectionLabel}>What this is</p>
      <h2 className={styles.sectionTitle}>A primitive for governance, not a token.</h2>

      <div className={styles.explainGrid}>
        <div className={styles.explainBody}>
          <p>
            When a DAO votes by token balance, whoever has the most money decides everything. <strong>Karn
            counts credentials, not tokens.</strong> They can&rsquo;t be bought, rented, or lent for a single
            block.
          </p>
        </div>

        <aside className={styles.callout}>
          <p className={styles.calloutQuote}>
            An attacker borrowed enough tokens, voted in a single block, and walked away with{" "}
            <span style={{ color: "var(--purple)" }}>$182M</span>.
          </p>
          <p className={styles.calloutSource}>Beanstalk · April 2022</p>
        </aside>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────── HOW IT WORKS */

function HowItWorks() {
  return (
    <section id="how" className={`${styles.snap} ${styles.section}`}>
      <p className={styles.sectionLabel}>How it works</p>
      <h2 className={styles.sectionTitle}>Three protections, working together.</h2>

      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <div className={styles.step} key={i}>
            <div className={styles.stepNumber}>0{i + 1}</div>
            <div className={styles.stepBody}>
              <h3>{s.title}</h3>
              <p>{s.plain}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────── SEE IT LIVE */

function SeeItLive() {
  return (
    <section id="live" className={`${styles.snap} ${styles.section}`}>
      <p className={styles.sectionLabel}>What a member looks like</p>
      <h2 className={styles.sectionTitle}>Voting power is composed, not bought.</h2>

      <SampleProfilePanel />
    </section>
  );
}

function SampleProfilePanel() {
  const score = 73;
  const decayPct = 64;

  return (
    <article className={styles.panel}>
      <span className={styles.sampleRibbon} aria-label="Illustration only">
        Illustration · Not on-chain
      </span>
      <header className={styles.panelHead}>
        <h3 className={styles.panelHeadTitle}>Sample Member</h3>
        <div className={styles.panelHeadMeta}>
          <span className={styles.techBadge}>
            <span className={styles.techDotStatic} />
            Illustration
          </span>
          <span className={styles.pubkey}>A6Xs…iKGj</span>
        </div>
      </header>

      <div className={styles.panelGrid}>
        <div className={styles.manaBlock}>
          <p className={styles.manaLabel}>Voting power</p>
          <p className={styles.manaNumber}>
            {score}
            <span className={styles.manaUnit}>mana.</span>
          </p>
          <p className={styles.manaPlain}>
            <strong>Baseline (5)</strong> plus the weight of credited contributions.
          </p>
          <div className={styles.decayWrap}>
            <p className={styles.decayLabel}>180 days remaining</p>
            <div className={styles.decayBar}>
              <div className={styles.decayFill} style={{ width: `${decayPct}%` }} />
            </div>
          </div>
        </div>

        <div>
          <header className={styles.ledgerHead}>
            <span>Credential</span>
            <span style={{ textAlign: "right" }}>Weight</span>
            <span style={{ textAlign: "right" }}>State</span>
          </header>
          {SAMPLE_BADGES.map((b) => (
            <div className={styles.ledgerRow} key={b.name}>
              <span className={styles.ledgerName}>
                <span className={styles.ledgerNameLabel}>{b.name}</span>
                <span className={styles.ledgerNameTrack}>{b.track}</span>
              </span>
              <span className={styles.ledgerWeight}>{b.weight.toLocaleString()}</span>
              <span className={`${styles.ledgerStatus} ${styles[b.status]}`}>
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────── CLOSING / FOOTER */

function Closing() {
  return (
    <section id="plug" className={`${styles.snap} ${styles.closing}`}>
      <div className={styles.closingInner}>
        <div className={styles.closingTop}>
          <div>
            <span className={styles.closingTechBadge}>Open · MIT · Devnet</span>
            <h2 className={styles.closingHeadline}>
              Plug Karn into your{" "}
              <span className={styles.closingHeadlineEm}>dao.</span>
            </h2>
            <p className={styles.closingSub}>
              Replace the voting-weight source of any Realms DAO in one transaction. No fund migration. No
              lock-in.
            </p>
          </div>

          <div className={styles.closingCtaCol}>
            <a
              href="https://github.com/ThaisFReis/Karn-Protocol_Solana"
              target="_blank"
              rel="noreferrer"
              className={`${styles.closingBtn} ${styles.closingBtnPrimary}`}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <GitHubIcon /> Read the source
              </span>
              <Arrow />
            </a>
            <a href="https://x.com/Karn_lat" target="_blank" rel="noreferrer" className={styles.closingXLink}>
              X / Karn_lat
            </a>
          </div>
        </div>

        <div className={styles.closingBottom}>
          <div className={styles.closingMark}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_karn.svg" alt="" className={styles.closingMarkIcon} />
            <span className={styles.closingMarkText}>Karn Protocol</span>
          </div>
          <div className={styles.closingLegal}>
            <p>Open source · MIT · Built on Solana</p>
            <p>Karn Protocol — Frontier Hackathon submission · 2026</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────── ICONS */

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8H14M14 8L8 2M14 8L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.1-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.46-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18a4.65 4.65 0 0 1 1.24 3.22c0 4.6-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .3" />
    </svg>
  );
}

