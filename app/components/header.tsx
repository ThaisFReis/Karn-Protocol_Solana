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
            className={styles.ctaBtn}
          >
            Read the source <Arrow />
          </a>
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
            <a
              href="https://github.com/ThaisFReis/Karn-Protocol_Solana"
              target="_blank"
              rel="noreferrer"
              onClick={close}
              className={`${styles.mobileMenuLink} ${styles.mobileMenuLinkActive}`}
            >
              Read the source
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8H14M14 8L8 2M14 8L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
