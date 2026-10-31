// All REST calls to the optional FinScan backend.

import { UNKNOWN_CURRENCY, detectCurrencyFromText, normalizeCurrencyCode } from './currency.js'
import { finalizeStatementExtraction } from './extractionSchema.js'

const PARSE_TIMEOUT_MS = 180000
const ARRAY_FIELDS = [
  'revenue', 'netIncome', 'grossProfit', 'ebit',
  'totalAssets', 'totalLiabilities', 'equity',
  'currentAssets', 'currentLiabilities', 'fixedAssets',
  'receivables', 'payables', 'cash', 'inventory',
  'interest', 'tax', 'cashFlow', 'debt',
  'retainedEarnings', 'shareCapital', 'reserves'
]

const SCALAR_FIELDS = [
  'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
  'prevRevenue', 'prevGrossProfit', 'prevReceivables',
  'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA',
  'prevDotAmort'
]

const FIELD_ALIASES = {
  revenue: ['revenue', 'total revenue', 'sales', 'net sales', 'turnover', 'net turnover', 'operating revenue', 'chiffre affaires', 'chiffre d affaires', 'chiffre d affaires net', 'ca', 'produits exploitation', 'cifra de afaceri', 'venituri din exploatare', 'revenus', 'total des produits d exploitation', 'produits d exploitation'],
  netIncome: ['net income', 'net profit', 'profit loss', 'net earnings', 'resultat net', 'resultat net exercice', 'resultat de l exercice', 'resultat de l exrcice', 'benefice net', 'rezultat net', 'profit net', 'pierdere neta', 'resultat net de l exercice', 'resultat des activites ord apres impot'],
  grossProfit: ['gross profit', 'gross margin', 'marge brute', 'marge commerciale', 'resultat brut', 'profit brut'],
  ebit: ['ebit', 'operating income', 'operating profit', 'resultat exploitation', 'resultat d exploitation', 'resultat operationnel', 'profit operational', 'rezultat din exploatare', 'resultat dexploitation'],
  totalAssets: ['total assets', 'total asset', 'total actif', 'actif total', 'total actif net', 'total general activ', 'total activ', 'activ total', 'total des actifs', 'total des actifs courants et non courants'],
  totalLiabilities: ['total liabilities', 'liabilities', 'total passif', 'passif total', 'total debts', 'total general passif', 'total pasiv', 'pasiv total', 'total datorii', 'datorii totale', 'total des capitaux propres et des passifs', 'total des passifs'],
  equity: ['equity', 'shareholders equity', 'owners equity', 'capitaux propres', 'fonds propres', 'situation nette', 'capitaluri proprii', 'total des capitaux propres'],
  currentAssets: ['current assets', 'actif circulant', 'actif courant', 'actifs courants', 'current asset', 'active circulante', 'total des actifs courants'],
  currentLiabilities: ['current liabilities', 'short term liabilities', 'dettes court terme', 'dettes a court terme', 'dettes courantes', 'passif circulant', 'pasiv curent', 'datorii curente', 'total des passifs courants'],
  fixedAssets: ['fixed assets', 'property plant equipment', 'ppe', 'immobilisations', 'immobilisations nettes', 'immobilisations corporelles', 'non current assets', 'active imobilizate', 'total des actifs immobilises', 'total des actifs non courants'],
  receivables: ['receivables', 'accounts receivable', 'trade receivables', 'creances clients', 'creances', 'clients et comptes rattaches', 'clients', 'creante', 'creante comerciale'],
  payables: ['payables', 'accounts payable', 'trade payables', 'suppliers', 'dettes fournisseurs', 'fournisseurs', 'fournisseurs et comptes rattaches', 'datorii comerciale', 'furnizori'],
  cash: ['cash', 'cash equivalents', 'cash and equivalents', 'tresorerie', 'banque', 'bank', 'casa si conturi la banci', 'disponibilitati banesti', 'liquidites', 'liquidites et equivalents de liquidites', 'equivalents de liquidites', 'tresorerie a la cloture de l exercice'],
  inventory: ['inventory', 'inventories', 'stock', 'stocks', 'stocuri', 'marchandises'],
  interest: ['interest', 'interest expense', 'charges financieres', 'financial expense', 'cheltuieli privind dobanzile', 'charges financieres nettes'],
  tax: ['tax', 'income tax', 'impot', 'impot sur les benefices', 'impozit pe profit'],
  cashFlow: ['operating cash flow', 'cash flow from operations', 'cashflow', 'cash flow', 'net cash from operating activities', 'flux exploitation', 'flux de tresorerie exploitation', 'flux net de trezorerie din activitati de exploatare', 'flux de tresorerie provenant de l exploitation', 'flux de tresorerie lies a l exploitation'],
  debt: ['debt', 'total debt', 'financial debt', 'dette financiere', 'dettes financieres', 'borrowings', 'imprumuturi', 'emprunts'],
  retainedEarnings: ['retained earnings', 'accumulated earnings', 'report a nouveau', 'report à nouveau', 'resultats accumules', 'resultats reportes', 'reserves et report a nouveau'],
  shareCapital: ['share capital', 'capital social', 'capital'],
  reserves: ['reserves', 'reserve legale', 'reserves legales', 'autres reserves'],
  cogs: ['cogs', 'cost of goods sold', 'cost of sales', 'achats consommes', 'purchases consumed', 'costul vanzarilor'],
  chPersonnel: ['personnel expenses', 'charges personnel', 'charges de personnel', 'staff costs'],
  dotAmort: ['depreciation', 'amortization', 'depreciation amortization', 'dotations amortissements', 'dotations aux amortissements'],
  autresCharges: ['other operating expenses', 'autres charges', 'autres charges exploitation'],
  prevRevenue: ['previous revenue', 'prior revenue', 'revenue n-1', 'ca n-1'],
  prevGrossProfit: ['previous gross profit', 'prior gross profit'],
  prevReceivables: ['previous receivables', 'prior receivables'],
  prevTotalAssets: ['previous total assets', 'prior total assets'],
  prevNetIncome: ['previous net income', 'prior net income'],
  prevSGA: ['previous sga', 'prior sga'],
  curSGA: ['sga', 'operating expenses', 'selling general administrative', 'opex'],
  prevDotAmort: ['previous depreciation', 'prior depreciation', 'dotations amortissements n-1', 'dotations aux amortissements n-1']
}

const META_ALIASES = {
  company: ['company', 'company name', 'entity', 'societe', 'denomination', 'raison sociale', 'denumire', 'nume firma'],
  period: ['period', 'fiscal year', 'year', 'annee', 'exercice', 'exercitiu financiar', 'an fiscal'],
  currency: ['currency', 'devise', 'monnaie', 'moneda'],
  standard: ['standard', 'accounting standard', 'referentiel']
}

export function getBackend(backendUrl = '') {
  // Vite proxy handles /api/* -> backend in dev.
  // In production set VITE_BACKEND_URL.
  return (backendUrl || import.meta.env?.VITE_BACKEND_URL || '').trim().replace(/\/$/, '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function parseFile({
  fileData,
  mimeType,
  fileName,
  standard,
  parseMode = 'resilient',
  fileSize = 0,
  backendUrl = '',
}) {
  const url = `${getBackend(backendUrl)}/api/parse-file`
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, mimeType, fileName, standard, parseMode, fileSize }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
        const message = err.error || 'Parse failed'
        if (attempt === 0 && [408, 429, 500, 502, 503, 504].includes(res.status)) {
          lastError = new Error(message)
          await sleep(800)
          continue
        }
        const error = new Error(message)
        error.status = res.status
        throw error
      }

      return res.json()
    } catch (error) {
      clearTimeout(timeout)
      if (error.name === 'AbortError') {
        lastError = new Error('Parsing timed out. Try resilient mode or a smaller PDF export.')
      } else {
        lastError = error
      }
      if (attempt === 0 && (!error.status || [408, 500, 502, 503, 504].includes(error.status))) {
        await sleep(800)
        continue
      }
      throw lastError
    }
  }

  throw lastError || new Error('Parse failed')
}

export async function analyzeCompany({ companyData, reportLanguage, reportStandard, backendUrl = '' }) {
  const res = await fetch(`${getBackend(backendUrl)}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyData: { ...companyData, reportLanguage, reportStandard } })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
    throw new Error(err.error || 'Analysis failed')
  }
  return res.json()
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target.result
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return null
  const raw = String(value ?? '').trim().replace(/−/g, '-').replace(/’/g, "'")
  if (!raw) return null

  // Reject obvious non-numeric strings (dates like 2024-12-31, IDs, etc.)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return null
  if (/^[a-zA-Z]/.test(raw) && !/^[\s]*-?\(?[\d]/.test(raw)) return null
  if (raw.length > 24) return null

  // Negative: parenthesized (accounting) OR leading minus only
  const negative = /^\(.+\)$/.test(raw) || /^\s*-/.test(raw)

  // Strip currency symbols, spaces, apostrophes, parens — keep digits, comma, period
  let cleaned = raw
    .replace(/[€$£¥₹]/g, '')
    .replace(/\((.*)\)/, '$1')
    .replace(/[\s ']/g, '')
    .replace(/^-/, '')
    .replace(/[a-zA-Z]/g, '')

  if (!/[\d]/.test(cleaned)) return null

  // Detect decimal separator strategy.
  // - Has BOTH , and . → the LAST one is the decimal separator
  // - Has only ,  → if it appears once with 1–2 digits after, it's decimal; else thousands
  // - Has only .  → if it appears multiple times, periods are thousands separators
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastDot > lastComma) {
      // 1,234.56 — comma is thousands
      cleaned = cleaned.replace(/,/g, '')
    } else {
      // 1.234,56 — period is thousands, comma is decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    }
  } else if (lastComma >= 0) {
    const after = cleaned.length - lastComma - 1
    if (after === 3 && (cleaned.match(/,/g) || []).length >= 1 && cleaned.indexOf(',') !== lastComma) {
      // 1,234,567 — thousands
      cleaned = cleaned.replace(/,/g, '')
    } else if (after <= 2) {
      // 1234,56 — decimal
      cleaned = cleaned.replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (lastDot >= 0) {
    const dotCount = (cleaned.match(/\./g) || []).length
    if (dotCount > 1) {
      // 1.234.567 — multiple periods means thousands separators
      cleaned = cleaned.replace(/\./g, '')
    }
    if (dotCount === 1) {
      const before = cleaned.slice(0, lastDot).replace(/[^\d]/g, '')
      const after = cleaned.slice(lastDot + 1).replace(/[^\d]/g, '')
      if (after.length === 3 && before.length >= 1 && before.length <= 3) {
        cleaned = cleaned.replace(/\./g, '')
      }
    }
    // Single period is always treated as a decimal point, regardless of how many
    // digits follow it. "1234.567" = 1234.567 (not 1,234,567). This is the
    // correct interpretation for European bilans where spaces are used for
    // thousands separators.
  }

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return negative && parsed > 0 ? -parsed : parsed
}

function aliasMatchesLabel(normalized, alias) {
  if (!normalized || !alias) return false
  if (normalized === alias) return true

  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hasWordBoundaryMatch = new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalized)

  if (alias.length <= 5 || !alias.includes(' ')) {
    return hasWordBoundaryMatch
  }

  return normalized.includes(alias)
}

function fieldContextAllowed(field, normalized) {
  if (/\b(variation|change in|growth|ratio|margin percent|autres)\b/.test(normalized)) return false
  if (field === 'currentAssets' && /\b(non current|non courants)\b/.test(normalized)) return false
  if (field === 'currentLiabilities' && /\b(non current|non courants)\b/.test(normalized)) return false
  if (field === 'totalLiabilities' && /\b(and equity|et capitaux|capitaux propres et)\b/.test(normalized)) return false
  if (field === 'receivables' && /\bcrediteurs?\b/.test(normalized)) return false
  if (field === 'payables' && /\bdebiteurs?\b/.test(normalized)) return false
  if (field === 'ebit' && /\bdebiteurs?\b/.test(normalized)) return false
  if (field === 'cash' && /\bflux\b/.test(normalized)) return false
  return true
}

function parseCsvRows(text, delimiter = ',') {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell.trim())
      if (row.some(value => String(value ?? '').trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (inQuotes) throw new Error('CSV contains an unclosed quoted cell. Check the source export.')
  row.push(cell.trim())
  if (row.some(value => String(value ?? '').trim() !== '')) rows.push(row)
  return rows
}

function fieldForLabel(label) {
  const normalized = normalizeLabel(label)
  if (!normalized) return null
  // A French total passif includes equity. It is the balance-sheet total,
  // not debt. Treat it as assets so liabilities can be derived from equity.
  if (/^(total passif|passif total|total general passif|total pasiv|pasiv total|total des capitaux propres et des passifs|total liabilities and (shareholders )?equity)$/.test(normalized)) return 'totalAssets'

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(alias => normalized === normalizeLabel(alias))) {
      return field
    }
  }

  const phraseMatches = Object.entries(FIELD_ALIASES)
    .flatMap(([field, aliases]) => aliases.map(alias => ({ field, alias: normalizeLabel(alias) })))
    .filter(entry => entry.alias.length > 2 && fieldContextAllowed(entry.field, normalized) && aliasMatchesLabel(normalized, entry.alias))
    .sort((a, b) => b.alias.length - a.alias.length)

  if (phraseMatches.length) {
    return phraseMatches[0].field
  }

  return null
}

function metaForLabel(label) {
  const normalized = normalizeLabel(label)
  if (!normalized) return null

  for (const [field, aliases] of Object.entries(META_ALIASES)) {
    if (aliases.some(alias => normalized === normalizeLabel(alias))) {
      return field
    }
  }

  const phraseMatches = Object.entries(META_ALIASES)
    .flatMap(([field, aliases]) => aliases.map(alias => ({ field, alias: normalizeLabel(alias) })))
    .filter(entry => entry.alias.length > 3 && normalized.includes(entry.alias))
    .sort((a, b) => b.alias.length - a.alias.length)

  if (phraseMatches.length) {
    return phraseMatches[0].field
  }

  return null
}

function extractYear(value) {
  if (value instanceof Date) return String(value.getUTCFullYear())
  const match = String(value ?? '').match(/\b(19|20)\d{2}\b/)
  return match ? match[0] : null
}

function deriveCompanyName(fileName = 'Uploaded Company') {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Uploaded Company'
}

function spreadsheetCell(rowIndex, columnIndex) {
  let column = ''
  let current = columnIndex + 1
  while (current > 0) {
    const remainder = (current - 1) % 26
    column = String.fromCharCode(65 + remainder) + column
    current = Math.floor((current - 1) / 26)
  }
  return `${column}${rowIndex + 1}`
}

function detectRowsCurrency(rows, fallback = '') {
  return detectCurrencyFromText([
    fallback,
    ...(rows || []).flat().map(value => String(value ?? '')),
  ].join(' '))
}

function applyCurrencyMeta(company, detection) {
  const normalized = normalizeCurrencyCode(company.currency)
  const code = normalized?.code || detection?.code || UNKNOWN_CURRENCY
  company.currency = code
  company.originalCurrency = code
  company.currencyConfidence = normalized?.confidence || detection?.confidence || 'none'
  company.currencySource = normalized?.source || detection?.source || 'not detected'
  if (company._extraction) {
    company._extraction.currencyCode = code
    company._extraction.currencyConfidence = company.currencyConfidence
    company._extraction.currencySource = company.currencySource
    company._extraction.currencyReviewRequired = !code || code === UNKNOWN_CURRENCY || company.currencyConfidence === 'ambiguous'
  }
  return company
}

function currencyWarningsFor(company) {
  const code = company.originalCurrency || company.currency || UNKNOWN_CURRENCY
  if (code === UNKNOWN_CURRENCY || !code) {
    return ['Currency was not detected. Confirm the source currency before accepting the extraction.']
  }
  if (company.currencyConfidence === 'ambiguous') {
    return [`Currency signal was ambiguous (${company.currencySource || 'source text'}). Confirm the source currency before accepting.`]
  }
  return []
}

function scoreExtraction(company, matchedFields, warnings) {
  const important = ['revenue', 'netIncome', 'totalAssets', 'totalLiabilities', 'currentAssets', 'currentLiabilities']
  const matchedImportant = important.filter(field => matchedFields.has(field)).length
  const base = Math.round((matchedImportant / important.length) * 70) + Math.min(matchedFields.size * 3, 25)
  return Math.max(20, Math.min(98, base - warnings.length * 4))
}

function fillMissingSeries(company, years, missingFields) {
  ARRAY_FIELDS.forEach((field) => {
    if (!Array.isArray(company[field])) {
      company[field] = Array.from({ length: years.length }, () => null)
      if (missingFields) missingFields.add(field)
    } else if (company[field].length < years.length) {
      company[field] = [
        ...Array.from({ length: years.length - company[field].length }, () => null),
        ...company[field],
      ]
    } else if (company[field].length > years.length) {
      company[field] = company[field].slice(company[field].length - years.length)
    }
  })
}

function parseColumnOrientedRows(rows, options) {
  const headerIndex = rows.findIndex(row => row.filter(cell => fieldForLabel(cell)).length >= 2 && row.some(cell => metaForLabel(cell)))
  if (headerIndex < 0) return null
  const headers = rows[headerIndex]
  const yearColumn = headers.findIndex(cell => metaForLabel(cell) === 'period')
  const companyColumn = headers.findIndex(cell => metaForLabel(cell) === 'company')
  const dataRows = rows.slice(headerIndex + 1).filter(row => row.some((cell, i) => fieldForLabel(headers[i]) && parseNumber(cell) !== null))
  if (!dataRows.length) return null
  if (companyColumn >= 0 && new Set(dataRows.map(row => row[companyColumn]).filter(Boolean)).size > 1) {
    throw new Error('This table contains multiple companies. Export one company per file.')
  }
  const transposed = headers.map((header, index) => [header, ...dataRows.map(row => row[index])])
  if (yearColumn >= 0) transposed[yearColumn][0] = 'Metric'
  else transposed.unshift(['Metric', ...dataRows.map(() => options.period || 'Current')])
  return parseRowsToCompany(transposed, { ...options, columnOriented: true, allowPartial: true })
}

const CRITICAL_FIELDS = ['revenue', 'totalAssets', 'totalLiabilities', 'equity', 'currentAssets', 'currentLiabilities', 'netIncome']
const IMPORTANT_FIELDS = ['cash', 'receivables', 'inventory', 'payables', 'cashFlow', 'ebit', 'grossProfit']
const OPTIONAL_FIELDS = ['fixedAssets', 'interest', 'tax', 'debt']

const FIELD_LABEL = {
  revenue: 'Revenue', netIncome: 'Net Income', grossProfit: 'Gross Profit', ebit: 'EBIT',
  totalAssets: 'Total Assets', totalLiabilities: 'Total Liabilities', equity: 'Equity',
  currentAssets: 'Current Assets', currentLiabilities: 'Current Liabilities',
  fixedAssets: 'Fixed Assets', receivables: 'Receivables', payables: 'Payables',
  cash: 'Cash', inventory: 'Inventory', interest: 'Interest Expense', tax: 'Income Tax',
  cashFlow: 'Operating Cash Flow', debt: 'Total Debt',
}

function buildExtractionWarnings(company, matchedFields) {
  const warnings = []
  const missingCritical = CRITICAL_FIELDS.filter(f => !matchedFields.has(f))
  const missingImportant = IMPORTANT_FIELDS.filter(f => !matchedFields.has(f))

  missingCritical.forEach(f => {
    warnings.push(`MISSING (critical): ${FIELD_LABEL[f] || f}`)
  })
  missingImportant.forEach(f => {
    warnings.push(`Missing: ${FIELD_LABEL[f] || f}`)
  })

  // Balance-sheet sanity check: Total Assets ≈ Total Liabilities + Equity (within 2%)
  const ta = Array.isArray(company.totalAssets) ? company.totalAssets[company.totalAssets.length - 1] : company.totalAssets
  const tl = Array.isArray(company.totalLiabilities) ? company.totalLiabilities[company.totalLiabilities.length - 1] : company.totalLiabilities
  const eq = Array.isArray(company.equity) ? company.equity[company.equity.length - 1] : company.equity
  if (matchedFields.has('totalAssets') && matchedFields.has('totalLiabilities') && matchedFields.has('equity') && ta) {
    const diff = Math.abs(ta - (tl + eq))
    if (diff / Math.abs(ta) > 0.02) {
      warnings.push(`Balance-sheet check failed: Assets (${ta.toFixed(0)}) ≠ Liabilities + Equity (${(tl + eq).toFixed(0)}). Gap: ${diff.toFixed(0)}.`)
    }
  }

  // Current Assets must be ≤ Total Assets
  const ca = Array.isArray(company.currentAssets) ? company.currentAssets[company.currentAssets.length - 1] : company.currentAssets
  if (matchedFields.has('currentAssets') && matchedFields.has('totalAssets') && ca > ta && ta > 0) {
    warnings.push(`Inconsistency: Current Assets (${ca.toFixed(0)}) exceed Total Assets (${ta.toFixed(0)}).`)
  }

  return warnings
}

function attachExtractionMeta(company, matchedFields, warnings, sources, options, rowCount) {
  const finalWarnings = [...warnings, ...currencyWarningsFor(company)]
  const confidence = scoreExtraction(company, matchedFields, finalWarnings)

  const extraction = {
    ...company,
    _filename: options.fileName,
    _extraction: {
      sourceType: options.sourceType || 'tabular',
      confidence,
      warnings: [...new Set(finalWarnings)],
      matchedFields: [...matchedFields],
      currencyCode: company.originalCurrency || company.currency || UNKNOWN_CURRENCY,
      currencyConfidence: company.currencyConfidence || 'none',
      currencySource: company.currencySource || 'not detected',
      currencyReviewRequired: !company.originalCurrency || company.originalCurrency === UNKNOWN_CURRENCY || company.currencyConfidence === 'ambiguous',
      sources,
      rowCount,
      reviewed: false,
      hasBalanceSheetError: warnings.some(w => w.startsWith('Balance-sheet') || w.startsWith('Inconsistency')),
    }
  }

  return finalizeStatementExtraction(extraction, {
    sourceType: options.sourceType || 'tabular',
    parser: 'local-tabular',
    confidence,
    warnings: [...new Set(finalWarnings)],
    matchedFields,
    sources,
    rowCount,
  })
}

export function parseRowsToCompany(rows, options = {}) {
  const cleanRows = rows.map(row => row.map(cell => cell ?? ''))
  if (!cleanRows.some(row => row.some(cell => String(cell).trim()))) return null
  if (!options.columnOriented) {
    const columnOriented = parseColumnOrientedRows(cleanRows, options)
    if (columnOriented) return columnOriented
  }
  // Header rows contain years, not financial values or document metadata.
  const headerIndex = cleanRows.findIndex(row => !fieldForLabel(row[0]) && !metaForLabel(row[0]) && row.slice(1).some(cell => extractYear(cell)))
  const headerRow = headerIndex >= 0 ? cleanRows[headerIndex] : []
  const yearColumns = headerRow.map((cell, index) => ({ year: extractYear(cell), index }))
    .filter(entry => entry.year).sort((a, b) => Number(a.year) - Number(b.year))
  if (new Set(yearColumns.map(entry => entry.year)).size !== yearColumns.length) {
    throw new Error('Duplicate year columns detected. Keep one financial column per year (exclude notes, gross and depreciation columns).')
  }
  const years = yearColumns.length ? yearColumns.map(entry => entry.year) : [options.period || 'Current']
  const detection = detectRowsCurrency(cleanRows, options.currency)
  const company = { company: deriveCompanyName(options.fileName), period: years.at(-1), currency: options.currency || detection.code || UNKNOWN_CURRENCY, standard: options.standard || 'international', years, _filename: options.fileName }
  applyCurrencyMeta(company, detection)
  const matchedFields = new Set()
  const sources = {}
  const conflicts = []
  cleanRows.forEach((row, rowIndex) => {
    if (rowIndex === headerIndex) return
    const labelIndex = row.findIndex(cell => String(cell).trim() && parseNumber(cell) === null)
    const label = row[labelIndex >= 0 ? labelIndex : 0]
    const field = fieldForLabel(label)
    const meta = metaForLabel(label)
    if (field) {
      const values = yearColumns.length ? yearColumns.map(entry => parseNumber(row[entry.index])) : [parseNumber(row.slice(Math.max(labelIndex, 0) + 1).find(cell => parseNumber(cell) !== null))]
      if (!values.some(value => value !== null)) return
      const value = ARRAY_FIELDS.includes(field) ? values : values.at(-1)
      if (matchedFields.has(field)) {
        if (JSON.stringify(company[field]) !== JSON.stringify(value)) conflicts.push('Conflicting rows for ' + field + '; the first matched row was retained. Verify the source.')
        return
      }
      company[field] = value
      matchedFields.add(field)
      sources[field] = { row: rowIndex + 1, sheet: options.sheetName || null, cell: options.sheetName ? spreadsheetCell(rowIndex, yearColumns.at(-1)?.index ?? labelIndex + 1) : null, label: String(label) }
      if (field === 'dotAmort' && values.length > 1 && values.at(-2) !== null) {
        company.prevDotAmort = values.at(-2); matchedFields.add('prevDotAmort'); sources.prevDotAmort = { ...sources[field] }
      }
      if (field === 'curSGA' && values.length > 1 && values.at(-2) !== null) {
        company.prevSGA = values.at(-2); matchedFields.add('prevSGA'); sources.prevSGA = { ...sources[field] }
      }
    } else if (meta) {
      const value = row.slice(Math.max(labelIndex, 0) + 1).find(cell => String(cell).trim())
      if (value === undefined) return
      if (meta === 'period' && yearColumns.length) return
      company[meta] = String(value).trim()
      if (meta === 'currency') applyCurrencyMeta(company, detectCurrencyFromText(String(value)))
      if (meta === 'period') company.years = [extractYear(value) || String(value)]
    }
  })
  fillMissingSeries(company, company.years, null)
  SCALAR_FIELDS.forEach(field => { if (company[field] === undefined) company[field] = null })
  if (!matchedFields.size) return null
  return attachExtractionMeta(company, matchedFields, [...buildExtractionWarnings(company, matchedFields), ...conflicts], sources, options, cleanRows.length)
}

export function parseCSVText(text, options = {}) {
  text = String(text).replace(/^\uFEFF/, '')
  const directive = text.match(/^sep=(.)\r?\n/i)
  if (directive) text = text.slice(directive[0].length)
  const delimiters = directive ? [directive[1]] : [',', ';', '\t', '|']
  const candidates = delimiters.map(delimiter => parseCsvRows(text, delimiter))
  candidates.sort((a, b) => b.filter(row => row.length > 1).length - a.filter(row => row.length > 1).length)
  return parseRowsToCompany(candidates[0], { ...options, sourceType: options.sourceType || 'csv' })
}

export function parseWorkbookSheets(sheets, options = {}) {
  const candidates = sheets.map(sheet => parseRowsToCompany(sheet.data, { ...options, sourceType: 'xlsx', sheetName: sheet.sheet })).filter(Boolean)
  if (!candidates.length) return null
  // Merge complementary statements only when period, entity and currency agree.
  const base = candidates[0]
  const matchedFields = new Set(base._extraction.matchedFields)
  const sources = { ...base._extraction.sources }
  const warnings = [...base._extraction.warnings]
  for (const candidate of candidates.slice(1)) {
    if (candidate.company !== base.company || JSON.stringify(candidate.years) !== JSON.stringify(base.years) || candidate.currency !== base.currency) {
      throw new Error('Workbook sheets contain different companies, currencies or years. Export one consistent statement set per file.')
    }
    for (const field of candidate._extraction.matchedFields) {
      if (!matchedFields.has(field) || base._extraction.derivedFields.includes(field)) {
        base[field] = candidate[field]; matchedFields.add(field); sources[field] = candidate._extraction.sources[field]
      } else if (JSON.stringify(base[field]) !== JSON.stringify(candidate[field])) warnings.push('Conflicting workbook values for ' + field + '. Verify the source sheet before accepting.')
    }
  }
  return finalizeStatementExtraction(base, { sourceType: 'xlsx', matchedFields, sources, warnings, derivedFields: [...matchedFields].filter(field => sources[field]?.derived) })
}

export async function parseSpreadsheetFile(file, options = {}) {
  const { default: readExcelFile } = await import('read-excel-file/browser')
  return parseWorkbookSheets(await readExcelFile(file), { ...options, fileName: options.fileName || file.name })
}
