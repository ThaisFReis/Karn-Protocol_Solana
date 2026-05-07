# Design

Inherited verbatim from `apps/karn-ecosystem-landing`. Any token below that drifts from the landing is a bug in this file, not a deliberate choice.

## Visual Theme

Neo-brutalist editorial. Swiss-grid spine with Memphis-era accents (halftone, hard offset shadows, occasional rotation). Ink-on-cream substrate. Type carries the message; color is editorial, not decorative.

**Scene sentence:** A founder demoing on a projector at 2pm in a co-working space, with a hackathon judge taking notes on a 14-inch laptop in the same room. Light register. Dark mode is off-limits because the landing is light and the brand break would be fatal.

## Color Strategy

**Committed.** Ink (`#111`) covers 60-70% of the page surface as a structural color (borders, headlines, primary panels). Cream (`#faf9f5`) is the substrate. Purple (`#a855f7`) is the single editorial accent that carries identity, used for serif italic emphasis and shadow casts on dark panels. Orange (`#f97316`) and teal (`#14b8a6`) are reserved for state semantics (active, success, warning) and never decorative.

## Color Tokens

| Role | Value | Usage |
|---|---|---|
| `ink` | `#111111` | Borders, headlines, primary surfaces, body type on cream |
| `cream` | `#faf9f5` | Page substrate, secondary panels, hero backgrounds |
| `paper` | `#ffffff` | Card surfaces against cream substrate |
| `accent-purple` | `#a855f7` | Serif italic emphasis, accent shadow casts, "SYS.ON"-style mono labels |
| `accent-orange` | `#f97316` | Active state, attention markers, mono labels on ink panels |
| `accent-teal` | `#14b8a6` | Success state, confirmed transactions, vote-for indicators |
| `accent-rose` | `#e11d48` | Vote-against indicators, danger, defeated proposal state |
| `mute-ink` | `#404040` (neutral-700) | Body copy on cream, supporting text |

`#000` and `#fff` are banned. `#111` and `#faf9f5` replace them everywhere.

## Typography

Three families. Each has one role and never crosses lanes.

| Family | Role | Loading |
|---|---|---|
| **Inter** (300/400/500/600 + 800/900 via display fallback) | Body, UI labels, button text, default sans | `next/font` (Google) |
| **Lora** (400/500/600/700 + italic 400/500) | Serif italic emphasis only — used inline inside black uppercase headlines for tonal contrast | `next/font` (Google) |
| **JetBrains Mono** (400/500) | Tech badges, on-chain values (pubkeys, signatures, slot numbers), uppercase tracking-widest labels, status pill text | `next/font` (Google) |

### Hierarchy

| Step | Class | Weight | Tracking | Case |
|---|---|---|---|---|
| Display | `text-7xl md:text-[7rem] lg:text-[8.5rem]` | `font-black` | `tracking-tighter` | `uppercase` (with serif italic emphasis lowercase) |
| H1 / Section title | `text-4xl md:text-6xl` | `font-black` | `tracking-tighter` | `uppercase` |
| H2 / Panel title | `text-2xl md:text-3xl` | `font-black` | `tracking-tight` | `uppercase` |
| H3 / Subsection | `text-xl` | `font-black` | `tracking-tight` | `uppercase` |
| Lead body | `text-lg md:text-xl` | `font-medium` italic | normal | normal (Lora) |
| Body | `text-base` | `font-normal` | normal | normal (Inter) |
| Mono label | `font-mono text-[10px]` | `font-bold` | `tracking-widest` | `uppercase` |
| Mono value | `font-mono text-sm` | `font-medium` | `tracking-tight` | normal |

Rule: any uppercase headline ≥ `text-2xl` may carry a one-word serif italic emphasis in `font-serif italic font-medium text-[#a855f7] lowercase` at the same or slightly larger optical size. Used sparingly — once per section, never twice in the same headline.

## Borders, Shadows, Surfaces

The landing's signature is **4px ink borders + hard offset shadows**. There are no rounded corners. Panels offset their shadow as a chunk of solid color, not a soft blur.

| Element | Border | Shadow |
|---|---|---|
| Hero card | `border-4 border-[#111]` | `shadow-[16px_16px_0px_#111]` |
| Section card on cream | `border-4 border-[#111]` | `shadow-[12px_12px_0px_#111]` |
| Section card on ink (inverted) | `border-4 border-[#111]` | `shadow-[12px_12px_0px_#a855f7]` |
| Tech badge | `border-2` | none |
| Marquee strip / divider | `border-b-4 border-[#111]` | none |
| Section divider | `border-b-8 border-[#111]` | none |
| Inputs | `border-2 border-[#111]` | none, focus state inverts bg |

**No `border-radius` anywhere.** This is a hard rule, no exceptions for inputs, buttons, badges, or chips. If something looks too aggressive without a radius, the fix is whitespace, not a radius.

**No `backdrop-filter: blur` anywhere.** Glassmorphism is banned per the absolute bans and per the landing's anti-language.

## Components

### BrutalButton

Primary, secondary, cyber variants. Mono uppercase tracking-widest label. 4px ink border. Hard offset shadow. Hover collapses the shadow to zero and translates the button by `(+4, +4)` to simulate "press".

```tsx
<button className="font-mono font-bold tracking-widest uppercase px-6 py-4 text-xs border-4 border-[#111] bg-[#111] text-white shadow-[6px_6px_0px_#111] hover:translate-x-1 hover:translate-y-1 hover:shadow-[0px_0px_0px_#111] transition-all duration-200">
  Connect <ArrowRightIcon size={16} />
</button>
```

Variants:
- `primary`: `bg-[#111] text-white shadow-[6px_6px_0px_#111]`
- `secondary`: `bg-transparent text-[#111] shadow-[6px_6px_0px_#111]` (hover inverts to ink)
- `cyber`: `bg-[#a855f7] text-[#111] shadow-[6px_6px_0px_#111]` (hover swaps to orange)

### TechBadge

Mono micro-label. Used for status (`SYS.ON`, `DEVNET`, `M14`), category tags, and value annotations.

```tsx
<span className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 px-2 py-1 border-2 w-max border-[#111]">
  <span className="w-2 h-2 inline-block bg-current animate-pulse" />
  Devnet
</span>
```

### Panel

Section container. Always carries the 4px border and a 12-16px hard shadow. Hover (when interactive) translates by `(+1, -1)` and shrinks the shadow.

### HalftoneBackground

Optional decorative texture inside panels. `radial-gradient(circle, #111 2px, transparent 2.5px)` at `16px 16px` repeat. Opacity `0.05` to `0.20` depending on contrast need. Use sparingly — never on a panel that already has dense text.

### Marquee divider

Full-bleed ink stripe with mono uppercase tracking-widest text scrolling left-to-right at `20s linear infinite`. Used between major page sections. One per page maximum.

## Layout

- Container: `max-w-7xl mx-auto px-6 md:px-12`
- Section vertical rhythm: `py-16 md:py-24` for primary, `py-10 md:py-12` for sub-sections
- Grid for the dashboard: 12-column with the connect/profile spanning 4-5, governance 7-8, treasury full-width below the fold (or right column on `xl`)
- No equal three-column layouts. Each panel earns its width by the data it carries
- Generous gaps (`gap-8 md:gap-12`) — the brutal language needs whitespace to read as composed, not crowded

## Motion

| Use | Curve | Duration |
|---|---|---|
| Page entrance | `animate-in fade-in` | 500ms |
| Button "press" (translate + shadow collapse) | `transition-all` (linear-ish via `duration-200`) | 200ms |
| Panel hover (translate `(+1, -1)`) | `duration-300` ease-out | 300ms |
| Marquee ticker | `linear infinite` | 20s |
| Halftone orb / blob ambient drift | ease-in-out infinite | 7-10s |

No bounce. No elastic. No spring. No animation on layout properties (`width`, `height`, `top`, `left`). Use `transform` + `opacity` only.

## Accessibility

- Contrast: ink-on-cream and white-on-ink are both ≥ 13:1, well above WCAG AAA. Purple-on-cream (`#a855f7` on `#faf9f5`) hits ~4.7:1 — usable for body italic emphasis but never used for sole-state indication; pair with weight, position, or icon.
- Focus rings: `outline outline-4 outline-offset-2 outline-[#a855f7]` on every interactive element. The 4px outline matches the 4px border language, so focus reads as part of the system, not a browser default.
- Reduced motion: marquee, halftone drift, and entrance fades all respect `prefers-reduced-motion: reduce` via `motion-safe:` Tailwind variants.
- Min hit target: 44×44px for any tap target on `md` and below.

## Iconography

`@phosphor-icons/react` (the same library the landing uses). Stroke-based, geometric, neutral. Default size `20-24px` inline; `48px` for panel headers.

## Tone of UI Copy

- All button labels: uppercase, max 3 words
- Panel titles: uppercase, max 5 words, ideally 2-3
- Body: sentence case, declarative, no marketing verbs ("Empower", "Unlock", "Discover" all banned)
- On-chain values: never truncated below 4 chars head + 4 chars tail (`A6Xs…iKGj` is acceptable shorthand; `A6X…` is not)
- Errors: state the failure plainly, then the recovery action. No "Oops" / "Uh oh" / exclamation marks.
