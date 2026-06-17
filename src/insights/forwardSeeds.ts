// ---------------------------------------------------------------------------
//  Forward-block seeds — the "Next steps" (How to use this / What to watch) for
//  the committed sample insights. These mirror what the model authors live (see
//  the runtime prompt in scripts/generate-insights.ts): grounded analytical
//  IMPLICATIONS and anchored monitorables — never advice, never a price target.
//
//  Why a seed file: `application`/`watch` are model-authored at generation time,
//  but the committed sample must render them too. Every number here traces to a
//  value in the signal payload (the grounding test enforces it). On the next live
//  `insights:generate`, the model's own blocks replace these.
// ---------------------------------------------------------------------------
import type { Application, Watch } from './types'

export const FORWARD_SEEDS: Record<string, { application: Application; watch: Watch }> = {
  'care-solvency-runway': {
    application: {
      framing: 'A capital-event clock for Care — it clears the floor today, but has the least room in the panel to grow into it.',
      uses: [
        { angle: 'Catalyst', detail: 'Sets up around a near-term equity raise / dilution at Care: a ~0.6-year runway to the floor versus ~3.8 for Niva and ~4.1 for Star.' },
        { angle: 'Relative value', detail: 'Frames Care (1.68x solvency, just +0.18x over the 1.5x floor) against Niva and Star, which carry multi-year runways and no comparable raise pressure.' },
        { angle: 'Risk flag', detail: 'If long Care, size for issuance risk while solvency compounds down at ~21% GWP growth.' },
      ],
    },
    watch: {
      items: [
        { trigger: 'Capital action / GWP growth', condition: 'Care raises equity, or GWP growth decelerates below ~10% from ~21%, restoring a multi-year runway', cadence: 'next annual print', direction: 'invalidates' },
        { trigger: 'Solvency ratio', condition: 'erodes toward the 1.5x floor from the current 1.68x', cadence: 'next quarterly return', direction: 'confirms' },
        { trigger: 'Raise-pressure horizon', condition: 'stays near ~0.6 yrs vs ~3.8 (Niva) and ~4.1 (Star)', direction: 'confirms' },
      ],
    },
  },
  'segment-underwriting-loss': {
    application: {
      framing: 'A sector-quality read: the SAHI growth story rests on investment income, not core underwriting.',
      uses: [
        { angle: 'Thesis check', detail: "Tests any 'margin re-rating' case against a 105.06% panel-mean combined ratio — every name is still above the 100% break-even." },
        { angle: 'Relative value', detail: 'Ranks the group on the path back to break-even: Star (101.1%) and Niva (101.2%) sit closest, ManipalCigna (115%) the furthest.' },
        { angle: 'Risk flag', detail: 'Treat reported segment profit as investment-led until a combined ratio prints below 100%.' },
      ],
    },
    watch: {
      items: [
        { trigger: 'Combined ratio (any SAHI)', condition: 'prints below the 100% break-even — a genuine underwriting profit', cadence: 'next annual accounts', direction: 'invalidates' },
        { trigger: 'Panel-mean combined ratio', condition: 'improves from 105.06% toward the 100% line', cadence: 'FY26 results', direction: 'either' },
      ],
    },
  },
  'niva-pb-roe-dislocation': {
    application: {
      framing: 'A forward-ROE option read on Niva — the multiple already prices the ramp, not the current return.',
      uses: [
        { angle: 'Relative value', detail: "Frames Niva vs Star: a richer 1.65x P/GWP on a 5.66% ROE against Star's 1.49x on ~11% — paying more for less current return." },
        { angle: 'Catalyst', detail: 'Positions around the ROE path: a 3.0x P/B vs a ~0.47x warranted multiple (ROE ÷ 12% CoE) is the gap the target must close.' },
        { angle: 'Risk flag', detail: 'Underwriting is still loss-making (CR 101.2%) and coverage is thin — little cushion if the ROE step stalls.' },
      ],
    },
    watch: {
      items: [
        { trigger: 'Niva ROE path', condition: 'continues stepping from 5.66% toward the mid-teens target on improving underwriting (vindicating the multiple)', cadence: 'next annual print', direction: 'invalidates' },
        { trigger: 'Niva combined ratio', condition: 'falls below 100% from 101.2%', cadence: 'FY26 results', direction: 'confirms' },
        { trigger: 'Analyst coverage', condition: 'broadens beyond the current 2 analysts, stress-testing the forward ROE', direction: 'either' },
      ],
    },
  },
  'niva-retail-mix-drift': {
    application: {
      framing: "A mix-quality read: Niva's healthy headline retail share masks a downward trend.",
      uses: [
        { angle: 'Thesis check', detail: 'Challenges the retail-led margin case — Niva’s retail mix is sliding ~2.89pp/yr even as group premium grew 24.4%.' },
        { angle: 'Relative value', detail: 'Contrasts Niva’s negative slope with Star (+1.35pp/yr) and Care (+1.72pp/yr) building retail.' },
        { angle: 'Risk flag', detail: 'Watch margin guidance if growth keeps tilting to thinner group business off the 67.8% mix.' },
      ],
    },
    watch: {
      items: [
        { trigger: 'Retail-mix slope', condition: 'turns positive from the current -2.89pp/yr (retail re-accelerates clear of group)', cadence: 'next GI-Council quarterly cut', direction: 'invalidates' },
        { trigger: 'Retail vs group growth', condition: 'retail premium pulls clear of the 24.4% group pace', direction: 'confirms' },
      ],
    },
  },
  'aditya-growth-quality': {
    application: {
      framing: "A growth-quality read: Aditya's top-line velocity is real; the margins and capital behind it are not yet.",
      uses: [
        { angle: 'Catalyst', detail: 'Positions around proof-of-margin: 50.3% retail growth off the lowest 37.1% retail base in the panel.' },
        { angle: 'Risk flag', detail: 'A loss-making 105% combined ratio and a thin 1.84x solvency cap the quality of that growth.' },
        { angle: 'Thesis check', detail: "Tests the 'fastest grower wins' read against whether the growth turns margin-accretive." },
      ],
    },
    watch: {
      items: [
        { trigger: 'Combined ratio vs growth', condition: 'CR improves toward the 100% break-even while retail growth holds near 50.3% (growth proves margin-accretive)', cadence: 'next annual print', direction: 'invalidates' },
        { trigger: 'Solvency ratio', condition: 'strengthens from the current 1.84x to fund the growth', direction: 'confirms' },
      ],
    },
  },
  'manipal-cr-outlier': {
    application: {
      framing: "An execution-risk read: ManipalCigna's fix is the right lever but the steepest climb in the panel.",
      uses: [
        { angle: 'Risk flag', detail: 'The 115% combined ratio is a +1.72σ outlier vs the 105.06% peer mean — the largest repair off the smallest scale.' },
        { angle: 'Catalyst', detail: 'Positions around the mix lever: retail mix climbing to 51.6% at +1.17pp/yr is the path to repair.' },
        { angle: 'Thesis check', detail: 'Tests whether gradual mix gains can outrun the worst underwriting position in the group.' },
      ],
    },
    watch: {
      items: [
        { trigger: 'Combined ratio', condition: 'repairs toward the ~105.06% peer mean from 115% within the next two prints', cadence: 'next two annual prints', direction: 'invalidates' },
        { trigger: 'Retail-mix slope', condition: 'accelerates beyond the current +1.17pp/yr toward a higher mix than 51.6%', direction: 'confirms' },
      ],
    },
  },
  'niva-credibility-thin-coverage': {
    application: {
      framing: 'A credibility-vs-coverage read: Niva is delivering, but few analysts are watching.',
      uses: [
        { angle: 'Thesis check', detail: '3 of 5 guidance items delivered with zero misses supports management credibility on the forward-ROE plan.' },
        { angle: 'Catalyst', detail: 'Thin coverage (2 analysts, a tight 7.5% target band, +12.2% upside) means a modest surprise can move the stock outsized.' },
        { angle: 'Risk flag', detail: 'The one delayed item — the combined ratio at 101.2% — is the guidance line to watch.' },
      ],
    },
    watch: {
      items: [
        { trigger: 'Coverage / guidance', condition: "analyst count rises materially from 2, or a tracked guidance item flips to 'missed' from the current 3 of 5 delivered", direction: 'invalidates' },
        { trigger: 'Consensus', condition: 'the tight 7.5% target band or +12.2% upside shifts as the price re-rates', direction: 'either' },
      ],
    },
  },
}
