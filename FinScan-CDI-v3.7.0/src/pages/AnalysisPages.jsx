import { divide, fixed, changePercent, numberOrNaN } from '../lib/numeric.js'
import { buildCorporateDecision } from '../lib/corporateDecision.js'
﻿// â”€â”€ All analysis pages â€” each exported separately â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import React, { useEffect, useRef, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { useStore } from '../store/useStore'
import { analyzeCompany } from '../lib/api'
import { last, fmtN, fmt, pct, computeRiskScore, computeAltman, computeBeneish, computeAltmanDetails, computeBeneishDetails, buildAvailableDataSignals, buildForensicReadiness, STD_LABELS, CHART_COLORS } from '../lib/finance'
import { buildLiquidityAnalysis } from '../lib/liquidity'
import MissingMetricsBanner from '../components/MissingMetricsBanner'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

// â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Card({ title, children, actions }) {
  return (
    <div className="card">
      {(title || actions) && (
        <div className={actions ? 'card-header' : ''}>
          {title && <div className="card-title">{title}</div>}
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

function Badge({ level, children }) {
  return <span className={`badge ${level}`}>{children}</span>
}

function RatioRow({ name, val, pctVal, color, bench }) {
  return (
    <div className="ratio-row">
      <span className="rname">{name}</span>
      <div className="rbarwrap"><div className="rbar" style={{ width: `${Number.isFinite(pctVal) ? Math.min(Math.abs(pctVal), 100) : 0}%`, background: color }} /></div>
      <span className="rval" style={{ color }}>{String(val).replace(/(?:NaN|n\/a|Infinity)[%x]?/g,'n/a')}</span>
      <span className="rbench">{bench}</span>
    </div>
  )
}

function metricDelta(value, threshold, goodWhenLower = false) {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) return 'n/a'
  const delta = Number((value - threshold).toFixed(2))
  if (goodWhenLower) {
    return delta <= 0
      ? `${Math.abs(delta).toFixed(2)} below threshold`
      : `${fixed(delta, 2)} above threshold`
  }
  return delta >= 0
    ? `${fixed(delta, 2)} above threshold`
    : `${Math.abs(delta).toFixed(2)} below threshold`
}

function toneForLevel(level) {
  return level === 'high'
    ? 'var(--danger)'
    : level === 'medium'
      ? 'var(--warn)'
      : 'var(--good)'
}

function previousValue(series) {
  return Array.isArray(series) && series.length > 1 ? series[series.length - 2] : null
}

function formatReportValue(value, format = 'number', currency = 'EUR') {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  if (format === 'money') return fmt(value, currency)
  if (format === 'percent') return `${Number(value).toFixed(1)}%`
  if (format === 'ratio') return `${Number(value).toFixed(2)}x`
  if (format === 'days') return `${Number(value).toFixed(1)} days`
  return Number(value).toFixed(2)
}

function assessmentLabel(level) {
  return level === 'high' ? 'Concerning' : level === 'medium' ? 'Medium watch' : 'Healthy'
}

function firstSentence(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const match = normalized.match(/.*?[.!?](?:\s|$)/)
  return (match ? match[0] : normalized).trim()
}

function compactReportText(text, maxLength = 150) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const shortened = firstSentence(normalized)
  if (shortened.length <= maxLength) return shortened
  return `${shortened.slice(0, maxLength - 1).trimEnd()}...`
}

function stripLeadingLabel(text) {
  return String(text || '').replace(/^[^:]{0,90}:\s*/, '').trim()
}

function readinessLevel(model) {
  if (model.ready) return 'low'
  return model.coverage >= 70 ? 'medium' : 'high'
}

function FraudSignalsPanel({ company, beneish, altman, flags }) {
  const altmanColor = toneForLevel(altman.level)
  const beneishColor = toneForLevel(beneish.level)
  const beneishScoreText = beneish.mscore || 'n/a'
  const altmanScoreText = altman.scoreDisplay || (Number.isFinite(altman.score) ? altman.score.toFixed(2) : 'n/a')
  const readiness = buildForensicReadiness(company || {})
  const availableSignals = buildAvailableDataSignals(company || {})
  const readinessRows = [
    ...readiness.altman.groups.map(group => ({ model: 'Altman', ...group })),
    ...readiness.beneish.groups.map(group => ({ model: 'Beneish', ...group })),
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>Fraud Signals</h2>
          <p>Score, threshold comparison, and interpretation for Beneish and Altman on the current filing.</p>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Beneish M-Score" actions={<Badge level={beneish.level}>{beneish.available === false ? beneish.statusLabel || 'Limited Data' : beneish.statusLabel || (beneish.manipulated ? 'Manipulation Flag' : 'No Flag')}</Badge>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: String(beneishScoreText).length > 8 ? 32 : 56, fontWeight: 700, color: beneishColor, fontFamily: 'DM Mono, monospace', lineHeight: 1.05 }}>{beneishScoreText}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: beneishColor, marginTop: 10 }}>{beneish.comparisonText}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{beneish.benchmarkText}</div>
            </div>
            <div className="scenario-impact-list">
              <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>Explanation</strong>
              {beneish.explanation}
            </div>
          </div>
          <div className="table-subnote">{beneish.note}</div>
        </Card>

        <Card title="Altman Z-Score" actions={<Badge level={altman.level}>{altman.zoneLabel}</Badge>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: String(altmanScoreText).length > 8 ? 32 : 56, fontWeight: 700, color: altmanColor, fontFamily: 'DM Mono, monospace', lineHeight: 1.05 }}>{altmanScoreText}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: altmanColor, marginTop: 10 }}>{altman.comparisonText}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{altman.benchmarkText}</div>
            </div>
            <div className="scenario-impact-list">
              <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>Explanation</strong>
              {altman.explanation}
            </div>
          </div>
          <div className="table-subnote">{altman.note}</div>
        </Card>
      </div>

      <Card title="Available Data Analysis" actions={<Badge level={availableSignals.level}>{availableSignals.label}</Badge>}>
        <div className="available-data-grid">
          <div className="available-data-score">
            <div className="available-score-value" style={{ color: toneForLevel(availableSignals.level) }}>{availableSignals.scoreDisplay}</div>
            <div className="available-score-label">available-data score</div>
            <div className="readiness-meter" aria-hidden="true"><span style={{ width: `${availableSignals.coverage}%` }} /></div>
            <div className="readiness-note">{availableSignals.coverage}% coverage from currently disclosed relationships</div>
          </div>
          <div>
            <div className="liquidity-copy">{availableSignals.explanation}</div>
            <div className="table-subnote">{availableSignals.note}</div>
          </div>
        </div>
        <table className="dt available-data-table">
          <thead><tr><th>Check</th><th>Reading</th><th>Formula</th><th>Signal</th><th>Why It Matters</th></tr></thead>
          <tbody>
            {availableSignals.checks.map(check => (
              <tr key={check.id}>
                <td><strong>{check.label}</strong><div className="fmeta">{check.id}</div></td>
                <td className="num" style={{ color: toneForLevel(check.level) }}>{check.display}</td>
                <td>{check.formula}</td>
                <td><Badge level={check.level}>{check.signal}</Badge></td>
                <td>{check.explanation}</td>
              </tr>
            ))}
            {!availableSignals.checks.length && (
              <tr>
                <td colSpan="5">No supported relationship is available yet. Review the extraction table or add manual figures.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Model Readiness" actions={<Badge level={readiness.altman.ready && readiness.beneish.ready ? 'low' : 'medium'}>{readiness.altman.coverage}% Altman / {readiness.beneish.coverage}% Beneish</Badge>}>
        <div className="readiness-summary">
          {[
            ['Altman Z-Score', readiness.altman],
            ['Beneish M-Score', readiness.beneish],
          ].map(([label, model]) => (
            <div className="readiness-summary-item" key={label}>
              <div className="readiness-summary-top">
                <strong>{label}</strong>
                <Badge level={readinessLevel(model)}>{model.ready ? 'Ready' : `${model.coverage}% Ready`}</Badge>
              </div>
              <div className="readiness-meter" aria-hidden="true"><span style={{ width: `${model.coverage}%` }} /></div>
              <div className="readiness-note">{model.nextAction}</div>
            </div>
          ))}
        </div>
        {readiness.blockers.length > 0 && (
          <div className="readiness-blockers">
            {readiness.blockers.slice(0, 6).map((blocker) => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
        )}
        <table className="dt readiness-table">
          <thead><tr><th>Model</th><th>Input Group</th><th>Formula</th><th>Status</th><th>Missing Inputs</th></tr></thead>
          <tbody>
            {readinessRows.map(row => (
              <tr key={`${row.model}-${row.id}`}>
                <td>{row.model}</td>
                <td><strong>{row.id}</strong><div className="fmeta">{row.label}</div></td>
                <td>{row.formula}</td>
                <td><Badge level={row.ready ? 'low' : 'medium'}>{row.availableCount}/{row.totalCount}</Badge></td>
                <td>{row.ready ? 'Complete' : row.missing.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-subnote">Readiness uses exact disclosed, reviewed, or deterministic values only. Placeholder display zeros and rough proxies are ignored by these fraud models.</div>
      </Card>

      <Card title="Beneish Indicator Comparison" actions={<Badge level={beneish.level}>{beneish.available === false ? beneish.statusLabel || 'Limited Data' : beneish.statusLabel || (beneish.manipulated ? 'Composite Above Cutoff' : 'Composite Below Cutoff')}</Badge>}>
        <table className="dt">
          <thead><tr><th>Indicator</th><th>Current Reading</th><th>Threshold</th><th>Comparison</th><th>Explanation</th><th>Signal</th></tr></thead>
          <tbody>
            {beneish.rows.map(row => (
              <tr key={row.id}>
                <td><strong>{row.id}</strong><div className="fmeta">{row.label}</div></td>
                <td className="num" style={{ color: toneForLevel(row.level) }}>{row.displayValue || (Number.isFinite(row.value) ? row.value.toFixed(2) : 'n/a')}</td>
                <td>{row.thresholdText}</td>
                <td>{metricDelta(row.value, row.threshold, true)}</td>
                <td>{row.explanation}</td>
                <td><Badge level={row.level}>{row.level === 'high' ? 'Elevated' : row.level === 'medium' ? 'Watch' : 'Comfortable'}</Badge></td>
              </tr>
            ))}
            <tr>
              <td><strong>M-Score</strong><div className="fmeta">Composite Beneish screen</div></td>
              <td className="num" style={{ color: beneish.manipulated ? 'var(--danger)' : 'var(--good)' }}>{beneish.mscore}</td>
              <td>{'<= -1.78'}</td>
              <td>{metricDelta(parseFloat(beneish.mscore), -1.78, true)}</td>
              <td>{beneish.explanation}</td>
              <td><Badge level={beneish.level}>{beneish.manipulated ? 'Flagged' : 'Not Flagged'}</Badge></td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="Altman Component Comparison" actions={<Badge level={altman.level}>{altman.zoneLabel}</Badge>}>
        <table className="dt">
          <thead><tr><th>Component</th><th>Current Reading</th><th>Weighted Impact</th><th>Benchmark</th><th>Explanation</th><th>Signal</th></tr></thead>
          <tbody>
            {altman.components.map(component => (
              <tr key={component.id}>
                <td><strong>{component.id}</strong><div className="fmeta">{component.label}</div></td>
                <td className="num" style={{ color: toneForLevel(component.level) }}>{component.displayValue || (Number.isFinite(component.value) ? component.value.toFixed(3) : 'n/a')}</td>
                <td className="num">{component.displayContribution || (Number.isFinite(component.contribution) ? component.contribution.toFixed(2) : 'n/a')}</td>
                <td>{component.benchmark}</td>
                <td>{component.explanation}</td>
                <td><Badge level={component.level}>{component.level === 'high' ? 'Weak' : component.level === 'medium' ? 'Mixed' : 'Supportive'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Model Interpretation">
        <div className="context-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div className="card-title" style={{ marginBottom: '.75rem' }}>Altman View</div>
            <div className="liquidity-copy">{altman.explanation}</div>
            <div className="context-note">Comparison: {altman.comparisonText}</div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: '.75rem' }}>Beneish View</div>
            <div className="liquidity-copy">{beneish.explanation}</div>
            <div className="context-note">Comparison: {beneish.comparisonText}</div>
          </div>
        </div>
      </Card>

      <Card title="Anomaly Flags">
        {flags.map((f, i) => (
          <div key={i} className="flag-item">
            <div className={`fdot ${f.level}`} />
            <div>
              <div className="ftext">{f.text}</div>
              <div className="fmeta">{f.detail}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

const g = (v, good, bad) => !Number.isFinite(v) ? 'var(--text3)' : v >= good ? 'var(--good)' : v >= bad ? 'var(--warn)' : 'var(--danger)'
const gi = (v, bad, warn) => !Number.isFinite(v) ? 'var(--text3)' : v <= bad ? 'var(--good)' : v <= warn ? 'var(--warn)' : 'var(--danger)'

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// OVERVIEW PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function OverviewPage() {
  const d = useStore(s => s.activeCompany)
  if (!d) return null
  const rev = last(d.revenue), ni = last(d.netIncome)
  const cur = d.displayCurrency || d.currency || 'EUR'
  const curRatio = fixed(divide(last(d.currentAssets), last(d.currentLiabilities)), 2)
  const roe = fixed(divide(ni, last(d.equity)) * 100, 1)
  const nm = fixed(divide(ni, rev) * 100, 1)
  const score = computeRiskScore(d)
  const scoreColor = score >= 65 ? 'var(--danger)' : score >= 40 ? 'var(--warn)' : 'var(--good)'
  const circ = 376.99
  const offset = circ - (circ * score / 100)
  const maxR = Math.max(1, ...d.revenue.filter(Number.isFinite).map(Math.abs))
  const revGrowth = d.revenue.length > 1
    ? fixed(changePercent(d.revenue[d.revenue.length - 1], d.revenue[d.revenue.length - 2]), 1)
    : 'n/a'

  return (
    <div>
      <MissingMetricsBanner />
      <div className="page-header">
        <div className="page-header-text">
          <h2>{d.company}</h2>
          <p>{d.period} | {d._filename} | {STD_LABELS[d.standard || 'international']}</p>
        </div>
        <div className="page-actions"><Badge level="info">{STD_LABELS[d.standard || 'international']}</Badge></div>
      </div>

      <div className="file-chip">Source: {d._filename}</div>

      <div className="grid-4">
        {[
          { label: 'Revenue', val: fmt(rev, cur), sub: d.period },
          { label: 'Net Income', val: fmt(ni, cur), sub: `${nm}% margin`, color: ni < 0 ? 'var(--danger)' : 'var(--good)' },
          { label: 'Current Ratio', val: `${curRatio}x`, sub: 'Liquidity', color: parseFloat(curRatio) < 1.2 ? 'var(--warn)' : 'var(--good)' },
          { label: 'Fraud Risk', val: `${score}/100`, sub: score >= 65 ? 'High risk' : score >= 40 ? 'Medium' : 'Low risk', color: scoreColor },
        ].map(m => (
          <div key={m.label} className="metric">
            <div className="mlabel">{m.label}</div>
            <div className="mval" style={{ color: m.color }}>{m.val}</div>
            <div className="msub">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <Card title="Fraud Risk Score">
          <div className="score-wrap">
            <svg width="150" height="150" viewBox="0 0 150 150">
              <circle cx="75" cy="75" r="60" fill="none" stroke="var(--surface2)" strokeWidth="14" />
              <circle cx="75" cy="75" r="60" fill="none" strokeWidth="14" strokeLinecap="round"
                stroke={scoreColor} strokeDasharray="376.99" strokeDashoffset={offset}
                transform="rotate(-90 75 75)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div className="score-num" style={{ color: scoreColor }}>{score}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>out of 100</div>
            <div style={{ marginTop: 10 }}><Badge level={score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low'}>{score >= 65 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk'}</Badge></div>
          </div>
        </Card>

        <Card title="Revenue Trend">
          {d.revenue.map((v, i) => {
            const declining = i > 0 && v < d.revenue[i - 1]
            return (
              <div key={i} className="trend-row">
                <span className="tyear">{d.years?.[i] || i}</span>
                <div className="tbwrap">
                  <div className="tbar" style={{ width: `${(Math.abs(v) / maxR * 100).toFixed(1)}%`, background: v < 0 ? 'var(--danger)' : declining ? 'var(--warn)' : 'var(--good)' }}>
                    {fmt(v, cur)}
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      <Card title="Key Indicators Snapshot">
        <table className="dt">
          <thead><tr><th>Metric</th><th>Value</th><th>Benchmark</th><th>Status</th></tr></thead>
          <tbody>
            {[
              { label: 'Current Ratio', val: `${curRatio}x`, bench: '> 1.5x', ok: parseFloat(curRatio) >= 1.5 },
              { label: 'D/E Ratio', val: `${(divide(last(d.debt), last(d.equity))).toFixed(2)}x`, bench: '< 0.8x', ok: (divide(last(d.debt), last(d.equity))) <= 0.8 },
              { label: 'ROE', val: `${roe}%`, bench: '> 12%', ok: parseFloat(roe) >= 12 },
              { label: 'Net Margin', val: `${nm}%`, bench: '> 10%', ok: parseFloat(nm) >= 10 },
              { label: 'Revenue Growth YoY', val: `${revGrowth}%`, bench: '> 5%', ok: parseFloat(revGrowth) >= 5 },
              { label: 'ROA', val: `${((divide(ni, last(d.totalAssets))) * 100).toFixed(1)}%`, bench: '> 5%', ok: ((divide(ni, last(d.totalAssets))) * 100) >= 5 },
            ].map(row => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="num">{String(row.val).replace(/(?:NaN|n\/a|Infinity)[%x]?/g,'n/a')}</td>
                <td>{row.bench}</td>
                <td><Badge level={row.ok ? 'low' : 'medium'}>{/n\/a|NaN/.test(row.val) ? 'Missing input' : row.ok ? 'Healthy' : 'Watch'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RATIOS PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function RatiosPage() {
  const d = useStore(s => s.activeCompany)
  if (!d) return null
  const rev = last(d.revenue), ta = last(d.totalAssets), eq = last(d.equity)
  const ni = last(d.netIncome)
  const cur = divide(last(d.currentAssets), last(d.currentLiabilities))
  const quick = divide(numberOrNaN(last(d.currentAssets)) - numberOrNaN(last(d.inventory)), last(d.currentLiabilities))
  const cashR = divide(last(d.cash), last(d.currentLiabilities))
  const gm = (divide(last(d.grossProfit), rev)) * 100
  const nm = (divide(ni, rev)) * 100
  const ebitM = (divide(last(d.ebit), rev)) * 100
  const roe = (divide(ni, eq)) * 100
  const roa = (divide(ni, ta)) * 100
  const de = divide(last(d.debt), eq)
  const ic = divide(last(d.ebit), Math.abs(numberOrNaN(last(d.interest))))
  const dr = (divide(last(d.totalLiabilities), ta)) * 100

  const chartData = {
    labels: ['Gross Margin', 'Net Margin', 'EBIT Margin', 'ROE', 'ROA'],
    datasets: [{
      label: 'Current Year (%)',
      data: [gm, nm, ebitM, roe, roa].map(v => +v.toFixed(1)),
      backgroundColor: [gm, nm, ebitM, roe, roa].map(v => v < 0 ? '#de3f57cc' : '#d72f4ccc'),
      borderRadius: 5
    }]
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>Financial Ratios</h2><p>Benchmarked against standard thresholds.</p></div>
        <div className="page-actions"><Badge level="info">{STD_LABELS[d.standard || 'international']}</Badge></div>
      </div>

      <Card title="Liquidity Ratios">
        <RatioRow name="Current Ratio" val={`${fixed(cur, 2)}x`} pctVal={cur / 3 * 100} color={g(cur, 1.5, 1.0)} bench="> 1.5x" />
        <RatioRow name="Quick Ratio" val={`${fixed(quick, 2)}x`} pctVal={quick / 2.5 * 100} color={g(quick, 1.0, 0.7)} bench="> 1.0x" />
        <RatioRow name="Cash Ratio" val={`${fixed(cashR, 2)}x`} pctVal={cashR / 1.5 * 100} color={g(cashR, 0.5, 0.2)} bench="> 0.5x" />
      </Card>

      <Card title="Profitability Ratios">
        <RatioRow name="Gross Margin" val={`${fixed(gm, 1)}%`} pctVal={Math.max(gm, 0)} color={g(gm, 30, 15)} bench="> 30%" />
        <RatioRow name="Net Margin" val={`${fixed(nm, 1)}%`} pctVal={Math.max(nm / 30 * 100, 0)} color={g(nm, 10, 5)} bench="> 10%" />
        <RatioRow name="EBIT Margin" val={`${fixed(ebitM, 1)}%`} pctVal={Math.max(ebitM / 30 * 100, 0)} color={g(ebitM, 12, 6)} bench="> 12%" />
        <RatioRow name="ROE" val={`${fixed(roe, 1)}%`} pctVal={Math.min(Math.max(roe / 30 * 100, 0), 100)} color={g(roe, 12, 6)} bench="> 12%" />
        <RatioRow name="ROA" val={`${fixed(roa, 1)}%`} pctVal={Math.min(Math.max(roa / 15 * 100, 0), 100)} color={g(roa, 5, 2)} bench="> 5%" />
      </Card>

      <Card title="Solvency & Leverage">
        <RatioRow name="Debt / Equity" val={`${fixed(de, 2)}x`} pctVal={de / 3 * 100} color={gi(de, 0.8, 1.5)} bench="< 0.8x" />
        <RatioRow name="Interest Coverage" val={`${fixed(ic, 1)}x`} pctVal={Math.min(ic / 10 * 100, 100)} color={g(ic, 3, 1.5)} bench="> 3.0x" />
        <RatioRow name="Debt Ratio" val={`${fixed(dr, 1)}%`} pctVal={dr} color={gi(dr, 50, 65)} bench="< 50%" />
      </Card>

      <Card title="Profitability Chart">
        <div className="chart-wrap">
          <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => v + '%' } } } }} />
        </div>
      </Card>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FRAUD PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function FraudPage() {
  const d = useStore(s => s.activeCompany)
  if (!d) return null
  const beneish = computeBeneishDetails(d)
  const altman = computeAltmanDetails(d)
  const flags = Array.isArray(d.flags) ? d.flags : []

  return <FraudSignalsPanel company={d} beneish={beneish} altman={altman} flags={flags} />
}
export function TimeSeriesPage() {
  const d = useStore(s => s.activeCompany)
  if (!d) return null
  const years = d.years || ['Y1']
  const rev = Array.isArray(d.revenue) ? d.revenue : [d.revenue]
  const ni = Array.isArray(d.netIncome) ? d.netIncome : [d.netIncome]
  const ta = Array.isArray(d.totalAssets) ? d.totalAssets : [d.totalAssets]
  const eq = Array.isArray(d.equity) ? d.equity : [d.equity]
  const tl = Array.isArray(d.totalLiabilities) ? d.totalLiabilities : [d.totalLiabilities]
  const gp = Array.isArray(d.grossProfit) ? d.grossProfit : [d.grossProfit]
  const grossMargin = rev.map((r, i) => divide(gp[i], r) * 100)
  const netMargin = rev.map((r, i) => divide(ni[i], r) * 100)
  const revGrowth = rev.map((v, i) => changePercent(v, rev[i - 1]))
  const niGrowth = ni.map((v, i) => changePercent(v, ni[i - 1]))
  const cur = d.displayCurrency || d.currency || 'EUR'

  const kpis = [
    { label: 'Revenue', vals: rev }, { label: 'Net Income', vals: ni }, { label: 'Gross Profit', vals: gp },
    { label: 'Total Assets', vals: ta }, { label: 'Equity', vals: eq }, { label: 'Total Liabilities', vals: tl },
    { label: 'Gross Margin %', vals: grossMargin, noFmt: true, suffix: '%' },
    { label: 'Net Margin %', vals: netMargin, noFmt: true, suffix: '%' },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>Year-over-Year Analysis</h2><p>Performance evolution across all available years.</p></div>
      </div>

      <div className="grid-2">
        <Card title="Revenue & Net Income">
          <div className="chart-wrap">
            <Bar data={{ labels: years, datasets: [
                { label: 'Revenue', data: rev, backgroundColor: '#d72f4caa', borderRadius: 5 },
                { label: 'Net Income', data: ni, backgroundColor: ni.map(v => v < 0 ? '#de3f57aa' : '#f25571aa'), borderRadius: 5 }
            ]}} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }} />
          </div>
        </Card>
        <Card title="Margin Trends (%)">
          <div className="chart-wrap">
            <Line data={{ labels: years, datasets: [
            { label: 'Gross Margin %', data: grossMargin, borderColor: '#d72f4c', backgroundColor: '#d72f4c22', tension: .3, fill: true },
            { label: 'Net Margin %', data: netMargin, borderColor: '#5c89ff', backgroundColor: '#5c89ff18', tension: .3 }
            ]}} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => v + '%' } } } }} />
          </div>
        </Card>
      </div>

      <Card title="Balance Sheet Evolution">
        <div className="chart-wrap">
          <Bar data={{ labels: years, datasets: [
            { label: 'Total Assets', data: ta, backgroundColor: '#ff8ea5aa', borderRadius: 5 },
            { label: 'Equity', data: eq, backgroundColor: '#d72f4caa', borderRadius: 5 },
            { label: 'Total Liabilities', data: tl, backgroundColor: '#ff6b84aa', borderRadius: 5 }
          ]}} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }} />
        </div>
      </Card>

      <Card title="Growth Rates (%)">
        <div className="chart-wrap">
          <Bar data={{ labels: years, datasets: [
            { label: 'Revenue Growth %', data: revGrowth, backgroundColor: revGrowth.map(v => v < 0 ? '#de3f57aa' : '#d72f4caa'), borderRadius: 5 },
            { label: 'Net Income Growth %', data: niGrowth, backgroundColor: niGrowth.map(v => v < 0 ? '#de3f57aa' : '#f25571aa'), borderRadius: 5 }
          ]}} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => v + '%' } } } }} />
        </div>
      </Card>

      <Card title="Year-by-Year KPI Table">
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>KPI</th>{years.map(y => <th key={y}>{y}</th>)}{years.map((y, i) => i === 0 ? null : <th key={'g' + y}>vs {years[i - 1]}</th>)}</tr></thead>
            <tbody>
              {kpis.map(k => (
                <tr key={k.label}>
                  <td><strong>{k.label}</strong></td>
                  {k.vals.map((v, i) => (
                    <td key={i} className="num" style={{ color: typeof v === 'number' && v < 0 ? 'var(--danger)' : 'inherit' }}>
                      {!Number.isFinite(v) ? 'n/a' : k.noFmt ? `${fixed(v, 1)}${k.suffix || ''}` : fmt(v, cur)}
                    </td>
                  ))}
                  {k.vals.map((v, i) => {
                    if (i === 0 || k.noFmt) return null
                    const prev = k.vals[i - 1]
                    if (!prev) return <td key={'g' + i}>n/a</td>
                    const gr = ((v - prev) / Math.abs(prev) * 100).toFixed(1)
                    return <td key={'g' + i} className="num" style={{ color: parseFloat(gr) < 0 ? 'var(--danger)' : 'var(--good)' }}>{parseFloat(gr) > 0 ? '+' : ''}{gr}%</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STATEMENTS PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function StatementsPage() {
  const d = useStore(s => s.activeCompany)
  const [tab, setTab] = useState('balance')
  if (!d) return null
  const std = d.standard || 'international'
  const cur = d.displayCurrency || d.currency || 'EUR'
  const isFR = std === 'french' || std === 'moroccan'
  const rev = last(d.revenue), ni = last(d.netIncome), gp = last(d.grossProfit)
  const ta = last(d.totalAssets), eq = last(d.equity), tl = last(d.totalLiabilities)
  const ca = last(d.currentAssets), fa = last(d.fixedAssets), cl = last(d.currentLiabilities)
  const rec = last(d.receivables), inv = last(d.inventory), cash = last(d.cash)
  const ebit = last(d.ebit), interest = last(d.interest), tax = last(d.tax)
  const cogs = d.cogs || (rev - gp)

  function PRow({ label, val, cls = '', indent = false }) {
    return (
      <div className={`pcg-row ${cls} ${indent ? 'pcg-indent' : ''}`}>
        <span>{label}</span><span className="pcg-val">{fmt(val, cur)}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>Financial Statements</h2><p>{d.company} | {d.period} | {STD_LABELS[std]}</p></div>
        <div className="page-actions"><Badge level="info">{STD_LABELS[std]}</Badge></div>
      </div>

      <div className="std-tabs">
        {[['balance', isFR ? 'Bilan' : 'Balance Sheet'], ['income', isFR ? 'CPC' : 'Income Statement'], ['cashflow', isFR ? 'Tableau de Financement' : 'Cash Flow']].map(([id, label]) => (
          <button key={id} className={`std-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'balance' && (
        <div className="card">
          <div className="card-title">{isFR ? 'Bilan' : 'Balance Sheet'} | {d.company} | {d.period}</div>
          <div className="grid-2">
            <div>
              <div className="pcg-section-title">{isFR ? 'Actif' : 'Assets'}</div>
              <PRow label={isFR ? 'Immobilisations nettes' : 'Fixed Assets (Net)'} val={fa} indent />
              <PRow label={isFR ? 'Stocks' : 'Inventories'} val={inv} indent />
              <PRow label={isFR ? 'Creances clients' : 'Receivables'} val={rec} indent />
              <PRow label={isFR ? 'Tresorerie' : 'Cash & Equivalents'} val={cash} indent />
              <PRow label={isFR ? 'Total Actif' : 'TOTAL ASSETS'} val={ta} cls="total" />
            </div>
            <div>
              <div className="pcg-section-title">{isFR ? 'Passif' : 'Equity & Liabilities'}</div>
              <PRow label={isFR ? 'Capitaux propres' : 'Equity'} val={eq} indent />
              <PRow label={isFR ? 'Dettes LT' : 'Non-Current Liabilities'} val={tl - cl} indent />
              <PRow label={isFR ? 'Dettes CT' : 'Current Liabilities'} val={cl} indent />
              <PRow label={isFR ? 'Total Passif' : 'TOTAL EQUITY & LIAB.'} val={ta} cls="total" />
            </div>
          </div>
          {d.years?.length > 1 && Array.isArray(d.totalAssets) && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="card-title">Evolution</div>
              <table className="dt"><thead><tr><th>Item</th>{d.years.map(y => <th key={y}>{y}</th>)}</tr></thead>
                <tbody>
                  {[['Total Assets', d.totalAssets], ['Equity', d.equity], ['Total Liabilities', d.totalLiabilities]].map(([label, arr]) => (
                    <tr key={label}><td>{label}</td>{arr.map((v, i) => <td key={i} className="num">{fmt(v, cur)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'income' && (
        <div className="card">
          <div className="card-title">{isFR ? 'Compte de Produits et Charges (CPC)' : 'Income Statement'} | {d.company} | {d.period}</div>
          {isFR ? (
            <>
              <div className="pcg-section-title">Produits d'exploitation</div>
              <PRow label="Chiffre d'affaires" val={rev} />
              <PRow label="Total produits d'exploitation" val={rev} cls="subtotal" />
              <div style={{ height: 8 }} />
              <div className="pcg-section-title">Charges d'exploitation</div>
              <PRow label="Achats consommes" val={cogs} indent />
              <PRow label="Charges de personnel" val={d.chPersonnel || 0} indent />
              <PRow label="Dotations aux amortissements" val={d.dotAmort || 0} indent />
              <PRow label="Autres charges d'exploitation" val={d.autresCharges || 0} indent />
              <PRow label="RESULTAT D'EXPLOITATION" val={ebit} cls="total" />
              <div style={{ height: 8 }} />
              <PRow label="Charges financieres" val={interest} indent />
              <PRow label="Impot sur les benefices" val={tax} indent />
              <PRow label="RESULTAT NET DE L'EXERCICE" val={ni} cls={ni < 0 ? 'total' : 'total'} />
            </>
          ) : (
            <>
              <PRow label="Revenue" val={rev} />
              <PRow label="Cost of Goods Sold" val={cogs} indent />
              <PRow label="Gross Profit" val={gp} cls="subtotal" />
              <PRow label="Operating Expenses" val={d.curSGA || 0} indent />
              <PRow label="EBIT / Operating Income" val={ebit} cls="subtotal" />
              <PRow label="Interest Expense" val={interest} indent />
              <PRow label="Income Tax" val={tax} indent />
              <PRow label="NET INCOME" val={ni} cls="total" />
            </>
          )}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 8 }}>
            {[
              { label: isFR ? 'Marge brute' : 'Gross Margin', val: pct(gp, rev) },
              { label: isFR ? "Resultat d'exploitation" : 'EBIT Margin', val: pct(ebit, rev) },
              { label: isFR ? 'Marge nette' : 'Net Margin', val: pct(ni, rev), neg: ni < 0 },
            ].map(m => (
              <div key={m.label} className="metric">
                <div className="mlabel">{m.label}</div>
                <div className="mval" style={{ color: m.neg ? 'var(--danger)' : 'var(--good)' }}>{m.val}</div>
              </div>
            ))}
          </div>
          {d.years?.length > 1 && Array.isArray(d.revenue) && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="card-title">Income Evolution</div>
              <table className="dt"><thead><tr><th>Item</th>{d.years.map(y => <th key={y}>{y}</th>)}</tr></thead>
                <tbody>
                  {[['Revenue', d.revenue], ['Gross Profit', d.grossProfit], ['Net Income', d.netIncome]].map(([label, arr]) => (
                    <tr key={label}><td>{label}</td>{arr.map((v, i) => <td key={i} className="num" style={{ color: v < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(v, cur)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'cashflow' && (
        <div className="card">
          <div className="card-title">{isFR ? 'Tableau de Financement' : 'Cash Flow Statement'} | {d.period}</div>
          <div className="pcg-section-title">{isFR ? "Flux d'exploitation" : 'Operating Activities'}</div>
          <PRow label={isFR ? "Resultat net de l'exercice" : 'Net Income'} val={ni} />
          <PRow label={isFR ? 'Dotations aux amortissements' : 'Depreciation & Amortization'} val={d.dotAmort || 0} indent />
          <PRow label={isFR ? 'Variation du BFR' : 'Change in Working Capital'} val={last(d.cashFlow) - ni - (d.dotAmort || 0)} indent />
          <PRow label={isFR ? "A) Flux d'exploitation" : 'A) Operating Cash Flow'} val={last(d.cashFlow)} cls="subtotal" />
          <div style={{ height: 8 }} />
          <div className="pcg-section-title">{isFR ? "Flux d'investissement" : 'Investing Activities'}</div>
          <PRow label={isFR ? "Acquisitions d'immobilisations" : 'Capital Expenditures'} val={-(fa * 0.1)} indent />
          <PRow label={isFR ? "B) Flux d'investissement" : 'B) Investing Cash Flow'} val={-(fa * 0.1)} cls="subtotal" />
          <div style={{ height: 8 }} />
          <PRow label={isFR ? "C) Flux de financement" : 'C) Financing Cash Flow'} val={0} cls="subtotal" />
          <PRow label={isFR ? 'Variation nette de tresorerie' : 'Net Change in Cash'} val={last(d.cashFlow) - fa * 0.1} cls="total" />
          <PRow label={isFR ? 'Tresorerie a la cloture' : 'Closing Cash Balance'} val={cash} cls="total" />
        </div>
      )}
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FULL REPORT PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function FullReportPage() {
  const d = useStore(s => s.activeCompany)
  const addToast = useStore(s => s.addToast)
  const globalReportLanguage = useStore(s => s.reportLanguage)
  const reportRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  if (!d) return null

  const reportLanguage = d.reportLanguage || globalReportLanguage || 'english'
  const isFrenchReport = reportLanguage === 'french'
  const copy = isFrenchReport
    ? {
      title: 'Rapport Complet Entreprise',
      subtitle: "Rapport financier type due-diligence: identite, notation, indicateurs, evolution et donnees financieres.",
      brandTitle: 'Rapport Executif de Screening Financier',
      brandMeta: 'Moteur analytique frontend | Devise revue | Genere le',
      companyId: 'Identification de la societe',
      executiveRead: 'Lecture executive',
      financialRating: 'Notation financiere',
      ratingSummary: 'Synthese de notation',
      executiveSummary: 'Resume executif',
      positives: 'Points positifs',
      watches: 'Points de vigilance',
      indicatorAssessment: 'Evaluation des indicateurs financiers',
      profitability: 'Rentabilite',
      solvency: 'Solvabilite',
      efficiency: 'Efficacite',
      trend: "Evolution de l'entreprise",
      fraudActions: 'Signaux de fraude et actions de gestion',
      managementPriorities: 'Priorites de gestion',
      financialData: 'Donnees financieres',
      statementProfit: 'Compte de resultat / Vue operationnelle',
      statementBalance: 'Bilan / Vue liquidite',
      generated: 'Genere le',
      printPreview: 'Apercu impression',
      saveSnapshot: 'Enregistrer image',
      savePdf: 'Enregistrer PDF',
      preparing: 'Preparation...',
      yearsCovered: 'Annees couvertes',
      revenue: "Chiffre d'affaires",
      netIncome: 'Resultat net',
      grossProfit: 'Marge brute',
      operatingCashFlow: 'Flux de tresorerie exploitation',
      fixedAssets: 'Immobilisations',
      currentAssets: 'Actif circulant',
      inventories: 'Stocks',
      receivables: 'Creances',
      cash: 'Tresorerie',
      equity: 'Capitaux propres',
      liabilities: 'Dettes',
      benchmark: 'Reference',
      interpretation: 'Interpretation',
      indicator: 'Indicateur',
      assessment: 'Evaluation',
      disclaimer: 'Ce rapport est genere par FinScan Corporate Decision Intelligence a titre informatif. Il ne constitue pas un conseil financier, juridique ou d investissement. Verifiez les chiffres avec les etats financiers officiels.',
    }
    : {
      title: 'Full Company Report',
      subtitle: 'Executive-grade report with the same due-diligence flow: identity, rating, indicators, evolution, and financial data.',
      brandTitle: 'Executive Counterparty Screening Report',
      brandMeta: 'Frontend analytics engine | Currency reviewed | Generated on',
      companyId: 'Company Identification',
      executiveRead: 'Executive Read',
      financialRating: 'Financial Rating',
      ratingSummary: 'Rating Summary',
      executiveSummary: 'Executive Summary',
      positives: 'Key Positives',
      watches: 'Primary Watch Items',
      indicatorAssessment: 'Financial Indicator Assessment',
      profitability: 'Profitability',
      solvency: 'Solvency',
      efficiency: 'Efficiency',
      trend: 'Trend and Company Evolution',
      fraudActions: 'Fraud Signals and Management Actions',
      managementPriorities: 'Management Priorities',
      financialData: 'Financial Data',
      statementProfit: 'Profit and Loss / Operating View',
      statementBalance: 'Balance Sheet / Liquidity View',
      generated: 'Generated on',
      printPreview: 'Print Preview',
      saveSnapshot: 'Save Snapshot',
      savePdf: 'Save PDF',
      preparing: 'Preparing export...',
      yearsCovered: 'Years covered',
      revenue: 'Sales Revenues',
      netIncome: 'Net Profit / Loss',
      grossProfit: 'Gross Profit',
      operatingCashFlow: 'Operating Cash Flow',
      fixedAssets: 'Fixed Assets',
      currentAssets: 'Current Assets',
      inventories: 'Inventories',
      receivables: 'Receivables',
      cash: 'Cash & Accounts',
      equity: 'Equity',
      liabilities: 'Liabilities',
      benchmark: 'Benchmark',
      interpretation: 'Interpretation',
      indicator: 'Indicator',
      assessment: 'Assessment',
      disclaimer: 'This report is generated by FinScan Corporate Decision Intelligence for informational purposes only. It does not constitute financial, legal, or investment advice. Verify all figures with official financial statements.',
    }

  const cur = d.displayCurrency || d.currency || 'EUR'
  const std = d.standard || 'international'
  const standardText = std === 'international' ? 'IFRS / GAAP' : std === 'french' ? 'PCG' : 'CGNC'
  const rev = last(d.revenue)
  const ni = last(d.netIncome)
  const ta = last(d.totalAssets)
  const eq = last(d.equity)
  const tl = last(d.totalLiabilities)
  const score = computeRiskScore(d)
  const altman = computeAltmanDetails(d)
  const beneish = computeBeneishDetails(d)
  const liquidity = buildLiquidityAnalysis(d)
  const today = new Date().toLocaleDateString(isFrenchReport ? 'fr-FR' : 'en-GB')
  const gm = Number((divide(last(d.grossProfit), rev) * 100).toFixed(1))
  const nm = Number((divide(ni, rev) * 100).toFixed(1))
  const roe = Number((divide(ni, eq) * 100).toFixed(1))
  const roa = Number((divide(ni, ta) * 100).toFixed(1))
  const curR = Number((divide(last(d.currentAssets), last(d.currentLiabilities))).toFixed(2))
  const dr = Number((divide(tl, ta) * 100).toFixed(1))
  const years = d.years?.length ? d.years : [d.period || 'Current']
  const currentYear = years[years.length - 1] || d.period || 'Current'
  const previousYear = years.length > 1 ? years[years.length - 2] : 'Previous'
  const baseFlags = Array.isArray(d.flags) ? d.flags : []
  const revGrowth = Array.isArray(d.revenue) && d.revenue.length > 1
    ? Number((changePercent(d.revenue[d.revenue.length - 1], d.revenue[d.revenue.length - 2])).toFixed(1))
    : null
  const prevRevenueGrowth = Array.isArray(d.revenue) && d.revenue.length > 2
    ? Number((changePercent(d.revenue[d.revenue.length - 2], d.revenue[d.revenue.length - 3])).toFixed(1))
    : null
  const scoreLevel = score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low'
  const liquidityLevel = liquidity.executiveMemo.score >= 75 ? 'low' : liquidity.executiveMemo.score >= 55 ? 'medium' : 'high'
  const companySector = liquidity.sector?.label || 'General'
  const metricsByKey = liquidity.metrics.reduce((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {})
  const currentFile = d._filename || 'Uploaded statement'
  const sourceCurrency = d.sourceCurrency || d.originalCurrency || d.currency || cur
  const companySlug = (d.company || 'company').replace(/[^a-z0-9]+/gi, ' ').trim()
  const prevRev = previousValue(d.revenue)
  const prevNetIncome = previousValue(d.netIncome)
  const prevGrossProfit = previousValue(d.grossProfit)
  const prevAssets = previousValue(d.totalAssets)
  const prevEquity = previousValue(d.equity)
  const prevLiabilities = previousValue(d.totalLiabilities)
  const prevCurrentAssets = previousValue(d.currentAssets)
  const prevCurrentLiabilities = previousValue(d.currentLiabilities)
  const prevGm = prevRev ? Number((divide(prevGrossProfit, prevRev) * 100).toFixed(1)) : null
  const prevNm = prevRev ? Number((divide(prevNetIncome, prevRev) * 100).toFixed(1)) : null
  const prevRoe = prevEquity ? Number((divide(prevNetIncome, prevEquity) * 100).toFixed(1)) : null
  const prevRoa = prevAssets ? Number((divide(prevNetIncome, prevAssets) * 100).toFixed(1)) : null
  const prevCurR = prevCurrentLiabilities ? Number((divide(prevCurrentAssets, prevCurrentLiabilities)).toFixed(2)) : null
  const prevDr = prevAssets ? Number((divide(prevLiabilities, prevAssets) * 100).toFixed(1)) : null
  const decisionReady = buildCorporateDecision(d).decisionReady
  const executiveRating = decisionReady ? Number((
    (((100 - score) * 0.35) + (liquidity.executiveMemo.score * 0.30) + ((altman.zone === 'safe' ? 90 : altman.zone === 'grey' ? 65 : 35) * 0.20) + ((nm >= 10 ? 85 : nm >= 5 ? 65 : nm >= 0 ? 50 : 30) * 0.15)) / 10
  ).toFixed(1)) : NaN
  const executiveLevel = executiveRating >= 8 ? 'low' : executiveRating >= 6 ? 'medium' : 'high'
  const executiveLabel = !decisionReady ? 'Review required' : executiveRating >= 8 ? 'Very Good' : executiveRating >= 6 ? 'Good' : executiveRating >= 4.5 ? 'Moderate' : 'Weak'

  const statementRows = [
    [copy.revenue, d.revenue],
    [copy.grossProfit, d.grossProfit],
    [copy.netIncome, d.netIncome],
    [copy.operatingCashFlow, d.cashFlow],
    [copy.fixedAssets, d.fixedAssets],
    [copy.currentAssets, d.currentAssets],
    [copy.inventories, d.inventory],
    [copy.receivables, d.receivables],
    [copy.cash, d.cash],
    [copy.equity, d.equity],
    [copy.liabilities, d.totalLiabilities],
  ]

  const performanceCards = [
    { label: 'Revenue', value: fmt(rev, cur), benchmark: 'Scale anchor', level: rev > 0 ? 'low' : 'high' },
    { label: 'Net Margin', value: `${fixed(nm, 1)}%`, benchmark: '> 10%', level: nm >= 10 ? 'low' : nm >= 5 ? 'medium' : 'high' },
    { label: 'Gross Margin', value: `${fixed(gm, 1)}%`, benchmark: '> 30%', level: gm >= 30 ? 'low' : gm >= 15 ? 'medium' : 'high' },
    { label: 'ROE', value: `${fixed(roe, 1)}%`, benchmark: '> 12%', level: roe >= 12 ? 'low' : roe >= 6 ? 'medium' : 'high' },
    { label: 'ROA', value: `${fixed(roa, 1)}%`, benchmark: '> 5%', level: roa >= 5 ? 'low' : roa >= 2 ? 'medium' : 'high' },
    { label: 'Revenue Growth', value: revGrowth === null ? 'n/a' : `${fixed(revGrowth, 1)}%`, benchmark: '> 5%', level: revGrowth === null ? 'medium' : revGrowth >= 5 ? 'low' : revGrowth >= 0 ? 'medium' : 'high' },
    { label: 'Current Ratio', value: `${fixed(curR, 2)}x`, benchmark: '> 1.5x', level: curR >= 1.5 ? 'low' : curR >= 1 ? 'medium' : 'high' },
    { label: 'Debt Ratio', value: `${fixed(dr, 1)}%`, benchmark: '< 50%', level: dr <= 50 ? 'low' : dr <= 65 ? 'medium' : 'high' },
  ]

  const positiveOffsets = liquidity.metrics.filter(metric => metric.status === 'green').slice(0, 2).map(metric => metric.label)
  const mainPressureLabels = liquidity.metrics.filter(metric => metric.status !== 'green').slice(0, 3).map(metric => metric.label)

  const summaryInsights = [
    { label: 'Liquidity status', value: liquidity.executiveMemo.overallStatus, tone: liquidityLevel === 'low' ? 'positive' : liquidityLevel === 'high' ? 'negative' : 'neutral' },
    { label: 'Benchmark', value: companySector, tone: 'neutral' },
    { label: 'Main pressures', value: mainPressureLabels.length ? mainPressureLabels.join(', ') : 'No major pressure flagged', tone: mainPressureLabels.length ? 'negative' : 'positive' },
    { label: 'Key offsets', value: positiveOffsets.length ? positiveOffsets.join(', ') : 'Limited offsets', tone: positiveOffsets.length ? 'positive' : 'neutral' },
  ]

  const strengths = [
    ...performanceCards
      .filter(card => card.level === 'low')
      .map(card => ({
        title: `${card.label} | ${card.value}`,
        detail: `Current reading is comfortably inside the benchmark range (${card.benchmark}).`,
      })),
    ...liquidity.metrics
      .filter(metric => metric.status === 'green')
      .slice(0, 2)
      .map(metric => ({
        title: metric.label,
        detail: compactReportText(stripLeadingLabel(metric.commentary), 120),
      })),
  ].slice(0, 4)

  const concerns = [
    ...baseFlags.map(flag => ({
      title: flag.text,
      detail: compactReportText(flag.detail, 120),
    })),
    ...liquidity.metrics
      .filter(metric => metric.status !== 'green')
      .map(metric => ({
        title: metric.label,
        detail: compactReportText(stripLeadingLabel(metric.commentary), 130),
      })),
  ].slice(0, 3)

  const actionItems = []
  if (liquidity.metrics.some(metric => ['ccc', 'dso'].includes(metric.key) && metric.status !== 'green')) {
    actionItems.push(isFrenchReport ? "Renforcer le recouvrement, la facturation et la resolution des litiges afin de convertir plus vite le chiffre d'affaires en tresorerie." : 'Tighten collections, billing cadence, and dispute resolution so revenue converts into cash faster.')
  }
  if (beneish.manipulated || score >= 50) {
    actionItems.push(isFrenchReport ? "Revoir la cut-off du chiffre d'affaires, les charges a payer/produits a recevoir et les mouvements de marge avant de se fier a la qualite du resultat." : 'Review revenue cut-off, accruals, and margin movements in detail before relying on reported earnings quality.')
  }
  if (altman.zone !== 'safe' || liquidity.metrics.some(metric => metric.key === 'shortTermDebtCoverage' && metric.status !== 'green')) {
    actionItems.push(isFrenchReport ? 'Preserver la tresorerie et replanifier les dettes court terme ou refinancements avant une compression de la flexibilite bilancielle.' : 'Preserve cash and re-sequence near-term liabilities or refinancing plans before balance-sheet flexibility compresses further.')
  }
  if (ni < 0 || (revGrowth !== null && revGrowth < 0)) {
    actionItems.push(isFrenchReport ? 'Prioriser la discipline de marge et les revenus rentables plutot que la croissance du volume a tout prix.' : 'Focus management attention on restoring margin discipline and protecting profitable revenue rather than pursuing volume at any cost.')
  }
  while (actionItems.length < 3) {
    actionItems.push(isFrenchReport ? 'Maintenir une revue mensuelle de la liquidite, de la rentabilite et des indicateurs sensibles afin de detecter rapidement toute derive.' : 'Maintain monthly operating reviews covering liquidity, profitability, and covenant-sensitive indicators so slippage is identified early.')
  }

  let investmentStance = isFrenchReport ? 'Selectif' : 'Selective'
  let stanceText = isFrenchReport
    ? "La societe n'est envisageable qu'avec un suivi cible de l'execution et de la discipline bilancielle."
    : 'The business is investable only with targeted monitoring on execution and balance-sheet discipline.'
  if (score >= 70 || altman.zone === 'distress') {
    investmentStance = isFrenchReport ? 'Defensif' : 'Defensive'
    stanceText = isFrenchReport
      ? 'La lecture reste defensive car les signaux de solvabilite et de qualite des resultats sont trop faibles.'
      : 'The report is reading defensively because solvency and earnings-quality signals are too weak for a relaxed posture.'
  } else if (score >= 50 || altman.zone === 'grey' || beneish.manipulated) {
    investmentStance = isFrenchReport ? 'Prudent' : 'Cautious'
    stanceText = isFrenchReport
      ? 'La societe presente des atouts, mais le profil de risque impose une diligence renforcee.'
      : 'The company has usable strengths, but the risk profile still argues for caution and tighter diligence.'
  } else if (ni > 0 && curR >= 1.2 && (revGrowth === null || revGrowth >= 0)) {
    investmentStance = isFrenchReport ? 'Constructif' : 'Constructive'
    stanceText = isFrenchReport
      ? 'La rentabilite et la liquidite soutiennent une lecture constructive, avec un suivi continu necessaire.'
      : 'Core profitability and liquidity are supporting a constructive read, although ongoing monitoring remains necessary.'
  }

  const reportFacts = [
    { label: 'App', value: 'FinScan CDI', note: isFrenchReport ? 'Screening financier pilote par le frontend' : 'Frontend-driven financial screening' },
    { label: isFrenchReport ? 'Type de rapport' : 'Report Type', value: copy.brandTitle, note: isFrenchReport ? 'Structure alignee sur un rapport de due-diligence financiere' : 'Layout aligned to external due-diligence style' },
    { label: isFrenchReport ? 'Fichier source' : 'Source File', value: currentFile, note: isFrenchReport ? `${years.length} periode(s) disponible(s)` : `${years.length} reported period${years.length > 1 ? 's' : ''} available` },
    { label: isFrenchReport ? 'Reference sectorielle' : 'Sector Benchmark', value: companySector, note: liquidity.sector?.description || (isFrenchReport ? 'Contexte sectoriel applique dans le frontend' : 'Sector context applied in the frontend') },
    { label: isFrenchReport ? "Devise d'affichage" : 'Display Currency', value: cur, note: isFrenchReport ? `Valeurs affichees en ${cur}` : `All report values shown in ${cur}` },
    { label: isFrenchReport ? 'Devise source' : 'Source Currency', value: sourceCurrency, note: d.fxApplied ? `Converted at ${d.fxRateToEUR?.toFixed(4)} EUR per source unit` : (isFrenchReport ? 'Affiche sans conversion FX integree' : 'Shown without embedded FX conversion') },
    { label: isFrenchReport ? 'Referentiel financier' : 'Financial Standard', value: standardText, note: isFrenchReport ? "Modele d'interpretation des etats selectionne" : 'Selected statement interpretation model' },
    { label: isFrenchReport ? 'Snapshot FX' : 'FX Snapshot', value: d.fxSnapshotDate || today, note: d.fxSnapshotNote || (isFrenchReport ? 'Snapshot FX frontend integre' : 'Embedded frontend FX snapshot') },
  ]

  const profitabilityRows = [
    {
      indicator: 'Net Profit Margin',
      level: performanceCards.find(card => card.label === 'Net Margin')?.level || 'medium',
      current: nm,
      previous: prevNm,
      benchmark: '> 10.0%',
      format: 'percent',
      note: `${nm >= 10 ? 'Stronger than' : nm >= 5 ? 'Near' : 'Below'} target profitability for an executive screening read.`,
    },
    {
      indicator: 'Sales Growth',
      level: performanceCards.find(card => card.label === 'Revenue Growth')?.level || 'medium',
      current: revGrowth,
      previous: prevRevenueGrowth,
      benchmark: '> 5.0%',
      format: 'percent',
      note: revGrowth === null ? 'Only one revenue period is available.' : revGrowth >= 5 ? 'Growth momentum is supporting the operating read.' : revGrowth >= 0 ? 'Growth is positive but not yet compelling.' : 'Negative growth requires closer demand and execution review.',
    },
    {
      indicator: 'ROA',
      level: performanceCards.find(card => card.label === 'ROA')?.level || 'medium',
      current: roa,
      previous: prevRoa,
      benchmark: '> 5.0%',
      format: 'percent',
      note: 'Shows how efficiently the asset base is being converted into profit.',
    },
    {
      indicator: 'ROE',
      level: performanceCards.find(card => card.label === 'ROE')?.level || 'medium',
      current: roe,
      previous: prevRoe,
      benchmark: '> 12.0%',
      format: 'percent',
      note: 'Tracks how strongly shareholder capital is being rewarded by current profitability.',
    },
  ]

  const solvencyRows = [
    {
      indicator: 'Current Ratio',
      level: performanceCards.find(card => card.label === 'Current Ratio')?.level || 'medium',
      current: curR,
      previous: prevCurR,
      benchmark: '> 1.50x',
      format: 'ratio',
      note: 'Short-term balance-sheet headroom relative to near-term obligations.',
    },
    {
      indicator: 'Debt Ratio',
      level: performanceCards.find(card => card.label === 'Debt Ratio')?.level || 'medium',
      current: dr,
      previous: prevDr,
      benchmark: '< 50.0%',
      format: 'percent',
      note: 'Lower is better because liabilities consume less of the asset base.',
    },
    {
      indicator: 'Short-Term Debt Coverage',
      level: metricsByKey.shortTermDebtCoverage?.badgeLevel || 'medium',
      current: metricsByKey.shortTermDebtCoverage?.current?.value ?? null,
      previous: previousValue(metricsByKey.shortTermDebtCoverage?.series),
      benchmark: metricsByKey.shortTermDebtCoverage?.benchmarkText || '>= 1.0x',
      format: 'ratio',
      note: metricsByKey.shortTermDebtCoverage?.trend?.text || 'Coverage trend unavailable.',
    },
    {
      indicator: 'Altman Z-Score',
      level: altman.level,
      current: altman.score,
      previous: null,
      benchmark: altman.benchmarkText,
      format: 'ratio',
      note: altman.explanation,
    },
  ]

  const efficiencyRows = [
    {
      indicator: 'Days Receivable (DSO)',
      level: metricsByKey.dso?.badgeLevel || 'medium',
      current: metricsByKey.dso?.current?.value ?? null,
      previous: previousValue(metricsByKey.dso?.series),
      benchmark: metricsByKey.dso?.benchmarkText || 'n/a',
      format: 'days',
      note: metricsByKey.dso?.trend?.text || 'Collection trend unavailable.',
    },
    {
      indicator: 'Stock Rotation Period (DIO)',
      level: metricsByKey.dio?.badgeLevel || 'medium',
      current: metricsByKey.dio?.current?.value ?? null,
      previous: previousValue(metricsByKey.dio?.series),
      benchmark: metricsByKey.dio?.benchmarkText || 'n/a',
      format: 'days',
      note: metricsByKey.dio?.trend?.text || 'Inventory trend unavailable.',
    },
    {
      indicator: 'Days Payable (DPO)',
      level: metricsByKey.dpo?.badgeLevel || 'medium',
      current: metricsByKey.dpo?.current?.value ?? null,
      previous: previousValue(metricsByKey.dpo?.series),
      benchmark: metricsByKey.dpo?.benchmarkText || 'n/a',
      format: 'days',
      note: metricsByKey.dpo?.trend?.text || 'Supplier-credit trend unavailable.',
    },
    {
      indicator: 'Cash Conversion Cycle (CCC)',
      level: metricsByKey.ccc?.badgeLevel || 'medium',
      current: metricsByKey.ccc?.current?.value ?? null,
      previous: previousValue(metricsByKey.ccc?.series),
      benchmark: metricsByKey.ccc?.benchmarkText || 'n/a',
      format: 'days',
      note: metricsByKey.ccc?.trend?.text || 'Cash-cycle trend unavailable.',
    },
  ]

  const ratingCards = [
    { label: 'Executive Rating', value: `${fixed(executiveRating, 1)}/10`, level: executiveLevel, note: executiveLabel, benchmark: 'Composite decision scale' },
    { label: 'Fraud Risk Score', value: `${score}/100`, level: scoreLevel, note: 'Lower is better', benchmark: '0 to 39 low concern' },
    { label: 'Liquidity Score', value: `${liquidity.executiveMemo.score}/100`, level: liquidityLevel, note: liquidity.executiveMemo.overallStatus, benchmark: '75+ stronger zone' },
    { label: 'Altman Z-Score', value: altman.scoreDisplay || (Number.isFinite(altman.score) ? altman.score.toFixed(2) : 'n/a'), level: altman.level, note: altman.zoneLabel, benchmark: altman.benchmarkText },
  ]

  const revenueNetIncomeChart = {
    labels: years,
    datasets: [
      { label: 'Sales Revenues', data: d.revenue, backgroundColor: '#d91016cc', borderRadius: 6 },
      { label: 'Net Profit / Loss', data: d.netIncome, backgroundColor: d.netIncome.map(value => value < 0 ? '#e11d2fcc' : '#15803dcc'), borderRadius: 6 },
    ],
  }

  const marginChart = {
    labels: years,
    datasets: [
      {
        label: 'Gross Margin %',
        data: years.map((_, index) => {
          const revenueValue = Array.isArray(d.revenue) ? d.revenue[index] : rev
          const grossProfitValue = Array.isArray(d.grossProfit) ? d.grossProfit[index] : last(d.grossProfit)
          return revenueValue ? Number((grossProfitValue / Math.max(revenueValue, 1) * 100).toFixed(1)) : 0
        }),
        borderColor: '#b68b00',
        backgroundColor: 'rgba(182, 139, 0, 0.12)',
        tension: 0.32,
        fill: true,
      },
      {
        label: 'Net Margin %',
        data: years.map((_, index) => {
          const revenueValue = Array.isArray(d.revenue) ? d.revenue[index] : rev
          const netIncomeValue = Array.isArray(d.netIncome) ? d.netIncome[index] : ni
          return revenueValue ? Number((netIncomeValue / Math.max(revenueValue, 1) * 100).toFixed(1)) : 0
        }),
        borderColor: '#15803d',
        backgroundColor: 'rgba(21, 128, 61, 0.10)',
        tension: 0.32,
      },
    ],
  }

  const cycleChart = {
    labels: years,
    datasets: [
      {
        label: 'CCC',
        data: metricsByKey.ccc?.series || [],
        borderColor: '#d91016',
        backgroundColor: 'rgba(217, 16, 22, 0.08)',
        tension: 0.3,
      },
      {
        label: 'DSO',
        data: metricsByKey.dso?.series || [],
        borderColor: '#2457d6',
        tension: 0.3,
      },
      {
        label: 'DPO',
        data: metricsByKey.dpo?.series || [],
        borderColor: '#15803d',
        tension: 0.3,
      },
      {
        label: 'DIO',
        data: metricsByKey.dio?.series || [],
        borderColor: '#b68b00',
        tension: 0.3,
      },
    ],
  }

  const balanceSheetChart = {
    labels: years,
    datasets: [
      { label: 'Total Assets', data: d.totalAssets, backgroundColor: '#f7a4b0cc', borderRadius: 6 },
      { label: 'Equity', data: d.equity, backgroundColor: '#15803dcc', borderRadius: 6 },
      { label: 'Total Liabilities', data: d.totalLiabilities, backgroundColor: '#d91016cc', borderRadius: 6 },
    ],
  }

  function ReportMetricCard({ label, value, benchmark, level, note }) {
    const tone = toneForLevel(level)
    return (
      <div className={`report-metric-card ${level}`}>
        <div className="report-metric-value" style={{ color: tone }}>{value}</div>
        <div className="report-metric-label">{label}</div>
        <div className={`report-status-pill ${level}`}>{assessmentLabel(level)}</div>
        <div className="report-metric-benchmark">{copy.benchmark}: {benchmark}</div>
        {note ? <div className="report-metric-note">{note}</div> : null}
      </div>
    )
  }

  function AssessmentTable({ title, subtitle, rows }) {
    return (
      <div className="report-assessment-card">
        <div className="report-assessment-head">
          <div>
            <h4>{title}</h4>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="dt report-assessment-table">
            <thead>
              <tr>
                <th>{copy.indicator}</th>
                <th>{copy.assessment}</th>
                <th>{currentYear}</th>
                <th>{previousYear}</th>
                <th>{copy.benchmark}</th>
                <th>{copy.interpretation}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.indicator}>
                  <td><strong>{row.indicator}</strong></td>
                  <td><span className={`report-status-pill ${row.level}`}>{assessmentLabel(row.level)}</span></td>
                  <td className="num" style={{ color: toneForLevel(row.level) }}>{formatReportValue(row.current, row.format, cur)}</td>
                  <td className="num">{formatReportValue(row.previous, row.format, cur)}</td>
                  <td>{row.benchmark}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function StatementTable({ title, rows }) {
    return (
      <div className="report-data-card">
        <div className="report-assessment-head">
          <div>
            <h4>{title}</h4>
            <p>{isFrenchReport ? 'Extrait du fichier charge et affiche dans la devise revue.' : 'Extracted from the uploaded filing and shown in the reviewed display currency.'}</p>
          </div>
        </div>
        <div className="report-table-wrap">
          <table className="dt report-assessment-table">
            <thead>
              <tr>
                <th>{copy.indicator}</th>
                {years.map(year => <th key={year}>{year}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, series]) => (
                <tr key={label}>
                  <td><strong>{label}</strong></td>
                  {(Array.isArray(series) ? series : [series]).map((value, index) => (
                    <td key={`${label}-${index}`} className="num" style={{ color: value < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(value, cur)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  async function captureReportCanvas(exportMode = 'standard') {
    const reportNode = reportRef.current
    if (!reportNode) throw new Error('The report section is not available yet.')

    const { default: html2canvas } = await import('html2canvas')
    const isDarkTheme = document.documentElement.dataset.theme === 'dark'

    if (document.fonts?.ready) {
      await document.fonts.ready
    }

    return html2canvas(reportNode, {
      scale: Math.min(window.devicePixelRatio || (exportMode === 'pdf' ? 1.4 : 1.5), exportMode === 'pdf' ? 1.8 : 2),
      useCORS: true,
      backgroundColor: isDarkTheme ? '#091320' : '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      width: reportNode.scrollWidth,
      height: reportNode.scrollHeight,
      windowWidth: Math.max(reportNode.scrollWidth, window.innerWidth),
      windowHeight: reportNode.scrollHeight,
      onclone: (clonedDocument) => {
        const clonedReport = clonedDocument.querySelector('.risco-report')
        const clonedRoot = clonedDocument.documentElement
        if (clonedReport) {
          clonedReport.style.overflow = 'visible'
          clonedReport.setAttribute('data-export-mode', exportMode)
        }
        if (clonedRoot) {
          clonedRoot.setAttribute('data-export-mode', exportMode)
        }
        if (clonedDocument.body) {
          clonedDocument.body.style.background = isDarkTheme ? '#091320' : '#ffffff'
        }
      },
    })
  }

  async function buildReportCanvas(exportMode = 'standard') {
    try {
      return await captureReportCanvas(exportMode)
    } catch (error) {
      if (exportMode === 'standard') {
        return captureReportCanvas('pdf')
      }
      throw error
    }
  }

  async function buildReportPdfDocument() {
    const [{ default: jsPDF }, canvas] = await Promise.all([
      import('jspdf'),
      buildReportCanvas('pdf'),
    ])

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 8
    const usableWidth = pageWidth - margin * 2
    const usableHeight = pageHeight - margin * 2
    const pageHeightPx = Math.floor((canvas.width * usableHeight) / usableWidth)

    let renderedHeight = 0
    let pageIndex = 0

    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight

      const ctx = pageCanvas.getContext('2d')
      ctx.drawImage(
        canvas,
        0,
        renderedHeight,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      )

      if (pageIndex > 0) pdf.addPage()

      const imageData = pageCanvas.toDataURL('image/png')
      const renderedPageHeight = (sliceHeight * usableWidth) / canvas.width
      pdf.addImage(imageData, 'PNG', margin, margin, usableWidth, renderedPageHeight, undefined, 'FAST')

      renderedHeight += sliceHeight
      pageIndex += 1
    }

    return pdf
  }

  async function withReportCanvas(action) {
    if (exporting) return
    setExporting(true)

    try {
      const canvas = await buildReportCanvas('snapshot')
      await action(canvas)
    } catch (error) {
      console.error('full report image export error:', error)
      addToast(error.message || 'Full report image export failed.', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function withPdfDocument(action) {
    if (exporting) return
    setExporting(true)

    try {
      const pdf = await buildReportPdfDocument()
      await action(pdf)
    } catch (error) {
      console.error('full report export error:', error)
      addToast(error.message || 'Full report export failed.', 'error')
    } finally {
      setExporting(false)
    }
  }

  function buildPdfFilename() {
    const slug = (d.company || 'company').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
    const periodSlug = String(d.period || 'report').replace(/[^a-z0-9]+/gi, '_')
    return `${slug || 'company'}_${periodSlug || 'report'}_full_report.pdf`
  }

  function buildImageFilename() {
    const slug = (d.company || 'company').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
    const periodSlug = String(d.period || 'report').replace(/[^a-z0-9]+/gi, '_')
    return `${slug || 'company'}_${periodSlug || 'report'}_full_report.png`
  }

  async function downloadFullReportPdf() {
    await withPdfDocument(async (pdf) => {
      pdf.save(buildPdfFilename())
      addToast('Full report exported as PDF.', 'info')
    })
  }

  async function downloadFullReportSnapshot() {
    await withReportCanvas(async (canvas) => {
      const imageUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = imageUrl
      link.download = buildImageFilename()
      link.click()
      addToast('Full report exported as an image.', 'info')
    })
  }

  async function openFullReportPrintPreview() {
    await withPdfDocument(async (pdf) => {
      const blob = pdf.output('blob')
      const previewUrl = URL.createObjectURL(blob)
      const previewWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer')
      if (!previewWindow) {
        URL.revokeObjectURL(previewUrl)
        addToast('Pop-up blocked. Please allow pop-ups to open the PDF preview.', 'error')
        return
      }
      setTimeout(() => URL.revokeObjectURL(previewUrl), 60000)
      addToast('PDF preview opened in a new tab for printing or saving.', 'info')
    })
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>{copy.title}</h2><p>{copy.subtitle}</p></div>
        <div className="page-actions">
          <button className="btn sm" onClick={openFullReportPrintPreview} disabled={exporting}>
            {exporting ? copy.preparing : copy.printPreview}
          </button>
          <button className="btn sm" onClick={downloadFullReportSnapshot} disabled={exporting}>
            {exporting ? copy.preparing : copy.saveSnapshot}
          </button>
          <button className="btn sm primary" onClick={downloadFullReportPdf} disabled={exporting}>
            {exporting ? copy.preparing : copy.savePdf}
          </button>
        </div>
      </div>

      <div className="risco-report" ref={reportRef}>
        <div className="report-app-header">
          <div className="report-brand-panel">
            <div className="report-brand-kicker">FinScan Corporate Decision Intelligence</div>
            <div className="report-brand-title">{copy.brandTitle}</div>
            <div className="report-brand-meta">{copy.brandMeta} {today}</div>
          </div>
          <div className="report-app-badges">
            <span className="report-doc-chip">Standard: {standardText}</span>
            <span className="report-doc-chip">Sector: {companySector}</span>
            <span className="report-doc-chip">Display Currency: {cur}</span>
          </div>
        </div>

        <div className="risco-header">
          <div className="report-hero-main">
            <div className="report-kicker">{copy.companyId}</div>
            <h2>{d.company}</h2>
            <p>{currentYear} | {companySlug} | Source file: {currentFile}</p>
          </div>
          <div className="report-hero-side">
            <div className="report-hero-revenue">{fixed(executiveRating, 1)}/10</div>
            <div className="report-hero-caption">{copy.financialRating} | {executiveLabel}</div>
            <div className="report-hero-tags">
              <span className={`badge ${executiveLevel}`}>{investmentStance}</span>
              <span className={`badge ${altman.level}`}>{altman.zoneLabel}</span>
            </div>
          </div>
        </div>

        <div className="risco-section">
          <div className="report-cover-grid">
            <div className="report-company-card">
              <div className="report-kicker">{copy.executiveRead}</div>
              <div className="report-stance-title">{investmentStance}</div>
              <p className="report-body-copy">{stanceText}</p>
              <div className="report-stance-meta">
                <span>{copy.revenue}: {fmt(rev, cur)}</span>
                <span>{copy.netIncome}: {fmt(ni, cur)}</span>
                <span>{copy.yearsCovered}: {years.join(', ')}</span>
              </div>
            </div>
            <div className="report-rating-card">
              <div className="report-kicker">{copy.financialRating}</div>
              <div className="report-rating-number" style={{ color: toneForLevel(executiveLevel) }}>{fixed(executiveRating, 1)}</div>
              <div className={`report-status-pill ${executiveLevel}`}>{executiveLabel}</div>
              <p className="report-body-copy">{isFrenchReport ? "La societe est evaluee via la rentabilite, la solvabilite, l'efficacite et les signaux de risque extraits du fichier charge." : 'The company is being assessed through profitability, solvency, efficiency, and fraud-risk signals extracted from the uploaded filing and shown in the selected display currency.'}</p>
            </div>
          </div>

          <div className="report-facts-grid">
            {reportFacts.map((fact) => (
              <div key={fact.label} className="report-fact-card">
                <div className="report-fact-label">{fact.label}</div>
                <div className="report-fact-value">{fact.value}</div>
                <div className="report-fact-note">{fact.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="risco-section">
          <h3>{copy.ratingSummary}</h3>
          <div className="report-metric-grid report-score-grid">
            {ratingCards.map((card) => (
              <ReportMetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                benchmark={card.benchmark}
                level={card.level}
                note={card.note}
              />
            ))}
          </div>

          <div className="report-summary-grid">
            <div className="report-summary-card report-summary-card-wide">
              <div className="card-title">{copy.executiveSummary}</div>
              <p className="report-body-copy report-summary-intro">{liquidity.executiveMemo.paragraphs[0]}</p>
              <div className="report-summary-insights">
                {summaryInsights.map((item) => (
                  <div key={item.label} className={`report-summary-insight ${item.tone}`}>
                    <div className="report-summary-insight-label">{item.label}</div>
                    <div className="report-summary-insight-value">{item.value}</div>
                  </div>
                ))}
              </div>
              <p className="report-body-copy report-summary-close">{liquidity.executiveMemo.paragraphs[1]}</p>
            </div>
            <div className="report-summary-card">
              <div className="card-title">{copy.positives}</div>
              <div className="report-list">
                {strengths.map((item, index) => (
                  <div key={index} className="report-list-item positive">
                    <div className="report-list-item-title">{item.title}</div>
                    <div className="report-list-item-detail">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="report-summary-card">
              <div className="card-title">{copy.watches}</div>
              <div className="report-list">
                {concerns.map((item, index) => (
                  <div key={index} className="report-list-item negative">
                    <div className="report-list-item-title">{item.title}</div>
                    <div className="report-list-item-detail">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="risco-section">
          <h3>{copy.indicatorAssessment}</h3>
          <div className="report-assessment-grid">
            <AssessmentTable
              title={copy.profitability}
              subtitle={isFrenchReport ? "Capacite de la societe a generer du profit a partir du chiffre d'affaires." : 'Ability of the company to generate profit from the current revenue base.'}
              rows={profitabilityRows}
            />
            <AssessmentTable
              title={copy.solvency}
              subtitle={isFrenchReport ? 'Capacite a soutenir les dettes et obligations court terme.' : 'Ability of the company to sustain debt and short-term obligations.'}
              rows={solvencyRows}
            />
            <AssessmentTable
              title={copy.efficiency}
              subtitle={isFrenchReport ? 'Efficacite de conversion des stocks et creances en tresorerie.' : 'How efficiently operations turn inventory and receivables back into cash.'}
              rows={efficiencyRows}
            />
          </div>
        </div>

        <div className="risco-section">
          <h3>{copy.trend}</h3>
          <div className="report-evolution-grid">
            <div className="report-chart-card">
              <div className="card-title">{copy.revenue} / {copy.netIncome}</div>
              <div className="chart-wrap">
                <Bar
                  data={revenueNetIncomeChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { ticks: { callback: value => fmtN(value) } } },
                  }}
                />
              </div>
            </div>
            <div className="report-chart-card">
              <div className="card-title">{isFrenchReport ? 'Evolution des marges' : 'Margin Evolution'}</div>
              <div className="chart-wrap">
                <Line
                  data={marginChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { ticks: { callback: value => `${value}%` } } },
                  }}
                />
              </div>
            </div>
            <div className="report-chart-card">
              <div className="card-title">{isFrenchReport ? 'Cycle du besoin en fonds de roulement' : 'Working-Capital Cycle'}</div>
              <div className="chart-wrap">
                <Line
                  data={cycleChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { ticks: { callback: value => `${value}d` } } },
                  }}
                />
              </div>
            </div>
            <div className="report-chart-card">
              <div className="card-title">{isFrenchReport ? 'Evolution du bilan' : 'Balance-Sheet Evolution'}</div>
              <div className="chart-wrap">
                <Bar
                  data={balanceSheetChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { ticks: { callback: value => fmtN(value) } } },
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="risco-section">
          <h3>{copy.fraudActions}</h3>
          <div className="report-dual-grid">
            <div className="report-callout-card">
              <div className="card-title">Beneish M-Score</div>
              <div className="report-callout-value" style={{ color: beneish.manipulated ? 'var(--danger)' : 'var(--good)' }}>{beneish.mscore}</div>
              <div className="report-callout-text">{beneish.manipulated ? 'Manipulation flag raised' : 'Below manipulation cutoff'} | {beneish.comparisonText}</div>
              <p className="report-body-copy">{beneish.explanation}</p>
            </div>
            <div className="report-callout-card">
              <div className="card-title">{copy.managementPriorities}</div>
              <div className="report-list">
                {actionItems.map((item, index) => (
                  <div key={index} className="report-list-item neutral">{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="risco-section">
          <h3>{copy.financialData} ({cur})</h3>
          <div className="report-data-grid">
            <StatementTable title={copy.statementProfit} rows={statementRows.slice(0, 4)} />
            <StatementTable title={copy.statementBalance} rows={statementRows.slice(4)} />
          </div>
          <div className="table-subnote">{isFrenchReport ? "Les chiffres ci-dessus proviennent du fichier charge apres normalisation frontend et conversion FX disponible." : 'All figures shown above are based on the uploaded dataset after frontend normalization and available FX conversion across the application.'}</div>
        </div>

        <div className="report-footer">
          <strong>{isFrenchReport ? 'Avertissement' : 'Disclaimer'}:</strong> {copy.disclaimer}
          <br />{copy.generated} {today} | FinScan Corporate Decision Intelligence | Standard: {standardText} | Sector benchmark: {companySector} | Source currency: {sourceCurrency}
        </div>
      </div>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AI REPORT PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function AIReportPage() {
  const d = useStore(s => s.activeCompany)
  const backendUrl = useStore(s => s.backendUrl)
  const globalReportLanguage = useStore(s => s.reportLanguage)
  const [lang, setLang] = useState(d?.reportLanguage || globalReportLanguage || 'english')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  async function generate() {
    if (!d) return
    setLoading(true); setError(null); setReport(null)
    const { dsri, gmi, mscore } = computeBeneish(d)
    const altmanValue = computeAltman(d)
    const altmanZ = Number.isFinite(altmanValue) ? altmanValue.toFixed(2) : 'n/a'
    const fraudScore = computeRiskScore(d)
    try {
      const res = await analyzeCompany({
        companyData: { ...d, mScore: mscore, altmanZ, fraudScore },
        reportLanguage: lang,
        reportStandard: d.standard,
        backendUrl,
      })
      setReport(res.report)
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  const sections = {
    english: ['EXECUTIVE SUMMARY', 'FRAUD RISK ASSESSMENT', 'KEY CONCERNS', 'INVESTMENT RECOMMENDATION'],
    french: ['RESUME EXECUTIF', 'ANALYSE DE LIQUIDITE', 'RISQUES CLES', 'RECOMMANDATION'],
    arabic: ['EXECUTIVE SUMMARY', 'FRAUD RISK ASSESSMENT', 'KEY CONCERNS', 'RECOMMENDATION'],
  }
  const sectionColors = ['var(--brand)', 'var(--brand-mid)', 'var(--danger)', 'var(--info)']

  function parseSections(text) {
    const titles = sections[lang] || sections.english
    return titles.map((title, i) => {
      const start = text.indexOf(title)
      const end = i < titles.length - 1 ? text.indexOf(titles[i + 1]) : text.length
      if (start === -1) return null
      const body = text.slice(start + title.length, end > -1 ? end : undefined).trim()
      return { title, body, color: sectionColors[i] }
    }).filter(Boolean)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>AI Analyst Report</h2><p>Generated through the optional backend analyst service.</p></div>
        <div className="page-actions">
          <select className="btn" value={lang} onChange={e => setLang(e.target.value)} style={{ cursor: 'pointer' }}>
            <option value="english">English</option>
            <option value="french">Francais</option>
            <option value="arabic">Arabic</option>
          </select>
          <button className="btn primary" onClick={generate} disabled={loading || !d}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating...</> : 'Generate Report ->'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading && (
          <div className="ai-section">
            <div className="thinking"><div className="dot" /><div className="dot" /><div className="dot" /><span style={{ marginLeft: 10, fontSize: 13, color: 'var(--text2)' }}>AI analyst is reviewing the data...</span></div>
          </div>
        )}
        {error && (
          <div className="ai-section" style={{ borderLeftColor: 'var(--danger)' }}>
            <div className="ai-section-title">Error</div>
            <p>{error}<br /><br />Make sure your backend is running at <strong>{backendUrl}</strong></p>
          </div>
        )}
        {report && parseSections(report).map((s, i) => (
          <div key={i} className="ai-section" style={{ borderLeftColor: s.color }}>
            <div className="ai-section-title">{s.title}</div>
            {s.body.split('\n\n').map((para, j) => <p key={j} style={j > 0 ? { marginTop: 8 } : {}}>{para}</p>)}
          </div>
        ))}
        {!loading && !error && !report && (
          <div className="empty"><h3>No report yet</h3><p>Click "Generate Report" to create an AI-assisted analysis.</p></div>
        )}
      </div>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MULTI-COMPANY COMPARE PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function ComparePage() {
  const { companies, setActiveCompany, setActivePage } = useStore()

  if (!companies.length) {
    return (
      <div>
        <div className="page-header"><div className="page-header-text"><h2>Multi-Company Comparison</h2></div></div>
        <div className="empty">
          <h3>No companies loaded yet</h3>
          <p>Upload PDF, CSV, or XLSX files from the Upload page.<br />Each file becomes one company - up to 5 at once.</p>
          <button className="btn primary" style={{ marginTop: '1rem' }} onClick={() => setActivePage('upload')}>Go to Upload -&gt;</button>
        </div>
      </div>
    )
  }

  const colors = CHART_COLORS
  const kpiDefs = [
    { key: 'revenue', label: 'Revenue', fn: d => last(d.revenue), money: true, cat: 'Income Statement' },
    { key: 'netIncome', label: 'Net Income', fn: d => last(d.netIncome), money: true, cat: 'Income Statement' },
    { key: 'grossProfit', label: 'Gross Profit', fn: d => last(d.grossProfit), money: true, cat: 'Income Statement' },
    { key: 'netMargin', label: 'Net Margin %', fn: d => { const r = last(d.revenue); return r ? last(d.netIncome) / r * 100 : 0 }, pct: true, cat: 'Income Statement' },
    { key: 'grossMargin', label: 'Gross Margin %', fn: d => { const r = last(d.revenue); return r ? last(d.grossProfit) / r * 100 : 0 }, pct: true, cat: 'Income Statement' },
    { key: 'revGrowth', label: 'Revenue Growth %', fn: d => { const a = Array.isArray(d.revenue) ? d.revenue : [d.revenue]; return a.length > 1 && a[a.length - 2] ? (a[a.length - 1] - a[a.length - 2]) / Math.abs(a[a.length - 2]) * 100 : 0 }, pct: true, cat: 'Income Statement' },
    { key: 'totalAssets', label: 'Total Assets', fn: d => last(d.totalAssets), money: true, cat: 'Balance Sheet' },
    { key: 'equity', label: 'Equity', fn: d => last(d.equity), money: true, cat: 'Balance Sheet' },
    { key: 'cash', label: 'Cash', fn: d => last(d.cash), money: true, cat: 'Balance Sheet' },
    { key: 'totalLiab', label: 'Total Liabilities', fn: d => last(d.totalLiabilities), money: true, inverse: true, cat: 'Balance Sheet' },
    { key: 'roa', label: 'ROA %', fn: d => { const a = last(d.totalAssets); return a ? last(d.netIncome) / a * 100 : 0 }, pct: true, cat: 'Ratios' },
    { key: 'roe', label: 'ROE %', fn: d => { const e = last(d.equity); return e ? last(d.netIncome) / e * 100 : 0 }, pct: true, cat: 'Ratios' },
    { key: 'currentRatio', label: 'Current Ratio', fn: d => { const cl = last(d.currentLiabilities); return cl ? last(d.currentAssets) / cl : 0 }, ratio: true, cat: 'Ratios' },
    { key: 'debtRatio', label: 'Debt Ratio %', fn: d => { const a = last(d.totalAssets); return a ? last(d.totalLiabilities) / a * 100 : 0 }, pct: true, inverse: true, cat: 'Ratios' },
    { key: 'altman', label: 'Altman Z-Score', fn: d => computeAltman(d), ratio: true, cat: 'Risk' },
    { key: 'fraudScore', label: 'Fraud Risk /100', fn: d => computeRiskScore(d), score: true, inverse: true, cat: 'Risk' },
  ]

  const cats = [...new Set(kpiDefs.map(k => k.cat))]

  function dispVal(kpi, val, i) {
    const c = companies[i]?.displayCurrency || companies[i]?.currency || 'EUR'
    if (!Number.isFinite(val)) return 'n/a'
    if (kpi.pct) return `${fixed(val, 1)}%`
    if (kpi.ratio) return `${fixed(val, 2)}x`
    if (kpi.score) return `${Math.round(val)}/100`
    if (kpi.money) return fmt(val, c)
    return val.toFixed(1)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>Multi-Company Comparison</h2><p>{companies.length} compan{companies.length > 1 ? 'ies' : 'y'} loaded</p></div>
        <div className="page-actions">
          <button className="btn sm" onClick={() => setActivePage('upload')}>+ Add Company</button>
        </div>
      </div>

      {/* Company switcher */}
      <div className="card">
        <div className="card-title">Active Company (for detail pages)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {companies.map((c, i) => (
            <button key={i} className="btn sm" style={{ borderLeft: `3px solid ${colors[i % colors.length]}` }}
              onClick={() => { setActiveCompany(c); setActivePage('overview') }}>
              {c.company} <span style={{ fontSize: 10, opacity: .7 }}>{c.period}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI table */}
      <div className="card">
        <div className="card-title">Full KPI Comparison</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead>
              <tr>
                <th>KPI</th>
                {companies.map((c, i) => (
                  <th key={i} style={{ borderTop: `3px solid ${colors[i % colors.length]}` }}>
                    {c.company}<br /><span style={{ fontWeight: 400, color: 'var(--text2)', fontSize: 11 }}>{c.period}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.map(cat => (
                <React.Fragment key={cat}>
                  <tr><td colSpan={companies.length + 1} style={{ background: 'var(--surface2)', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{cat}</td></tr>
                  {kpiDefs.filter(k => k.cat === cat).map(kpi => {
                    const vals = companies.map(c => kpi.fn(c))
                    const valid = vals.filter(isFinite)
                    const best = kpi.inverse ? Math.min(...valid) : Math.max(...valid)
                    const worst = kpi.inverse ? Math.max(...valid) : Math.min(...valid)
                    return (
                      <tr key={kpi.key}>
                        <td style={{ color: 'var(--text2)' }}>{kpi.label}</td>
                        {vals.map((v, i) => {
                          const isBest = valid.length > 1 && Math.abs(v - best) < Math.abs(best) * 0.001 + 0.001
                          const isWorst = valid.length > 1 && Math.abs(v - worst) < Math.abs(worst) * 0.001 + 0.001 && worst !== best
                          return (
                            <td key={i} className="num" style={{ color: isBest ? 'var(--good)' : isWorst ? 'var(--danger)' : v < 0 ? 'var(--danger)' : 'inherit', fontWeight: isBest ? 600 : 400 }}>
                              {dispVal(kpi, v, i)}{isBest ? ' BEST' : ''}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profitability bars */}
      <div className="card">
        <div className="card-title">Profitability Visual Comparison</div>
        {['netMargin', 'grossMargin', 'roa', 'roe'].map(key => {
          const kpi = kpiDefs.find(k => k.key === key)
          const vals = companies.map(c => kpi.fn(c))
          const max = Math.max(...vals.map(Math.abs), 1)
          return (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{kpi.label}</div>
              <div className="kpi-bars">
                {companies.map((c, i) => (
                  <div key={i} className="kpi-bar-row">
                    <span className="kpi-bar-label" style={{ color: colors[i % colors.length] }}>{c.company.split(' ')[0]}</span>
                    <div className="kpi-bar-wrap">
                      <div className="kpi-bar-fill" style={{ width: `${Math.min(Math.abs(vals[i]) / max * 100, 100).toFixed(1)}%`, background: vals[i] < 0 ? '#de3f57' : colors[i % colors.length] }}>
                        {vals[i].toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid-2">
        <Card title="Profitability Margins %">
          <div className="chart-wrap">
            <Bar data={{
              labels: ['Net Margin', 'Gross Margin', 'EBIT Margin', 'ROA', 'ROE'],
              datasets: companies.map((c, i) => ({
                label: c.company, borderRadius: 4,
                backgroundColor: colors[i % colors.length] + 'cc',
                data: [
                  +(last(c.netIncome) / Math.max(last(c.revenue), 1) * 100).toFixed(1),
                  +(last(c.grossProfit) / Math.max(last(c.revenue), 1) * 100).toFixed(1),
                  +(last(c.ebit) / Math.max(last(c.revenue), 1) * 100).toFixed(1),
                  +(last(c.netIncome) / Math.max(last(c.totalAssets), 1) * 100).toFixed(1),
                  +(last(c.netIncome) / Math.max(last(c.equity), 1) * 100).toFixed(1),
                ]
              }))
            }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => v + '%' } } } }} />
          </div>
        </Card>
        <Card title="Revenue vs Net Income">
          <div className="chart-wrap">
            <Bar data={{
              labels: companies.map(c => c.company.split(' ')[0]),
              datasets: [
                { label: 'Revenue', data: companies.map(c => last(c.revenue)), backgroundColor: colors.map(c => c + '99'), borderRadius: 4 },
                { label: 'Net Income', data: companies.map(c => last(c.netIncome)), backgroundColor: companies.map(c => last(c.netIncome) < 0 ? '#de3f57cc' : '#f25571cc'), borderRadius: 4 }
              ]
            }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }} />
          </div>
        </Card>
      </div>

      {/* YoY trend per company */}
      {companies.some(c => Array.isArray(c.revenue) && c.revenue.length > 1) && (
        <Card title="Revenue Trend per Company">
          <div className="chart-wrap-lg">
            <Line data={{
              labels: [...new Set(companies.flatMap(c => c.years || []))].sort(),
              datasets: companies.map((c, i) => {
                const allYears = [...new Set(companies.flatMap(cc => cc.years || []))].sort()
                return {
                  label: c.company, borderColor: colors[i % colors.length],
                  backgroundColor: colors[i % colors.length] + '22',
                  tension: .3, fill: false, spanGaps: true, pointRadius: 5,
                  data: allYears.map(y => { const idx = (c.years || []).indexOf(y); return idx >= 0 ? (Array.isArray(c.revenue) ? c.revenue[idx] : c.revenue) || null : null })
                }
              })
            }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => fmtN(v) } } } }} />
          </div>
        </Card>
      )}
    </div>
  )
}
