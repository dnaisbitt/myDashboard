# LifeOS design plan

## Concept: "the highlighter"

A calm, paper-like desk. Type carries the hierarchy and colour only signals. The single bold colour (Highlighter yellow) marks **now**: the current or next block on Today, or priority #1 when nothing is scheduled. It appears once per screen.

## Palette

| Name        | Light     | Dark      | Role |
|-------------|-----------|-----------|------|
| Fog         | `#F3F4F1` | `#121314` | Canvas. Cool, faintly green-grey, deliberately not cream |
| Ink         | `#15171A` | `#ECECE8` | Text, primary action, focus ring |
| Graphite    | `#5C6168` | `#9EA2A8` | Secondary text (5.8:1 on Fog) |
| Rule        | `#DCDED8` | `#2B2E31` | Hairlines: the main structural device |
| Highlighter | `#F2C14E` | `#E9B949` | "Now / the one thing". Always under ink text (≈10:1), never used for warnings |
| Brick       | `#A8432F` | `#E07A62` | Overdue and destructive. Text and small marks only |

Supporting: Sheet `#FBFBF9` (floating surfaces), Sunken `#E9EAE5` (hover/selected).

## Type

- **Newsreader** (variable, optical sizes): the date on Today, page titles, numerals in the progress strip. Nowhere else.
- **Schibsted Grotesk** (variable): all UI. A newspaper grotesque with more character than Inter or Geist, and very legible at 13–15px.
- Scale: 12 micro · 13 small · 15 body · 17 lead · 20 title · 26 h2 · 34 h1 · 52 display.
- Tabular figures for counts and money only. Schibsted's tabular colon is too wide for clock times.

## Layout

- **Laptop:** a 232px text sidebar with no box, separated by a hairline. Content is capped at 1120px. Today is editorial: a large serif date, a one-sentence factual summary, then two columns (Today's three + Schedule | Deadlines + Briefing) and a single progress strip.
- **Phone:** a top bar (wordmark, search, menu) and a bottom bar with four items (Today · Inbox · Capture · Log). Today on the phone shows only the date, the three priorities, the schedule and deadlines. The briefing and strip are laptop-only by design.
- Hairlines before boxes. Bordered containers are kept for empty states, dialogs and the AI slot.

## Principles

1. The phone is a remote; the laptop is a desk.
2. Type makes the hierarchy; colour only signals.
3. Every item has a next decision (do today, schedule, keep, archive).
4. Honest by default: planned and unconfigured features are labelled, never faked.
5. Motion answers actions (tick draws, row strikes, sheets rise). There is one deliberate moment: the highlighter sweeps under "now" once on load. `prefers-reduced-motion` turns all of it off.

## Self-critique and revisions

| First instinct | Problem | Revision |
|---|---|---|
| Cream `#F5EFE6` + terracotta accent | The overused "warm editorial" default | Cool Fog + Ink + one yellow highlighter |
| Geist / Inter + Instrument Serif | The defaults of the moment | Schibsted Grotesk + Newsreader |
| Dashboard of 6–8 equal rounded cards with soft shadows | Template look, too many cards | Hairline sections; shadows only on floating layers |
| ALL-CAPS eyebrow labels above headings | Generic | Sentence-case section titles with a quiet count |
| Fade-and-slide-up on every section | Generic, distracting | Motion only on action, plus one sweep |
| Yellow as both "now" and "warning" | Ambiguous signal | Yellow means now only; Brick means overdue |
| Same layout on the phone | Invites browsing | Phone Today drops the briefing and strip |
