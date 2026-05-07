# Product

## Register

product

## Users

Three concurrent audiences, ranked by criticality of the demo window:

1. **Frontier Hackathon judges (Colosseum)** evaluating the submission in under 10 minutes. They have not read the PRD. They need to see, in one viewport, that the protocol does what the pitch claims: connect a wallet, register without buying tokens, watch Mana materialize, vote, execute. They will not click into anything that looks like a generic SaaS dashboard, because they see those daily.
2. **Solana DAO contributors** (Realms users) testing whether Karn could replace their voting-weight source. They arrive skeptical of any new governance primitive and will leave if the UI signals "yet another DAO tool". They want to read the on-chain state directly, not through abstractions.
3. **The founder, demoing live during the 2-minute pitch.** Every panel must be legible from the back of a room on a projector. Reputation, vote count, treasury balance must read like statements, not metrics. The aesthetic must reinforce the pitch's thesis (governance hack-resistant, merit > capital), not contradict it.

## Product Purpose

A devnet dApp that proves the Karn Protocol on Solana works end-to-end: identity (`self_register`), reputation (`Mana` with decay), governance (`propose / cast_vote / execute`), and collective treasury (scholarship escrow). It is intentionally a single page with three panels, because the protocol's tension is not solved by routing or chrome.

Success means a judge can, in one sitting: connect Phantom on devnet, see their Mana score on-screen, create a proposal, cast a vote, and watch the proposal state transition. Failure means the dApp looks like a dashboard for "yet another DeFi protocol" and the thesis dissolves into noise.

## Brand Personality

Three words: **civic, declarative, undecorated**.

Voice: matter-of-fact, technical, never hyped. Calls things by their on-chain name (`Mana`, `Valor`, `Lab`) rather than translating to consumer-friendly substitutes. Numbers are protagonists, not garnish. Confidence comes from typographic weight and structural honesty, not from gradients or glow.

Sister product (the ecosystem landing in `apps/karn-ecosystem-landing`) sets the aesthetic anchor: neo-brutalist editorial — heavy uppercase headlines on cream paper, ink borders, hard offset shadows, serif italic emphasis in purple, JetBrains Mono labels, halftone dot textures. The dApp inherits that language wholesale, adapted to a dashboard rhythm instead of a marketing rhythm.

## Anti-references

- **Realms / Squads / Solana Foundation defaults.** Cool grays, navy gradients, neutral cards. The thing the pitch attacks looks like that. The dApp must read as the *opposite* of that visual register, otherwise the critique collapses.
- **Phantom and Backpack wallet UI.** Purple-pink gradients, neon-on-dark, "crypto-friendly" rounded everything. We use the same accent purple `#a855f7` but as ink on cream, not as a glow.
- **Linear / Vercel-style dashboards.** Equal-sized cards, icon + label + metric, perfectly even gutters. Reads as "yet another B2B SaaS" and the thesis is lost.
- **DeFi terminals and Bloomberg-style mono dashboards.** Green-on-black, dense tables, ticker fonts. We use mono only as a labeling primitive, never as the substrate.
- **Glassmorphism and backdrop blurs.** The current dApp leans on these. Banned in the redesign — the landing rejects it explicitly and the protocol's claim is structural, not atmospheric.

## Strategic Design Principles

1. **Parity with the ecosystem landing is non-negotiable.** A user who clicks from `karn-ecosystem-landing` to this dApp must not feel a brand break. Type stack, color tokens, border weights, shadow geometry, and motion language are inherited verbatim.
2. **Show the protocol; do not abstract it.** Display real on-chain values (program IDs, PDA addresses, raw Mana counts, slot-based timestamps) as first-class typographic content. Do not hide them behind "human-friendly" rounding.
3. **Merit > capital, structurally.** No element exists that resembles a token balance or portfolio value. The dashboard is about *contribution state*, not *holdings*.
4. **Demo-grade, not consumer-grade.** This is a demonstration surface for one pitch and one hackathon. Onboarding flows, empty-state polish, error recovery copy can be terse — but the surface must be visually decisive on first frame.
5. **The thesis is in the type.** A judge who reads only the headlines must walk away with the pitch. Body copy is an explanation, not the message.
