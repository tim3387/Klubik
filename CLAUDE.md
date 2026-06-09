# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Klubik is a one-page marketing website for a French sports agency targeting amateur sports clubs. It sells design packs (logos, jerseys, Canva templates, communication materials). The stack is HTML5 / CSS3 / JS vanilla — no build step, no dependencies, no framework.

**Files:**
- `index.html` — main landing page (all sections)
- `style.css` — all styles in one file
- `script.js` — all JS in one file
- `mentions-legales.html`, `cgv.html`, `cgu.html` — standalone legal pages (share navbar/footer markup)
- `assets/images/` — logo, hero video (`hero kubo.mp4`), and a set of Kubo character PNGs (not yet wired into the HTML — available for future use)

## CSS architecture

All CSS variables are declared in `:root`. Never hard-code values; always use tokens:

| Token | Value |
|---|---|
| `--blue` | `#1353F4` (primary brand) |
| `--blue-dark` | `#0C3ECC` |
| `--blue-light` | `#EEF3FF` |
| `--black` | `#0A0A0A` |
| `--ink` | `#1A1A1A` (body text) |
| `--muted` | `#6B7280` |
| `--border` | `#E8EAED` |
| `--surface` | `#F8F9FC` |

**File order:** reset → container → typography helpers → buttons → reveal animation → then one block per section in page order → responsive at the bottom.

Breakpoints: `1024px` (tablet), `768px` (mobile burger menu), `480px` (small phones).

## JS behaviours

All JS is in `script.js`. Five independent modules — no classes, no imports:

1. **Navbar scroll** — adds `.scrolled` class after 24px, triggers glass opacity change.
2. **Mobile menu** — burger toggle opens `.nav-links.open` with blur overlay; any nav link click closes it.
3. **Scroll reveal** — `IntersectionObserver` on `.reveal-item` elements; adds `.in` class with staggered delay per sibling group.
4. **Hero cards parallax** — `mousemove` on `.hero` section tilts the five `.hcard` elements (desktop only, `min-width: 1024px`).
5. **Orbital system** — `requestAnimationFrame` loop rotates six `.onode` nodes around a central core in the *Pour qui* section; click on a node pauses rotation and shows its popup. Stops on click-outside.

The contact form (`#contactForm`) fakes a submission with a 900ms delay then shows a green success state — **no actual backend**. If a real form submission is needed, this is where to hook in a service (e.g. Formspree, EmailJS).

## Section structure (in page order)

`#navbar` → `.hero` → `.hero-video-wrap` → `#services` → `#pour-qui` → `#why` → `#portfolio` → `#process` → `#packs` → `#contact` → `.footer`

The *Pour qui* section has a **dual rendering** strategy: `.orbital-scene` (desktop) and `.audience-grid` (mobile). They contain the same 6 audience types. CSS hides the grid on desktop and shows it on mobile (hidden by default in CSS, shown via media query).

## Pricing & payments

Stripe payment links are hardcoded in `index.html` inside the `#packs` section. Each `.pack-cta` `href` points directly to a Stripe buy link. Update these links directly on the `<a>` tags if pricing or products change.

## Contact info

- WhatsApp: `+33695971715`
- Email: `contact.klubik@gmail.com`
- Instagram: `@klubik.fr`

These appear in multiple places (contact section, floating WhatsApp button, footer). Search for the phone number or email to find all occurrences before changing.

## Naming conventions

- CSS classes: BEM-lite — block (`hero`, `pcard`, `why`), element with double-dash only when needed (`hcard--jersey`, `pack-card--featured`).
- Sections use both a CSS class and an `id` for scroll targeting (e.g. `<section id="packs" class="packs">`).
- `.reveal-item` marks any element that should animate in on scroll; siblings stagger automatically.
