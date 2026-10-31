import { useStore } from '../../store/useStore'
import { computeAltmanDetails, computeBeneishDetails, buildAvailableDataSignals, buildForensicReadiness } from '../../lib/finance'
import { Card, Badge, metricDelta, toneForLevel, readinessLevel } from './shared'

export function FraudSignalsPanel({ company, beneish, altman, flags }) {
  const altmanColor = toneForLevel(altman.level)
  const beneishColor = toneForLevel(beneish.level)
  const beneishScoreText = beneish.mscore || 'n/a'
  const altmanScoreText = altman.scoreDisplay || (Number.isFinite(altman.score) ? altman.score.toFixed(2) : 'n/a')
  const readiness = buildForensicReadiness(company || {})
  const availableSignals = buildAvailableDataSignals(company || {})
  const readinessRows = [
    ...readiness.altman.groups.map(group => ({ model: 'Altman', ...group })),
    ...readiness.beneish.groups.map(group => ({ model: 'Beneish', ...group })),
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>Fraud Signals</h2>
          <p>Score, threshold comparison, and interpretation for Beneish and Altman on the current filing.</p>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Beneish M-Score" actions={<Badge level={beneish.level}>{beneish.available === false ? beneish.statusLabel || 'Limited Data' : beneish.statusLabel || (beneish.manipulated ? 'Manipulation Flag' : 'No Flag')}</Badge>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: String(beneishScoreText).length > 8 ? 32 : 56, fontWeight: 700, color: beneishColor, fontFamily: 'DM Mono, monospace', lineHeight: 1.05 }}>{beneishScoreText}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: beneishColor, marginTop: 10 }}>{beneish.comparisonText}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{beneish.benchmarkText}</div>
            </div>
            <div className="scenario-impact-list">
              <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>Explanation</strong>
              {beneish.explanation}
            </div>
          </div>
          <div className="table-subnote">{beneish.note}</div>
        </Card>

        <Card title="Altman Z-Score" actions={<Badge level={altman.level}>{altman.zoneLabel}</Badge>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: String(altmanScoreText).length > 8 ? 32 : 56, fontWeight: 700, color: altmanColor, fontFamily: 'DM Mono, monospace', lineHeight: 1.05 }}>{altmanScoreText}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: altmanColor, marginTop: 10 }}>{altman.comparisonText}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{altman.benchmarkText}</div>
            </div>
            <div className="scenario-impact-list">
              <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>Explanation</strong>
              {altman.explanation}
            </div>
          </div>
          <div className="table-subnote">{altman.note}</div>
        </Card>
      </div>

      <Card title="Available Data Analysis" actions={<Badge level={availableSignals.level}>{availableSignals.label}</Badge>}>
        <div className="available-data-grid">
          <div className="available-data-score">
            <div className="available-score-value" style={{ color: toneForLevel(availableSignals.level) }}>{availableSignals.scoreDisplay}</div>
            <div className="available-score-label">available-data score</div>
            <div className="readiness-meter" aria-hidden="true"><span style={{ width: `${availableSignals.coverage}%` }} /></div>
            <div className="readiness-note">{availableSignals.coverage}% coverage from currently disclosed relationships</div>
          </div>
          <div>
            <div className="liquidity-copy">{availableSignals.explanation}</div>
            <div className="table-subnote">{availableSignals.note}</div>
          </div>
        </div>
        <table className="dt available-data-table">
          <thead><tr><th>Check</th><th>Reading</th><th>Formula</th><th>Signal</th><th>Why It Matters</th></tr></thead>
          <tbody>
            {availableSignals.checks.map(check => (
              <tr key={check.id}>
                <td><strong>{check.label}</strong><div className="fmeta">{check.id}</div></td>
                <td className="num" style={{ color: toneForLevel(check.level) }}>{check.display}</td>
                <td>{check.formula}</td>
                <td><Badge level={check.level}>{check.signal}</Badge></td>
                <td>{check.explanation}</td>
              </tr>
            ))}
            {!availableSignals.checks.length && (
              <tr>
                <td colSpan="5">No supported relationship is available yet. Review the extraction table or add manual figures.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Model Readiness" actions={<Badge level={readiness.altman.ready && readiness.beneish.ready ? 'low' : 'medium'}>{readiness.altman.coverage}% Altman / {readiness.beneish.coverage}% Beneish</Badge>}>
        <div className="readiness-summary">
          {[
            ['Altman Z-Score', readiness.altman],
            ['Beneish M-Score', readiness.beneish],
          ].map(([label, model]) => (
            <div className="readiness-summary-item" key={label}>
              <div className="readiness-summary-top">
                <strong>{label}</strong>
                <Badge level={readinessLevel(model)}>{model.ready ? 'Ready' : `${model.coverage}% Ready`}</Badge>
              </div>
              <div className="readiness-meter" aria-hidden="true"><span style={{ width: `${model.coverage}%` }} /></div>
              <div className="readiness-note">{model.nextAction}</div>
            </div>
          ))}
        </div>
        {readiness.blockers.length > 0 && (
          <div className="readiness-blockers">
            {readiness.blockers.slice(0, 6).map((blocker) => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
        )}
        <table className="dt readiness-table">
          <thead><tr><th>Model</th><th>Input Group</th><th>Formula</th><th>Status</th><th>Missing Inputs</th></tr></thead>
          <tbody>
            {readinessRows.map(row => (
              <tr key={`${row.model}-${row.id}`}>
                <td>{row.model}</td>
                <td><strong>{row.id}</strong><div className="fmeta">{row.label}</div></td>
                <td>{row.formula}</td>
                <td><Badge level={row.ready ? 'low' : 'medium'}>{row.availableCount}/{row.totalCount}</Badge></td>
                <td>{row.ready ? 'Complete' : row.missing.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-subnote">Readiness uses exact disclosed, reviewed, or deterministic values only. Placeholder display zeros and rough proxies are ignored by these fraud models.</div>
      </Card>

      <Card title="Beneish Indicator Comparison" actions={<Badge level={beneish.level}>{beneish.available === false ? beneish.statusLabel || 'Limited Data' : beneish.statusLabel || (beneish.manipulated ? 'Composite Above Cutoff' : 'Composite Below Cutoff')}</Badge>}>
        <table className="dt">
          <thead><tr><th>Indicator</th><th>Current Reading</th><th>Threshold</th><th>Comparison</th><th>Explanation</th><th>Signal</th></tr></thead>
          <tbody>
            {beneish.rows.map(row => (
              <tr key={row.id}>
                <td><strong>{row.id}</strong><div className="fmeta">{row.label}</div></td>
                <td className="num" style={{ color: toneForLevel(row.level) }}>{row.displayValue || (Number.isFinite(row.value) ? row.value.toFixed(2) : 'n/a')}</td>
                <td>{row.thresholdText}</td>
                <td>{metricDelta(row.value, row.threshold, true)}</td>
                <td>{row.explanation}</td>
                <td><Badge level={row.level}>{row.level === 'high' ? 'Elevated' : row.level === 'medium' ? 'Watch' : 'Comfortable'}</Badge></td>
              </tr>
            ))}
            <tr>
              <td><strong>M-Score</strong><div className="fmeta">Composite Beneish screen</div></td>
              <td className="num" style={{ color: beneish.manipulated ? 'var(--danger)' : 'var(--good)' }}>{beneish.mscore}</td>
              <td>{'<= -1.78'}</td>
              <td>{metricDelta(parseFloat(beneish.mscore), -1.78, true)}</td>
              <td>{beneish.explanation}</td>
              <td><Badge level={beneish.level}>{beneish.manipulated ? 'Flagged' : 'Not Flagged'}</Badge></td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="Altman Component Comparison" actions={<Badge level={altman.level}>{altman.zoneLabel}</Badge>}>
        <table className="dt">
          <thead><tr><th>Component</th><th>Current Reading</th><th>Weighted Impact</th><th>Benchmark</th><th>Explanation</th><th>Signal</th></tr></thead>
          <tbody>
            {altman.components.map(component => (
              <tr key={component.id}>
                <td><strong>{component.id}</strong><div className="fmeta">{component.label}</div></td>
                <td className="num" style={{ color: toneForLevel(component.level) }}>{component.displayValue || (Number.isFinite(component.value) ? component.value.toFixed(3) : 'n/a')}</td>
                <td className="num">{component.displayContribution || (Number.isFinite(component.contribution) ? component.contribution.toFixed(2) : 'n/a')}</td>
                <td>{component.benchmark}</td>
                <td>{component.explanation}</td>
                <td><Badge level={component.level}>{component.level === 'high' ? 'Weak' : component.level === 'medium' ? 'Mixed' : 'Supportive'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Model Interpretation">
        <div className="context-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div className="card-title" style={{ marginBottom: '.75rem' }}>Altman View</div>
            <div className="liquidity-copy">{altman.explanation}</div>
            <div className="context-note">Comparison: {altman.comparisonText}</div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: '.75rem' }}>Beneish View</div>
            <div className="liquidity-copy">{beneish.explanation}</div>
            <div className="context-note">Comparison: {beneish.comparisonText}</div>
          </div>
        </div>
      </Card>

      <Card title="Anomaly Flags">
        {flags.map((f, i) => (
          <div key={i} className="flag-item">
            <div className={`fdot ${f.level}`} />
            <div>
              <div className="ftext">{f.text}</div>
              <div className="fmeta">{f.detail}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function FraudPage() {
  const d = useStore(s => s.activeCompany)
  if (!d) return null
  const beneish = computeBeneishDetails(d)
  const altman = computeAltmanDetails(d)
  const flags = Array.isArray(d.flags) ? d.flags : []

  return <FraudSignalsPanel company={d} beneish={beneish} altman={altman} flags={flags} />
}
