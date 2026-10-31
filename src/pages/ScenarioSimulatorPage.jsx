import React, { useState, useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { useStore } from '../store/useStore'
import { buildCorporateDecision } from '../lib/corporateDecision'
import { last } from '../lib/finance'
import MissingMetricsBanner from '../components/MissingMetricsBanner'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const PRESETS = [
  {
    label: 'Mild downturn',
    desc: 'Revenue –10%, DSO +15 days',
    values: { revDrop: 10, dsoDays: 15, invMult: 0, marginDrop: 2, dpoDays: 0, equityDrop: 0 },
  },
  {
    label: 'Supply shock',
    desc: 'Inventory ×2, payables –20 days',
    values: { revDrop: 0, dsoDays: 0, invMult: 100, marginDrop: 4, dpoDays: 20, equityDrop: 0 },
  },
  {
    label: 'Cash squeeze',
    desc: 'DSO +30, DPO –15, margin –8pp',
    values: { revDrop: 5, dsoDays: 30, invMult: 50, marginDrop: 8, dpoDays: 15, equityDrop: 10 },
  },
  {
    label: 'Severe stress',
    desc: 'All factors at maximum',
    values: { revDrop: 30, dsoDays: 60, invMult: 150, marginDrop: 15, dpoDays: 30, equityDrop: 25 },
  },
]

const SLIDERS = [
  {
    key: 'revDrop',
    label: 'Revenue decline',
    unit: '%',
    min: 0,
    max: 40,
    step: 1,
    help: 'Simulates a percentage drop in the company\'s top-line revenue.',
    negative: true,
  },
  {
    key: 'dsoDays',
    label: 'Receivables slowdown',
    unit: 'd',
    min: 0,
    max: 90,
    step: 5,
    help: 'Additional days it takes customers to pay — increases receivables on balance sheet.',
    negative: true,
  },
  {
    key: 'invMult',
    label: 'Inventory build-up',
    unit: '%',
    min: 0,
    max: 200,
    step: 10,
    help: 'Increases inventory by this percentage, reflecting over-purchasing or slow sales.',
    negative: true,
  },
  {
    key: 'marginDrop',
    label: 'EBIT margin pressure',
    unit: 'pp',
    min: 0,
    max: 20,
    step: 1,
    help: 'Cuts operating profit margin by this many percentage points.',
    negative: true,
  },
  {
    key: 'dpoDays',
    label: 'Supplier payment acceleration',
    unit: 'd',
    min: 0,
    max: 45,
    step: 5,
    help: 'Fewer days before paying suppliers — reduces payables, tightening cash.',
    negative: true,
  },
  {
    key: 'equityDrop',
    label: 'Equity erosion',
    unit: '%',
    min: 0,
    max: 40,
    step: 2,
    help: 'Models accumulated losses or dividend payouts reducing equity.',
    negative: true,
  },
]

function applyStress(company, s) {
  const clone = JSON.parse(JSON.stringify(company))
  const applyArr = (field, fn) => {
    if (Array.isArray(clone[field])) clone[field] = clone[field].map(fn)
    else if (typeof clone[field] === 'number') clone[field] = fn(clone[field])
  }

  // Revenue decline
  if (s.revDrop > 0) {
    const factor = 1 - s.revDrop / 100
    applyArr('revenue', v => v * factor)
    applyArr('grossProfit', v => v * factor * 0.9)
    applyArr('ebit', v => v * factor)
    applyArr('netIncome', v => v * factor * 0.85)
    applyArr('cashFlow', v => v * factor * 0.8)
  }

  // Receivables slowdown — increase receivables by (dsoDays/365) * revenue
  if (s.dsoDays > 0) {
    const rev = last(clone.revenue)
    const extraRec = (s.dsoDays / 365) * rev
    applyArr('receivables', v => v + extraRec)
    applyArr('currentAssets', v => v + extraRec)
    applyArr('totalAssets', v => v + extraRec)
  }

  // Inventory increase
  if (s.invMult > 0) {
    applyArr('inventory', v => v * (1 + s.invMult / 100))
    const inv = last(clone.inventory)
    applyArr('currentAssets', v => v + inv * (s.invMult / 100))
    applyArr('totalAssets', v => v + inv * (s.invMult / 100))
  }

  // EBIT margin pressure
  if (s.marginDrop > 0) {
    const rev = last(clone.revenue)
    const cut = rev * (s.marginDrop / 100)
    applyArr('ebit', v => v - cut)
    applyArr('netIncome', v => v - cut * 0.75)
    applyArr('cashFlow', v => v - cut * 0.7)
  }

  // Supplier payment acceleration — reduce payables
  if (s.dpoDays > 0) {
    const rev = last(clone.revenue)
    const cut = (s.dpoDays / 365) * rev
    applyArr('payables', v => Math.max(0, v - cut))
    applyArr('currentLiabilities', v => Math.max(0, v - cut))
    applyArr('totalLiabilities', v => Math.max(0, v - cut))
  }

  // Equity erosion
  if (s.equityDrop > 0) {
    const factor = 1 - s.equityDrop / 100
    applyArr('equity', v => v * factor)
  }

  return clone
}

function toneForLevel(l) {
  return l === 'high' ? 'var(--danger)' : l === 'medium' ? 'var(--warn)' : 'var(--good)'
}

export default function ScenarioSimulatorPage() {
  const company = useStore(s => s.activeCompany)
  const [stress, setStress] = useState({ revDrop: 0, dsoDays: 0, invMult: 0, marginDrop: 0, dpoDays: 0, equityDrop: 0 })

  if (!company) return null

  const baseDecision = useMemo(() => buildCorporateDecision(company), [company])
  const stressedCompany = useMemo(() => applyStress(company, stress), [company, stress])
  const stressedDecision = useMemo(() => buildCorporateDecision(stressedCompany), [stressedCompany])

  const delta = stressedDecision.compositeScore - baseDecision.compositeScore
  const anyStress = Object.values(stress).some(v => v > 0)

  function applyPreset(preset) {
    setStress(preset.values)
  }

  function resetAll() {
    setStress({ revDrop: 0, dsoDays: 0, invMult: 0, marginDrop: 0, dpoDays: 0, equityDrop: 0 })
  }

  const barData = {
    labels: stressedDecision.scoreBreakdown.map(f => f.label),
    datasets: [
      {
        label: 'Baseline',
        data: baseDecision.scoreBreakdown.map(f => f.score),
        backgroundColor: 'rgba(100,160,255,0.5)',
        borderRadius: 6,
      },
      {
        label: 'Stressed',
        data: stressedDecision.scoreBreakdown.map(f => f.score),
        backgroundColor: stressedDecision.scoreBreakdown.map(f =>
          f.level === 'high' ? 'rgba(225,29,47,0.72)' : f.level === 'medium' ? 'rgba(245,158,11,0.7)' : 'rgba(21,128,61,0.6)'
        ),
        borderRadius: 6,
      },
    ],
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: {
      y: { beginAtZero: true, max: 100, grid: { color: 'rgba(120,120,120,.14)' } },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  }

  return (
    <div>
      <MissingMetricsBanner />
      <div className="page-header">
        <div className="page-header-text">
          <h2>Scenario Simulator</h2>
          <p>Stress-test the counterparty score under adverse conditions. Adjust sliders to model financial deterioration.</p>
        </div>
        <div className="page-actions">
          {anyStress && <button className="btn sm" onClick={resetAll}>Reset</button>}
        </div>
      </div>

      <div className="scenario-preset-row">
        {PRESETS.map(p => (
          <button key={p.label} className="scenario-preset" onClick={() => applyPreset(p)}>
            <strong>{p.label}</strong>
            <span>{p.desc}</span>
          </button>
        ))}
      </div>

      <div className="scenario-grid">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Stress Parameters</div>
          {SLIDERS.map(sl => (
            <div key={sl.key} className="scenario-row">
              <div>
                <div className="scenario-label">{sl.label}</div>
                <div className="scenario-help">{sl.help}</div>
              </div>
              <div className="scenario-control">
                <input
                  type="range"
                  min={sl.min}
                  max={sl.max}
                  step={sl.step}
                  value={stress[sl.key]}
                  onChange={e => setStress(prev => ({ ...prev, [sl.key]: Number(e.target.value) }))}
                />
                <span className={`scenario-pill ${stress[sl.key] > 0 ? 'negative' : ''}`}>
                  {stress[sl.key] > 0 ? '–' : ''}{stress[sl.key]}{sl.unit}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="scenario-summary">
          <div className="scenario-summary-card">
            <div className="scenario-summary-title">Baseline Score</div>
            <div className="scenario-summary-score" style={{ color: toneForLevel(baseDecision.level) }}>
              {baseDecision.compositeScore}
            </div>
            <div className="scenario-summary-text">{baseDecision.recommendation.short}</div>
          </div>

          <div className="scenario-summary-card">
            <div className="scenario-summary-title">Stressed Score</div>
            <div className="scenario-summary-score" style={{ color: toneForLevel(stressedDecision.level) }}>
              {stressedDecision.compositeScore}
            </div>
            <div className="scenario-summary-text">{stressedDecision.recommendation.short}</div>
            {anyStress && (
              <div style={{ marginTop: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>
                <span style={{ color: delta < 0 ? 'var(--danger)' : 'var(--good)' }}>
                  {delta > 0 ? '+' : ''}{delta} pts
                </span>
                {' '}vs baseline
              </div>
            )}
          </div>

          {anyStress && (
            <div className="scenario-impact-list">
              <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 12 }}>Score drivers</div>
              {stressedDecision.scoreBreakdown.map((f, i) => {
                const base = baseDecision.scoreBreakdown[i]
                const d = f.score - base.score
                return (
                  <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '5px 0' }}>
                    <span>{f.label}</span>
                    <span className={`scenario-delta ${d < -2 ? 'negative' : d > 2 ? 'positive' : 'neutral'}`}>
                      {d > 0 ? '+' : ''}{d}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {stressedDecision.recommendation.level !== baseDecision.recommendation.level && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--danger-light)',
              border: '1px solid var(--danger)',
              fontSize: 13,
              color: 'var(--danger)',
              fontWeight: 600,
            }}>
              Decision changes: {baseDecision.recommendation.title} → {stressedDecision.recommendation.title}
            </div>
          )}
        </div>
      </div>

      {anyStress && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-title">Factor comparison — Baseline vs Stressed</div>
          <div style={{ height: 280 }}>
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Stressed Exposure Limits</div>
        <div className="grid-4">
          {[
            { label: 'Exposure Cap', value: stressedDecision.exposure.displayAmount },
            { label: 'Payment Terms', value: `${stressedDecision.exposure.termDays}d` },
            { label: 'Review Cadence', value: stressedDecision.exposure.reviewCadence },
            { label: 'Guarantee', value: stressedDecision.exposure.guarantee },
          ].map(k => (
            <div key={k.label} className="decision-kpi">
              <div className="decision-kpi-label">{k.label}</div>
              <div className="decision-kpi-value" style={{ fontSize: 18, marginTop: 6, marginBottom: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
