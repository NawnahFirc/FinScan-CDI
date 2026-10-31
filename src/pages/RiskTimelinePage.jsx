import React, { useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useStore } from '../store/useStore'
import MissingMetricsBanner from '../components/MissingMetricsBanner'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

function safeDiv(a, b) { return b ? a / b : 0 }

function getTimelineData(company) {
  const years = company.years || []
  const len = years.length

  function arr(field) {
    const v = company[field]
    return Array.isArray(v) ? v : Array(len).fill(typeof v === 'number' ? v : 0)
  }

  const rev = arr('revenue')
  const ni = arr('netIncome')
  const gp = arr('grossProfit')
  const ca = arr('currentAssets')
  const cl = arr('currentLiabilities')
  const ta = arr('totalAssets')
  const tl = arr('totalLiabilities')
  const eq = arr('equity')
  const cf = arr('cashFlow')
  const rec = arr('receivables')
  const ebit = arr('ebit')

  return years.map((yr, i) => ({
    year: yr,
    currentRatio: safeDiv(ca[i], cl[i]),
    ebitdaMargin: rev[i] ? (ebit[i] / rev[i]) * 100 : 0,
    debtEquity: safeDiv(tl[i], eq[i]),
    ocfNiRatio: ni[i] ? safeDiv(cf[i], ni[i]) : 0,
    revenueGrowth: i > 0 && rev[i - 1] ? ((rev[i] - rev[i - 1]) / Math.abs(rev[i - 1])) * 100 : null,
    netMargin: rev[i] ? (ni[i] / rev[i]) * 100 : 0,
  }))
}

function generateEvents(rows) {
  const events = []
  rows.forEach((row, i) => {
    if (row.currentRatio < 1) events.push({ year: row.year, text: `Current ratio below 1.0x (${row.currentRatio.toFixed(2)}x) — liquidity warning.` })
    if (row.ebitdaMargin < 0) events.push({ year: row.year, text: `Negative EBIT margin (${row.ebitdaMargin.toFixed(1)}%) — operating loss.` })
    if (row.debtEquity > 2) events.push({ year: row.year, text: `High leverage: debt/equity at ${row.debtEquity.toFixed(2)}x.` })
    if (row.revenueGrowth !== null && row.revenueGrowth < -10) events.push({ year: row.year, text: `Revenue declined ${Math.abs(row.revenueGrowth).toFixed(1)}% year-over-year.` })
    if (row.ocfNiRatio < 0.5 && i > 0) events.push({ year: row.year, text: `Operating cash flow well below net income (OCF/NI: ${row.ocfNiRatio.toFixed(2)}x) — accrual concern.` })
  })
  return events
}

const METRICS = [
  { key: 'currentRatio', label: 'Current Ratio', unit: 'x', color: 'rgba(92,137,255,0.9)', fill: 'rgba(92,137,255,0.1)', refLine: 1.5 },
  { key: 'ebitdaMargin', label: 'EBIT Margin', unit: '%', color: 'rgba(21,128,61,0.9)', fill: 'rgba(21,128,61,0.08)', refLine: 0 },
  { key: 'debtEquity', label: 'Debt / Equity', unit: 'x', color: 'rgba(217,16,22,0.85)', fill: 'rgba(217,16,22,0.07)', refLine: 1.5 },
  { key: 'netMargin', label: 'Net Margin', unit: '%', color: 'rgba(182,139,0,0.9)', fill: 'rgba(182,139,0,0.08)', refLine: 0 },
  { key: 'ocfNiRatio', label: 'OCF / Net Income', unit: 'x', color: 'rgba(101,88,211,0.9)', fill: 'rgba(101,88,211,0.08)', refLine: 1 },
  { key: 'revenueGrowth', label: 'Revenue Growth', unit: '%', color: 'rgba(255,67,49,0.85)', fill: 'rgba(255,67,49,0.07)', refLine: 0 },
]

export default function RiskTimelinePage() {
  const company = useStore(s => s.activeCompany)
  const [activeMetrics, setActiveMetrics] = useState(['currentRatio', 'ebitdaMargin', 'debtEquity'])

  if (!company) return null

  const rows = getTimelineData(company)
  const years = rows.map(r => r.year)
  const events = generateEvents(rows)

  function toggleMetric(key) {
    setActiveMetrics(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const datasets = METRICS.filter(m => activeMetrics.includes(m.key)).map(m => ({
    label: m.label,
    data: rows.map(r => r[m.key] !== null ? Number(r[m.key].toFixed(2)) : null),
    borderColor: m.color,
    backgroundColor: m.fill,
    fill: true,
    tension: 0.35,
    pointRadius: 5,
    pointHoverRadius: 7,
    borderWidth: 2.5,
    spanGaps: true,
  }))

  const chartData = { labels: years, datasets }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 }, padding: 16 } },
      tooltip: {
        callbacks: {
          label: ctx => {
            const m = METRICS.find(x => x.label === ctx.dataset.label)
            const v = ctx.raw
            if (v === null || v === undefined) return `${ctx.dataset.label}: n/a`
            return `${ctx.dataset.label}: ${Number(v).toFixed(2)}${m?.unit || ''}`
          },
        },
      },
    },
    scales: {
      y: { grid: { color: 'rgba(120,120,120,.12)' }, ticks: { font: { size: 11 } } },
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  }

  return (
    <div>
      <MissingMetricsBanner />
      <div className="page-header">
        <div className="page-header-text">
          <h2>Risk Timeline</h2>
          <p>Historical view of financial health across {years.length} period{years.length !== 1 ? 's' : ''}. Select metrics to overlay.</p>
        </div>
      </div>

      <div className="card">
        <div className="timeline-header-row">
          <div className="card-title" style={{ margin: 0 }}>Metric overlay</div>
          <div className="timeline-metric-toggle">
            {METRICS.map(m => (
              <button
                key={m.key}
                className={`timeline-metric-btn ${activeMetrics.includes(m.key) ? 'active' : ''}`}
                onClick={() => toggleMetric(m.key)}
                style={activeMetrics.includes(m.key) ? { background: m.color, borderColor: 'transparent', color: '#fff' } : {}}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="timeline-chart-wrap">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Period snapshot</div>
          <table className="dt">
            <thead>
              <tr>
                <th>Year</th>
                {METRICS.filter(m => activeMetrics.includes(m.key)).map(m => (
                  <th key={m.key} style={{ textAlign: 'right' }}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.year}>
                  <td><strong>{row.year}</strong></td>
                  {METRICS.filter(m => activeMetrics.includes(m.key)).map(m => {
                    const v = row[m.key]
                    const formatted = v !== null && v !== undefined ? `${Number(v).toFixed(2)}${m.unit}` : '—'
                    const color = m.key === 'currentRatio' && v < 1 ? 'var(--danger)'
                      : m.key === 'ebitdaMargin' && v < 0 ? 'var(--danger)'
                      : m.key === 'netMargin' && v < 0 ? 'var(--danger)'
                      : m.key === 'debtEquity' && v > 2 ? 'var(--danger)'
                      : undefined
                    return <td key={m.key} className="num" style={color ? { color } : {}}>{formatted}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Risk events detected</div>
          {events.length === 0 ? (
            <div className="empty" style={{ padding: '2rem 0' }}>
              <p>No major risk events in available periods.</p>
            </div>
          ) : (
            <div className="timeline-event-list">
              {events.map((ev, i) => (
                <div key={i} className="timeline-event">
                  <div className="timeline-event-year">{ev.year}</div>
                  <div className="timeline-event-body">{ev.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
