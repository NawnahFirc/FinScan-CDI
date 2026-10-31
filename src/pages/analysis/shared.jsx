import { fixed } from '../../lib/numeric.js'
import { fmt } from '../../lib/finance'

export function Card({ title, children, actions }) {
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

export function Badge({ level, children }) {
  return <span className={`badge ${level}`}>{children}</span>
}

export function RatioRow({ name, val, pctVal, color, bench }) {
  return (
    <div className="ratio-row">
      <span className="rname">{name}</span>
      <div className="rbarwrap"><div className="rbar" style={{ width: `${Number.isFinite(pctVal) ? Math.min(Math.abs(pctVal), 100) : 0}%`, background: color }} /></div>
      <span className="rval" style={{ color }}>{String(val).replace(/(?:NaN|n\/a|Infinity)[%x]?/g,'n/a')}</span>
      <span className="rbench">{bench}</span>
    </div>
  )
}

export function metricDelta(value, threshold, goodWhenLower = false) {
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

export function toneForLevel(level) {
  return level === 'high'
    ? 'var(--danger)'
    : level === 'medium'
      ? 'var(--warn)'
      : 'var(--good)'
}

export function previousValue(series) {
  return Array.isArray(series) && series.length > 1 ? series[series.length - 2] : null
}

export function formatReportValue(value, format = 'number', currency = 'EUR') {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  if (format === 'money') return fmt(value, currency)
  if (format === 'percent') return `${Number(value).toFixed(1)}%`
  if (format === 'ratio') return `${Number(value).toFixed(2)}x`
  if (format === 'days') return `${Number(value).toFixed(1)} days`
  return Number(value).toFixed(2)
}

export function assessmentLabel(level) {
  return level === 'high' ? 'Concerning' : level === 'medium' ? 'Medium watch' : 'Healthy'
}

export function firstSentence(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const match = normalized.match(/.*?[.!?](?:\s|$)/)
  return (match ? match[0] : normalized).trim()
}

export function compactReportText(text, maxLength = 150) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const shortened = firstSentence(normalized)
  if (shortened.length <= maxLength) return shortened
  return `${shortened.slice(0, maxLength - 1).trimEnd()}...`
}

export function stripLeadingLabel(text) {
  return String(text || '').replace(/^[^:]{0,90}:\s*/, '').trim()
}

export function readinessLevel(model) {
  if (model.ready) return 'low'
  return model.coverage >= 70 ? 'medium' : 'high'
}

export const g = (v, good, bad) => !Number.isFinite(v) ? 'var(--text3)' : v >= good ? 'var(--good)' : v >= bad ? 'var(--warn)' : 'var(--danger)'

export const gi = (v, bad, warn) => !Number.isFinite(v) ? 'var(--text3)' : v <= bad ? 'var(--good)' : v <= warn ? 'var(--warn)' : 'var(--danger)'
