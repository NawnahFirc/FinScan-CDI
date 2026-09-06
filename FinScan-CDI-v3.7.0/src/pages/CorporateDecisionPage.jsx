import React, { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { useStore } from '../store/useStore'
import { buildCorporateDecision, buildCorporateMemo } from '../lib/corporateDecision'
import MissingMetricsBanner from '../components/MissingMetricsBanner'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const EXPLAIN_CONTENT = {
  executive: {
    approve: 'This counterparty meets or exceeds all financial thresholds. Normal credit terms apply. Schedule quarterly review.',
    monitor: 'Acceptable risk. Proceed with standard terms but flag for finance review if receivables age or cash flow weakens.',
    conditional: 'Business may continue under protective conditions. Finance must confirm before increasing exposure.',
    restrict: 'High risk counterparty. Credit should be restricted and existing exposure reduced over the next 60 days.',
    reject: 'Financial quality is insufficient. No new exposure should be accepted. Legal should review any outstanding receivables.',
  },
  analyst: {
    approve: 'Composite score ≥ 82 with Altman Z in safe zone and no Beneish flag. All five dimensions pass thresholds. Standard exposure appropriate.',
    monitor: 'Score 68–81. Liquidity or profitability is below ideal but not distressed. Monthly review of DSO and EBITDA margins warranted.',
    conditional: 'Score 55–67 or Altman grey zone. Structural weaknesses present. Require guarantees, shorter terms, or security before extending credit.',
    restrict: 'Score 40–54 or distressed Altman. Material operational weakness. Reduce exposure and require updated financials within 30 days.',
    reject: 'Score < 40 or Beneish manipulated. Systemic risk or fraud signals. No exposure should be taken on or renewed.',
  },
  student: {
    approve: 'The company is financially healthy. Its current ratio, profitability, and debt levels are all within safe ranges. The bank or partner can lend to or work with this company without special conditions.',
    monitor: 'The company looks mostly okay but has some weak spots — maybe it collects payments slowly or its profit margins are thin. We can still do business but should check in regularly.',
    conditional: 'The company has real financial problems, like too much debt or negative cash flow. We need extra protection — like a shorter payment window or a guarantee — before we take any risk.',
    restrict: 'This company is struggling. It may not be able to pay its bills on time. We should lower how much money we have at risk with them and wait for updated financials.',
    reject: 'This company is in serious trouble — possibly losing money, facing bankruptcy, or even manipulating its accounts. We should not do business with them right now.',
  },
}

function ExplainBox({ decision, mode }) {
  const level = decision.recommendation.level
  const key = level === 'low' && decision.compositeScore >= 82 ? 'approve'
    : level === 'low' ? 'monitor'
    : level === 'medium' ? 'conditional'
    : decision.compositeScore >= 40 ? 'restrict'
    : 'reject'
  const text = EXPLAIN_CONTENT[mode]?.[key] || ''
  return <div className={`explain-box ${mode}`}>{text}</div>
}

function ExplainToggle({ mode, setMode }) {
  return (
    <div className="explain-toggle">
      {['executive', 'analyst', 'student'].map(m => (
        <button key={m} className={`explain-btn ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
          {m.charAt(0).toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  )
}

function ConfBadge({ level }) {
  return <span className={`conf-badge ${level}`}>{level === 'high' ? '✓ High' : level === 'medium' ? '~ Medium' : '⚠ Review'}</span>
}

function SupervisorPanel({ decision, onClose }) {
  return (
    <div className="supervisor-overlay">
      <button className="btn supervisor-close" onClick={onClose}>Exit Presentation</button>
      <div className="supervisor-title">
        {decision.company || 'Counterparty Assessment'}
        <span className={`badge ${decision.level}`} style={{ fontSize: 14, padding: '8px 16px' }}>
          {decision.recommendation.short}
        </span>
      </div>
      <div className="supervisor-kpi-row">
        {[
          { label: 'Score', value: decision.compositeScore, color: decision.level === 'high' ? 'var(--danger)' : decision.level === 'medium' ? 'var(--warn)' : 'var(--good)' },
          { label: 'Exposure Cap', value: decision.exposure.displayAmount },
          { label: 'Payment Terms', value: `${decision.exposure.termDays}d` },
          { label: 'Review', value: decision.exposure.reviewCadence },
        ].map(k => (
          <div key={k.label} className="supervisor-kpi">
            <div className="supervisor-kpi-val" style={k.color ? { color: k.color } : {}}>{k.value}</div>
            <div className="supervisor-kpi-lbl">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="supervisor-grid">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Decision</div>
          <div style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', color: decision.level === 'high' ? 'var(--danger)' : decision.level === 'medium' ? 'var(--warn)' : 'var(--good)' }}>
            {decision.recommendation.title}
          </div>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.65, color: 'var(--text)', maxWidth: 640 }}>
            {decision.recommendation.summary}
          </p>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">Top actions</div>
          {decision.actionItems.slice(0, 4).map((item, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--brand)', marginRight: 10, fontWeight: 700 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children, actions, className = '' }) {
  return (
    <div className={`card ${className}`.trim()}>
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

function toneForLevel(level) {
  return level === 'high'
    ? 'var(--danger)'
    : level === 'medium'
      ? 'var(--warn)'
      : 'var(--good)'
}

function DecisionKpi({ label, value, sub, level = 'info' }) {
  return (
    <div className="decision-kpi">
      <div className="decision-kpi-label">{label}</div>
      <div className="decision-kpi-value" style={{ color: toneForLevel(level) }}>{value}</div>
      <div className="decision-kpi-sub"><Badge level={level}>{sub}</Badge></div>
    </div>
  )
}

function ScoreFactor({ factor }) {
  return (
    <div className="score-factor">
      <div className="score-factor-head">
        <div>
          <strong>{factor.label}</strong>
          <span>{factor.weight}% weight</span>
        </div>
        <b style={{ color: toneForLevel(factor.level) }}>{factor.score}/100</b>
      </div>
      <div className="score-factor-track">
        <div
          className={`score-factor-fill ${factor.level}`}
          style={{ width: `${Math.max(4, Math.min(factor.score, 100))}%` }}
        />
      </div>
      <p>{factor.driver}</p>
    </div>
  )
}

const AUDIT_FORMULAS = {
  'Current Ratio': 'Current Assets ÷ Current Liabilities',
  'Quick Ratio': '(Current Assets − Inventory) ÷ Current Liabilities',
  'EBITDA Margin': 'EBIT ÷ Revenue × 100',
  'Net Margin': 'Net Income ÷ Revenue × 100',
  'Return on Equity': 'Net Income ÷ Equity × 100',
  'Debt / Equity': 'Total Liabilities ÷ Equity',
  'Interest Coverage': 'EBIT ÷ Interest Expense',
  'Asset Turnover': 'Revenue ÷ Total Assets',
  'Altman Z-Score': "6.56×WC/TA + 3.26×RE/TA + 6.72×EBIT/TA + 1.05×Book Equity/TL",
  'Beneish M-Score': '8-variable logit model (DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA)',
  'OCF / Net Income': 'Operating Cash Flow ÷ Net Income',
}

function EvidenceTable({ evidence }) {
  return (
    <div className="report-table-wrap decision-evidence-wrap audit-trail-table">
      <table className="dt decision-evidence-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Reading</th>
            <th>Threshold</th>
            <th>Status</th>
            <th>Formula</th>
            <th>Source</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((item) => (
            <tr key={item.metric}>
              <td><strong>{item.metric}</strong></td>
              <td className="num" style={{ color: toneForLevel(item.level) }}>{item.reading}</td>
              <td style={{ fontSize: 12, color: 'var(--text2)' }}>{item.threshold}</td>
              <td><Badge level={item.level}>{item.status}</Badge></td>
              <td>
                {AUDIT_FORMULAS[item.metric]
                  ? <span className="audit-formula">{AUDIT_FORMULAS[item.metric]}</span>
                  : <span style={{ color: 'var(--text2)', fontSize: 11 }}>{item.source}</span>
                }
              </td>
              <td style={{ fontSize: 12, color: 'var(--text2)' }}>{item.interpretation}</td>
              <td>
                <ConfBadge level={item.level === 'low' ? 'high' : item.level === 'medium' ? 'medium' : 'review'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CorporateDecisionPage() {
  const company = useStore(state => state.activeCompany)
  const addToast = useStore(state => state.addToast)
  const { watchlist, toggleWatchlist, explainMode, setExplainMode, setPresentationMode } = useStore()
  const [showPresentation, setShowPresentation] = useState(false)

  if (!company) return null

  const decision = buildCorporateDecision(company)
  const companyKey = `${company.company}::${company._filename}`
  const isWatched = watchlist.includes(companyKey)

  function handleWatchlist() {
    toggleWatchlist(companyKey)
    addToast(isWatched ? 'Removed from watchlist' : 'Added to watchlist', 'info')
  }

  function openPresentation() {
    setShowPresentation(true)
    setPresentationMode(true)
  }
  function closePresentation() {
    setShowPresentation(false)
    setPresentationMode(false)
  }

  const scoreChart = {
    labels: decision.scoreBreakdown.map(item => item.label),
    datasets: [
      {
        label: 'Score',
        data: decision.scoreBreakdown.map(item => item.score),
        backgroundColor: decision.scoreBreakdown.map(item => (
          item.level === 'high' ? '#ef4444cc' : item.level === 'medium' ? '#f59e0bcc' : '#16a34acc'
        )),
        borderRadius: 10,
      }
    ]
  }

  const scoreOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: context => `${context.raw}/100` } },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(120,120,120,.18)' },
      },
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: false },
      },
    },
  }

  async function copyMemo() {
    try {
      await navigator.clipboard.writeText(buildCorporateMemo(company))
      addToast('Corporate decision memo copied', 'info')
    } catch {
      addToast('Could not copy memo from this browser', 'error')
    }
  }

  function downloadEvidence() {
    const payload = {
      generatedAt: new Date().toISOString(),
      company: decision.company,
      decision: decision.recommendation.title,
      score: decision.compositeScore,
      exposure: decision.exposure,
      scoreBreakdown: decision.scoreBreakdown,
      evidence: decision.evidence,
      actions: decision.actionItems,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${decision.company.replace(/[^a-z0-9]+/gi, '_')}_corporate_decision_evidence.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addToast('Evidence file downloaded', 'info')
  }

  return (
    <div>
      {showPresentation && <SupervisorPanel decision={decision} onClose={closePresentation} />}

      <MissingMetricsBanner />

      <div className="page-header">
        <div className="page-header-text">
          <h2>Decision Center</h2>
          <p>{company.company || 'Company'} · Score {decision.compositeScore}/100 · {decision.recommendation.title}</p>
        </div>
        <div className="page-actions">
          <button className="btn sm" onClick={handleWatchlist}>
            {isWatched ? '★ Watching' : '☆ Watchlist'}
          </button>
          <button className="btn sm" onClick={openPresentation}>Present</button>
          <button className="btn sm" onClick={copyMemo}>Copy Memo</button>
          <button className="btn primary sm" onClick={downloadEvidence}>Export JSON</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Smart explanation</div>
        <ExplainToggle mode={explainMode} setMode={setExplainMode} />
      </div>
      <ExplainBox decision={decision} mode={explainMode} />

      <div className={`decision-hero ${decision.recommendation.level}`}>
        <div>
          <div className="decision-kicker">Corporate Recommendation</div>
          <h3>{decision.recommendation.title}</h3>
          <p>{decision.recommendation.summary}</p>
          <div className="decision-chip-row">
            <span>Review: {decision.exposure.reviewCadence}</span>
            <span>Terms: {decision.exposure.termDays} days</span>
            <span>{decision.exposure.guarantee}</span>
          </div>
        </div>
        <div className="decision-score-panel">
          <div className="decision-score">{decision.compositeScore}</div>
          <div className="decision-score-label">Counterparty Score / 100</div>
          <Badge level={decision.level}>{decision.recommendation.short}</Badge>
        </div>
      </div>

      <div className="grid-4">
        <DecisionKpi
          label="Exposure Limit"
          value={decision.exposure.displayAmount}
          sub="recommended cap"
          level={decision.recommendation.level}
        />
        <DecisionKpi
          label="Payment Terms"
          value={`${decision.exposure.termDays}d`}
          sub="maximum terms"
          level={decision.exposure.termDays >= 45 ? 'low' : decision.exposure.termDays >= 30 ? 'medium' : 'high'}
        />
        <DecisionKpi
          label="Liquidity"
          value={`${decision.scoreBreakdown[0].score}/100`}
          sub={decision.liquidity.executiveMemo.overallStatus}
          level={decision.scoreBreakdown[0].level}
        />
        <DecisionKpi
          label="Integrity"
          value={`${decision.scoreBreakdown[4].score}/100`}
          sub={decision.beneish.available === false ? decision.beneish.statusLabel || 'Beneish input gap' : decision.beneish.manipulated ? 'Beneish flagged' : 'No Beneish flag'}
          level={decision.scoreBreakdown[4].level}
        />
      </div>

      <div className="decision-grid">
        <Card title="Scorecard Breakdown">
          <div className="decision-chart-wrap">
            <Bar data={scoreChart} options={scoreOptions} />
          </div>
          <div className="score-factor-list">
            {decision.scoreBreakdown.map(factor => (
              <ScoreFactor key={factor.key} factor={factor} />
            ))}
          </div>
        </Card>

        <Card title="Corporate Action Register">
          <div className="decision-action-list">
            {decision.actionItems.map((item, index) => (
              <div key={item} className="decision-action-item">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Risk Alerts">
          {decision.alerts.length ? (
            <div className="decision-alert-list">
              {decision.alerts.map(alert => (
                <div key={alert.title} className={`decision-alert ${alert.level}`}>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.text}</p>
                  </div>
                  <Badge level={alert.level}>{alert.level === 'high' ? 'Escalate' : 'Watch'}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty"><h3>No major alerts</h3><p>The decision engine did not find material red or amber flags.</p></div>
          )}
        </Card>

        <Card title="Governance">
          <div className="governance-grid">
            <div>
              <span>Owner</span>
              <strong>Sales + Finance</strong>
              <p>Finance must validate before increasing exposure.</p>
            </div>
            <div>
              <span>Review cadence</span>
              <strong>{decision.exposure.reviewCadence}</strong>
              <p>Trigger earlier if DSO rises or cash flow weakens.</p>
            </div>
            <div>
              <span>Audit</span>
              <strong>JSON export available</strong>
              <p>All metrics, thresholds, and sources are preserved in the export.</p>
            </div>
            <div>
              <span>Override</span>
              <strong>Senior sign-off required</strong>
              <p>Any exposure above the cap needs documented approval.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Audit Trail — Source figures, formulas, and confidence">
        <EvidenceTable evidence={decision.evidence} />
        <div className="table-subnote">
          Every ratio links back to its formula, source statement line, and extraction confidence. Export JSON for full auditability.
        </div>
      </Card>
    </div>
  )
}
