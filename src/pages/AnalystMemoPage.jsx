import React from 'react'
import { useStore } from '../store/useStore'
import { buildAnalystMemoText, buildAnalystReportSections } from '../lib/liquidity'

export default function AnalystMemoPage() {
  const company = useStore(state => state.activeCompany)
  const addToast = useStore(state => state.addToast)

  if (!company) return null

  const sections = buildAnalystReportSections(company)
  const memoText = buildAnalystMemoText(company)
  const sectionColors = ['var(--brand)', 'var(--brand-mid)', 'var(--danger)', 'var(--info)']
  const displayCurrency = company.displayCurrency || company.currency || 'UNKNOWN'

  async function copyMemo() {
    try {
      await navigator.clipboard.writeText(memoText)
      addToast('Analyst memo copied to clipboard', 'info')
    } catch {
      addToast('Clipboard copy failed in this browser session', 'error')
    }
  }

  function downloadMemo() {
    const blob = new Blob([memoText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${company.company.replace(/[^a-z0-9]+/gi, '_')}_analyst_memo.txt`
    link.click()
    URL.revokeObjectURL(url)
    addToast('Plain-text memo downloaded', 'info')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text">
          <h2>Analyst Memo</h2>
          <p>Locally generated executive narrative assembled from frontend liquidity, benchmark, and risk analysis.</p>
        </div>
        <div className="page-actions">
          <button className="btn sm" onClick={copyMemo}>Copy Memo</button>
          <button className="btn sm" onClick={downloadMemo}>Download TXT</button>
          <button className="btn sm primary" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="card">
        <div className="ai-section" style={{ borderLeftColor: 'var(--brand)' }}>
          <div className="ai-section-title">Generation Mode</div>
          <p>The memo below is assembled directly in the frontend from the uploaded figures, the selected sector benchmark, and locally computed risk indicators.</p>
        </div>

        <div className="memo-toolbar">
          <div className="memo-toolbar-card">
            <strong>Company</strong>
            <span>{company.company}</span>
          </div>
          <div className="memo-toolbar-card">
            <strong>Sector</strong>
            <span>{company.sector || 'general'}</span>
          </div>
          <div className="memo-toolbar-card">
            <strong>Currency</strong>
            <span>{displayCurrency} display</span>
          </div>
        </div>

        {sections.map((section, index) => (
          <div key={section.title} className="ai-section" style={{ borderLeftColor: sectionColors[index % sectionColors.length] }}>
            <div className="ai-section-title">{section.title}</div>
            {section.body.split('\n\n').map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} style={paragraphIndex > 0 ? { marginTop: 8 } : {}}>
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
