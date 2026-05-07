import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import { Header } from "@/components/header";
import styles from "@/components/karn.module.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["italic", "normal"],
  variable: "--font-serif",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Karn Protocol Solana — Demo",
};

const TOTAL_SECTIONS = 5;

const STEPS = [
  {
    title: "Your seat is yours alone.",
    plain: "Voting power is tied to you. It can't be sold, lent, or borrowed.",
  },
  {
    title: "Everyone has a voice.",
    plain: "Every member starts with a baseline. Contributing makes it louder. Inactivity softens it, but never to zero.",
  },
  {
    title: "No admins. No backdoors.",
    plain: "Once live, the protocol obeys only itself.",
  },
];

const BADGES = [
  { name: "Leadership", track: "Granted at genesis", weight: 2000, status: "active" as const },
  { name: "Tech Contributor", track: "From a verified contribution", weight: 1000, status: "active" as const },
  { name: "Governance Voter", track: "From past proposals", weight: 250, status: "decaying" as const },
  { name: "Member Floor", track: "Everyone gets this", weight: 5, status: "active" as const },
];

export default function PreviewPage() {
  return (
    <div className={[styles.root, inter.variable, lora.variable, mono.variable].join(" ")}>
      <Header />
      <div className={styles.shell} style={{ fontFamily: "var(--font-sans)" }}>
        <Hero />
        <WhatIsKarn />
        <HowItWorks />
        <SeeItLive />
        <Closing />
      </div>
    </div>
  );
}

function SectionIndex({ n }: { n: number }) {
  return (
    <span className={styles.snapIndex}>
      0{n} / 0{TOTAL_SECTIONS}
    </span>
  );
}

function ScrollHint() {
  return (
    <span className={styles.scrollHint} aria-hidden>
      <span className={styles.scrollLine} />
      <span>Scroll</span>
      <span className={styles.scrollLine} />
    </span>
  );
}

/* ─────────────────────────────────────────── HERO */

function Hero() {
  return (
    <section id="hero" className={`${styles.snap} ${styles.hero}`}>
      <div className={styles.heroDots} aria-hidden />
      <SectionIndex n={1} />

      <div className={styles.heroGrid}>
        <div>
          <p className={styles.heroIntro}>Karn Protocol · Solana Devnet</p>

          <h1 className={styles.headline}>
            A vote that can&rsquo;t be{" "}
            <span className={styles.emphasis}>bought.</span>
          </h1>

          <p className={styles.subhead}>
            Karn replaces token-weighted voting with{" "}
            <strong>non-transferable credentials</strong>. Power belongs to the people in the room, not to
            whoever shows up with the most capital.
          </p>

          <div className={styles.ctaRow}>
            <BrutalButton>
              Connect Wallet <Arrow />
            </BrutalButton>
            <span className={styles.ctaHint}>or scroll · 4 sections</span>
          </div>
        </div>

        <ConnectCardMock />
      </div>

      <ScrollHint />
    </section>
  );
}

function ConnectCardMock() {
  return (
    <aside className={styles.connectCard}>
      <div>
        <p className={styles.connectLabel}>Step 1</p>
        <h3 className={styles.connectTitle}>Connect your wallet</h3>
      </div>

      <div className={styles.walletList}>
        <div className={`${styles.walletRow} ${styles.walletRowActive}`}>
          <span>Phantom</span>
          <span>Available</span>
        </div>
        <div className={styles.walletRow}>
          <span>Backpack</span>
          <span>Available</span>
        </div>
        <div className={`${styles.walletRow} ${styles.walletRowMuted}`}>
          <span>Solflare</span>
          <span>Not detected</span>
        </div>
      </div>

      <p className={styles.connectFootnote}>
        Karn never sees your balance, your transactions, or any asset you hold. We only need to know that
        this wallet is yours.
      </p>
    </aside>
  );
}

/* ─────────────────────────────────────────── WHAT IS KARN */

function WhatIsKarn() {
  return (
    <section id="what" className={`${styles.snap} ${styles.section}`}>
      <SectionIndex n={2} />
      <p className={styles.sectionLabel}>What this is</p>
      <h2 className={styles.sectionTitle}>A primitive for governance, not a token.</h2>

      <div className={styles.explainGrid}>
        <div className={styles.explainBody}>
          <p>
            When a DAO votes by token balance, whoever has the most money decides everything. <strong>Karn
            counts credentials, not tokens.</strong> They can&rsquo;t be bought, rented, or lent for a
            single block.
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
      <SectionIndex n={3} />
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
      <SectionIndex n={4} />
      <p className={styles.sectionLabel}>See it live</p>
      <h2 className={styles.sectionTitle}>This is real, on-chain, right now.</h2>

      <ProfilePanelMock />
    </section>
  );
}

function ProfilePanelMock() {
  const score = 73;
  const decayPct = 64;

  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <h3 className={styles.panelHeadTitle}>Sample Member</h3>
        <div className={styles.panelHeadMeta}>
          <TechBadge>
            <span className={styles.techDot} />
            Active member
          </TechBadge>
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
          {BADGES.map((b) => (
            <div className={styles.ledgerRow} key={b.name}>
              <span className={styles.ledgerName}>
                <span className={styles.ledgerNameLabel}>{b.name}</span>
                <span className={styles.ledgerNameTrack}>{b.track}</span>
              </span>
              <span className={styles.ledgerWeight}>{b.weight.toLocaleString()}</span>
              <span className={`${styles.ledgerStatus} ${styles[b.status]}`}>
                {b.status === "active" ? "Active" : "Cooling"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────── CLOSING */

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
            <button type="button" className={`${styles.closingBtn} ${styles.closingBtnPrimary}`}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <DiscordIcon /> Join the community
              </span>
              <Arrow />
            </button>
            <a
              href="https://github.com/ThaisFReis/Karn-Protocol_Solana"
              target="_blank"
              rel="noreferrer"
              className={`${styles.closingBtn} ${styles.closingBtnGhost}`}
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
            <img src="/logo_karn.svg" alt="" />
            <span className={styles.closingMarkText}>KARN.</span>
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

/* ─────────────────────────────────────────── PRIMITIVES */

function TechBadge({ children }: { children: React.ReactNode }) {
  return <span className={styles.techBadge}>{children}</span>;
}

function BrutalButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const cls = variant === "secondary" ? `${styles.btn} ${styles.btnSecondary}` : styles.btn;
  return (
    <button type="button" className={cls}>
      {children}
    </button>
  );
}

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

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.335-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.335-.946 2.42-2.157 2.42z" />
    </svg>
  );
}
