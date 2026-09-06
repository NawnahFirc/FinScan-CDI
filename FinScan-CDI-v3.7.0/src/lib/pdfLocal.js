// Fully client-side PDF parser. No backend API call.
// Uses pdfjs-dist to extract positioned text, reconstructs rows by y-coordinate,
// then routes through the local parseRowsToCompany pipeline in api.js.

import { parseRowsToCompany } from './api.js'
import { UNKNOWN_CURRENCY, detectCurrencyFromText } from './currency.js'
import { finalizeStatementExtraction } from './extractionSchema.js'

let pdfjsLib = null

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  const lib = await import('pdfjs-dist/build/pdf.mjs')
  // Worker — pdfjs needs one. We load it as a module URL via Vite's ?url import.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  pdfjsLib = lib
  return lib
}

// Group text items into rows by y-coordinate within a tolerance (in PDF units, typically points).
function groupItemsIntoRows(items, yTolerance = 2.5) {
  // Sort by y descending (PDF y starts from bottom), then x ascending
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > yTolerance) return b.y - a.y
    return a.x - b.x
  })

  const rows = []
  let currentRow = []
  let currentY = null

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= yTolerance) {
      currentRow.push(item)
      currentY = currentY === null ? item.y : currentY
    } else {
      if (currentRow.length) rows.push(currentRow)
      currentRow = [item]
      currentY = item.y
    }
  }
  if (currentRow.length) rows.push(currentRow)
  return rows
}

// Detect column boundaries by clustering x-coordinates across all rows.
// A column "anchor" is an x value that appears repeatedly across many rows.
function detectColumns(rows, minRowsPerColumn = 3) {
  const xCounts = new Map()
  for (const row of rows) {
    for (const item of row) {
      const bucket = Math.round(item.x / 5) * 5
      xCounts.set(bucket, (xCounts.get(bucket) || 0) + 1)
    }
  }

  const sortedBuckets = [...xCounts.entries()]
    .filter(([, count]) => count >= minRowsPerColumn)
    .sort((a, b) => a[0] - b[0])
    .map(([x]) => x)

  // Merge buckets that are too close (within 20 units = ~same column with slight jitter)
  const columns = []
  for (const x of sortedBuckets) {
    if (!columns.length || x - columns[columns.length - 1] > 20) {
      columns.push(x)
    }
  }
  return columns
}

// Assign each text item to the closest column anchor.
function rowToCells(row, columns) {
  if (!columns.length) return [row.map(i => i.text).join(' ').trim()]

  const cells = Array(columns.length).fill('')
  for (const item of row) {
    let best = 0
    let bestDist = Math.abs(item.x - columns[0])
    for (let i = 1; i < columns.length; i += 1) {
      const d = Math.abs(item.x - columns[i])
      if (d < bestDist) { bestDist = d; best = i }
    }
    cells[best] = cells[best] ? `${cells[best]} ${item.text}` : item.text
  }
  return cells.map(c => c.trim())
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function deriveCompanyName(fileName = 'Uploaded Company') {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Uploaded Company'
}

function parseMoneyToken(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const negative = raw.includes('(') || raw.trim().startsWith('-')
  let cleaned = raw
    .replace(/[()]/g, '')
    .replace(/[\s\u00a0\u202f']/g, '')
    .replace(/^-/, '')
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '')
  } else {
    cleaned = cleaned.replace(',', '.')
  }
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return negative ? -Math.abs(parsed) : parsed
}

function parseMoneyValues(text) {
  const values = []
  const normalized = String(text || '').replace(/[\u00a0\u202f]/g, ' ')
  const moneyRe = /(^|[^\w])(\(?-?\d{1,3}(?:\s\d{3})+(?:[,.]\d+)?\)?|\(?-?\d+(?:[,.]\d+)?\)?)/g
  let match = moneyRe.exec(normalized)
  while (match) {
    const parsed = parseMoneyToken(match[2])
    if (parsed !== null) values.push(parsed)
    match = moneyRe.exec(normalized)
  }
  return values
}

function parseThousandsPageValues(row) {
  const numericItems = (row?.items || [])
    .map(item => ({
      text: String(item.text || '').trim(),
      x: item.x || 0,
    }))
    .filter(item => /\d/.test(item.text) && !/[a-zA-Z]/.test(item.text))
    .sort((a, b) => a.x - b.x)

  if (numericItems.length < 2) return parseMoneyValues(row?.text || '')

  if (numericItems.length === 2) {
    return numericItems.map(item => parseMoneyToken(item.text)).filter(value => value !== null)
  }

  let splitAt = Math.ceil(numericItems.length / 2) - 1
  let largestGap = -Infinity
  for (let index = 0; index < numericItems.length - 1; index += 1) {
    const gap = numericItems[index + 1].x - numericItems[index].x
    if (gap > largestGap) {
      largestGap = gap
      splitAt = index
    }
  }

  const groups = [
    numericItems.slice(0, splitAt + 1),
    numericItems.slice(splitAt + 1),
  ]

  return groups
    .map(group => parseMoneyToken(group.map(item => item.text).join(' ')))
    .filter(value => value !== null)
}

function latestPair(values, scale = 1) {
  if (!values || values.length < 2) return null
  const pair = values.length >= 4
    ? [values[values.length - 1], values[values.length - 2]]
    : [values[1], values[0]]
  return pair.map(value => value * scale)
}

function rowText(row) {
  return [...row]
    .sort((a, b) => a.x - b.x)
    .map(item => item.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findRow(pdfRows, predicates) {
  return pdfRows.find((row) => predicates.every((predicate) => predicate(row)))
}

function hasNorm(fragment) {
  const normalizedFragment = normalizeText(fragment)
  return (row) => row.norm.includes(normalizedFragment)
}

function pageIs(pageSet) {
  return (row) => pageSet.has(row.page)
}

function valuesForRow(row, scale = 1) {
  if (!row) return null
  const values = scale === 1000 ? parseThousandsPageValues(row) : parseMoneyValues(row.text)
  return latestPair(values, scale)
}

function setSeries(target, field, pair, matchedFields, sources, row, note) {
  if (!pair) return false
  target[field] = pair
  matchedFields.add(field)
  sources[field] = {
    page: row?.page || null,
    label: row?.text || note || field,
  }
  return true
}

function countPresentCritical(company) {
  const fields = ['revenue', 'netIncome', 'totalAssets', 'totalLiabilities', 'equity', 'currentAssets', 'currentLiabilities']
  return fields.filter((field) => {
    const value = company?.[field]
    const series = Array.isArray(value) ? value : [value]
    return series.some(item => Number.isFinite(item) && Math.abs(item) > 0)
  }).length
}

function inferYears(pdfRows) {
  const dateYears = new Set()
  const years = new Set()
  for (const row of pdfRows) {
    for (const match of row.text.matchAll(/\b(20\d{2})\b/g)) years.add(Number(match[1]))
    for (const match of row.text.matchAll(/\b(?:31|30)[-/.\s]*(?:12|d[ée]c\.?)[-/.\s]*(\d{2})\b/gi)) {
      dateYears.add(2000 + Number(match[1]))
    }
  }
  const sourceYears = dateYears.size ? dateYears : years
  const currentYear = new Date().getFullYear()
  const sorted = [...sourceYears].filter(year => year >= 2000 && year <= currentYear + 1).sort((a, b) => a - b)
  if (sorted.length >= 2) return sorted.slice(-2).map(String)
  if (sorted.length === 1) return [String(sorted[0] - 1), String(sorted[0])]
  return ['2024', '2025']
}

function detectRisCoCompany(rows, fileName) {
  const header = rows.find(row => /Raport\s+.+?\s+CUI\s+-\s+\d+/i.test(row.text))?.text || ''
  const match = header.match(/Raport\s+(.+?)\s+CUI\s+-\s+\d+/i)
  return match?.[1]?.trim() || deriveCompanyName(fileName)
}

export function parseRisCoValues(row) {
  if (!row) return []
  return [...row.text.matchAll(/\(?-?\d+(?:[.,]\d+)*\)?/g)]
    .map(match => parseMoneyToken(match[0]))
    .filter(value => value !== null && Number.isFinite(value))
}

function latestRisCoSeries(values, availableYears) {
  if (!values.length) return null
  const yearCount = Math.min(values.length, availableYears.length || values.length)
  return {
    years: (availableYears.length ? availableYears : inferYears([])).slice(-yearCount),
    values: values.slice(-yearCount),
  }
}

function findRisCoRow(rows, pattern) {
  return rows.find(row => pattern.test(row.text))
}

function setRisCoSeries(company, field, row, availableYears, matchedFields, sources) {
  const parsed = latestRisCoSeries(parseRisCoValues(row), availableYears)
  if (!parsed) return false
  if (!company.years || company.years.length < parsed.years.length) {
    company.years = parsed.years
    company.period = parsed.years[parsed.years.length - 1]
  }
  const offset = Math.max(0, parsed.values.length - company.years.length)
  company[field] = parsed.values.slice(offset)
  matchedFields.add(field)
  sources[field] = { page: row.page, label: row.text, snippet: row.text }
  return true
}

export function extractRisCoFinancialReport(pdfRows, options = {}) {
  const rows = pdfRows
    .map(row => ({ ...row, norm: normalizeText(row.text) }))
    .filter(row => row.text && row.norm)

  if (!rows.some(row => /RisCo\.ro/i.test(row.text)) || !rows.some(row => /Financial Data\s*\([A-Z]{3}\)/i.test(row.text))) {
    return null
  }

  const financialText = rows.map(row => row.text).join(' ')
  const currency = financialText.match(/Financial Data\s*\(([A-Z]{3})\)/i)?.[1] || detectCurrencyFromText(financialText).code || UNKNOWN_CURRENCY
  const yearHeader = rows.find(row => /Profit and loss account\b/i.test(row.text) && /\b20\d{2}\b/.test(row.text))
  const tableRows = yearHeader ? rows.filter(row => row.page === yearHeader.page) : rows
  const availableYears = yearHeader
    ? [...yearHeader.text.matchAll(/\b(20\d{2})\b/g)].map(match => match[1])
    : inferYears(rows)
  const company = {
    company: detectRisCoCompany(rows, options.fileName),
    period: availableYears[availableYears.length - 1] || '2024',
    standard: options.standard || 'international',
    currency,
    originalCurrency: currency,
    currencyConfidence: currency === UNKNOWN_CURRENCY ? 'none' : 'high',
    currencySource: currency === UNKNOWN_CURRENCY ? 'not detected' : 'Financial Data header',
    years: [],
    _filename: options.fileName,
  }
  const matchedFields = new Set()
  const sources = {}

  const mappings = [
    ['revenue', /^Sales revenues\b/i],
    ['grossProfit', /^Gross Profit\s*\/\s*Loss\b/i],
    ['netIncome', /^Net Profit\s*\/\s*Loss\b/i],
    ['fixedAssets', /^Fixed asset\b/i],
    ['currentAssets', /^Current assets?\b/i],
    ['inventory', /^Inventories\b/i],
    ['receivables', /^Receivables\b/i],
    ['cash', /^House and accounts\b/i],
    ['equity', /^Own Capitals\b/i],
    ['totalLiabilities', /^Liabilities\b/i],
  ]

  mappings.forEach(([field, pattern]) => {
    setRisCoSeries(company, field, findRisCoRow(tableRows, pattern), availableYears, matchedFields, sources)
  })

  if (!company.years.length) return null

  if (company.fixedAssets && company.currentAssets) {
    company.totalAssets = company.currentAssets.map((value, index) => value + (company.fixedAssets[index] || 0))
    matchedFields.add('totalAssets')
    sources.totalAssets = {
      label: 'Derived: totalAssets = fixedAssets + currentAssets',
      formula: 'totalAssets = fixedAssets + currentAssets',
      inputs: ['fixedAssets', 'currentAssets'],
      derived: true,
      evidence: [sources.fixedAssets, sources.currentAssets].filter(Boolean),
    }
  }

  const result = finalizeStatementExtraction(company, {
    sourceType: 'pdf-risco-report',
    parser: 'risco-financial-report',
    confidence: Math.min(98, 58 + matchedFields.size * 4),
    warnings: ['RisCo-style report detected. Legal, registry, and market sections are intentionally excluded from FinScan financial analysis.'],
    matchedFields,
    derivedFields: new Set(company.totalAssets ? ['totalAssets'] : []),
    sources,
    rowCount: rows.length,
  })

  return result
}

export function extractStructuredAnnualReport(pdfRows, options = {}) {
  const rows = pdfRows
    .map(row => ({ ...row, norm: normalizeText(row.text) }))
    .filter(row => row.text && row.norm)

  if (!rows.length) return null

  const pagesWithThousandsDh = new Set(
    rows
      .filter(row => /en\s+(milliers|k)\s+de\s+(dh|dirhams?)|en\s+kdh/i.test(row.text))
      .map(row => row.page)
  )
  const consolidatedIncomePages = new Set(
    rows
      .filter(row => row.norm.includes('compte de resultat consolide'))
      .map(row => row.page)
  )
  const cashFlowPages = new Set(
    rows
      .filter(row => row.norm.includes('tableau des flux de tresorerie'))
      .map(row => row.page)
  )
  const actifPages = new Set(
    rows
      .filter(row => row.norm.includes('bilan actif'))
      .map(row => row.page)
  )
  const passifPages = new Set(
    rows
      .filter(row => row.norm.includes('bilan passif'))
      .map(row => row.page)
  )

  const hasAnnualReportShape =
    consolidatedIncomePages.size ||
    actifPages.size ||
    passifPages.size ||
    rows.some(row => row.norm.includes('total des capitaux propres'))

  if (!hasAnnualReportShape) return null

  const years = inferYears(rows)
  const currencyDetection = options.currency
    ? detectCurrencyFromText(options.currency)
    : detectCurrencyFromText(rows.map(row => row.text).join(' '))
  const sourceCurrency = currencyDetection.code || UNKNOWN_CURRENCY
  const company = {
    company: deriveCompanyName(options.fileName),
    period: years[years.length - 1],
    standard: options.standard || 'moroccan',
    currency: sourceCurrency,
    originalCurrency: sourceCurrency,
    currencyConfidence: currencyDetection.confidence,
    currencySource: currencyDetection.source,
    years,
    _filename: options.fileName,
  }
  const matchedFields = new Set()
  const sources = {}
  const warnings = []

  const scaleFor = (row) => (row && pagesWithThousandsDh.has(row.page) ? 1000 : 1)

  const revenueRow = findRow(rows, [
    consolidatedIncomePages.size ? pageIs(consolidatedIncomePages) : () => true,
    hasNorm('chiffre d affaires'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'revenue', valuesForRow(revenueRow, scaleFor(revenueRow)), matchedFields, sources, revenueRow)

  const netIncomeRow = findRow(rows, [
    consolidatedIncomePages.size ? pageIs(consolidatedIncomePages) : () => true,
    row => (row.norm.startsWith('resultat net ') && !row.norm.includes('part du groupe')) || row.norm.includes('resultat net consolide'),
    row => !!valuesForRow(row, scaleFor(row)),
  ]) || findRow(rows, [
    hasNorm('resultat net de l exercice'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'netIncome', valuesForRow(netIncomeRow, scaleFor(netIncomeRow)), matchedFields, sources, netIncomeRow)

  const ebitRow = findRow(rows, [
    consolidatedIncomePages.size ? pageIs(consolidatedIncomePages) : () => true,
    row => row.norm.includes('resultat operationnel') || row.norm.includes('resultat d exploitation'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'ebit', valuesForRow(ebitRow, scaleFor(ebitRow)), matchedFields, sources, ebitRow)

  const purchasesRow = findRow(rows, [
    consolidatedIncomePages.size ? pageIs(consolidatedIncomePages) : () => true,
    row => row.norm.startsWith('achats ') || row.norm.includes('achats consommes'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  const purchasePair = valuesForRow(purchasesRow, scaleFor(purchasesRow))
  if (purchasePair) {
    company.cogs = purchasePair[purchasePair.length - 1]
    matchedFields.add('cogs')
    sources.cogs = { page: purchasesRow.page, label: purchasesRow.text }
  }
  if (company.revenue && purchasePair) {
    company.grossProfit = company.revenue.map((value, index) => value - (purchasePair[index] || 0))
    matchedFields.add('grossProfit')
    sources.grossProfit = {
      page: revenueRow?.page || null,
      label: 'Derived as revenue minus purchases from the consolidated income statement',
    }
  }

  const cashFlowRow = findRow(rows, [
    cashFlowPages.size ? pageIs(cashFlowPages) : () => true,
    hasNorm('flux net de tresorerie genere par l activite'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'cashFlow', valuesForRow(cashFlowRow, scaleFor(cashFlowRow)), matchedFields, sources, cashFlowRow)

  const totalAssetsRow = findRow(rows, [
    actifPages.size ? pageIs(actifPages) : () => true,
    row => row.norm.includes('total general i ii iii'),
    row => !!valuesForRow(row, scaleFor(row)),
  ]) || findRow(rows, [
    hasNorm('total actif'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'totalAssets', valuesForRow(totalAssetsRow), matchedFields, sources, totalAssetsRow)

  const fixedAssetsRow = findRow(rows, [
    actifPages.size ? pageIs(actifPages) : () => true,
    row => row.norm.includes('total a b c d e'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'fixedAssets', valuesForRow(fixedAssetsRow), matchedFields, sources, fixedAssetsRow)

  const currentAssetsRow = findRow(rows, [
    actifPages.size ? pageIs(actifPages) : () => true,
    row => row.norm.includes('total ii f g h i'),
    row => !!valuesForRow(row, scaleFor(row)),
  ]) || findRow(rows, [
    hasNorm('actif circulant'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'currentAssets', valuesForRow(currentAssetsRow), matchedFields, sources, currentAssetsRow)

  const receivablesRow = findRow(rows, [
    actifPages.size ? pageIs(actifPages) : () => true,
    hasNorm('creances de l actif circulant'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'receivables', valuesForRow(receivablesRow), matchedFields, sources, receivablesRow)

  const cashRow = findRow(rows, [
    actifPages.size ? pageIs(actifPages) : () => true,
    row => row.norm.includes('tresorerie actif'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'cash', valuesForRow(cashRow), matchedFields, sources, cashRow)

  const equityRow = findRow(rows, [
    passifPages.size ? pageIs(passifPages) : () => true,
    hasNorm('total des capitaux propres'),
    row => !!valuesForRow(row, scaleFor(row)),
  ]) || findRow(rows, [
    passifPages.size ? pageIs(passifPages) : () => true,
    row => row.norm.startsWith('capitaux propres'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'equity', valuesForRow(equityRow), matchedFields, sources, equityRow)

  const currentLiabilitiesRow = findRow(rows, [
    passifPages.size ? pageIs(passifPages) : () => true,
    row => row.norm.includes('total ii f g h'),
    row => !!valuesForRow(row, scaleFor(row)),
  ]) || findRow(rows, [
    passifPages.size ? pageIs(passifPages) : () => true,
    hasNorm('dettes du passif circulant'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'currentLiabilities', valuesForRow(currentLiabilitiesRow), matchedFields, sources, currentLiabilitiesRow)

  if (company.totalAssets && company.equity) {
    company.totalLiabilities = company.totalAssets.map((value, index) => Math.max(value - (company.equity[index] || 0), 0))
    matchedFields.add('totalLiabilities')
    sources.totalLiabilities = {
      page: equityRow?.page || totalAssetsRow?.page || null,
      label: 'Derived as total assets minus equity from the statutory balance sheet',
    }
  }

  const payablesRow = findRow(rows, [
    passifPages.size ? pageIs(passifPages) : () => true,
    hasNorm('fournisseurs et comptes rattaches'),
    row => !row.norm.includes('debiteurs'),
    row => !!valuesForRow(row, scaleFor(row)),
  ])
  setSeries(company, 'payables', valuesForRow(payablesRow), matchedFields, sources, payablesRow)


  if (sourceCurrency === UNKNOWN_CURRENCY) {
    warnings.push('Currency was not detected. Confirm the source currency before accepting the extraction.')
  } else if (currencyDetection.confidence === 'ambiguous') {
    warnings.push(`Currency signal was ambiguous (${currencyDetection.source}). Confirm the source currency before accepting.`)
  }

  const criticalFields = ['revenue', 'netIncome', 'totalAssets', 'totalLiabilities', 'equity', 'currentAssets', 'currentLiabilities']
  const importantFields = ['cash', 'receivables', 'inventory', 'payables', 'cashFlow', 'ebit', 'grossProfit']
  const missingCritical = criticalFields.filter(field => !matchedFields.has(field))
  const missingImportant = importantFields.filter(field => !matchedFields.has(field))

  if (countPresentCritical(company) < 4) return null

  company._extraction = {
    sourceType: 'pdf-annual-report',
    confidence: Math.max(45, Math.min(96, 52 + matchedFields.size * 4 - missingCritical.length * 8)),
    warnings,
    matchedFields: [...matchedFields],
    currencyCode: sourceCurrency,
    currencyConfidence: currencyDetection.confidence,
    currencySource: currencyDetection.source,
    currencyReviewRequired: sourceCurrency === UNKNOWN_CURRENCY || currencyDetection.confidence === 'ambiguous',
    missingCritical,
    missingImportant,
    missingOptional: [],
    sources,
    reviewed: false,
    hasBalanceSheetError: false,
  }

  return company
}

export async function parsePdfLocally(file, options = {}) {
  const { onProgress } = options
  const lib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise

  let allItems = []
  let totalChars = 0
  let sparsePages = 0
  const pageCount = pdf.numPages
  try {
  let usedOcr = false

  onProgress?.({ stage: 'text-extract', total: pdf.numPages })
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    if(textContent.items.reduce((sum,item)=>sum+(item.str?.length||0),0)<100) sparsePages+=1

    for (const it of textContent.items) {
      if (!it.str || !it.str.trim()) continue
      const transform = it.transform || []
      const x = transform[4] || 0
      const y = transform[5] || 0
      allItems.push({
        text: it.str.trim(),
        x,
        y: y - (pageNumber - 1) * 10000,
        page: pageNumber,
      })
      totalChars += it.str.length
    }
  }

  // If text layer is missing or near-empty, automatically fall back to OCR.
  // The OCR pipeline builds the company object directly (no need to go through
  // parseRowsToCompany), so we return early on success.
  if (totalChars < 100 || sparsePages > pageCount * .3) {
    onProgress?.({ stage: 'ocr-start', pageCount: pdf.numPages, reason: 'no-text-layer' })
    const { ocrPdfToCompany } = await import('./pdfOcr.js')
    const { company } = await ocrPdfToCompany(file, {
      onProgress,
      standard: options.standard,
      currency: options.currency,
      sector: options.sector,
    })
    return company
  }

  // Build rows per page, then concatenate (each page already isolated by y-offset)
  const rowsByPage = new Map()
  for (const item of allItems) {
    if (!rowsByPage.has(item.page)) rowsByPage.set(item.page, [])
    rowsByPage.get(item.page).push(item)
  }

  let allRows = []
  for (const [, items] of rowsByPage) {
    allRows = allRows.concat(groupItemsIntoRows(items))
  }

  const pdfRows = allRows
    .map(row => ({
      page: row[0]?.page || null,
      text: rowText(row),
      items: [...row].sort((a, b) => a.x - b.x).map(item => ({ text: item.text, x: item.x })),
    }))
    .filter(row => row.page && row.text)

  const riscoResult = extractRisCoFinancialReport(pdfRows, {
    ...options,
    fileName: options.fileName || file.name,
  })

  const structuredResult = extractStructuredAnnualReport(pdfRows, {
    ...options,
    fileName: options.fileName || file.name,
  })

  const columns = detectColumns(allRows)
  const tabularRows = allRows.map(row => rowToCells(row, columns))

  // Split "Label: Number" inline cells into [Label, Number] pairs.
  // PDFs often render financial data inline rather than in column tables.
  const INLINE_NUMBER_RE = /^(.+?)[\s]*[:\-=][\s]*(\(?-?[\d.,\s']+\)?)\s*$/
  const splitRows = tabularRows.map(cells => {
    const out = []
    for (const cell of cells) {
      const m = cell.match(INLINE_NUMBER_RE)
      if (m && /\d/.test(m[2])) {
        out.push(m[1].trim(), m[2].trim())
      } else {
        out.push(cell)
      }
    }
    return out
  })

  // Filter to rows likely to be data (have at least one numeric-looking cell)
  const dataLikeRows = splitRows.filter(cells =>
    cells.some(c => /\d/.test(c)) && cells.some(c => /[a-zA-Z]/.test(c))
  )

  if (!dataLikeRows.length && !riscoResult && !structuredResult) {
    const err = new Error('No tabular financial data detected in the PDF text. Try CSV/XLSX or manual entry.')
    err.code = 'NO_TABLE'
    throw err
  }

  const genericResult = parseRowsToCompany(dataLikeRows, {
    ...options,
    fileName: options.fileName || file.name,
    sourceType: 'pdf-local',
  })

  const result = [riscoResult, structuredResult, genericResult]
    .filter(Boolean)
    .sort((a, b) => countPresentCritical(b) - countPresentCritical(a))[0]

  if (!result) {
    const err = new Error('Could not match financial fields in the PDF. The structure may need manual entry.')
    err.code = 'NO_FIELDS_MATCHED'
    throw err
  }

  // Annotate the extraction with PDF-specific metadata
  result._extraction = {
    ...(result._extraction || {}),
    sourceType: result._extraction?.sourceType || (usedOcr ? 'pdf-ocr' : 'pdf-local'),
    pageCount: pdf.numPages,
    textChars: totalChars,
    backendUsed: false,
    ocrUsed: usedOcr,
  }

  // Add an OCR-specific warning so the user knows to double-check values
  if (usedOcr) {
    result._extraction.warnings = [
      'OCR was used to read this scanned PDF. Please verify every extracted value against the source document before relying on the analysis.',
      ...(result._extraction.warnings || []),
    ]
  }

  return result
  } finally { await pdf.destroy() }
}
