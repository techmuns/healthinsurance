import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Database, ExternalLink, UploadCloud, ShieldCheck, Ban, ArrowDownToLine,
  CheckCircle2, FileSearch, ListChecks,
} from 'lucide-react'
import { Drawer } from './Drawer'
import { SignalBadge } from './SignalBadge'
import { OrganicIconBlob } from './OrganicIconBlob'
import {
  STATE_META, BASIS_META, METRIC_LABEL, SOURCE_PRIORITY_LADDER, SUPPORTED_DOC_TYPES,
  MOCK_CELL_STATUS, MOCK_EXTRACTION, MOCK_AUDIT, SCREENER_POLICY, allowedForStatutory,
  type SourceCellStatus, type SourceBasis,
} from '@/data/sourceAutomation'

export interface SourceAutomationPanelProps {
  open: boolean
  onClose: () => void
  /** Pre-select a company (e.g. the focal insurer on a company page). */
  focusCompanyId?: string
}

const basisTone: Record<SourceBasis, 'teal' | 'navy' | 'negative' | 'neutral' | 'warning'> = {
  statutory: 'teal', ifrs: 'navy', broker: 'negative', market_data: 'neutral', screener_fallback: 'warning',
}

/** Heuristic auto-detect from an uploaded file name (Phase 1 — mock extraction). */
function detectFromName(name: string) {
  const n = name.toLowerCase()
  const company =
    n.includes('aditya') ? 'Aditya Birla Health'
    : n.includes('manipal') || n.includes('cigna') ? 'ManipalCigna Health'
    : n.includes('star') ? 'Star Health'
    : n.includes('niva') ? 'Niva Bupa'
    : n.includes('care') ? 'Care Health' : 'Unknown'
  const period = (n.match(/fy\s?-?(\d{2})/) ?? n.match(/20(\d{2})[-_ ]?(\d{2})/))?.[0]?.toUpperCase() ?? '—'
  const doc =
    n.includes('annual') ? SUPPORTED_DOC_TYPES[0]
    : n.includes('disclosure') ? SUPPORTED_DOC_TYPES[1]
    : n.includes('result') ? SUPPORTED_DOC_TYPES[2]
    : n.includes('presentation') || n.includes('earnings') ? SUPPORTED_DOC_TYPES[3]
    : n.includes('broker') || n.includes('research') ? SUPPORTED_DOC_TYPES[4]
    : SUPPORTED_DOC_TYPES[0]
  return { company, period, doc }
}

function Card({ title, icon, children, accent }: { title: string; icon: ReactNode; children: ReactNode; accent?: string }) {
  return (
    <section className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-navy-primary">{icon}</span>
        <h4 className="font-display text-[15px] text-navy-deep">{title}</h4>
        {accent && <span className="ml-auto text-[11px] font-semibold text-ink-secondary">{accent}</span>}
      </div>
      {children}
    </section>
  )
}

export function SourceAutomationPanel({ open, onClose, focusCompanyId }: SourceAutomationPanelProps) {
  const companies = useMemo(() => {
    const seen = new Map<string, string>()
    MOCK_CELL_STATUS.forEach((r) => seen.set(r.companyId, r.company))
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [])

  const initial = focusCompanyId && companies.some((c) => c.id === focusCompanyId) ? focusCompanyId : 'all'
  const [company, setCompany] = useState<string>(initial)
  const [fallbackFor, setFallbackFor] = useState<SourceCellStatus | null>(null)
  const [uploaded, setUploaded] = useState<{ name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(
    () => MOCK_CELL_STATUS.filter((r) => company === 'all' || r.companyId === company),
    [company],
  )
  const blockedCount = rows.filter((r) => STATE_META[r.state].fallback).length

  const detected = uploaded ? detectFromName(uploaded.name) : null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Source Automation & Fallback"
      subtitle="Official-first acquisition · manual upload only when automation is blocked"
    >
      {/* Intent + honesty note */}
      <div className="mb-5 flex items-center gap-3 rounded-xl2 border border-soft-border bg-soft-blue/50 p-4">
        <OrganicIconBlob shape="blob-c" tone="navy" size="sm"><Database /></OrganicIconBlob>
        <p className="text-sm text-ink-primary">
          The dashboard tries <span className="font-semibold">official sources automatically first</span>; a
          PDF upload appears only as a fallback when fetch is blocked or a file isn’t staged. Statuses below are{' '}
          <span className="font-semibold">illustrative (Phase 1)</span>, seeded from the real known blockers.
        </p>
      </div>

      {/* Source priority ladder */}
      <Card title="Source priority ladder" icon={<ArrowDownToLine className="h-4 w-4" />} accent="automation → fallback">
        <ol className="space-y-1.5">
          {SOURCE_PRIORITY_LADDER.map((s) => (
            <li key={s.rank} className="flex items-center gap-3 rounded-lg bg-ice/60 px-3 py-2">
              <span className={['grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                s.automated ? 'bg-teal-soft text-teal' : 'bg-gold-soft text-gold'].join(' ')}>{s.rank}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink-primary">{s.label}</p>
                <p className="text-[11px] text-ink-secondary">{s.note}</p>
              </div>
              <span className="ml-auto shrink-0">
                <SignalBadge label={s.automated ? 'Automated' : 'Fallback'} tone={s.automated ? 'teal' : 'warning'} size="sm" />
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Screener fallback policy (Neha, 2026-06-08) */}
      <div className="mt-3 flex items-start gap-3 rounded-xl2 border border-[#F0E1BE] bg-gold-soft/50 p-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <p className="text-[12.5px] text-ink-primary">
          <span className="font-semibold">{SCREENER_POLICY.label}</span> ·{' '}
          <span className="font-semibold text-gold">{SCREENER_POLICY.badge}</span>. <span className="text-ink-secondary">{SCREENER_POLICY.rule}</span>
        </p>
      </div>

      {/* Company filter */}
      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Company</span>
        <button onClick={() => setCompany('all')}
          className={['rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
            company === 'all' ? 'bg-navy-primary text-white' : 'bg-ice text-ink-secondary hover:text-navy-primary'].join(' ')}>
          All
        </button>
        {companies.map((c) => (
          <button key={c.id} onClick={() => setCompany(c.id)}
            className={['rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
              company === c.id ? 'bg-navy-primary text-white' : 'bg-ice text-ink-secondary hover:text-navy-primary'].join(' ')}>
            {c.name}
          </button>
        ))}
        {blockedCount > 0 && (
          <span className="ml-auto text-[11px] text-ink-secondary">
            {blockedCount} cell{blockedCount > 1 ? 's' : ''} need a fallback upload
          </span>
        )}
      </div>

      {/* Source status by cell */}
      <Card title="Source status by cell" icon={<FileSearch className="h-4 w-4" />}>
        <div className="overflow-hidden rounded-lg border border-soft-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-ice text-[10.5px] uppercase tracking-wide text-ink-secondary">
              <tr>
                <th className="px-3 py-2 font-semibold">Metric · Period</th>
                <th className="px-3 py-2 font-semibold">Basis</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Official source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const meta = STATE_META[r.state]
                const ok = allowedForStatutory(r.basis, true)
                return (
                  <tr key={`${r.companyId}-${r.metric}-${r.period}`} className={i % 2 ? 'bg-ice/30' : ''}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink-primary">{METRIC_LABEL[r.metric] ?? r.metric}</p>
                      <p className="text-[11px] text-ink-secondary">{company === 'all' ? `${r.company} · ` : ''}{r.period}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <SignalBadge label={BASIS_META[r.basis].label} tone={basisTone[r.basis]} size="sm" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span title={meta.note} className="inline-flex flex-col gap-1">
                        <SignalBadge label={meta.label} tone={meta.tone} size="sm" />
                        {meta.fallback && (
                          <button onClick={() => { setFallbackFor(r); setUploaded(null) }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-gold hover:underline">
                            <UploadCloud className="h-3 w-3" /> Upload official source
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-secondary">
                      {r.officialSource?.url ? (
                        <a href={r.officialSource.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-navy-primary hover:underline">
                          {r.officialSource.label}<ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (r.officialSource?.label ?? '—')}
                      {!ok && <span className="ml-1 text-coral">· non-statutory blocked</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Fallback upload — surfaces only when a blocked cell is chosen */}
      {fallbackFor && (
        <div className="mt-4 animate-fade-in space-y-4">
          <div className="flex items-start gap-3 rounded-xl2 border border-[#F0E1BE] bg-gold-soft/60 p-4">
            <Ban className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                Official source exists, but automated fetch is blocked.
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-secondary">
                {METRIC_LABEL[fallbackFor.metric] ?? fallbackFor.metric} · {fallbackFor.period} · {fallbackFor.company}.
                Upload the official PDF to continue. {fallbackFor.note}
              </p>
            </div>
          </div>

          <Card title="Source upload (fallback)" icon={<UploadCloud className="h-4 w-4" />} accent={fallbackFor.company}>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed border-soft-border bg-ice/40 px-4 py-7 text-center transition-colors hover:border-navy-primary/40 hover:bg-soft-blue/40">
              <UploadCloud className="h-7 w-7 text-navy-primary/70" />
              <p className="text-sm font-medium text-ink-primary">Drop the official PDF here, or click to choose</p>
              <p className="text-[11.5px] text-ink-secondary">Annual report · public disclosure · exchange result · investor presentation (IFRS-tagged)</p>
            </button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploaded({ name: f.name }) }} />
            {uploaded && <p className="mt-2 text-[12px] text-ink-secondary">Received: <span className="font-medium text-ink-primary">{uploaded.name}</span> — auto-detecting…</p>}
          </Card>

          {detected && (
            <Card title="Auto-detection" icon={<FileSearch className="h-4 w-4" />} accent={`${Math.round(MOCK_EXTRACTION.confidence * 100)}% confidence`}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
                <div><dt className="text-[11px] text-ink-secondary">Company</dt><dd className="font-medium text-ink-primary">{detected.company}</dd></div>
                <div><dt className="text-[11px] text-ink-secondary">Period</dt><dd className="font-medium text-ink-primary">{detected.period}</dd></div>
                <div><dt className="text-[11px] text-ink-secondary">Document type</dt><dd className="font-medium text-ink-primary">{detected.doc.label}</dd></div>
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-[11px] text-ink-secondary">Source basis</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <SignalBadge label={BASIS_META[detected.doc.basis].label} tone={basisTone[detected.doc.basis]} size="sm" />
                    {allowedForStatutory(detected.doc.basis, detected.doc.official)
                      ? <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald"><ShieldCheck className="h-3.5 w-3.5" /> Allowed for statutory cells</span>
                      : <span className="inline-flex items-center gap-1 text-[12px] font-medium text-coral"><Ban className="h-3.5 w-3.5" /> Blocked from statutory cells</span>}
                  </dd>
                </div>
              </dl>
            </Card>
          )}

          {detected && (
            <Card title="Extraction review" icon={<ListChecks className="h-4 w-4" />} accent="approve before ingestion">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-ice text-[10px] uppercase tracking-wide text-ink-secondary">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Metric · Period</th>
                      <th className="px-2 py-2 font-semibold">Extracted → Normalized</th>
                      <th className="px-2 py-2 font-semibold">Basis · Page · Label</th>
                      <th className="px-2 py-2 font-semibold">Conflict</th>
                      <th className="px-2 py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_EXTRACTION.rows.map((c, i) => {
                      const blocked = c.conflict === 'blocked_non_statutory'
                      return (
                        <tr key={i} className={blocked ? 'bg-coral-soft/40' : i % 2 ? 'bg-ice/30' : ''}>
                          <td className="px-2 py-2 font-medium text-ink-primary">{METRIC_LABEL[c.metric] ?? c.metric}<span className="block text-[10.5px] font-normal text-ink-secondary">{c.period}</span></td>
                          <td className="px-2 py-2 text-ink-secondary">{c.rawValue} <span className="text-ink-primary">→ {c.normalizedValue ?? '—'} {c.unit}</span></td>
                          <td className="px-2 py-2 text-ink-secondary">
                            <SignalBadge label={BASIS_META[c.basis].label} tone={basisTone[c.basis]} size="sm" />
                            <span className="ml-1 text-[11px]">p.{c.sourcePage} · “{c.exactLabel}”</span>
                          </td>
                          <td className="px-2 py-2">
                            {blocked
                              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-coral"><Ban className="h-3 w-3" /> non-statutory</span>
                              : <span className="text-[11px] text-emerald">new fill</span>}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {blocked
                              ? <span className="text-[11px] font-medium text-coral">blocked</span>
                              : <span className="inline-flex gap-1">
                                  <span className="rounded-md bg-emerald-soft px-2 py-0.5 text-[11px] font-semibold text-emerald">Approve</span>
                                  <span className="rounded-md bg-ice px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">Reject</span>
                                </span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11.5px] text-ink-secondary">
                Approved rows enter the <span className="font-medium">annual_report</span> source-map layer with full page-cited audit trail.
                Non-statutory rows are held back. <span className="italic">Phase 1 preview — extraction is mocked; the annual_report layer is the first real path (Phase 3).</span>
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Audit trail */}
      <div className="mt-4">
        <Card title="Source-layer audit · verification status" icon={<CheckCircle2 className="h-4 w-4" />}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-ice text-[10px] uppercase tracking-wide text-ink-secondary">
                <tr>
                  <th className="px-2 py-2 font-semibold">Company · Metric · Period</th>
                  <th className="px-2 py-2 font-semibold">Value</th>
                  <th className="px-2 py-2 font-semibold">Source · Page · Label</th>
                  <th className="px-2 py-2 font-semibold">Layer</th>
                  <th className="px-2 py-2 font-semibold">Verification</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_AUDIT.map((a, i) => {
                  const screener = a.layer === 'screener_fallback'
                  return (
                    <tr key={i} className={screener ? 'bg-gold-soft/30' : i % 2 ? 'bg-ice/30' : ''}>
                      <td className="px-2 py-2 font-medium text-ink-primary">{a.company} · {METRIC_LABEL[a.metric] ?? a.metric} · {a.period}</td>
                      <td className="px-2 py-2 text-ink-primary">{a.value == null ? '—' : a.value.toLocaleString('en-IN')}</td>
                      <td className="px-2 py-2 text-ink-secondary">{a.sourceFile}{a.page ? ` · p.${a.page}` : ''} · “{a.exactLabel}”</td>
                      <td className="px-2 py-2"><SignalBadge label={a.layer} tone={screener ? 'warning' : 'navy'} size="sm" /></td>
                      <td className="px-2 py-2">
                        {screener
                          ? <span className="text-[11px] font-medium text-gold">{a.verification}{a.fetchedAt ? ` · ${a.fetchedAt}` : ''}</span>
                          : <span className="inline-flex items-center gap-1 text-[11px] text-emerald"><ShieldCheck className="h-3 w-3" /> {a.verification ?? 'official'}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Drawer>
  )
}
