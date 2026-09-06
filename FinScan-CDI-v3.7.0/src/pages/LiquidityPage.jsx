import React, { useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { useStore } from '../store/useStore'
import { applyLiquidityScenario, buildLiquidityAnalysis } from '../lib/liquidity'
import { SECTOR_OPTIONS } from '../lib/companyData'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

const DEFAULT_SCENARIO = {
  collectionsPct: 0,
  inventoryPct: 0,
  supplierPct: 0,
  ocfPct: 0,
  cashBufferPct: 0,
}

const PRESETS = [
  {
    label: 'Collections Sprint',
    description: 'Receivables convert faster and operating cash improves.',
    values: { collectionsPct: 18, inventoryPct: 0, supplierPct: 0, ocfPct: 12, cashBufferPct: 0 }
  },
  {
    label: 'Inventory Release',
    description: 'Excess stock is liquidated into cash.',
    values: { collectionsPct: 0, inventoryPct: 22, supplierPct: 0, ocfPct: 8, cashBufferPct: 0 }
  },
  {
    label: 'Supplier Stretch',
    description: 'Longer payment terms support cash temporarily.',
    values: { collectionsPct: 0, inventoryPct: 0, supplierPct: 16, ocfPct: 0, cashBufferPct: 0 }
  },
  {
    label: 'Stress Case',
    description: 'Collections slow, inventory builds, and cash flow weakens.',
    values: { collectionsPct: -15, inventoryPct: -12, supplierPct: -8, ocfPct: -18, cashBufferPct: -12 }
  },
]

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

function SummaryMetric({ label, value, sub, level = 'info' }) {
  return (
    <div className="metric">
      <div className="mlabel">{label}</div>
      <div className="mval">{value}</div>
      <div className="msub">
        <Badge level={level}>{sub}</Badge>
      </div>
    </div>
  )
}

function ScenarioSlider({ label, description, value, onChange, min = -30, max = 30 }) {
  return (
    <div className="scenario-row">
      <div>
        <div className="scenario-label">{label}</div>
        <div className="scenario-help">{description}</div>
      </div>
      <div className="scenario-control">
        <input type="range" min={min} max={max} step="1" value={value} onChange={onChange} />
        <div className={`scenario-pill ${value > 0 ? 'positive' : value < 0 ? 'negative' : ''}`}>
          {value > 0 ? '+' : ''}{value}%
        </div>
      </div>
    </div>
  )
}

function ScenarioDelta({ actual, scenario, suffix = '' }) {
  const delta = (scenario || 0) - (actual || 0)
  const tone = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
  return <span className={`scenario-delta ${tone}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}{suffix}</span>
}

export default function LiquidityPage() {
  const company = useStore(state => state.activeCompany)
  const updateActiveCompanyMeta = useStore(state => state.updateActiveCompanyMeta)

  const [scenario, setScenario] = useState(DEFAULT_SCENARIO)

  if (!company) return null

  const analysis = buildLiquidityAnalysis(company)
  const scenarioRun = applyLiquidityScenario(company, scenario)
  const scenarioAnalysis = buildLiquidityAnalysis(scenarioRun.company)

  const metricsByKey = analysis.metrics.reduce((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {})

  const scenarioMetricsByKey = scenarioAnalysis.metrics.reduce((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {})

  const actualScore = analysis.executiveMemo.score
  const scenarioScore = scenarioAnalysis.executiveMemo.score
  const scoreDelta = scenarioScore - actualScore
  const scenarioActive = Object.values(scenario).some(value => value !== 0)
  const displayCurrency = company.displayCurrency || company.currency || 'UNKNOWN'
  const sourceCurrency = company.sourceCurrency || company.originalCurrency || company.currency || 'UNKNOWN'

  const cycleChartData = {
    labels: analysis.years,
    datasets: [
      {
        label: 'CCC',
        data: analysis.seriesMap.ccc.map(value => Number.isFinite(value) ? +value.toFixed(1) : null),
        borderColor: '#0F6E56',
        backgroundColor: '#0F6E5620',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'DSO',
        data: analysis.seriesMap.dso.map(value => Number.isFinite(value) ? +value.toFixed(1) : null),
        borderColor: '#185FA5',
        tension: 0.3,
      },
      {
        label: 'DIO',
        data: analysis.seriesMap.dio.map(value => Number.isFinite(value) ? +value.toFixed(1) : null),
        borderColor: '#BA7517',
        tension: 0.3,
      },
      {
        label: 'DPO',
        data: analysis.seriesMap.dpo.map(value => Number.isFinite(value) ? +value.toFixed(1) : null),
        borderColor: '#6B3FA0',
        tension: 0.3,
      },
    ]
  }

  const supportChartData = {
    labels: ['Working Capital Adequacy', 'OCF vs Net Income', 'Short-Term Debt Coverage'],
    datasets: [
      {
        label: 'Actual',
        data: [
          metricsByKey.workingCapitalAdequacy.current.value || 0,
          metricsByKey.ocfVsNetIncome.current.value || 0,
          metricsByKey.shortTermDebtCoverage.current.value || 0,
        ],
        backgroundColor: '#185FA5cc',
        borderRadius: 6,
      },
      {
        label: 'Scenario',
        data: [
          scenarioMetricsByKey.workingCapitalAdequacy.current.value || 0,
          scenarioMetricsByKey.ocfVsNetIncome.current.value || 0,
          scenarioMetricsByKey.shortTermDebtCoverage.current.value || 0,
        ],
        backgroundColor: '#1D9E75cc',
        borderRadius: 6,
      }
    ]
  }

  function updateScenarioField(key, value) {
    setScenario(prev => ({ ...prev, [key]: parseInt(value, 10) || 0 }))
  }

  function applyPreset(values) {
    setScenario(values)
  }

  function resetScenario() {
    setScenario(DEFAULT_SCENARIO)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>Liquidity & Working Capital</h2>
          <p>All liquidity ratios and commentary are computed locally from reviewed financial data.</p>
        </div>
        <div className="page-actions">
          <select
            className="btn"
            value={company.sector || 'general'}
            onChange={event => updateActiveCompanyMeta({ sector: event.target.value })}
            style={{ cursor: 'pointer' }}
          >
            {SECTOR_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <Card title="Assessment Context">
        <div className="context-strip">
          <div>
            <strong>{company.company}</strong> is being benchmarked against the <strong>{analysis.sector.label}</strong> profile.
            <div className="context-note">{analysis.sector.description}</div>
          </div>
          <div>
            <strong>Display currency:</strong> {displayCurrency}
            <div className="context-note">
              {company.fxRateKnown
                ? `Source currency ${sourceCurrency} converted at ${company.fxRateToEUR?.toFixed(4) || '1.0000'} EUR per source unit.`
                : `Values remain in source currency ${sourceCurrency}; no embedded EUR rate is available.`}
            </div>
          </div>
          <div>
            <strong>FX snapshot:</strong> {company.fxSnapshotDate || 'Local default'}
            <div className="context-note">{company.fxSnapshotNote}</div>
          </div>
        </div>
      </Card>

      <div className="grid-4">
        <SummaryMetric
          label="Liquidity Score"
          value={`${actualScore}/100`}
          sub={analysis.executiveMemo.overallStatus}
          level={actualScore >= 75 ? 'low' : actualScore >= 55 ? 'medium' : 'high'}
        />
        <SummaryMetric
          label="Scenario Score"
          value={`${scenarioScore}/100`}
          sub={scenarioActive ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta} vs actual` : 'No scenario active'}
          level={scoreDelta > 0 ? 'low' : scoreDelta < 0 ? 'high' : 'info'}
        />
        <SummaryMetric
          label="Cash Conversion Cycle"
          value={metricsByKey.ccc.current.displayValue}
          sub={metricsByKey.ccc.statusLabel}
          level={metricsByKey.ccc.badgeLevel}
        />
        <SummaryMetric
          label="Short-Term Debt Coverage"
          value={metricsByKey.shortTermDebtCoverage.current.displayValue}
          sub={metricsByKey.shortTermDebtCoverage.statusLabel}
          level={metricsByKey.shortTermDebtCoverage.badgeLevel}
        />
      </div>

      <div className="grid-2">
        <Card title="Cycle Trend">
          <div className="chart-wrap">
            <Line
              data={cycleChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: { y: { ticks: { callback: value => `${value}d` } } }
              }}
            />
          </div>
        </Card>

        <Card title="Actual vs Scenario Support">
          <div className="chart-wrap">
            <Bar
              data={supportChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
              }}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Liquidity What-If Lab"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={resetScenario}>Reset</button>
          </div>
        }
      >
        <div className="scenario-preset-row">
          {PRESETS.map(preset => (
            <button key={preset.label} className="scenario-preset" onClick={() => applyPreset(preset.values)}>
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="scenario-grid">
          <div>
            <ScenarioSlider
              label="Collections Improvement"
              description="Positive values accelerate receivable collections into cash."
              value={scenario.collectionsPct}
              onChange={event => updateScenarioField('collectionsPct', event.target.value)}
            />
            <ScenarioSlider
              label="Inventory Release"
              description="Positive values unwind inventory into cash."
              value={scenario.inventoryPct}
              onChange={event => updateScenarioField('inventoryPct', event.target.value)}
            />
            <ScenarioSlider
              label="Supplier Terms"
              description="Positive values stretch suppliers and temporarily lift cash."
              value={scenario.supplierPct}
              onChange={event => updateScenarioField('supplierPct', event.target.value)}
            />
            <ScenarioSlider
              label="Operating Cash Flow"
              description="Positive values improve operating execution and cash conversion."
              value={scenario.ocfPct}
              onChange={event => updateScenarioField('ocfPct', event.target.value)}
              min={-40}
              max={40}
            />
            <ScenarioSlider
              label="Cash Buffer"
              description="Directly stress or strengthen the closing cash position."
              value={scenario.cashBufferPct}
              onChange={event => updateScenarioField('cashBufferPct', event.target.value)}
              min={-40}
              max={40}
            />
          </div>

          <div className="scenario-summary">
            <div className="scenario-summary-card">
              <div className="scenario-summary-title">Simulated Outlook</div>
              <div className="scenario-summary-score">{scenarioScore}/100</div>
              <div className="scenario-summary-text">
                {scenarioAnalysis.executiveMemo.paragraphs[0]}
              </div>
            </div>

            <div className="scenario-impact-list">
              <div><strong>Receivable shift:</strong> {scenarioRun.adjustments.collectionShift >= 0 ? '+' : ''}{scenarioRun.adjustments.collectionShift.toFixed(0)} {displayCurrency} into cash</div>
              <div><strong>Inventory shift:</strong> {scenarioRun.adjustments.inventoryRelease >= 0 ? '+' : ''}{scenarioRun.adjustments.inventoryRelease.toFixed(0)} {displayCurrency} into cash</div>
              <div><strong>Supplier timing:</strong> {scenarioRun.adjustments.payableShift >= 0 ? '+' : ''}{scenarioRun.adjustments.payableShift.toFixed(0)} {displayCurrency} of payment float</div>
              <div><strong>OCF shift:</strong> {scenarioRun.adjustments.cashFlowShift >= 0 ? '+' : ''}{scenarioRun.adjustments.cashFlowShift.toFixed(0)} {displayCurrency}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Scenario Delta Board">
        <table className="dt">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Actual</th>
              <th>Scenario</th>
              <th>Delta</th>
              <th>Scenario Status</th>
            </tr>
          </thead>
          <tbody>
            {['ccc', 'dso', 'dpo', 'dio', 'workingCapitalAdequacy', 'ocfVsNetIncome', 'shortTermDebtCoverage', 'cashBurnRate'].map(key => (
              <tr key={key}>
                <td>
                  <strong>{metricsByKey[key].label}</strong>
                  <div className="table-subnote">{scenarioMetricsByKey[key].trend.text}</div>
                </td>
                <td className="num">{metricsByKey[key].current.displayValue}</td>
                <td className="num">{scenarioMetricsByKey[key].current.displayValue}</td>
                <td className="num">
                  {key === 'workingCapitalAdequacy' && <ScenarioDelta actual={metricsByKey[key].current.value} scenario={scenarioMetricsByKey[key].current.value} suffix="pp" />}
                  {(key === 'ocfVsNetIncome' || key === 'shortTermDebtCoverage') && <ScenarioDelta actual={metricsByKey[key].current.value} scenario={scenarioMetricsByKey[key].current.value} suffix="x" />}
                  {(key === 'ccc' || key === 'dso' || key === 'dpo' || key === 'dio') && <ScenarioDelta actual={metricsByKey[key].current.value} scenario={scenarioMetricsByKey[key].current.value} suffix="d" />}
                  {key === 'cashBurnRate' && <ScenarioDelta actual={metricsByKey[key].current.value} scenario={scenarioMetricsByKey[key].current.value} />}
                </td>
                <td><Badge level={scenarioMetricsByKey[key].badgeLevel}>{scenarioMetricsByKey[key].statusLabel}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Executive Risk Narrative">
        <div className="ai-section" style={{ marginBottom: 0 }}>
          {analysis.executiveMemo.paragraphs.map((paragraph, index) => (
            <p key={index} style={index > 0 ? { marginTop: 10 } : {}}>{paragraph}</p>
          ))}
        </div>
      </Card>

      <Card title="Sector Benchmark Matrix">
        <table className="dt">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Company</th>
              <th>Benchmark</th>
              <th>Status</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {analysis.metrics.map(metric => (
              <tr key={metric.key}>
                <td>
                  <strong>{metric.label}</strong>
                  <div className="table-subnote">{metric.explanation}</div>
                </td>
                <td className="num">{metric.current.displayValue}</td>
                <td>{metric.benchmarkText}</td>
                <td><Badge level={metric.badgeLevel}>{metric.statusLabel}</Badge></td>
                <td>{metric.trend.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="liquidity-metric-grid">
        {analysis.metrics.map(metric => (
          <Card
            key={metric.key}
            title={metric.label}
            actions={<Badge level={metric.badgeLevel}>{metric.statusLabel}</Badge>}
          >
            <div className="liquidity-metric-head">
              <div className="liquidity-metric-value">{metric.current.displayValue}</div>
              <div className="liquidity-metric-meta">
                <div><strong>Benchmark:</strong> {metric.benchmarkText}</div>
                <div><strong>Trend:</strong> {metric.trend.label}</div>
              </div>
            </div>
            <p className="liquidity-copy">{metric.commentary}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
