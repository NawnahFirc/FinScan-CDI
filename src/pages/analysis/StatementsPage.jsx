import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { last, fmt, pct, STD_LABELS } from '../../lib/finance'
import { Badge } from './shared'

export function StatementsPage() {
  const d = useStore(s => s.activeCompany)
  const [tab, setTab] = useState('balance')
  if (!d) return null
  const std = d.standard || 'international'
  const cur = d.displayCurrency || d.currency || 'EUR'
  const isFR = std === 'french' || std === 'moroccan'
  const rev = last(d.revenue), ni = last(d.netIncome), gp = last(d.grossProfit)
  const ta = last(d.totalAssets), eq = last(d.equity), tl = last(d.totalLiabilities)
  const ca = last(d.currentAssets), fa = last(d.fixedAssets), cl = last(d.currentLiabilities)
  const rec = last(d.receivables), inv = last(d.inventory), cash = last(d.cash)
  const ebit = last(d.ebit), interest = last(d.interest), tax = last(d.tax)
  const cogs = d.cogs || (rev - gp)

  function PRow({ label, val, cls = '', indent = false }) {
    return (
      <div className={`pcg-row ${cls} ${indent ? 'pcg-indent' : ''}`}>
        <span>{label}</span><span className="pcg-val">{fmt(val, cur)}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-text"><h2>Financial Statements</h2><p>{d.company} | {d.period} | {STD_LABELS[std]}</p></div>
        <div className="page-actions"><Badge level="info">{STD_LABELS[std]}</Badge></div>
      </div>

      <div className="std-tabs">
        {[['balance', isFR ? 'Bilan' : 'Balance Sheet'], ['income', isFR ? 'CPC' : 'Income Statement'], ['cashflow', isFR ? 'Tableau de Financement' : 'Cash Flow']].map(([id, label]) => (
          <button key={id} className={`std-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'balance' && (
        <div className="card">
          <div className="card-title">{isFR ? 'Bilan' : 'Balance Sheet'} | {d.company} | {d.period}</div>
          <div className="grid-2">
            <div>
              <div className="pcg-section-title">{isFR ? 'Actif' : 'Assets'}</div>
              <PRow label={isFR ? 'Immobilisations nettes' : 'Fixed Assets (Net)'} val={fa} indent />
              <PRow label={isFR ? 'Stocks' : 'Inventories'} val={inv} indent />
              <PRow label={isFR ? 'Creances clients' : 'Receivables'} val={rec} indent />
              <PRow label={isFR ? 'Tresorerie' : 'Cash & Equivalents'} val={cash} indent />
              <PRow label={isFR ? 'Total Actif' : 'TOTAL ASSETS'} val={ta} cls="total" />
            </div>
            <div>
              <div className="pcg-section-title">{isFR ? 'Passif' : 'Equity & Liabilities'}</div>
              <PRow label={isFR ? 'Capitaux propres' : 'Equity'} val={eq} indent />
              <PRow label={isFR ? 'Dettes LT' : 'Non-Current Liabilities'} val={tl - cl} indent />
              <PRow label={isFR ? 'Dettes CT' : 'Current Liabilities'} val={cl} indent />
              <PRow label={isFR ? 'Total Passif' : 'TOTAL EQUITY & LIAB.'} val={ta} cls="total" />
            </div>
          </div>
          {d.years?.length > 1 && Array.isArray(d.totalAssets) && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="card-title">Evolution</div>
              <table className="dt"><thead><tr><th>Item</th>{d.years.map(y => <th key={y}>{y}</th>)}</tr></thead>
                <tbody>
                  {[['Total Assets', d.totalAssets], ['Equity', d.equity], ['Total Liabilities', d.totalLiabilities]].map(([label, arr]) => (
                    <tr key={label}><td>{label}</td>{arr.map((v, i) => <td key={i} className="num">{fmt(v, cur)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'income' && (
        <div className="card">
          <div className="card-title">{isFR ? 'Compte de Produits et Charges (CPC)' : 'Income Statement'} | {d.company} | {d.period}</div>
          {isFR ? (
            <>
              <div className="pcg-section-title">Produits d'exploitation</div>
              <PRow label="Chiffre d'affaires" val={rev} />
              <PRow label="Total produits d'exploitation" val={rev} cls="subtotal" />
              <div style={{ height: 8 }} />
              <div className="pcg-section-title">Charges d'exploitation</div>
              <PRow label="Achats consommes" val={cogs} indent />
              <PRow label="Charges de personnel" val={d.chPersonnel || 0} indent />
              <PRow label="Dotations aux amortissements" val={d.dotAmort || 0} indent />
              <PRow label="Autres charges d'exploitation" val={d.autresCharges || 0} indent />
              <PRow label="RESULTAT D'EXPLOITATION" val={ebit} cls="total" />
              <div style={{ height: 8 }} />
              <PRow label="Charges financieres" val={interest} indent />
              <PRow label="Impot sur les benefices" val={tax} indent />
              <PRow label="RESULTAT NET DE L'EXERCICE" val={ni} cls={ni < 0 ? 'total' : 'total'} />
            </>
          ) : (
            <>
              <PRow label="Revenue" val={rev} />
              <PRow label="Cost of Goods Sold" val={cogs} indent />
              <PRow label="Gross Profit" val={gp} cls="subtotal" />
              <PRow label="Operating Expenses" val={d.curSGA || 0} indent />
              <PRow label="EBIT / Operating Income" val={ebit} cls="subtotal" />
              <PRow label="Interest Expense" val={interest} indent />
              <PRow label="Income Tax" val={tax} indent />
              <PRow label="NET INCOME" val={ni} cls="total" />
            </>
          )}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 8 }}>
            {[
              { label: isFR ? 'Marge brute' : 'Gross Margin', val: pct(gp, rev) },
              { label: isFR ? "Resultat d'exploitation" : 'EBIT Margin', val: pct(ebit, rev) },
              { label: isFR ? 'Marge nette' : 'Net Margin', val: pct(ni, rev), neg: ni < 0 },
            ].map(m => (
              <div key={m.label} className="metric">
                <div className="mlabel">{m.label}</div>
                <div className="mval" style={{ color: m.neg ? 'var(--danger)' : 'var(--good)' }}>{m.val}</div>
              </div>
            ))}
          </div>
          {d.years?.length > 1 && Array.isArray(d.revenue) && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="card-title">Income Evolution</div>
              <table className="dt"><thead><tr><th>Item</th>{d.years.map(y => <th key={y}>{y}</th>)}</tr></thead>
                <tbody>
                  {[['Revenue', d.revenue], ['Gross Profit', d.grossProfit], ['Net Income', d.netIncome]].map(([label, arr]) => (
                    <tr key={label}><td>{label}</td>{arr.map((v, i) => <td key={i} className="num" style={{ color: v < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(v, cur)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'cashflow' && (
        <div className="card">
          <div className="card-title">{isFR ? 'Tableau de Financement' : 'Cash Flow Statement'} | {d.period}</div>
          <div className="pcg-section-title">{isFR ? "Flux d'exploitation" : 'Operating Activities'}</div>
          <PRow label={isFR ? "Resultat net de l'exercice" : 'Net Income'} val={ni} />
          <PRow label={isFR ? 'Dotations aux amortissements' : 'Depreciation & Amortization'} val={d.dotAmort || 0} indent />
          <PRow label={isFR ? 'Variation du BFR' : 'Change in Working Capital'} val={last(d.cashFlow) - ni - (d.dotAmort || 0)} indent />
          <PRow label={isFR ? "A) Flux d'exploitation" : 'A) Operating Cash Flow'} val={last(d.cashFlow)} cls="subtotal" />
          <div style={{ height: 8 }} />
          <div className="pcg-section-title">{isFR ? "Flux d'investissement" : 'Investing Activities'}</div>
          <PRow label={isFR ? "Acquisitions d'immobilisations" : 'Capital Expenditures'} val={-(fa * 0.1)} indent />
          <PRow label={isFR ? "B) Flux d'investissement" : 'B) Investing Cash Flow'} val={-(fa * 0.1)} cls="subtotal" />
          <div style={{ height: 8 }} />
          <PRow label={isFR ? "C) Flux de financement" : 'C) Financing Cash Flow'} val={0} cls="subtotal" />
          <PRow label={isFR ? 'Variation nette de tresorerie' : 'Net Change in Cash'} val={last(d.cashFlow) - fa * 0.1} cls="total" />
          <PRow label={isFR ? 'Tresorerie a la cloture' : 'Closing Cash Balance'} val={cash} cls="total" />
        </div>
      )}
    </div>
  )
}
