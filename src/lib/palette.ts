// ---------------------------------------------------------------------------
// Color psychology — one source of truth for the dashboard's signal colours.
//   navy   = selected / highlighted company
//   gold   = leader / best in column
//   teal   = positive trend / improving metric
//   red    = risk / weak metric / deterioration
//   slate  = neutral peer
// Keep these in sync with tailwind.config.js (navy-primary, champagne, teal…).
// ---------------------------------------------------------------------------

export const PALETTE = {
  selected: '#27457E',
  leader: '#B68B3A',
  positive: '#168E8E',
  risk: '#C0584F',
  neutral: '#8C97A8',
} as const
