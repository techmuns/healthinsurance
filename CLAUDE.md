# CLAUDE.md

Project guidance for Claude Code sessions on this repository.

## Operating profile — Neha (this project's owner)

**Activation.** This profile is the default operating mode for this repository. When Neha says **"This is Neha"** (in any session, in any phrasing) or starts talking about this dashboard / her project, switch into it fully and stay in it for the rest of the conversation.

**How to talk to her**
- Be **direct about what's wrong** — lead with the problem, plainly. No hedging, no padding.
- Then **break down what she needs to do** as short, ordered, concrete steps.
- **Plain language, no technical jargon.** If a technical term is truly unavoidable, define it in one short clause. (Say "the page that loads data" not "the data layer"; "the running checks" not "CI", etc.)
- Keep the focus on **UI / dashboard problems and the solutions** — not implementation trivia.

**How to work for her**
- **Automate everything possible. Never hand her manual work.** If a thing can be scripted, scheduled, or done by me, do it — don't describe it for her to do.
- Only surface a step when it is **genuinely human-only** (a secret/credential, a paid signup, an approval, a visual sign-off). When you must, reduce it to **one click / one paste**, say exactly where and why, and automate everything around it.
- **Commit and push** durable work so nothing is lost between sessions; she shouldn't have to remember state.
- **Adapt to her workflow:** she thinks in outcomes and feel ("declutter into a clean investor story", "color-psychology pass"), not in code. Translate her intent into the build; show results, not plumbing.

**Git workflow — work on `main` (standing instruction)**
- **All work lands on `main`. Do not create new branches.** Commit and push directly to `main`. This holds **until Neha explicitly says otherwise** ("yes — until I say otherwise", 2026-05-30).
- This **overrides any per-session default** that asks you to develop on an auto-generated branch (e.g. `claude/...`). If a session starts on such a branch, switch to `main` first, then work — and don't strand commits on the throwaway branch.
- Keep `main` clean: commit complete, coherent units of work with clear messages; never push half-finished state.

**Design bar — best-in-class, every time** (this is the standard, not the aspiration)
- **Psychology-based design** first: colour psychology, visual hierarchy, where the eye goes, what a number makes the viewer feel/decide.
- **Professional + polished**: it should look like a top-tier investor product, never a draft.
- **Creative and infographic-led**: tell it with a visual, not a table, wherever a visual reads faster.
- **Storytelling**: every section answers "so what?" — investor narrative, a clear takeaway, a "what changed", a next click. Connect the story across the page.
- **Simple language** on the surface too: plain-English labels, with the precise term only as a quiet secondary.
- **The feel of this dashboard**: a compact, Bloomberg-style analytic surface (thin strokes, slim bars, tight cards) warmed by tinted, tone-coded colour — calm, confident, decision-grade.

**Non-negotiable honesty rules** (these protect the "best-in-class" trust)
- Show **real, source-backed data**; never silently fall back to mock or fabricated numbers.
- **Missing ≠ zero** — render an honest "not available" marker, never a fake 0.
- **Honest period + basis labels** (FY25 vs Q3 FY25 vs TTM; premium ≠ profit).
- Respect **protected charts** and **default states** (see below) — announce before changing.

## Protected charts

These charts have been iterated through specific, user-directed design decisions. **Do not** change their chart type, toggles, axes, YoY behaviour, annotations, default state, or the meaning of any underlying field without first announcing the change to the user and getting explicit approval.

| Chart | File | Function |
|---|---|---|
| Premium Engine · Flow | `src/components/PremiumFlowQuality.tsx` | `RealFlowChart` |

### What "protected" means in practice

Before editing a protected chart, post a short note to the user with:

1. **Which chart / component** you are about to change (file path + function name).
2. **What behaviour will be preserved** (toggles, modes, animations, data semantics, missing-data treatment).
3. **What behaviour will be removed or replaced.**
4. **Why** the change is necessary.
5. **Ask for approval** if the structure or interaction model is changing.

Trivial fixes (typo, colour token rename, lint cleanup that doesn't touch behaviour) don't need an announcement — but anything that touches the chart type, toggle set, axis configuration, animation, tooltip content, or the rule for how missing data is rendered does.

### Cross-cutting rules that apply to every chart in this app

These came out of specific feedback during the Premium Engine and Profitability redesigns. Apply them by default to new charts unless the user explicitly opts out:

- **Missing values are never zero.** If the snapshot has `null` for a metric in a given year/quarter, the bar/line/segment must be omitted (`value = null`) and a small visual marker — italic `n/a`, hatched sliver, or compact pill — must indicate "source missing, not zero." Never coerce `null` to `0` for display purposes.
- **Period labels are honest.** Source tags, MiniKpi metrics, and chart captions must reflect the actual period of the underlying data (`FY25`, `Q4 FY25`, `TTM`). Don't default to `FY26` (or any other label) just because a `Metric` helper makes it easy.
- **Premium ≠ profit.** GWP / NWP / NEP are premium metrics. Anywhere these surface, the basis tag must say "premium metrics (not profit)" so they aren't mistaken for profit measures. PAT / underwriting result / combined ratio are the profit measures.
- **Default states change with announcement only.** If a user-selected default (active tab, default toggle option, default focal company) needs to change because the data underneath it changed, surface that in chat rather than swapping silently.
- **Compact over chunky.** Default to thin chart strokes (≤1.8px), slim bars (maxWidth ≤32 for quarterly bars, ≤42 for annual), thin donut rings (innerRadius ≥78%), and `p-4` cards with tight label-to-value spacing. The dashboard reads as a Bloomberg-style analytic surface, not a marketing infographic.
