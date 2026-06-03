import { MarketEngineHero, GiPoolShiftBlock } from '@/sections/MarketLandscape'
import { ChannelMomentumBlock } from '@/sections/DistributionStrength'

/**
 * Market & Distribution — one integrated dashboard page (no internal tabs).
 *
 *   Row 1 · full-width   → Market Engine / Structural Opportunity hero
 *   Row 2 · two columns  → GI premium pool-shift chart (left, 1.35fr, primary)
 *                          + Channel Momentum chart (right, 0.85fr, supporting)
 *
 * The three blocks read as a single composed surface rather than disconnected
 * tab views; each retains its own chart logic, toggles and source strips.
 */
export function MarketDistribution() {
  return (
    <div className="space-y-6">
      {/* Row 1 — full-width hero */}
      <MarketEngineHero />

      {/* Row 2 — primary distribution chart (left) + supporting momentum (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)] lg:items-stretch">
        <GiPoolShiftBlock />
        <ChannelMomentumBlock />
      </div>
    </div>
  )
}
