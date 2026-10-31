import { divide, fixed, numberOrNaN } from '../../lib/numeric.js'
import { Bar } from './charts'
import { useStore } from '../../store/useStore'
import { last, STD_LABELS } from '../../lib/finance'
import { Card, Badge, RatioRow, g, gi } from './shared'

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
