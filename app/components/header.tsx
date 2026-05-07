"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import styles from "./karn.module.css";

const NAV = [
  { id: "what", label: "What" },
  { id: "how", label: "How" },
  { id: "live", label: "Live" },
  { id: "plug", label: "Plug" },
];

export function Header() {
  const [active, setActive] = useState<string>("hero");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`.${styles.root}`);
    if (!root) return;

    const sections = ["hero", ...NAV.map((n) => n.id)]
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { root, threshold: [0.4, 0.6, 0.8] },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const close = () => setMenuOpen(false);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="#hero" className={styles.logo} onClick={close}>
          <Image src="/namee-logo.svg" alt="Karn" width={360} height={92} priority />
        </a>

        <nav className={styles.nav}>
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`${styles.navLink} ${active === item.id ? styles.navLinkActive : ""}`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.headerCluster}>
          <a
            href="https://github.com/ThaisFReis/Karn-Protocol_Solana"
            target="_blank"
            rel="noreferrer"
            className={styles.iconBtn}
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>
          <button type="button" className={styles.ctaBtn}>
            Connect <Arrow />
          </button>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>

        {menuOpen && (
          <div className={styles.mobileMenu}>
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={close}
                className={`${styles.mobileMenuLink} ${active === item.id ? styles.mobileMenuLinkActive : ""}`}
              >
                {item.label}
              </a>
            ))}
            <button type="button" className={`${styles.mobileMenuLink} ${styles.mobileMenuLinkActive}`} onClick={close}>
              Connect Wallet
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.1-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.46-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18a4.65 4.65 0 0 1 1.24 3.22c0 4.6-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .3" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8H14M14 8L8 2M14 8L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
