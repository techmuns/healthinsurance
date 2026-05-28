# CLAUDE.md

Project guidance for Claude Code sessions on this repository.

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
