import React, { useState } from 'react'
import { useStore } from '../store/useStore'

const FIELD_LABEL = {
  revenue: 'Revenue',
  netIncome: 'Net Income',
  grossProfit: 'Gross Profit',
  ebit: 'EBIT',
  totalAssets: 'Total Assets',
  totalLiabilities: 'Total Liabilities',
  equity: 'Equity',
  currentAssets: 'Current Assets',
  currentLiabilities: 'Current Liabilities',
  fixedAssets: 'Fixed Assets',
  receivables: 'Receivables',
  payables: 'Payables',
  cash: 'Cash',
  inventory: 'Inventory',
  interest: 'Interest Expense',
  tax: 'Income Tax',
  cashFlow: 'Operating Cash Flow',
  debt: 'Total Debt',
}

export default function MissingMetricsBanner() {
  const company = useStore(s => s.activeCompany)
  const setActivePage = useStore(s => s.setActivePage)
  const [dismissed, setDismissed] = useState(false)

  if (!company || !company._extraction) return null

  const { missingCritical = [], missingImportant = [], hasBalanceSheetError, warnings = [], currencyReviewRequired } = company._extraction

  const balanceWarnings = warnings.filter(w => w.startsWith('Balance-sheet') || w.startsWith('Inconsistency'))
  const currencyWarnings = warnings.filter(w => w.toLowerCase().includes('currency'))
  const hasIssue = missingCritical.length > 0 || hasBalanceSheetError || balanceWarnings.length > 0 || currencyReviewRequired

  if (!hasIssue && missingImportant.length === 0) return null
  if (dismissed) return null

  const severity = (missingCritical.length > 0 || hasBalanceSheetError || currencyReviewRequired) ? 'critical' : 'warn'

  return (
    <div style={{
      marginBottom: '1rem',
      padding: '14px 18px',
      borderRadius: 'var(--radius)',
      background: severity === 'critical' ? 'var(--danger-light)' : 'var(--warn-light)',
      border: `1px solid ${severity === 'critical' ? 'var(--danger)' : 'var(--warn)'}`,
      borderLeft: `4px solid ${severity === 'critical' ? 'var(--danger)' : 'var(--warn)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            color: severity === 'critical' ? 'var(--danger)' : 'var(--warn)',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {severity === 'critical' ? '⚠ Missing critical data — analysis may be unreliable' : 'Incomplete data — some metrics are missing'}
          </div>

          {missingCritical.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
              <strong>Critical fields not extracted:</strong>{' '}
              {missingCritical.map(f => (
                <span key={f} className="conf-badge review" style={{ margin: '2px 4px 2px 0' }}>
                  {FIELD_LABEL[f] || f}
                </span>
              ))}
            </div>
          )}

          {balanceWarnings.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 6, lineHeight: 1.5 }}>
              {balanceWarnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          {currencyReviewRequired && (
            <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 6, lineHeight: 1.5 }}>
              {currencyWarnings.length
                ? currencyWarnings.map((w, i) => <div key={i}>* {w}</div>)
                : <div>* Source currency needs confirmation before financial values are reliable.</div>}
            </div>
          )}

          {missingImportant.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              <strong>Also missing:</strong> {missingImportant.map(f => FIELD_LABEL[f] || f).join(', ')}.
              Ratios involving these fields will be marked n/a.
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => setActivePage('upload')}>
              Fix in Upload page
            </button>
            <button className="btn sm" onClick={() => setDismissed(true)}>
              Dismiss for this session
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
