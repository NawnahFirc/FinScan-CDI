import { postProcessParsed } from './finance.js'
import {
  FX_SNAPSHOT_DATE,
  FX_SNAPSHOT_NOTE,
  UNKNOWN_CURRENCY,
  detectCurrencyFromText,
  getFxRateToEUR,
  normalizeCurrencyCode,
} from './currency.js'

export const DEFAULT_SECTOR = 'general'

export const SECTOR_OPTIONS = [
  {
    id: 'general',
    label: 'General Corporate',
    description: 'Balanced benchmark for diversified companies without a clear operating model fit.'
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    description: 'Longer inventory cycles and higher working-capital needs.'
  },
  {
    id: 'retail',
    label: 'Retail & Consumer',
    description: 'Fast inventory turns and tighter cash conversion expectations.'
  },
  {
    id: 'technology',
    label: 'Technology & Software',
    description: 'Lower inventory intensity with more tolerance for growth investment.'
  },
  {
    id: 'healthcare',
    label: 'Healthcare & Pharma',
    description: 'Longer collection and inventory cycles with stronger balance-sheet expectations.'
  },
  {
    id: 'construction',
    label: 'Construction & Real Estate',
    description: 'Project-driven cash timing with uneven working-capital swings.'
  },
  {
    id: 'logistics',
    label: 'Logistics & Distribution',
    description: 'Operationally lean sectors that rely on disciplined collections and inventory control.'
  },
]

export const SECTOR_MAP = SECTOR_OPTIONS.reduce((acc, sector) => {
  acc[sector.id] = sector
  return acc
}, {})

const MONEY_ARRAY_FIELDS = [
  'revenue',
  'netIncome',
  'grossProfit',
  'ebit',
  'totalAssets',
  'totalLiabilities',
  'equity',
  'currentAssets',
  'currentLiabilities',
  'fixedAssets',
  'receivables',
  'cash',
  'inventory',
  'interest',
  'tax',
  'cashFlow',
  'debt',
  'payables',
  'retainedEarnings',
  'shareCapital',
  'reserves',
]

const MONEY_SCALAR_FIELDS = [
  'cogs',
  'chPersonnel',
  'dotAmort',
  'autresCharges',
  'prevRevenue',
  'prevGrossProfit',
  'prevReceivables',
  'prevTotalAssets',
  'prevNetIncome',
  'prevSGA',
  'curSGA',
  'prevDotAmort',
  'suppliers',
  'resFinancier',
]

function resolveSector(sector) {
  return SECTOR_MAP[sector] ? sector : DEFAULT_SECTOR
}

function toFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function convertValue(value, rate) {
  if (value === null || value === undefined || value === '') return value
  if (Array.isArray(value)) return value.map(item => convertValue(item, rate))
  return toFiniteNumber(value) * rate
}

function ensurePayablesSeries(company) {
  const payables = Array.isArray(company.payables) ? company.payables : null
  const hasMeaningfulPayables = payables && payables.some(value => Number.isFinite(value)) && !company.payablesEstimated

  if (hasMeaningfulPayables) {
    company.payablesEstimated = false
    return company
  }

  const currentLiabilities = Array.isArray(company.currentLiabilities) ? company.currentLiabilities : [0]
  company.payables = currentLiabilities.map(() => null)
  company.payablesEstimated = false
  return company
}

const CRITICAL_FIELDS_NORM = ['revenue', 'totalAssets', 'totalLiabilities', 'equity', 'currentAssets', 'currentLiabilities', 'netIncome']
const IMPORTANT_FIELDS_NORM = ['cash', 'receivables', 'inventory', 'payables', 'cashFlow', 'ebit', 'grossProfit']

function deriveMissingFromValues(processed) {
  // A field counts as "present" if it has at least one non-zero finite value.
  const missing = []
  ;[...CRITICAL_FIELDS_NORM, ...IMPORTANT_FIELDS_NORM].forEach(field => {
    const v = processed[field]
    const arr = Array.isArray(v) ? v : [v]
    const hasValue = processed._extraction?.fields?.[field]?.status !== 'missing' && Number.isFinite(arr.at(-1))
    if (!hasValue) missing.push(field)
  })
  return missing
}

export function normalizeCompanyData(data) {
  const processed = postProcessParsed({ ...data })
  const detected = normalizeCurrencyCode(processed.originalCurrency || processed.currency) ||
    detectCurrencyFromText(processed._extraction?.currencySource || '')
  const sourceCurrency = detected?.code || UNKNOWN_CURRENCY
  const fx = getFxRateToEUR(sourceCurrency)

  if (fx.known && !(data.fxApplied && data.currency === 'EUR')) {
    MONEY_ARRAY_FIELDS.forEach(field => {
      if (processed[field] !== undefined) {
        processed[field] = convertValue(processed[field], fx.rate)
      }
    })

    MONEY_SCALAR_FIELDS.forEach(field => {
      if (processed[field] !== undefined && processed[field] !== null && processed[field] !== '') {
        processed[field] = convertValue(processed[field], fx.rate)
      }
    })
  }

  ensurePayablesSeries(processed)

  processed.sourceCurrency = sourceCurrency
  processed.currency = fx.known ? 'EUR' : sourceCurrency
  processed.displayCurrency = fx.known ? 'EUR' : sourceCurrency
  processed.fxRateToEUR = fx.known ? fx.rate : null
  processed.fxSnapshotDate = FX_SNAPSHOT_DATE
  processed.fxSnapshotNote = fx.known
    ? FX_SNAPSHOT_NOTE
    : sourceCurrency === UNKNOWN_CURRENCY
      ? 'Currency was not detected. Values are shown without EUR conversion until the source currency is confirmed.'
      : `No embedded EUR conversion rate is available for ${sourceCurrency}. Values are shown in source currency.`
  processed.fxApplied = fx.known && sourceCurrency !== 'EUR'
  processed.fxRateKnown = fx.known
  processed.currencyConfidence = processed.currencyConfidence || processed._extraction?.currencyConfidence || detected?.confidence || 'none'
  processed.currencySource = processed.currencySource || processed._extraction?.currencySource || detected?.source || 'not detected'
  processed.currencyReviewRequired = sourceCurrency === UNKNOWN_CURRENCY || processed.currencyConfidence === 'ambiguous'
  processed.sector = resolveSector(processed.sector)

  // Refresh missing-metric tracking from the post-normalization values.
  // A field reported as "matched" but with all-zero values should still show as missing.
  const derivedMissing = deriveMissingFromValues(processed)
  if (processed.payablesEstimated && !derivedMissing.includes('payables')) {
    derivedMissing.push('payables')
  }
  const missingCritical = derivedMissing.filter(f => CRITICAL_FIELDS_NORM.includes(f))
  const missingImportant = derivedMissing.filter(f => IMPORTANT_FIELDS_NORM.includes(f))

  processed._extraction = {
    ...(processed._extraction || {}),
    missingCritical,
    missingImportant,
    missingOptional: processed._extraction?.missingOptional || [],
    hasBalanceSheetError: processed._extraction?.hasBalanceSheetError || false,
    currencyCode: sourceCurrency,
    currencyConfidence: processed.currencyConfidence,
    currencySource: processed.currencySource || processed._extraction?.currencySource || detected?.source || 'not detected',
    currencyReviewRequired: processed.currencyReviewRequired,
    fxRateKnown: fx.known,
    warnings: [
      ...new Set([
        ...(processed._extraction?.warnings || []),
        ...(processed.currencyReviewRequired
          ? [sourceCurrency === UNKNOWN_CURRENCY
            ? 'Currency was not detected. Confirm the source currency before accepting the extraction.'
            : `Currency signal was ambiguous (${processed._extraction?.currencySource || processed.currencySource || 'source text'}). Confirm the source currency before relying on conversion.`]
          : []),
      ]),
    ],
  }

  return processed
}
