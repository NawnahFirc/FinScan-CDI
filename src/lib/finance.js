// ── Array helper: get last value ──────────────────────────────
import { UNKNOWN_CURRENCY, normalizeCurrencyCode } from './currency.js'

export function last(v) {
  return Array.isArray(v) ? (v[v.length - 1] ?? null) : (v ?? null)
}

// ── Format number for display ─────────────────────────────────
export function fmtN(v) {
  if (v === null || v === undefined || isNaN(v)) return 'n/a'
  const abs = Math.abs(v)
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return Number(v).toFixed(0)
}

// ── Format with currency ──────────────────────────────────────
export function fmt(v, cur = 'EUR') {
  if (v === null || v === undefined) return 'n/a'
  const normalized = normalizeCurrencyCode(cur)?.code || (cur === UNKNOWN_CURRENCY ? UNKNOWN_CURRENCY : '')
  if (!normalized || normalized === UNKNOWN_CURRENCY) return fmtN(v)
  const suffixCurrencies = new Set(['MAD', 'TND', 'RON', 'AED', 'DZD', 'XOF', 'XAF'])
  return suffixCurrencies.has(normalized)
    ? `${fmtN(v)} ${normalized}`
    : `${normalized} ${fmtN(v)}`
}

export function pct(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return 'n/a'
  return ((a / b) * 100).toFixed(1) + '%'
}

export function growth(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return 'n/a'
  const g = ((a - b) / Math.abs(b)) * 100
  return (g > 0 ? '+' : '') + g.toFixed(1) + '%'
}

// ── Build anomaly flags ───────────────────────────────────────
export function buildFlags(rev, ni, cf, rec, liab, assets) {
  const flags = []
  if (rev > 0 && (rec / rev) > 0.25) flags.push({ level: 'high', text: `High receivables-to-revenue ratio (${(rec / rev * 100).toFixed(1)}%)`, detail: 'Possible revenue inflation - DSRI above threshold' })
  if (ni < 0) flags.push({ level: 'high', text: 'Net loss reported - company is loss-making', detail: 'Negative net income signals operational or structural issues' })
  if (ni > 0 && Number.isFinite(cf) && (cf / ni) < 0.8) flags.push({ level: 'medium', text: 'Operating cash flow lags net income', detail: `CFO/NI ratio: ${(cf / ni).toFixed(2)} - earnings may be accrual-heavy` })
  if (assets > 0 && (liab / assets) > 0.65) flags.push({ level: 'high', text: `Debt ratio ${(liab / assets * 100).toFixed(1)}% - high leverage`, detail: 'Total liabilities exceed 65% of assets' })
  if (!flags.length) flags.push({ level: 'low', text: 'No major anomalies detected from available data', detail: 'Review the analyst memo for deeper context' })
  return flags
}

// ── Post-process parsed data (normalise arrays, fill prev fields) ──
export function postProcessParsed(d) {
  const arrFields = ['revenue', 'netIncome', 'grossProfit', 'ebit', 'totalAssets',
    'totalLiabilities', 'equity', 'currentAssets', 'currentLiabilities',
    'fixedAssets', 'receivables', 'cash', 'inventory', 'interest', 'tax', 'cashFlow',
    'debt', 'payables', 'retainedEarnings', 'shareCapital', 'reserves']

  const missingFields = new Set(d._missingFields || [])

  arrFields.forEach(k => {
    const wasMissing = d[k] === undefined || d[k] === null || (Array.isArray(d[k]) && d[k].length === 0)
    if (d[k] !== undefined && !Array.isArray(d[k])) d[k] = [d[k]]
    if (!d[k] || d[k].length === 0) {
      d[k] = [null]
      missingFields.add(k)
    } else if (!wasMissing) {
      missingFields.delete(k)
    }
    d[k] = d[k].map(v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v))
    if (!Number.isFinite(d[k].at(-1)) || d._extraction?.fields?.[k]?.status === 'missing') missingFields.add(k)
  })

  if (!d.years || !d.years.length) {
    const len = d.revenue.length
    const baseYear = parseInt(d.period || '2024') || 2024
    d.years = Array.from({ length: len }, (_, i) => String(baseYear - (len - 1 - i)))
  }

  const rev = last(d.revenue)
  if (d.prevRevenue === null || d.prevRevenue === undefined) d.prevRevenue = d.revenue.length > 1 ? d.revenue[d.revenue.length - 2] : null
  if (d.prevGrossProfit === null || d.prevGrossProfit === undefined) d.prevGrossProfit = d.grossProfit.length > 1 ? d.grossProfit[d.grossProfit.length - 2] : null
  if (d.prevReceivables === null || d.prevReceivables === undefined) d.prevReceivables = d.receivables.length > 1 ? d.receivables[d.receivables.length - 2] : null
  if (d.prevTotalAssets === null || d.prevTotalAssets === undefined) d.prevTotalAssets = d.totalAssets.length > 1 ? d.totalAssets[d.totalAssets.length - 2] : null
  if (d.prevNetIncome === null || d.prevNetIncome === undefined) d.prevNetIncome = d.netIncome.length > 1 ? d.netIncome[d.netIncome.length - 2] : null
  if (d.prevSGA === null || d.prevSGA === undefined) d.prevSGA = null
  if (d.curSGA === null || d.curSGA === undefined) d.curSGA = null

  d._missingFields = Array.from(missingFields)

  d.flags = buildFlags(rev, last(d.netIncome), last(d.cashFlow), last(d.receivables), last(d.totalLiabilities), last(d.totalAssets))

  return d
}

// ── Build sample data ─────────────────────────────────────────
export function buildSampleData(standard) {
  if (standard === 'moroccan') return buildMzabiSample()
  if (standard === 'french') return buildFrenchSample()
  return buildDekadentSample()
}

function buildMzabiSample() {
  return postProcessParsed({
    company: 'KAMEL MZABI SUARL', period: '2024', standard: 'moroccan', currency: 'TND',
    _filename: 'MZABI_2024_sample.pdf',
    years: ['2022', '2023', '2024'],
    revenue: [40527801, 40527801, 0],
    netIncome: [2461103, 2461103, -5203281],
    totalAssets: [82362670, 82362670, 83966939],
    equity: [44232772, 44232772, 39029491],
    totalLiabilities: [38129898, 38129898, 44937448],
    currentAssets: [81568832, 81568832, 83633759],
    currentLiabilities: [38129898, 38129898, 44937448],
    fixedAssets: [793838, 793838, 333180],
    receivables: [20458065, 20458065, 20394357],
    cash: [61110767, 61110767, 63239402],
    inventory: [0, 0, 96727],
    payables: [10385024, 10385024, 12195000],
    grossProfit: [3601143, 3601143, -3979830],
    ebit: [3600143, 3600143, -3979830],
    interest: [0, 0, 0],
    tax: [540000, 540000, 750000],
    cashFlow: [1710967, 1710967, 1710967],
    debt: [38129898, 38129898, 44937448],
    cogs: 1831636, chPersonnel: 1831636, dotAmort: 460658, autresCharges: 1687536,
  })
}

function buildFrenchSample() {
  return postProcessParsed({
    company: 'Societe Exemple SAS', period: '2024', standard: 'french', currency: 'EUR',
    _filename: 'Societe_Exemple_sample.csv',
    years: ['2022', '2023', '2024'],
    revenue: [4401539, 4401539, 7389296],
    netIncome: [167736, 431011, 807697],
    totalAssets: [474275, 2261608, 3436821],
    equity: [167738, 423793, 792043],
    totalLiabilities: [249602, 1600432, 2468138],
    currentAssets: [417023, 2056682, 2916060],
    currentLiabilities: [249602, 1584573, 2446495],
    fixedAssets: [57252, 159067, 436408],
    receivables: [184851, 1113749, 1954167],
    cash: [98278, 887415, 435974],
    inventory: [133894, 55519, 324886],
    payables: [118540, 546778, 845111],
    grossProfit: [175989, 512175, 934607],
    ebit: [175989, 517205, 953923],
    interest: [0, 246, 1893],
    tax: [0, 82756, 144333],
    cashFlow: [167421, 472109, 469565],
    debt: [249602, 1600432, 2468138],
    cogs: 1811333, chPersonnel: 420421, dotAmort: 21966, autresCharges: 4281170,
  })
}

function buildDekadentSample() {
  return postProcessParsed({
    company: 'DEKADENT CONSTRUCT S.R.L.', period: '2024', standard: 'international', currency: 'EUR',
    _filename: 'Dekadent_2024_sample.csv',
    years: ['2022', '2023', '2024'],
    revenue: [843302, 4401539, 7389296],
    netIncome: [167736, 431011, 807697],
    totalAssets: [474275, 2261608, 3436821],
    equity: [167738, 423793, 792043],
    totalLiabilities: [249602, 1600432, 2468138],
    currentAssets: [417023, 2056682, 2916060],
    currentLiabilities: [249602, 1584573, 2446495],
    fixedAssets: [57252, 159067, 436408],
    receivables: [184851, 1113749, 1954167],
    cash: [98278, 887415, 435974],
    inventory: [133894, 55519, 324886],
    payables: [118540, 546778, 845111],
    grossProfit: [175989, 512175, 934607],
    ebit: [176000, 517205, 953923],
    interest: [0, 246, 1893],
    tax: [0, 82756, 144333],
    cashFlow: [167421, 472109, 469565],
    debt: [249602, 1600432, 2468138],
    cogs: 1811333,
  })
}

// ── Risk scores ───────────────────────────────────────────────
export function computeRiskScore(d) {
  let s = 0
  const rev = last(d.revenue)
  const revenueTrend = currentAndPrevious(d, 'revenue', 'prevRevenue')
  const receivableTrend = currentAndPrevious(d, 'receivables', 'prevReceivables')
  const grossProfitTrend = currentAndPrevious(d, 'grossProfit', 'prevGrossProfit')
  const trendInputsAvailable = [
    revenueTrend.current,
    revenueTrend.previous,
    receivableTrend.current,
    receivableTrend.previous,
    grossProfitTrend.current,
    grossProfitTrend.previous,
  ].every(hasMeaningfulValue)
  if (trendInputsAvailable) {
    const dsri = safeRatio(receivableTrend.current / revenueTrend.current, receivableTrend.previous / revenueTrend.previous)
    const gmi = safeRatio(
      grossProfitTrend.previous / revenueTrend.previous,
      grossProfitTrend.current / revenueTrend.current
    )
    if (Number.isFinite(dsri) && Number.isFinite(gmi)) {
      const mscore = -4.84 + 0.92 * dsri + 0.528 * gmi
      if (mscore > -1.78) s += 35; else if (mscore > -2.22) s += 18
    }
  }
  const cur = last(d.currentAssets) / Math.max(last(d.currentLiabilities), 1)
  if (cur < 1.0) s += 20; else if (cur < 1.5) s += 10
  const leverageNumerator = fieldHasAcceptedValue(d, 'debt') ? last(d.debt) : fieldHasAcceptedValue(d, 'totalLiabilities') ? last(d.totalLiabilities) : null
  const de = Number.isFinite(leverageNumerator) ? leverageNumerator / Math.max(last(d.equity), 1) : null
  if (Number.isFinite(de) && de > 1.5) s += 15; else if (Number.isFinite(de) && de > 0.8) s += 8
  if (hasMeaningfulValue(revenueTrend.previous) && revenueTrend.current < revenueTrend.previous) s += 10
  if (last(d.netIncome) < 0) s += 20
  const ni = last(d.netIncome)
  const cf = fieldHasAcceptedValue(d, 'cashFlow') ? last(d.cashFlow) : null
  if (ni > 0 && Number.isFinite(cf) && (ni - cf) / ni > 0.2) s += 10
  return Math.min(Math.max(s, 5), 95)
}

function safeRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && Math.abs(denominator) > 1e-9
    ? numerator / denominator
    : null
}

function roundMetric(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0
}

function hasMeaningfulValue(value) {
  return Number.isFinite(value) && Math.abs(value) > 1e-9
}

function hasFiniteValue(value) {
  return Number.isFinite(value)
}

function seriesValue(series, offsetFromEnd = 0) {
  if (!Array.isArray(series)) return offsetFromEnd === 0 && Number.isFinite(series) ? series : null
  const index = series.length - 1 - offsetFromEnd
  return index >= 0 && Number.isFinite(series[index]) ? series[index] : null
}

function currentAndPrevious(d, field, prevField) {
  const accepted = fieldHasAcceptedValue(d, field)
  const previousMissing = Array.isArray(d._missingPreviousFields) && d._missingPreviousFields.includes(field)
  const current = accepted ? seriesValue(d[field], 0) : null
  const previousFromSeries = accepted && !previousMissing ? seriesValue(d[field], 1) : null
  const previous = hasFiniteValue(previousFromSeries)
    ? previousFromSeries
    : hasFiniteValue(d[prevField])
      ? Number(d[prevField])
      : null
  return { current: current ?? NaN, previous: previous ?? NaN }
}

function fieldHasAcceptedValue(d, field) {
  const status = d._extraction?.fields?.[field]?.status
  if (status === 'missing') return false
  if (['extracted', 'derived', 'reviewed'].includes(status)) return true
  if (Array.isArray(d._extraction?.matchedFields) && d._extraction.matchedFields.includes(field)) return true
  if (Array.isArray(d._missingFields) && d._missingFields.includes(field)) return false
  const value = d[field]
  if (value === undefined || value === null || value === '') return false
  return Array.isArray(value) ? value.length > 0 && value.some(item => Number.isFinite(item)) : Number.isFinite(Number(value))
}

function exactLatest(d, field) {
  return fieldHasAcceptedValue(d, field) ? last(d[field]) : null
}

function mixedReportingBasisWarning(d) {
  return (d._extraction?.warnings || []).find(w => String(w).includes('consolidated tables while balance-sheet values')) || ''
}

function appendBasisCaution(note, d) {
  return mixedReportingBasisWarning(d)
    ? `${note} Extraction includes a reporting-basis caution, so review the source values before relying on this score.`
    : note
}

function estimatedCurrentAssets(d) {
  const direct = last(d.currentAssets)
  if (hasMeaningfulValue(direct)) return { value: direct, estimated: false }
  const parts = [last(d.cash), last(d.receivables), last(d.inventory)].filter(hasMeaningfulValue)
  const total = parts.reduce((sum, value) => sum + value, 0)
  return hasMeaningfulValue(total)
    ? { value: total, estimated: true }
    : { value: direct, estimated: false }
}

function estimatedCurrentLiabilities(d) {
  const direct = last(d.currentLiabilities)
  if (hasMeaningfulValue(direct)) return { value: direct, estimated: false }
  const payables = last(d.payables)
  return hasMeaningfulValue(payables)
    ? { value: payables, estimated: true }
    : { value: direct, estimated: false }
}

function metricText(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
}

const FORENSIC_FIELD_LABELS = {
  revenue: 'Revenue',
  receivables: 'Receivables',
  grossProfit: 'Gross Profit',
  currentAssets: 'Current Assets',
  currentLiabilities: 'Current Liabilities',
  fixedAssets: 'Fixed Assets',
  totalAssets: 'Total Assets',
  totalLiabilities: 'Total Liabilities',
  retainedEarnings: 'Retained Earnings',
  ebit: 'EBIT',
  equity: 'Book Equity',
  dotAmort: 'Depreciation / Amortization',
  prevDotAmort: 'Prior Depreciation / Amortization',
  curSGA: 'Current SG&A / Operating Expenses',
  prevSGA: 'Prior SG&A / Operating Expenses',
  netIncome: 'Net Income',
  cashFlow: 'Operating Cash Flow',
}

function fieldSourceSummary(d, field) {
  const meta = d._extraction?.fields?.[field]
  const firstEvidence = meta?.evidence?.[0]
  if (!firstEvidence) return meta?.status || 'not detected'
  const location = [firstEvidence.page ? `p.${firstEvidence.page}` : '', firstEvidence.sheet, firstEvidence.cell].filter(Boolean).join(' / ')
  return location || firstEvidence.label || firstEvidence.snippet || meta?.status || 'source linked'
}

function readinessLatest(d, field, { allowZero = true } = {}) {
  const value = exactLatest(d, field)
  const available = allowZero ? Number.isFinite(value) : hasMeaningfulValue(value)
  return {
    field,
    label: FORENSIC_FIELD_LABELS[field] || field,
    available,
    status: available ? (d._extraction?.fields?.[field]?.status || 'provided') : 'missing',
    value: available ? value : null,
    source: available ? fieldSourceSummary(d, field) : 'missing',
  }
}

function readinessPrevious(d, field, prevField = null, { allowZero = true } = {}) {
  const previousMissing = Array.isArray(d._missingPreviousFields) && d._missingPreviousFields.includes(field)
  const previousFromSeries = Array.isArray(d[field]) && fieldHasAcceptedValue(d, field) && !previousMissing
    ? seriesValue(d[field], 1)
    : null
  const previousFromScalar = prevField && d[prevField] !== undefined && d[prevField] !== null && d[prevField] !== ''
    ? Number(d[prevField])
    : null
  const value = Number.isFinite(previousFromSeries) ? previousFromSeries : previousFromScalar
  const available = allowZero ? Number.isFinite(value) : hasMeaningfulValue(value)
  return {
    field: prevField || field,
    label: `Prior ${FORENSIC_FIELD_LABELS[field] || field}`,
    available,
    status: available ? (prevField ? 'provided' : d._extraction?.fields?.[field]?.status || 'provided') : 'missing',
    value: available ? value : null,
    source: available ? (prevField ? 'prior-year scalar' : fieldSourceSummary(d, field)) : 'missing',
  }
}

function readinessGroup(id, label, formula, requirements) {
  const availableCount = requirements.filter(item => item.available).length
  const ready = availableCount === requirements.length
  return {
    id,
    label,
    formula,
    ready,
    availableCount,
    totalCount: requirements.length,
    missing: requirements.filter(item => !item.available).map(item => item.label),
    requirements,
  }
}

export function buildForensicReadiness(d) {
  const altmanGroups = [
    readinessGroup('X1', 'Working Capital / Total Assets', '(Current Assets - Current Liabilities) / Total Assets', [
      readinessLatest(d, 'currentAssets'),
      readinessLatest(d, 'currentLiabilities'),
      readinessLatest(d, 'totalAssets', { allowZero: false }),
    ]),
    readinessGroup('X2', 'Retained Earnings / Total Assets', 'Retained Earnings / Total Assets', [
      readinessLatest(d, 'retainedEarnings'),
      readinessLatest(d, 'totalAssets', { allowZero: false }),
    ]),
    readinessGroup('X3', 'EBIT / Total Assets', 'EBIT / Total Assets', [
      readinessLatest(d, 'ebit', { allowZero: false }),
      readinessLatest(d, 'totalAssets', { allowZero: false }),
    ]),
    readinessGroup('X4', 'Book Equity / Total Liabilities', 'Book Equity / Total Liabilities', [
      readinessLatest(d, 'equity'),
      readinessLatest(d, 'totalLiabilities', { allowZero: false }),
    ]),
  ]

  const beneishGroups = [
    readinessGroup('DSRI', 'Days Sales in Receivables Index', '(Receivables / Revenue) / (Prior Receivables / Prior Revenue)', [
      readinessLatest(d, 'receivables'),
      readinessPrevious(d, 'receivables', 'prevReceivables'),
      readinessLatest(d, 'revenue', { allowZero: false }),
      readinessPrevious(d, 'revenue', 'prevRevenue', { allowZero: false }),
    ]),
    readinessGroup('GMI', 'Gross Margin Index', 'Prior gross margin / Current gross margin', [
      readinessLatest(d, 'grossProfit'),
      readinessPrevious(d, 'grossProfit', 'prevGrossProfit'),
      readinessLatest(d, 'revenue', { allowZero: false }),
      readinessPrevious(d, 'revenue', 'prevRevenue', { allowZero: false }),
    ]),
    readinessGroup('AQI', 'Asset Quality Index', 'Asset quality current / Asset quality prior', [
      readinessLatest(d, 'currentAssets'),
      readinessPrevious(d, 'currentAssets'),
      readinessLatest(d, 'fixedAssets'),
      readinessPrevious(d, 'fixedAssets'),
      readinessLatest(d, 'totalAssets', { allowZero: false }),
      readinessPrevious(d, 'totalAssets', 'prevTotalAssets', { allowZero: false }),
    ]),
    readinessGroup('SGI', 'Sales Growth Index', 'Revenue / Prior Revenue', [
      readinessLatest(d, 'revenue', { allowZero: false }),
      readinessPrevious(d, 'revenue', 'prevRevenue', { allowZero: false }),
    ]),
    readinessGroup('DEPI', 'Depreciation Index', 'Prior depreciation rate / Current depreciation rate', [
      readinessLatest(d, 'dotAmort', { allowZero: false }),
      readinessPrevious(d, 'dotAmort', 'prevDotAmort', { allowZero: false }),
      readinessLatest(d, 'fixedAssets'),
      readinessPrevious(d, 'fixedAssets'),
    ]),
    readinessGroup('SGAI', 'SG&A Expense Index', '(SG&A / Revenue) / (Prior SG&A / Prior Revenue)', [
      readinessLatest(d, 'curSGA'),
      readinessPrevious(d, 'curSGA', 'prevSGA'),
      readinessLatest(d, 'revenue', { allowZero: false }),
      readinessPrevious(d, 'revenue', 'prevRevenue', { allowZero: false }),
    ]),
    readinessGroup('LVGI', 'Leverage Index', '(Liabilities / Assets) / Prior', [
      readinessLatest(d, 'totalLiabilities'),
      readinessPrevious(d, 'totalLiabilities'),
      readinessLatest(d, 'totalAssets', { allowZero: false }),
      readinessPrevious(d, 'totalAssets', 'prevTotalAssets', { allowZero: false }),
    ]),
    readinessGroup('TATA', 'Total Accruals / Total Assets', '(Net Income - Operating Cash Flow) / Total Assets', [
      readinessLatest(d, 'netIncome'),
      readinessLatest(d, 'cashFlow'),
      readinessLatest(d, 'totalAssets', { allowZero: false }),
    ]),
  ]

  const altmanReady = altmanGroups.every(group => group.ready)
  const beneishReady = beneishGroups.every(group => group.ready)
  const altmanCoverage = Math.round((altmanGroups.filter(group => group.ready).length / altmanGroups.length) * 100)
  const beneishCoverage = Math.round((beneishGroups.filter(group => group.ready).length / beneishGroups.length) * 100)
  const blockers = [
    ...altmanGroups.filter(group => !group.ready).map(group => `Altman ${group.id}: ${group.missing.join(', ')}`),
    ...beneishGroups.filter(group => !group.ready).slice(0, 4).map(group => `Beneish ${group.id}: ${group.missing.join(', ')}`),
  ]

  return {
    altman: {
      ready: altmanReady,
      coverage: altmanCoverage,
      groups: altmanGroups,
      nextAction: altmanReady
        ? "Altman Z'' can be calculated from exact extracted inputs."
        : "Add retained earnings, EBIT, working capital, total assets, total liabilities, and book equity to calculate Altman Z''.",
    },
    beneish: {
      ready: beneishReady,
      coverage: beneishCoverage,
      groups: beneishGroups,
      nextAction: beneishReady
        ? 'Beneish M-Score can be calculated from all eight official indicators.'
        : 'Upload a two-year statement with revenue, receivables, gross profit, depreciation, SG&A, leverage, cash flow, and asset detail.',
    },
    blockers,
  }
}

function displayPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a'
}

function displayRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : 'n/a'
}

function scoreLevel(score) {
  if (score >= 70) return 'low'
  if (score >= 45) return 'medium'
  return 'high'
}

function checkFromThreshold({ id, label, value, display, formula, good, watch, higherIsBetter = true, explanation }) {
  if (!Number.isFinite(value)) return null
  let score = 50
  if (higherIsBetter) {
    score = value >= good ? 92 : value >= watch ? 62 : 28
  } else {
    score = value <= good ? 92 : value <= watch ? 62 : 28
  }
  return {
    id,
    label,
    value,
    display,
    formula,
    score,
    level: scoreLevel(score),
    signal: score >= 70 ? 'Supportive' : score >= 45 ? 'Watch' : 'Pressure',
    explanation,
  }
}

export function buildAvailableDataSignals(d) {
  const revenue = exactLatest(d, 'revenue')
  const grossProfit = exactLatest(d, 'grossProfit')
  const netIncome = exactLatest(d, 'netIncome')
  const totalAssets = exactLatest(d, 'totalAssets')
  const totalLiabilities = exactLatest(d, 'totalLiabilities')
  const equity = exactLatest(d, 'equity')
  const currentAssets = exactLatest(d, 'currentAssets')
  const currentLiabilities = exactLatest(d, 'currentLiabilities')
  const receivables = exactLatest(d, 'receivables')
  const cashFlow = exactLatest(d, 'cashFlow')
  const revenueTrend = currentAndPrevious(d, 'revenue', 'prevRevenue')

  const checks = [
    checkFromThreshold({
      id: 'LIQ',
      label: 'Current Ratio',
      value: safeRatio(currentAssets, currentLiabilities),
      display: displayRatio(safeRatio(currentAssets, currentLiabilities)),
      formula: 'Current Assets / Current Liabilities',
      good: 1.5,
      watch: 1.0,
      explanation: 'Measures whether disclosed short-term assets cover disclosed short-term obligations.',
    }),
    checkFromThreshold({
      id: 'LEV',
      label: 'Debt Ratio',
      value: safeRatio(totalLiabilities, totalAssets),
      display: displayPercent(safeRatio(totalLiabilities, totalAssets)),
      formula: 'Total Liabilities / Total Assets',
      good: 0.55,
      watch: 0.75,
      higherIsBetter: false,
      explanation: 'Shows how much of the asset base is financed by liabilities.',
    }),
    checkFromThreshold({
      id: 'EQ',
      label: 'Equity Cushion',
      value: safeRatio(equity, totalAssets),
      display: displayPercent(safeRatio(equity, totalAssets)),
      formula: 'Equity / Total Assets',
      good: 0.35,
      watch: 0.15,
      explanation: 'A higher equity cushion gives creditors more balance-sheet protection.',
    }),
    checkFromThreshold({
      id: 'GM',
      label: 'Gross Margin',
      value: safeRatio(grossProfit, revenue),
      display: displayPercent(safeRatio(grossProfit, revenue)),
      formula: 'Gross Profit / Revenue',
      good: 0.25,
      watch: 0.10,
      explanation: 'Captures the disclosed margin available before operating costs.',
    }),
    checkFromThreshold({
      id: 'NM',
      label: 'Net Margin',
      value: safeRatio(netIncome, revenue),
      display: displayPercent(safeRatio(netIncome, revenue)),
      formula: 'Net Income / Revenue',
      good: 0.05,
      watch: 0,
      explanation: 'Measures whether revenue is converting into bottom-line profit.',
    }),
    checkFromThreshold({
      id: 'CASH',
      label: 'Cash Conversion',
      value: hasMeaningfulValue(netIncome) ? safeRatio(cashFlow, netIncome) : null,
      display: displayRatio(hasMeaningfulValue(netIncome) ? safeRatio(cashFlow, netIncome) : null),
      formula: 'Operating Cash Flow / Net Income',
      good: 0.8,
      watch: 0.5,
      explanation: 'Compares disclosed operating cash flow with reported profit.',
    }),
    checkFromThreshold({
      id: 'REC',
      label: 'Receivables Intensity',
      value: safeRatio(receivables, revenue),
      display: displayPercent(safeRatio(receivables, revenue)),
      formula: 'Receivables / Revenue',
      good: 0.25,
      watch: 0.45,
      higherIsBetter: false,
      explanation: 'High receivables versus revenue can point to collection pressure or aggressive sales recognition.',
    }),
    checkFromThreshold({
      id: 'GROWTH',
      label: 'Revenue Trend',
      value: hasMeaningfulValue(revenueTrend.previous) ? safeRatio(revenueTrend.current - revenueTrend.previous, Math.abs(revenueTrend.previous)) : null,
      display: displayPercent(hasMeaningfulValue(revenueTrend.previous) ? safeRatio(revenueTrend.current - revenueTrend.previous, Math.abs(revenueTrend.previous)) : null),
      formula: '(Revenue - Prior Revenue) / Prior Revenue',
      good: 0.03,
      watch: -0.10,
      explanation: 'Uses disclosed current and prior revenue to flag growth support or contraction pressure.',
    }),
    checkFromThreshold({
      id: 'TURN',
      label: 'Asset Turnover',
      value: safeRatio(revenue, totalAssets),
      display: displayRatio(safeRatio(revenue, totalAssets)),
      formula: 'Revenue / Total Assets',
      good: 0.7,
      watch: 0.3,
      explanation: 'Shows how efficiently disclosed assets are generating revenue.',
    }),
  ].filter(Boolean)

  if (!checks.length) {
    return {
      available: false,
      score: null,
      scoreDisplay: 'n/a',
      coverage: 0,
      level: 'medium',
      label: 'Too Limited',
      checks,
      explanation: 'FinScan needs at least one disclosed financial relationship to produce an available-data signal.',
      note: 'Upload or review revenue, assets, liabilities, profitability, cash flow, or working-capital values.',
    }
  }

  const score = Math.round(checks.reduce((sum, item) => sum + item.score, 0) / checks.length)
  const coverage = Math.round((checks.length / 9) * 100)
  const level = scoreLevel(score)
  const weakCount = checks.filter(item => item.level === 'high').length
  const watchCount = checks.filter(item => item.level === 'medium').length
  const label = level === 'low' ? 'Usable Support' : level === 'medium' ? 'Workable Watch' : 'Pressure Signal'
  const explanation = level === 'low'
    ? `FinScan can work with the available statement data. ${checks.length} disclosed relationships are supportive enough for a preliminary financial view.`
    : level === 'medium'
      ? `FinScan can work with the available statement data, but ${watchCount + weakCount} disclosed relationship${watchCount + weakCount === 1 ? '' : 's'} need attention.`
      : `FinScan can work with the available statement data, and the disclosed relationships already point to elevated pressure.`

  return {
    available: true,
    score,
    scoreDisplay: String(score),
    coverage,
    level,
    label,
    checks,
    explanation,
    note: 'This is an available-data financial screen, not an official Altman or Beneish score. It uses only disclosed, reviewed, or deterministically derived values.',
  }
}

function unavailableAltman(reason) {
  const components = [
    ['X1', 'Working Capital / Total Assets', '> 0.10', 'Liquidity support inside the asset base. Higher is usually better.'],
    ['X2', 'Retained Earnings / Total Assets', '> 0.10', 'Cumulative profitability retained inside the business. Must be extracted from the equity notes or balance sheet.'],
    ['X3', 'EBIT / Total Assets', '> 0.08', 'Core operating profitability relative to the total asset base.'],
    ['X4', 'Book Equity / Total Liabilities', '> 1.00', 'Private/non-manufacturing Altman variant uses book equity instead of market value.'],
  ].map(([id, label, benchmark, explanation]) => ({
    id,
    label,
    value: null,
    contribution: null,
    displayValue: 'n/a',
    displayContribution: 'n/a',
    benchmark,
    explanation,
    level: 'medium',
  }))

  return {
    available: false,
    score: null,
    scoreDisplay: 'n/a',
    zone: 'insufficient',
    zoneLabel: 'Limited Data',
    statusLabel: 'Limited Data',
    level: 'medium',
    comparisonText: reason,
    benchmarkText: "Private/non-manufacturing Z'' model: Safe > 2.60 | Grey 1.10 to 2.60 | Distress < 1.10",
    explanation: reason,
    components,
    note: "Altman Z'' is not calculated unless working capital, retained earnings, EBIT, book equity, liabilities, and assets are available.",
  }
}

function unavailableBeneish(reason) {
  const rows = [
    ['DSRI', 'Days Sales in Receivables Index', '<= 1.03', 'A rising receivables index can indicate revenue recognition running ahead of cash collection.'],
    ['GMI', 'Gross Margin Index', '<= 1.01', 'Margin deterioration can increase incentives to manage earnings more aggressively.'],
    ['SGAI', 'SG&A Expense Index', '<= 1.04', 'A rising SG&A burden versus sales can add pressure on management to protect headline profitability.'],
  ].map(([id, label, thresholdText, explanation]) => ({
    id,
    label,
    value: null,
    displayValue: 'n/a',
    threshold: null,
    thresholdText,
    delta: null,
    explanation,
    level: 'medium',
  }))

  return {
    available: false,
    statusLabel: 'Limited Data',
    dsri: 'n/a',
    gmi: 'n/a',
    sgai: 'n/a',
    mscore: 'n/a',
    manipulated: false,
    level: 'medium',
    comparisonText: reason,
    explanation: reason,
    benchmarkText: 'Requires current and prior revenue plus receivables and margin inputs.',
    rows,
    note: 'Beneish M-Score is withheld when the required trend inputs are missing or not meaningful.',
  }
}

export function computeAltmanDetails(d) {
  const ta = exactLatest(d, 'totalAssets')
  const tl = exactLatest(d, 'totalLiabilities')
  const ca = exactLatest(d, 'currentAssets')
  const cl = exactLatest(d, 'currentLiabilities')
  const eq = exactLatest(d, 'equity')
  const ebit = exactLatest(d, 'ebit')
  const re = exactLatest(d, 'retainedEarnings')

  const missing = []
  if (!hasMeaningfulValue(ta)) missing.push('total assets')
  if (!hasMeaningfulValue(tl)) missing.push('total liabilities')
  if (!hasFiniteValue(eq)) missing.push('book equity')
  if (!hasFiniteValue(ca) || !hasFiniteValue(cl)) missing.push('working-capital inputs')
  if (!hasMeaningfulValue(ebit)) missing.push('EBIT')
  if (!hasFiniteValue(re)) missing.push('retained earnings')

  if (missing.length) {
    return unavailableAltman(`Altman Z'' is not calculated because ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing from the extracted statement data.`)
  }

  const components = [
    {
      id: 'X1',
      label: 'Working Capital / Total Assets',
      value: safeRatio(ca - cl, ta),
      weight: 6.56,
      benchmark: '> 0.10',
      explanation: 'Liquidity support inside the asset base. Higher is usually better.',
    },
    {
      id: 'X2',
      label: 'Retained Earnings / Total Assets',
      value: safeRatio(re, ta),
      weight: 3.26,
      benchmark: '> 0.10',
      explanation: 'Cumulative profitability retained inside the business.',
    },
    {
      id: 'X3',
      label: 'EBIT / Total Assets',
      value: safeRatio(ebit, ta),
      weight: 6.72,
      benchmark: '> 0.08',
      explanation: 'Core operating profitability relative to the total asset base.',
    },
    {
      id: 'X4',
      label: 'Book Equity / Total Liabilities',
      value: safeRatio(eq, tl),
      weight: 1.05,
      benchmark: '> 1.00',
      explanation: "Private/non-manufacturing Altman Z'' uses book equity instead of market value.",
    },
  ].map((component) => {
    const contribution = Number.isFinite(component.value) ? component.value * component.weight : null
    const threshold = parseFloat(component.benchmark.replace(/[^\d.-]/g, '')) || 0
    let level = 'medium'
    if (Number.isFinite(component.value) && component.value >= threshold) level = 'low'
    else if (Number.isFinite(component.value) && component.value < threshold * 0.5) level = 'high'
    return {
      ...component,
      value: Number.isFinite(component.value) ? roundMetric(component.value, 3) : null,
      contribution: Number.isFinite(contribution) ? roundMetric(contribution, 2) : null,
      displayValue: metricText(component.value, 3),
      displayContribution: metricText(contribution, 2),
      level,
    }
  })

  if (components.some(component => !Number.isFinite(component.contribution))) {
    return unavailableAltman('Altman Z-Score cannot be calculated reliably because one or more component ratios is unavailable.')
  }

  const score = roundMetric(components.reduce((sum, component) => sum + component.contribution, 0), 2)
  const distressCutoff = 1.1
  const safeCutoff = 2.6
  const zone = score < distressCutoff ? 'distress' : score < safeCutoff ? 'grey' : 'safe'
  const zoneLabel =
    zone === 'distress'
      ? 'Distress Zone'
      : zone === 'grey'
        ? 'Grey Zone'
        : 'Safe Zone'
  const level = zone === 'distress' ? 'high' : zone === 'grey' ? 'medium' : 'low'
  const comparisonText =
    zone === 'safe'
      ? `${(score - safeCutoff).toFixed(2)} above the safe-zone threshold`
      : zone === 'grey'
        ? `${(score - distressCutoff).toFixed(2)} above distress, but ${(safeCutoff - score).toFixed(2)} below safe`
        : `${(distressCutoff - score).toFixed(2)} below the distress cutoff`
  const explanation =
    zone === 'safe'
      ? 'The combined balance-sheet and earnings profile points to a relatively strong solvency position on the uploaded data.'
      : zone === 'grey'
        ? 'The company is not in immediate distress, but the capital structure and earnings quality do not yet support a clearly safe reading.'
        : 'The score indicates a stressed solvency profile. Liquidity, leverage, and earnings generation should be reviewed closely.'

  return {
    score,
    available: true,
    variant: 'private-non-manufacturing-z-double-prime',
    scoreDisplay: score.toFixed(2),
    zone,
    zoneLabel,
    level,
    comparisonText,
    benchmarkText: "Private/non-manufacturing Z'' model: Safe > 2.60 | Grey 1.10 to 2.60 | Distress < 1.10",
    explanation: appendBasisCaution(explanation, d),
    components,
    note: appendBasisCaution("Altman Z'' uses working capital, retained earnings, EBIT, book equity, total liabilities, and total assets. No retained-earnings proxy is used.", d),
  }
}

export function computeAltman(d) {
  return computeAltmanDetails(d).score
}

export function computeBeneishDetails(d) {
  const revenue = currentAndPrevious(d, 'revenue', 'prevRevenue')
  const receivables = currentAndPrevious(d, 'receivables', 'prevReceivables')
  const grossProfit = currentAndPrevious(d, 'grossProfit', 'prevGrossProfit')
  const totalAssets = currentAndPrevious(d, 'totalAssets', 'prevTotalAssets')
  const currentAssets = currentAndPrevious(d, 'currentAssets')
  const fixedAssets = currentAndPrevious(d, 'fixedAssets')
  const totalLiabilities = currentAndPrevious(d, 'totalLiabilities')
  const cashFlow = currentAndPrevious(d, 'cashFlow')
  const netIncome = currentAndPrevious(d, 'netIncome', 'prevNetIncome')
  const currentSGA = hasFiniteValue(d.curSGA) ? Math.abs(Number(d.curSGA)) : NaN
  const previousSGA = hasFiniteValue(d.prevSGA) ? Math.abs(Number(d.prevSGA)) : NaN
  const currentDepreciation = hasFiniteValue(d.dotAmort) ? Math.abs(Number(d.dotAmort)) : NaN
  const previousDepreciation = hasFiniteValue(d.prevDotAmort) ? Math.abs(Number(d.prevDotAmort)) : NaN

  const indicators = [
    {
      id: 'DSRI',
      label: 'Days Sales in Receivables Index',
      value: safeRatio(receivables.current / revenue.current, receivables.previous / revenue.previous),
      threshold: 1.03,
      thresholdText: '<= 1.03',
      requiredInputs: 'current/prior revenue and receivables',
      explanation: 'A rising receivables index can indicate revenue recognition running ahead of cash collection.',
    },
    {
      id: 'GMI',
      label: 'Gross Margin Index',
      value: safeRatio(grossProfit.previous / revenue.previous, grossProfit.current / revenue.current),
      threshold: 1.01,
      thresholdText: '<= 1.01',
      requiredInputs: 'current/prior revenue and gross profit',
      explanation: 'Margin deterioration can increase incentives to manage earnings more aggressively.',
    },
    {
      id: 'AQI',
      label: 'Asset Quality Index',
      value: safeRatio(
        1 - ((currentAssets.current + fixedAssets.current) / totalAssets.current),
        1 - ((currentAssets.previous + fixedAssets.previous) / totalAssets.previous)
      ),
      threshold: 1.00,
      thresholdText: '<= 1.00',
      requiredInputs: 'current/prior current assets, fixed assets, and total assets',
      explanation: 'Growth in less tangible or lower-quality assets can indicate capitalization risk.',
    },
    {
      id: 'SGI',
      label: 'Sales Growth Index',
      value: safeRatio(revenue.current, revenue.previous),
      threshold: 1.20,
      thresholdText: '<= 1.20',
      requiredInputs: 'current/prior revenue',
      explanation: 'Fast growth is not fraud by itself, but it can increase pressure to maintain reported performance.',
    },
    {
      id: 'DEPI',
      label: 'Depreciation Index',
      value: safeRatio(
        previousDepreciation / (previousDepreciation + fixedAssets.previous),
        currentDepreciation / (currentDepreciation + fixedAssets.current)
      ),
      threshold: 1.00,
      thresholdText: '<= 1.00',
      requiredInputs: 'current/prior depreciation and fixed assets',
      explanation: 'A rising depreciation index can suggest slower depreciation assumptions.',
    },
    {
      id: 'SGAI',
      label: 'SG&A Expense Index',
      value: safeRatio(currentSGA / revenue.current, previousSGA / revenue.previous),
      threshold: 1.04,
      thresholdText: '<= 1.04',
      requiredInputs: 'current/prior SG&A or operating expenses and revenue',
      explanation: 'A rising SG&A burden versus sales can add pressure on management to protect headline profitability.',
    },
    {
      id: 'LVGI',
      label: 'Leverage Index',
      value: safeRatio(totalLiabilities.current / totalAssets.current, totalLiabilities.previous / totalAssets.previous),
      threshold: 1.00,
      thresholdText: '<= 1.00',
      requiredInputs: 'current/prior total liabilities and total assets',
      explanation: 'Higher leverage can increase incentives to meet covenants or preserve reported performance.',
    },
    {
      id: 'TATA',
      label: 'Total Accruals / Total Assets',
      value: safeRatio(netIncome.current - cashFlow.current, totalAssets.current),
      threshold: 0.05,
      thresholdText: '<= 0.05',
      requiredInputs: 'net income, operating cash flow, and total assets',
      explanation: 'Positive accruals relative to assets can indicate earnings that are not converting into operating cash flow.',
    },
  ].map((row) => {
    const hasValue = Number.isFinite(row.value)
    const displayValue = hasValue ? roundMetric(row.value, row.id === 'TATA' ? 3 : 2) : null
    const delta = hasValue ? roundMetric(displayValue - row.threshold, 2) : null
    let level = 'medium'
    if (hasValue && displayValue <= row.threshold) level = 'low'
    else if (hasValue && displayValue > row.threshold * 1.1) level = 'high'
    return {
      ...row,
      value: displayValue,
      displayValue: hasValue ? metricText(displayValue, row.id === 'TATA' ? 3 : 2) : 'missing input',
      delta,
      level,
      missingInput: !hasValue,
    }
  })

  const availableRows = indicators.filter(row => !row.missingInput)
  if (availableRows.length < indicators.length) {
    const missingRows = indicators.filter(row => row.missingInput).map(row => `${row.id} (${row.requiredInputs})`)
    return {
      available: false,
      statusLabel: 'Input Gap',
      dsri: indicators.find(row => row.id === 'DSRI')?.displayValue || 'n/a',
      gmi: indicators.find(row => row.id === 'GMI')?.displayValue || 'n/a',
      sgai: indicators.find(row => row.id === 'SGAI')?.displayValue || 'n/a',
      mscore: 'not computed',
      manipulated: false,
      level: 'medium',
      comparisonText: `Beneish M-Score is not calculated because ${missingRows.join('; ')} ${missingRows.length === 1 ? 'is' : 'are'} missing.`,
      explanation: appendBasisCaution('Available Beneish indicators are shown below, but the composite M-Score is withheld until all eight official inputs are present.', d),
      benchmarkText: `${availableRows.length}/8 Beneish indicators available. Composite requires DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, and TATA.`,
      rows: indicators,
      note: appendBasisCaution('No neutral-filled Beneish variables are used. Missing indicators remain missing for review or re-extraction.', d),
    }
  }

  const byId = Object.fromEntries(indicators.map(row => [row.id, row.value]))
  const mscore =
    -4.84 +
    0.92 * byId.DSRI +
    0.528 * byId.GMI +
    0.404 * byId.AQI +
    0.892 * byId.SGI +
    0.115 * byId.DEPI -
    0.172 * byId.SGAI +
    4.679 * byId.TATA -
    0.327 * byId.LVGI

  const manipulated = mscore > -1.78
  const comparisonText = manipulated
    ? `${(mscore + 1.78).toFixed(2)} above the manipulation cutoff`
    : `${Math.abs(mscore + 1.78).toFixed(2)} below the manipulation cutoff`
  const explanation = manipulated
    ? 'The Beneish screen is flagging elevated earnings-manipulation risk. This is not proof of fraud, but it is strong enough to justify deeper revenue, margin, asset-quality, leverage, and accrual testing.'
    : 'The Beneish screen is not flagging manipulation risk on the uploaded data. That lowers concern, but it should still be read alongside anomaly flags and cash-conversion profile.'

  return {
    available: true,
    statusLabel: undefined,
    dsri: indicators.find(row => row.id === 'DSRI')?.displayValue || 'n/a',
    gmi: indicators.find(row => row.id === 'GMI')?.displayValue || 'n/a',
    sgai: indicators.find(row => row.id === 'SGAI')?.displayValue || 'n/a',
    mscore: roundMetric(mscore, 2).toFixed(2),
    manipulated,
    level: manipulated ? 'high' : 'low',
    comparisonText,
    explanation: appendBasisCaution(explanation, d),
    benchmarkText: 'Lower is better. Composite manipulation risk is flagged when M-Score > -1.78. Full 8-factor Beneish model.',
    rows: indicators,
    note: appendBasisCaution('Beneish uses the standard 8-variable formula. No missing variables are neutral-filled or estimated.', d),
  }
}

export function computeBeneish(d) {
  return computeBeneishDetails(d)
}

// ── Standard labels ───────────────────────────────────────────
export const STD_LABELS = {
  international: 'IFRS/GAAP',
  french: 'PCG',
  moroccan: 'CGNC'
}

export const STD_DESC = {
  international: 'International standard (IFRS / US GAAP): Balance sheet, income statement and cash flow with globally recognized line items.',
  french: 'Plan Comptable General (PCG): charges d exploitation, produits d exploitation, resultat d exploitation, resultat financier, resultat net.',
  moroccan: 'Code General de la Normalisation Comptable (CGNC): bilan, compte de produits et charges, et tableau de financement.'
}

export const CHART_COLORS = ['#d72f4c', '#f25571', '#b91d3a', '#ff8ea5', '#5c89ff']
