import { divide, fixed, changePercent } from '../../lib/numeric.js'
import { useStore } from '../../store/useStore'
import { last, fmt, computeRiskScore, STD_LABELS } from '../../lib/finance'
import MissingMetricsBanner from '../../components/MissingMetricsBanner'
import { Card, Badge } from './shared'

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
