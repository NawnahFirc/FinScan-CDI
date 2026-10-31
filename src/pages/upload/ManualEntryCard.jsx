import { STD_LABELS } from '../../lib/finance'

export default function ManualEntryCard({ form, isFrench, loadManual, loadSample, setField, standard }) {
  return (
    <>
      <div className="card">
        <div className="card-title">{`Manual Entry - ${STD_LABELS[standard]}`}</div>

        <div className="form-row">
          <div className="form-group">
            <label>Company Name</label>
            <input value={form.company} onChange={(event) => setField('company', event.target.value)} placeholder="e.g. Atlas Distribution SARL" />
          </div>
          <div className="form-group">
            <label>Fiscal Year</label>
            <input value={form.year} onChange={(event) => setField('year', event.target.value)} placeholder="2024" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Source Currency</label>
            <input
              list="currency-options"
              value={form.currency}
              onChange={(event) => setField('currency', event.target.value.toUpperCase().trim())}
              placeholder="e.g. MAD"
            />
          </div>
          <div className="form-group">
            <label>Unit</label>
            <select value={form.unit} onChange={(event) => setField('unit', event.target.value)}>
              <option value="1">Exact units</option>
              <option value="1000">Thousands (K)</option>
              <option value="1000000">Millions (M)</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: '1rem' }}>
          The app stores your inputs in the source currency and converts to EUR only when this build has an embedded FX rate.
        </div>

        <div className="divider" />

        {isFrench ? (
          <>
            <div className="pcg-section-title">{standard === 'moroccan' ? 'CGNC (Morocco)' : 'PCG (France)'} - Income Statement</div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group"><label>Chiffre d'affaires</label><input type="number" step="any" value={form.revenue} onChange={(event) => setField('revenue', event.target.value)} placeholder="73892960" /></div>
              <div className="form-group"><label>Achats consommes / COGS</label><input type="number" step="any" value={form.cogs} onChange={(event) => setField('cogs', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Charges de personnel</label><input type="number" step="any" value={form.chPersonnel} onChange={(event) => setField('chPersonnel', event.target.value)} /></div>
              <div className="form-group"><label>Dotations aux amortissements</label><input type="number" step="any" value={form.dotAmort} onChange={(event) => setField('dotAmort', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Autres charges d'exploitation</label><input type="number" step="any" value={form.autresCharges} onChange={(event) => setField('autresCharges', event.target.value)} /></div>
              <div className="form-group"><label>Resultat d'exploitation (EBIT)</label><input type="number" step="any" value={form.ebit} onChange={(event) => setField('ebit', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Resultat financier net</label><input type="number" step="any" value={form.resFinancier} onChange={(event) => setField('resFinancier', event.target.value)} /></div>
              <div className="form-group"><label>Impot sur les benefices</label><input type="number" step="any" value={form.tax} onChange={(event) => setField('tax', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Resultat net</label><input type="number" step="any" value={form.netIncome} onChange={(event) => setField('netIncome', event.target.value)} /></div>
              <div className="form-group"><label>Marge brute</label><input type="number" step="any" value={form.grossProfit} onChange={(event) => setField('grossProfit', event.target.value)} /></div>
            </div>

            <div className="divider" />
            <div className="pcg-section-title">Balance Sheet</div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group"><label>Total Actif</label><input type="number" step="any" value={form.totalAssets} onChange={(event) => setField('totalAssets', event.target.value)} /></div>
              <div className="form-group"><label>Capitaux propres</label><input type="number" step="any" value={form.equity} onChange={(event) => setField('equity', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Dettes a court terme</label><input type="number" step="any" value={form.currentLiab} onChange={(event) => setField('currentLiab', event.target.value)} /></div>
              <div className="form-group"><label>Total Passif</label><input type="number" step="any" value={form.totalLiabilities} onChange={(event) => setField('totalLiabilities', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Immobilisations nettes</label><input type="number" step="any" value={form.fixedAssets} onChange={(event) => setField('fixedAssets', event.target.value)} /></div>
              <div className="form-group"><label>Actif circulant</label><input type="number" step="any" value={form.currentAssets} onChange={(event) => setField('currentAssets', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Creances clients</label><input type="number" step="any" value={form.receivables} onChange={(event) => setField('receivables', event.target.value)} /></div>
              <div className="form-group"><label>Tresorerie</label><input type="number" step="any" value={form.cash} onChange={(event) => setField('cash', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Stocks</label><input type="number" step="any" value={form.inventory} onChange={(event) => setField('inventory', event.target.value)} /></div>
              <div className="form-group"><label>Dettes fournisseurs</label><input type="number" step="any" value={form.payables} onChange={(event) => setField('payables', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Flux de tresorerie d'exploitation</label><input type="number" step="any" value={form.cashFlow} onChange={(event) => setField('cashFlow', event.target.value)} /></div>
              <div className="form-group"><label>Dette financiere totale</label><input type="number" step="any" value={form.debt} onChange={(event) => setField('debt', event.target.value)} /></div>
            </div>

            <div className="divider" />
            <div className="pcg-section-title">Capitaux Propres & Forensic Inputs</div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group"><label>Report a nouveau / Resultats accumules</label><input type="number" step="any" value={form.retainedEarnings} onChange={(event) => setField('retainedEarnings', event.target.value)} /></div>
              <div className="form-group"><label>Capital social</label><input type="number" step="any" value={form.shareCapital} onChange={(event) => setField('shareCapital', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Reserves</label><input type="number" step="any" value={form.reserves} onChange={(event) => setField('reserves', event.target.value)} /></div>
              <div className="form-group"><label>Charges admin / SG&amp;A N</label><input type="number" step="any" value={form.curSGA} onChange={(event) => setField('curSGA', event.target.value)} /></div>
            </div>

            <div className="divider" />
            <div className="pcg-section-title">Exercice Precedent (N-1)</div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group"><label>Chiffre d'affaires N-1</label><input type="number" step="any" value={form.prevRevenue} onChange={(event) => setField('prevRevenue', event.target.value)} /></div>
              <div className="form-group"><label>Marge brute N-1</label><input type="number" step="any" value={form.prevGrossProfit} onChange={(event) => setField('prevGrossProfit', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Total actif N-1</label><input type="number" step="any" value={form.prevAssets} onChange={(event) => setField('prevAssets', event.target.value)} /></div>
              <div className="form-group"><label>Total passif N-1</label><input type="number" step="any" value={form.prevTotalLiabilities} onChange={(event) => setField('prevTotalLiabilities', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Actif circulant N-1</label><input type="number" step="any" value={form.prevCurrentAssets} onChange={(event) => setField('prevCurrentAssets', event.target.value)} /></div>
              <div className="form-group"><label>Passif courant N-1</label><input type="number" step="any" value={form.prevCurrentLiab} onChange={(event) => setField('prevCurrentLiab', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Immobilisations nettes N-1</label><input type="number" step="any" value={form.prevFixedAssets} onChange={(event) => setField('prevFixedAssets', event.target.value)} /></div>
              <div className="form-group"><label>Creances clients N-1</label><input type="number" step="any" value={form.prevReceivables} onChange={(event) => setField('prevReceivables', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Dotations amort. N-1</label><input type="number" step="any" value={form.prevDotAmort} onChange={(event) => setField('prevDotAmort', event.target.value)} /></div>
              <div className="form-group"><label>Charges admin / SG&amp;A N-1</label><input type="number" step="any" value={form.prevSGA} onChange={(event) => setField('prevSGA', event.target.value)} /></div>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Income Statement</div>
            <div className="form-row">
              <div className="form-group"><label>Revenue</label><input type="number" step="any" value={form.revenue} onChange={(event) => setField('revenue', event.target.value)} placeholder="7389296" /></div>
              <div className="form-group"><label>Cost of Goods Sold</label><input type="number" step="any" value={form.cogs} onChange={(event) => setField('cogs', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Gross Profit</label><input type="number" step="any" value={form.grossProfit} onChange={(event) => setField('grossProfit', event.target.value)} /></div>
              <div className="form-group"><label>Operating Expenses (SGA)</label><input type="number" step="any" value={form.opex} onChange={(event) => setField('opex', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>EBIT</label><input type="number" step="any" value={form.ebit} onChange={(event) => setField('ebit', event.target.value)} /></div>
              <div className="form-group"><label>Interest Expense</label><input type="number" step="any" value={form.interest} onChange={(event) => setField('interest', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Income Tax</label><input type="number" step="any" value={form.tax} onChange={(event) => setField('tax', event.target.value)} /></div>
              <div className="form-group"><label>Net Income</label><input type="number" step="any" value={form.netIncome} onChange={(event) => setField('netIncome', event.target.value)} /></div>
            </div>

            <div className="divider" />
            <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Balance Sheet</div>
            <div className="form-row">
              <div className="form-group"><label>Total Assets</label><input type="number" step="any" value={form.totalAssets} onChange={(event) => setField('totalAssets', event.target.value)} /></div>
              <div className="form-group"><label>Total Liabilities</label><input type="number" step="any" value={form.totalLiabilities} onChange={(event) => setField('totalLiabilities', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Current Assets</label><input type="number" step="any" value={form.currentAssets} onChange={(event) => setField('currentAssets', event.target.value)} /></div>
              <div className="form-group"><label>Current Liabilities</label><input type="number" step="any" value={form.currentLiab} onChange={(event) => setField('currentLiab', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Equity</label><input type="number" step="any" value={form.equity} onChange={(event) => setField('equity', event.target.value)} /></div>
              <div className="form-group"><label>Inventories</label><input type="number" step="any" value={form.inventory} onChange={(event) => setField('inventory', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Receivables</label><input type="number" step="any" value={form.receivables} onChange={(event) => setField('receivables', event.target.value)} /></div>
              <div className="form-group"><label>Cash &amp; Equivalents</label><input type="number" step="any" value={form.cash} onChange={(event) => setField('cash', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Accounts Payable / Suppliers</label><input type="number" step="any" value={form.payables} onChange={(event) => setField('payables', event.target.value)} /></div>
              <div className="form-group"><label>Operating Cash Flow</label><input type="number" step="any" value={form.cashFlow} onChange={(event) => setField('cashFlow', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Fixed Assets (Net)</label><input type="number" step="any" value={form.fixedAssets} onChange={(event) => setField('fixedAssets', event.target.value)} /></div>
              <div className="form-group"><label>Total Debt</label><input type="number" step="any" value={form.debt} onChange={(event) => setField('debt', event.target.value)} /></div>
            </div>

            <div className="divider" />
            <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Equity Detail & Forensic Inputs</div>
            <div className="form-row">
              <div className="form-group"><label>Retained Earnings</label><input type="number" step="any" value={form.retainedEarnings} onChange={(event) => setField('retainedEarnings', event.target.value)} /></div>
              <div className="form-group"><label>Share Capital</label><input type="number" step="any" value={form.shareCapital} onChange={(event) => setField('shareCapital', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Reserves</label><input type="number" step="any" value={form.reserves} onChange={(event) => setField('reserves', event.target.value)} /></div>
              <div className="form-group"><label>Current SG&amp;A / Operating Expenses</label><input type="number" step="any" value={form.curSGA} onChange={(event) => setField('curSGA', event.target.value)} /></div>
            </div>

            <div className="divider" />
            <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Previous Year (N-1)</div>
            <div className="form-row">
              <div className="form-group"><label>Previous Revenue</label><input type="number" step="any" value={form.prevRevenue} onChange={(event) => setField('prevRevenue', event.target.value)} /></div>
              <div className="form-group"><label>Previous Net Income</label><input type="number" step="any" value={form.prevNetIncome} onChange={(event) => setField('prevNetIncome', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Previous Total Assets</label><input type="number" step="any" value={form.prevAssets} onChange={(event) => setField('prevAssets', event.target.value)} /></div>
              <div className="form-group"><label>Previous Receivables</label><input type="number" step="any" value={form.prevReceivables} onChange={(event) => setField('prevReceivables', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Previous Gross Profit</label><input type="number" step="any" value={form.prevGrossProfit} onChange={(event) => setField('prevGrossProfit', event.target.value)} /></div>
              <div className="form-group"><label>Previous Total Liabilities</label><input type="number" step="any" value={form.prevTotalLiabilities} onChange={(event) => setField('prevTotalLiabilities', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Previous Current Assets</label><input type="number" step="any" value={form.prevCurrentAssets} onChange={(event) => setField('prevCurrentAssets', event.target.value)} /></div>
              <div className="form-group"><label>Previous Current Liabilities</label><input type="number" step="any" value={form.prevCurrentLiab} onChange={(event) => setField('prevCurrentLiab', event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Previous Fixed Assets</label><input type="number" step="any" value={form.prevFixedAssets} onChange={(event) => setField('prevFixedAssets', event.target.value)} /></div>
              <div className="form-group"><label>Previous Depreciation / Amortization</label><input type="number" step="any" value={form.prevDotAmort} onChange={(event) => setField('prevDotAmort', event.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Previous SG&amp;A / Operating Expenses</label>
              <input type="number" step="any" value={form.prevSGA} onChange={(event) => setField('prevSGA', event.target.value)} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: '.5rem' }}>
          <button className="btn primary" onClick={loadManual}>Analyze -&gt;</button>
          <button className="btn" onClick={loadSample}>Load Sample Data</button>
        </div>
      </div>
    </>
  )
}
