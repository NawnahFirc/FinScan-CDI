import { divide, fixed, changePercent } from '../../lib/numeric.js'
import { Bar, Line } from './charts'
import { useStore } from '../../store/useStore'
import { fmtN, fmt } from '../../lib/finance'
import { Card } from './shared'

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
