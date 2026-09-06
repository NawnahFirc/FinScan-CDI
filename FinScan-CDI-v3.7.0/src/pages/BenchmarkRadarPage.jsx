import React, { useState } from 'react'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Radar } from 'react-chartjs-2'
import { useStore } from '../store/useStore'
import { last } from '../lib/finance'
import { buildCorporateDecision } from '../lib/corporateDecision'
import { SECTOR_OPTIONS } from '../lib/companyData'
import MissingMetricsBanner from '../components/MissingMetricsBanner'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

// Sector benchmark scores on a 0–100 scale for each dimension
const SECTOR_BENCHMARKS = {
  general:       { liquidity: 65, profitability: 60, solvency: 62, efficiency: 63, integrity: 72 },
  manufacturing: { liquidity: 58, profitability: 55, solvency: 60, efficiency: 68, integrity: 70 },
  retail:        { liquidity: 62, profitability: 50, solvency: 56, efficiency: 80, integrity: 68 },
  technology:    { liquidity: 75, profitability: 65, solvency: 70, efficiency: 72, integrity: 74 },
  healthcare:    { liquidity: 68, profitability: 62, solvency: 66, efficiency: 62, integrity: 78 },
  construction:  { liquidity: 52, profitability: 48, solvency: 55, efficiency: 58, integrity: 65 },
  logistics:     { liquidity: 60, profitability: 53, solvency: 58, efficiency: 75, integrity: 69 },
}

const DIMS = ['Liquidity', 'Profitability', 'Solvency', 'Efficiency', 'Integrity']
const DIM_KEYS = ['liquidity', 'profitability', 'solvency', 'efficiency', 'integrity']

function getCompanyScores(decision) {
  const bd = decision.scoreBreakdown
  const byKey = Object.fromEntries(bd.map(f => [f.key, f.score]))
  return {
    liquidity: byKey.liquidity ?? 50,
    profitability: byKey.profitability ?? 50,
    solvency: byKey.solvency ?? 50,
    efficiency: byKey.efficiency ?? 50,
    integrity: byKey.integrity ?? 50,
  }
}

function levelForDelta(company, bench) {
  const d = company - bench
  if (d >= 5) return 'above'
  if (d <= -5) return 'below'
  return 'inline'
}

export default function BenchmarkRadarPage() {
  const company = useStore(s => s.activeCompany)
  const [sector, setSector] = useState(company?.sector || 'general')

  if (!company) return null

  const decision = buildCorporateDecision(company)
  const companyScores = getCompanyScores(decision)
  const benchScores = SECTOR_BENCHMARKS[sector] || SECTOR_BENCHMARKS.general
  const sectorLabel = SECTOR_OPTIONS.find(o => o.id === sector)?.label || 'General'

  const radarData = {
    labels: DIMS,
    datasets: [
      {
        label: company.company || 'Company',
        data: DIM_KEYS.map(k => companyScores[k]),
        backgroundColor: 'rgba(217,16,22,0.18)',
        borderColor: 'rgba(217,16,22,0.85)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(217,16,22,0.9)',
        pointRadius: 4,
      },
      {
        label: `${sectorLabel} median`,
        data: DIM_KEYS.map(k => benchScores[k]),
        backgroundColor: 'rgba(92,137,255,0.12)',
        borderColor: 'rgba(92,137,255,0.7)',
        borderWidth: 2,
        borderDash: [5, 4],
        pointBackgroundColor: 'rgba(92,137,255,0.8)',
        pointRadius: 3,
      },
    ],
  }

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, font: { size: 10 }, color: 'rgba(130,130,130,0.7)' },
        grid: { color: 'rgba(130,130,130,0.14)' },
        pointLabels: { font: { size: 12, weight: '600' } },
      },
    },
  }

  return (
    <div>
      <MissingMetricsBanner />
      <div className="page-header">
        <div className="page-header-text">
          <h2>Benchmark Radar</h2>
          <p>Compare {company.company || 'this company'} against sector peers across five risk dimensions.</p>
        </div>
        <div className="page-actions">
          <select
            value={sector}
            onChange={e => setSector(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
          >
            {SECTOR_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Radar Chart</div>
          <div className="radar-wrap">
            <Radar data={radarData} options={radarOptions} />
          </div>
          <div className="radar-legend">
            <div className="radar-legend-item">
              <div className="radar-legend-dot" style={{ background: 'rgba(217,16,22,0.85)' }} />
              {company.company || 'Company'}
            </div>
            <div className="radar-legend-item">
              <div className="radar-legend-dot" style={{ background: 'rgba(92,137,255,0.7)' }} />
              {sectorLabel} median
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Dimension detail</div>
          <table className="dt radar-dim-table">
            <thead>
              <tr>
                <th>Dimension</th>
                <th style={{ textAlign: 'right' }}>Company</th>
                <th style={{ textAlign: 'right' }}>Sector median</th>
                <th style={{ textAlign: 'right' }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {DIM_KEYS.map((key, i) => {
                const co = companyScores[key]
                const be = benchScores[key]
                const d = co - be
                const lvl = levelForDelta(co, be)
                return (
                  <tr key={key}>
                    <td><strong>{DIMS[i]}</strong></td>
                    <td className="num" style={{ color: decision.scoreBreakdown.find(f => f.key === key)?.level === 'high' ? 'var(--danger)' : decision.scoreBreakdown.find(f => f.key === key)?.level === 'medium' ? 'var(--warn)' : 'var(--good)' }}>
                      {co}
                    </td>
                    <td className="num" style={{ color: 'var(--info)' }}>{be}</td>
                    <td className="num" style={{ color: lvl === 'above' ? 'var(--good)' : lvl === 'below' ? 'var(--danger)' : 'var(--text2)' }}>
                      {d > 0 ? '+' : ''}{d}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem' }}>
            <div className="card-title">Dimension glossary</div>
            {[
              { dim: 'Liquidity', desc: 'Current ratio, quick ratio, CCC — ability to meet short-term obligations.' },
              { dim: 'Profitability', desc: 'EBITDA margin, ROE, ROA — earning power relative to assets and equity.' },
              { dim: 'Solvency', desc: 'Debt-to-equity, interest coverage — long-term financial stability.' },
              { dim: 'Efficiency', desc: 'Asset turnover, DSO, DPO — how well the company uses its resources.' },
              { dim: 'Integrity', desc: 'Beneish M-Score, Altman Z-Score — earnings quality and fraud/distress risk.' },
            ].map(({ dim, desc }) => (
              <div key={dim} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <strong style={{ minWidth: 100, color: 'var(--heading-tone)' }}>{dim}</strong>
                <span style={{ color: 'var(--text2)', lineHeight: 1.55 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Composite score breakdown</div>
        <div className="grid-4">
          {decision.scoreBreakdown.map(f => (
            <div key={f.key} className="decision-kpi">
              <div className="decision-kpi-label">{f.label}</div>
              <div className="decision-kpi-value" style={{
                fontSize: 24,
                marginTop: 8,
                marginBottom: 6,
                color: f.level === 'high' ? 'var(--danger)' : f.level === 'medium' ? 'var(--warn)' : 'var(--good)'
              }}>
                {f.score}<span style={{ fontSize: 13, fontWeight: 400 }}>/100</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{f.driver}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
