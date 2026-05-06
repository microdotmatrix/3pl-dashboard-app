---
name: GreenBox 3PL Operations Dashboard
description: Internal logistics operations tool for GreenBox 3PL — precise, fast, on-brand.
colors:
  forest-primary: "oklch(0.52 0.20 147)"
  forest-deep: "oklch(0.38 0.14 147)"
  forest-dark: "oklch(0.32 0.13 147)"
  sage-medium: "oklch(0.62 0.14 147)"
  sage-light: "oklch(0.80 0.10 147)"
  mint-canvas: "oklch(0.98 0.008 147)"
  mint-surface: "oklch(0.96 0.012 147)"
  mint-accent: "oklch(0.93 0.016 147)"
  neutral-text: "oklch(0.14 0.008 147)"
  neutral-muted: "oklch(0.56 0.006 147)"
  neutral-border: "oklch(0.92 0.006 147)"
  dark-bg: "oklch(0.14 0.010 147)"
  dark-surface: "oklch(0.19 0.012 147)"
  dark-accent: "oklch(0.24 0.014 147)"
  vendor-dip: "oklch(0.80 0.165 85)"
  vendor-ryot: "oklch(0.42 0.17 27)"
  vendor-fatass: "oklch(0.40 0.10 150)"
  status-destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.forest-primary}"
    textColor: "{colors.mint-canvas}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.mint-canvas}"
  button-secondary:
    backgroundColor: "{colors.mint-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.mint-accent}"
    textColor: "{colors.neutral-text}"
  button-destructive:
    backgroundColor: "{colors.status-destructive}"
    textColor: "{colors.mint-canvas}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.mint-canvas}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.mint-canvas}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: GreenBox 3PL Operations Dashboard

## 1. Overview

**Creative North Star: "The Dispatch Board"**

The GreenBox 3PL operations dashboard is built for the rhythm of a well-run warehouse: a small, trusted team checking statuses, logging notes, and closing out billing at the end of the month. The interface is a dispatch board — calm, organized, status visible at a glance. Green means cleared. Every element earns its space on the surface.

Color derives from the GreenBox 3PL brand: forest green as the primary signal color, tinted mint neutrals as the working surface, vendor colors (amber, red-brown, sage) as fixed semantic identifiers. Light mode takes its cue from the GreenBox marketing site — an airy mint canvas that reads as deliberate, not sterile. Dark mode shifts to deeply tinted dark surfaces in the same green family: the brand hue never disappears, it recedes to the bones of the layout. Both themes are first-class.

This system explicitly rejects AI-generated SaaS slop: hero metrics with gradient accents, glassmorphism, gradient text clips, identical card grids, side-stripe border callouts, and modal-first interactions. If a viewer can look at the interface and immediately identify it as component-library-default, something has failed. Every decision visible to the user should read as intentional.

**Key Characteristics:**
- Flat-by-default surfaces; tonal layering (not shadows) establishes depth
- Dense information presentation without visual crowding
- GreenBox Forest green as the sole vivid primary signal; vendor colors carry semantic weight only
- All neutrals tinted toward hue 147; no chroma-zero grays, no pure black or white
- DM Sans for headings (warmth, presence at size); Geist for all data and UI text (technical clarity)
- Both light and dark modes; OS default, user-selectable, profile-persisted

## 2. Colors: The Dispatch Palette

Anchored at OKLCH hue 147 across a range from deep forest to light mint. This is a restrained palette: one vivid primary, tonal neutrals, and three locked vendor identity colors.

### Primary
- **GreenBox Forest** (`oklch(0.52 0.20 147)`): The primary action signal. Primary buttons, active state indicators, focus rings, link text. Matches the GreenBox 3PL marketing site CTA button exactly. Used on at most 10% of any screen surface; its rarity is what makes it legible as a signal.
- **Forest Deep** (`oklch(0.38 0.14 147)`): Hover state for primary actions, high-emphasis text when green-on-light contrast is needed, logo wordmark reference color.

### Secondary
- **Sage Medium** (`oklch(0.62 0.14 147)`): Secondary active indicators, selected filter pills, sidebar active background tint. Quieter than the primary — it supports, never competes.
- **Sage Light** (`oklch(0.80 0.10 147)`): Chart track 1, subtle background reinforcement, secondary data series.

### Neutral
- **Mint Canvas** (`oklch(0.98 0.008 147)`): Default page background (light mode). Slightly warmer than pure white — visibly clean without being stark. Card backgrounds sit on this.
- **Mint Surface** (`oklch(0.96 0.012 147)`): Sidebar, secondary panel backgrounds, table header rows. One step darker than canvas; the tonal step that creates depth without a shadow.
- **Mint Accent** (`oklch(0.93 0.016 147)`): Hover state on ghost buttons, hovered table rows, active chip backgrounds.
- **Neutral Text** (`oklch(0.14 0.008 147)`): Primary body text, table cell values, form labels. Near-black with a trace of green — never pure `#000`.
- **Neutral Muted** (`oklch(0.56 0.006 147)`): Timestamps, secondary labels, placeholder text, column headers, empty state messages.
- **Neutral Border** (`oklch(0.92 0.006 147)`): All borders and dividers in light mode. Single-pixel hairlines only.
- **Dark Background** (`oklch(0.14 0.010 147)`): Dark mode page surface. Deeply green-tinted, not neutral gray.
- **Dark Surface** (`oklch(0.19 0.012 147)`): Dark mode cards, sidebar, secondary surfaces. Keeps the same tonal-step relationship as light mode.
- **Dark Accent** (`oklch(0.24 0.014 147)`): Hover tints, muted selections in dark mode.

### Vendor Colors (Semantic — Fixed)
- **Vendor DIP** (`oklch(0.80 0.165 85)`): Amber-yellow. Identifies DIP brand across all surfaces.
- **Vendor RYOT** (`oklch(0.42 0.17 27)`): Red-brown. Identifies RYOT brand across all surfaces.
- **Vendor FATASS** (`oklch(0.40 0.10 150)`): Forest-adjacent green. Identifies FATASS brand across all surfaces.

Vendor colors are identity tokens. They identify brands; they are never repurposed for status indicators, alerts, or decorative use.

**The One Signal Rule.** GreenBox Forest (`oklch(0.52 0.20 147)`) is the only vivid green that appears on primary interactive elements. Every other green in the system — sage tones, vendor-fatass, chart greens — is quieter. The primary signal works because nothing else competes for its register.

**The Vendor Immutability Rule.** DIP, RYOT, and FATASS colors are never adjusted for aesthetic reasons. Brand colors are fixed.

## 3. Typography: The Dispatch Stack

**Display/Heading Font:** DM Sans (system-ui, sans-serif fallback)
**Body/UI Font:** Geist (system-ui, sans-serif fallback)
**Mono Font:** Geist Mono (monospace fallback)

**Character:** DM Sans brings warmth and human proportion to panel headings — it reads as deliberate, not clinical. Geist is technically precise and compact at small sizes, suited for table data, labels, and dense UI text. Together they create immediate hierarchy contrast: DM Sans signals "this is structure," Geist signals "this is data."

### Hierarchy
- **Display** (DM Sans 600, 1.75rem, line-height 1.2, tracking -0.01em): Page-level titles. Admin dashboard heading, section titles. Rare — one per route.
- **Headline** (DM Sans 600, 1.25rem, line-height 1.3): Card titles, panel headers, major section labels.
- **Title** (Geist 500, 1rem, line-height 1.4): Sub-section labels, filter group headers.
- **Body** (Geist 400, 1rem at 18px root, line-height 1.6): Table cell content, whiteboard note body, form descriptions. Prose capped at 65–75ch.
- **Label** (Geist 500, 0.75rem, tracking 0.01em): Status badges, vendor pills, table column headers, timestamps, filter pill text.
- **Mono** (Geist Mono 400, 0.75rem, line-height 1.5): Shipment IDs, order numbers, sync cursor values, reset URLs, error output. All machine-generated identifiers use mono.

**The DM Sans Ceiling Rule.** DM Sans is headings only. It does not appear in table cells, form fields, status badges, or any data-dense UI surface. If you're uncertain whether a text element is a heading, it almost certainly isn't — use Geist.

**The Mono Identifier Rule.** Any value that is machine-generated, user-unreadable, or a reference code uses Geist Mono. This creates immediate visual disambiguation between human-readable labels and system identifiers.

## 4. Elevation

This system is flat by default. Surfaces are differentiated through tonal layering: page background sits below card surfaces, which sit below sidebar. No decorative box shadows appear on cards, panels, rows, or containers at rest — and never on hover either.

Floating UI — dropdowns, tooltips, command palette, date picker, drawers — uses a structural shadow to establish separation from the document layer.

### Shadow Vocabulary
- **Floating** (`0 4px 16px oklch(0 0 0 / 0.08), 0 1px 4px oklch(0 0 0 / 0.05)`): Dropdowns, popovers, command palette, tooltips. Applied by Radix UI primitives; do not override.
- **Sheet/Drawer** (`-4px 0 24px oklch(0 0 0 / 0.10)` for left-anchored, mirrored for right): Side-anchored panels and bottom drawers only.

**The Flat-by-Default Rule.** Cards, panels, and table rows never carry box shadows at rest or on hover. If you feel the urge to add a shadow to a card, add a `1px neutral-border` border instead and step up the background tint by one level.

## 5. Components

### Buttons
Direct, compact, no ceremony. Labels are sentence case; no uppercase, no wide letter-spacing.
- **Shape:** Gently curved, 0.5rem radius across all variants.
- **Primary:** GreenBox Forest background, mint-white text. Padding 8px 16px. Hover shifts to Forest Deep — a clean darkening, no transform, no shadow lift.
- **Secondary:** Mint Surface background, neutral text. For secondary actions adjacent to a primary CTA.
- **Ghost:** Transparent at rest, Mint Accent tint on hover. Used in toolbars, table row actions, dense action sets.
- **Destructive:** Status Error red background. Reserved for irreversible actions (reject user, revoke invite). Always paired with a confirm step.
- **Focus:** 2px forest-primary ring, 2px offset. No outer glow, no blur. Clean and accessible.

### Status Badges
Semantic tint system: background at 12% opacity of the status color, text in a high-saturation version of the same hue. Shape is pill (full radius), padding 2px 8px, Geist Label 500.
- Approved → green tint (oklch forest / 12% bg)
- Pending → amber tint (vendor-dip hue / 12% bg)
- Rejected / Suspended → red tint (destructive / 12% bg)

The three-color system is closed. No fourth status color without updating this document and all badge surfaces.

### Vendor Pills
Identity markers on shipment rows and whiteboard notes. Solid fill at the vendor color, small compact padding, pill shape, Geist Label 500. They read at a glance without relying on text alone — color IS the identifier, the label confirms it.

### Tables
The primary data surface in this dashboard. Rows separated by a single 1px neutral-border hairline. No zebra striping — at this density, alternation creates noise. Hover state: mint-accent tint on the full row.
- **Column headers:** Geist Label 500, neutral-muted color. Never bold enough to compete with data.
- **Primary cell data:** Geist Body 400 (1rem). Machine IDs in Mono.
- **Secondary cell data** (timestamps, sub-labels): Geist 400, 0.75rem, neutral-muted.
- **Action cells:** Ghost button group, right-aligned, visible on row hover.

### Inputs and Fields
- **Style:** Mint Canvas background, neutral-border stroke (1px), 0.5rem radius.
- **Focus:** Border shifts to forest-primary. Ring: 2px forest-primary, offset 2px. No glow.
- **Placeholder:** Neutral-muted color, no italic.
- **Error:** Border and ring shift to destructive red. Error message below in Label style.
- **Search Inputs:** Left-anchored search icon, right-anchored clear button when populated. The clear button is a ghost icon button, not a visible ×.

### Sidebar Navigation
Left-rail sidebar. Background: Mint Surface (light) / Dark Surface (dark). Nav items: Geist 500, 0.875rem.
- Default: neutral text, no background.
- Hover: Mint Accent / Dark Accent tint, full-width.
- Active: Sage Medium background tint, Forest Deep text. No left-stripe border.

**The No Left-Stripe Rule.** Active nav items, callouts, and alert components never use a border-left accent stripe wider than 1px. Active state is expressed through background tint and text color shift.

### Whiteboard Notes
A signature panel component. Notes appear as compact entries without full card chrome — background lifts by one tonal step, no explicit card border. Author avatar + name in Label style, timestamp in Mono, note content in Body. Unread indicator: a 6px forest-primary dot positioned at the top-right corner of the note entry, not a badge count.

### ShipStation Sync Panel
Status-dense admin component. Each sync account row shows: display name (Headline), slug (Mono, muted), last run (timestamp in Mono), status badge (Approved/Error/Never), cursor timestamp (Mono). Error output renders in a `<pre>` block at 0.7rem Geist Mono, destructive text color, no background fill.

## 6. Do's and Don'ts

### Do:
- **Do** use GreenBox Forest (`oklch(0.52 0.20 147)`) as the sole vivid green on primary interactive elements. Every other green is a tonal variant — quieter, supporting.
- **Do** tint all neutrals toward hue 147, even at chroma 0.005–0.01. This project has no chroma-zero grays and no pure `#000` or `#fff`.
- **Do** use DM Sans exclusively for headings: card titles, panel headings, page titles. Geist carries all data, labels, and UI text.
- **Do** use Geist Mono for every machine-generated identifier: shipment IDs, order numbers, cursor values, reset URLs, token strings, error codes.
- **Do** use tonal layering (canvas → surface → accent tint) to establish hierarchy. Shadows appear only on floating UI.
- **Do** present data at full density. The team is small, experienced, and trusted. Do not hide information behind progressive disclosure for its own sake.
- **Do** keep vendor colors (DIP, RYOT, FATASS) at their fixed OKLCH values. They identify brands; brand colors are immutable.
- **Do** default the theme to the user's OS preference; persist the user's override to their profile.

### Don't:
- **Don't** use hero metrics with gradient accents — big number, small label, saturated gradient background. This is the SaaS cliché this system explicitly rejects.
- **Don't** use gradient text (`background-clip: text` with a gradient fill). Use a solid color; emphasis comes from weight or size.
- **Don't** use glassmorphism on cards, panels, or nav. Backdrop-filter blur is permitted only on floating UI elements where layer separation requires it.
- **Don't** build identical card grids — same size, same icon-heading-body structure, repeated. Each card-pattern surface earns a distinct treatment.
- **Don't** use `border-left` wider than 1px as a colored accent stripe on any card, nav item, callout, or list element. Use background tints and text color for state.
- **Don't** animate layout properties (height, width, top, left, padding). All transitions use opacity and transform only, easing out with exponential curves (ease-out-quart or quint). No bounce, no elastic, no spring.
- **Don't** add skeleton loaders for queries fast enough to return in under 300ms, animated metric counters, or pulse-badge decoration. Motion carries operational meaning or does not exist.
- **Don't** reach for a modal as the first interaction pattern. Drawers (vaul), inline expansion, and progressive disclosure within the existing panel layout are always tried first.
- **Don't** introduce a fourth status color (a distinct warning orange, an info blue) without updating the badge taxonomy across every surface that uses status colors.
- **Don't** let any screen look like something AI assembled from a starter template. If it could be from any generic SaaS dashboard, the design decisions were not made — they were defaulted.
