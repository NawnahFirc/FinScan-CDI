import React from 'react'
import { useStore } from '../store/useStore'
import { buildCorporateDecision } from '../lib/corporateDecision'
import { fmt, last } from '../lib/finance'

function toneForLevel(l) {
  return l === 'high' ? 'var(--danger)' : l === 'medium' ? 'var(--warn)' : 'var(--good)'
}

function RiskBadge({ level }) {
  return <span className={`badge ${level}`}>{level === 'high' ? 'High Risk' : level === 'medium' ? 'Medium' : 'Low Risk'}</span>
}

function WatchCard({ company, onRemove, onOpen }) {
  const decision = buildCorporateDecision(company)
  const rev = last(company.revenue)
  const sector = company.sector || 'general'

  return (
    <div className="watchlist-card">
      <div className="watchlist-card-head">
        <div>
          <div className="watchlist-card-name">{company.company || 'Unknown Company'}</div>
          <div className="watchlist-card-meta">{sector} · {company.displayCurrency || company.currency || 'UNKNOWN'} · {company.period || '—'}</div>
        </div>
        <div className="watchlist-card-score" style={{ color: toneForLevel(decision.level) }}>
          {decision.compositeScore}
        </div>
      </div>

      <div className="watchlist-risk-row">
        <RiskBadge level={decision.level} />
        <span className="conf-badge medium">{decision.recommendation.short}</span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>
        {decision.recommendation.summary}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
        <div>
          <div style={{ color: 'var(--heading-soft)', marginBottom: 3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenue</div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{fmt(rev, company.displayCurrency || company.currency)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--heading-soft)', marginBottom: 3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Exposure cap</div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{decision.exposure.displayAmount}</div>
        </div>
      </div>

      <div className="watchlist-card-actions">
        <button className="btn sm" style={{ flex: 1 }} onClick={() => onOpen(company)}>
          Open Analysis
        </button>
        <button className="btn sm" onClick={() => onRemove(company)}>
          Remove
        </button>
      </div>
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'risk-desc', label: 'Highest risk first' },
  { value: 'risk-asc', label: 'Lowest risk first' },
  { value: 'score-desc', label: 'Score: high to low' },
  { value: 'score-asc', label: 'Score: low to high' },
  { value: 'name', label: 'Company name' },
]

export default function WatchlistPage() {
  const { companies, watchlist, removeFromWatchlist, setActiveCompany, setActivePage } = useStore()
  const [sort, setSort] = React.useState('risk-desc')
  const [filter, setFilter] = React.useState('all')

  const watched = companies.filter(c => {
    const key = `${c.company}::${c._filename}`
    return watchlist.includes(key)
  })

  const withDecisions = watched.map(c => ({ company: c, decision: buildCorporateDecision(c) }))

  const filtered = filter === 'all'
    ? withDecisions
    : withDecisions.filter(({ decision }) => decision.level === filter)

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'risk-desc': {
        const order = { high: 0, medium: 1, low: 2 }
        return order[a.decision.level] - order[b.decision.level]
      }
      case 'risk-asc': {
        const order = { high: 2, medium: 1, low: 0 }
        return order[a.decision.level] - order[b.decision.level]
      }
      case 'score-desc': return b.decision.compositeScore - a.decision.compositeScore
      case 'score-asc': return a.decision.compositeScore - b.decision.compositeScore
      case 'name': return (a.company.company || '').localeCompare(b.company.company || '')
      default: return 0
    }
  })

  function handleRemove(company) {
    const key = `${company.company}::${company._filename}`
    removeFromWatchlist(key)
  }

  function handleOpen(company) {
    setActiveCompany(company)
    setActivePage('decision')
  }

  const highCount = withDecisions.filter(d => d.decision.level === 'high').length
  const medCount = withDecisions.filter(d => d.decision.level === 'medium').length
  const lowCount = withDecisions.filter(d => d.decision.level === 'low').length

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>Watchlist</h2>
          <p>Monitor saved counterparties. Add companies from the Corporate Decision page.</p>
        </div>
        <div className="page-actions">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {watched.length > 0 && (
        <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
          {[
            { label: 'Total watched', value: watched.length, color: 'var(--info)' },
            { label: 'High risk', value: highCount, color: 'var(--danger)' },
            { label: 'Medium risk', value: medCount, color: 'var(--warn)' },
            { label: 'Low risk', value: lowCount, color: 'var(--good)' },
          ].map(k => (
            <div key={k.label} className="decision-kpi">
              <div className="decision-kpi-label">{k.label}</div>
              <div className="decision-kpi-value" style={{ fontSize: 28, marginTop: 6, marginBottom: 4, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {watched.length > 0 && (
        <div className="std-tabs" style={{ marginBottom: '1rem' }}>
          {['all', 'high', 'medium', 'low'].map(f => (
            <button
              key={f}
              className={`std-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span style={{ marginLeft: 5, opacity: 0.72 }}>
                  ({f === 'high' ? highCount : f === 'medium' ? medCount : lowCount})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="watchlist-empty">
          {watched.length === 0 ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
              <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, color: 'var(--heading-tone)', marginBottom: 8 }}>No companies on watchlist</h3>
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>
                Open the Corporate Decision page for any company and click "Add to Watchlist".
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--text2)' }}>No companies match this filter.</p>
          )}
        </div>
      ) : (
        <div className="watchlist-grid">
          {sorted.map(({ company }) => (
            <WatchCard
              key={`${company.company}::${company._filename}`}
              company={company}
              onRemove={handleRemove}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
