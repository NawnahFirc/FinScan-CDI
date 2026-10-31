import { fixed } from '../../lib/numeric.js'
import React from 'react'
import { Bar, Line } from './charts'
import { useStore } from '../../store/useStore'
import { last, fmtN, fmt, computeRiskScore, computeAltman, CHART_COLORS } from '../../lib/finance'
import { Card } from './shared'

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
