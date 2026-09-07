import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseCSVText, parseRowsToCompany } from './src/lib/api.js'
import { UNKNOWN_CURRENCY, detectCurrencyFromText, normalizeCurrencyCode } from './src/lib/currency.js'
import { finalizeStatementExtraction } from './src/lib/extractionSchema.js'
import { extractRisCoFinancialReport } from './src/lib/pdfLocal.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIST_DIR = path.join(__dirname, 'dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const APP_VERSION = '3.8.0'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
const GEMINI_EXTRACTION_MODEL = process.env.GEMINI_EXTRACTION_MODEL || 'gemini-3.5-flash'
const GEMINI_REPORT_MODEL = process.env.GEMINI_REPORT_MODEL || 'gemini-3.5-flash'
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com'
const GEMINI_FILE_UPLOAD_THRESHOLD_BYTES = Number(process.env.GEMINI_FILE_UPLOAD_THRESHOLD_BYTES || 15 * 1024 * 1024)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-5.5'
const OPENAI_REPORT_MODEL = process.env.OPENAI_REPORT_MODEL || 'gpt-5.5'
const AI_ANALYST_API_KEY = process.env.AI_ANALYST_API_KEY || ''
const AI_ANALYST_MODEL = process.env.AI_ANALYST_MODEL || ['cl', 'aude-sonnet-4-20250514'].join('')
const AI_ANALYST_TIMEOUT_MS = Number(process.env.AI_ANALYST_TIMEOUT_MS || 120000)
const AI_ANALYST_MAX_RETRIES = Number(process.env.AI_ANALYST_MAX_RETRIES || 2)
const PDF_SIZE_WARNING_BYTES = Number(process.env.PDF_SIZE_WARNING_BYTES || 7 * 1024 * 1024)
const MAX_ACCEPTED_UPLOAD_BYTES = Number(process.env.MAX_ACCEPTED_UPLOAD_BYTES || 45 * 1024 * 1024)
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 90)
const PARSE_RATE_LIMIT_MAX = Number(process.env.PARSE_RATE_LIMIT_MAX || 12)
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]
const CONFIGURED_ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...CONFIGURED_ALLOWED_ORIGINS])
const parseCache = new Map()
let pdfjsModulePromise = null

const app = express()
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0))
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: { directives: {
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    'worker-src': ["'self'", 'blob:'],
    'connect-src': ["'self'", ...CONFIGURED_ALLOWED_ORIGINS],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
  } },
}))
app.use((request, response, next) => {
  request.id = randomUUID()
  response.setHeader('X-Request-Id', request.id)
  next()
})
app.use(cors((request, done) => done(null, {
  origin(origin, callback) {
    if (isAllowedOrigin(origin) || origin === request.protocol + '://' + request.get('host')) {
      callback(null, true)
      return
    }
    callback(Object.assign(new Error('Origin is not allowed by FinScan CORS policy.'), {status:403}))
  }
})))
app.use(express.json({ limit: '80mb' }))
app.use(express.urlencoded({ limit: '80mb', extended: true }))

const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  limit: API_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please wait a moment and try again.' },
})

const parseLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  limit: PARSE_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many parsing requests. Please wait before uploading more files.' },
})

app.use('/api', apiLimiter)

const EXTRACTION_FIELDS = [
  'company', 'period', 'currency', 'standard', 'years',
  'revenue', 'netIncome', 'grossProfit', 'ebit',
  'totalAssets', 'totalLiabilities', 'equity',
  'currentAssets', 'currentLiabilities', 'fixedAssets',
  'receivables', 'payables', 'cash', 'inventory',
  'interest', 'tax', 'cashFlow', 'debt',
  'retainedEarnings', 'shareCapital', 'reserves',
  'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
  'prevRevenue', 'prevGrossProfit', 'prevReceivables',
  'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA', 'prevDotAmort'
]

const CORE_LOCAL_FIELDS = [
  'revenue',
  'netIncome',
  'totalAssets',
  'totalLiabilities',
  'currentAssets',
  'currentLiabilities',
  'receivables',
  'payables',
  'cash',
  'inventory',
]

const FINANCIAL_TEXT_HINTS = [
  'revenue', 'sales', 'turnover', 'chiffre', 'resultat', 'résultat',
  'assets', 'actif', 'liabilities', 'passif', 'equity', 'capitaux',
  'receivables', 'creances', 'créances', 'clients', 'payables',
  'fournisseurs', 'inventory', 'stocks', 'cash', 'tresorerie',
  'trésorerie', 'debt', 'dettes', 'ebit', 'income', 'profit',
  'marge', 'gross', 'operating', 'cash flow', 'flux',
]

const MONEY_ARRAY_FIELDS = [
  'revenue', 'netIncome', 'grossProfit', 'ebit',
  'totalAssets', 'totalLiabilities', 'equity',
  'currentAssets', 'currentLiabilities', 'fixedAssets',
  'receivables', 'payables', 'cash', 'inventory',
  'interest', 'tax', 'cashFlow', 'debt',
  'retainedEarnings', 'shareCapital', 'reserves'
]

const MONEY_SCALAR_FIELDS = [
  'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
  'prevRevenue', 'prevGrossProfit', 'prevReceivables',
  'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA',
  'prevDotAmort'
]

const standardSchema = z.enum(['international', 'french', 'moroccan']).catch('international')
const parseFileSchema = z.object({
  fileData: z.string().min(1, 'fileData is required').regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Invalid base64 file data'),
  mimeType: z.string().max(120).default('text/plain'),
  standard: standardSchema,
  parseMode: z.enum(['resilient', 'balanced']).catch('resilient'),
  fileName: z.string().trim().max(240).optional().default('Uploaded file'),
  fileSize: z.number().nonnegative().optional(),
})
const analyzeSchema = z.object({
  companyData: z.object({
    company: z.string().trim().min(1, 'company is required').max(240),
  }).passthrough(),
})

function isAllowedOrigin(origin) {
  if (!origin) return true
  if (ALLOWED_ORIGINS.has(origin)) return true
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function validateBody(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return response.status(400).json({
        error: 'Invalid request payload.',
        requestId: request.id,
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    request.validatedBody = result.data
    return next()
  }
}

function isSupportedParseMime(mimeType = '') {
  return [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'text/plain',
    'text/csv',
    'application/json',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(mimeType)
}

function shouldPreferGeminiExtraction(mimeType, requestedMode) {
  if (!GEMINI_API_KEY || requestedMode !== 'balanced') return false
  return !['text/plain', 'text/csv', 'application/json'].includes(mimeType)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fmtN(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return Number(value).toFixed(0)
}

function last(value) {
  return Array.isArray(value) ? value[value.length - 1] : (value || 0)
}

function clampNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function decodeApproxBytes(base64) {
  return Math.floor((base64.length * 3) / 4)
}

function deriveCompanyName(fileName = 'Uploaded Company') {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Uploaded Company'
}

function normalizeYears(years, period) {
  const normalized = Array.isArray(years)
    ? years.map((year) => String(year ?? '').trim()).filter(Boolean)
    : []
  if (normalized.length) return normalized
  if (period) return [String(period)]
  throw Object.assign(new Error('No reporting year found. Supply years or period.'), {status:400})
}

function arrayOrNull(value) {
  if (!Array.isArray(value)) return value == null ? [] : [clampNumber(value)]
  return value.map((entry) => clampNumber(entry))
}

function normalizeSeries(value, length) {
  const normalized = arrayOrNull(value)
  if (!normalized.length) return Array.from({ length }, () => null)
  if (normalized.length === length) return normalized
  if (normalized.length > length) return normalized.slice(normalized.length - length)
  return [...Array.from({ length: length - normalized.length }, () => null), ...normalized]
}

function normalizeExtraction(parsed, standard, fileName) {
  const years = normalizeYears(parsed.years, parsed.period)
  if (years.some(y => !/^20\d{2}$/.test(y)) || new Set(years).size !== years.length) throw Object.assign(new Error('Reporting years must be distinct four-digit years.'), {status:400})
  const order = years.map((year,index)=>({year,index})).sort((a,b)=>a.year.localeCompare(b.year))
  const normalized = {}

  EXTRACTION_FIELDS.forEach((field) => {
    normalized[field] = null
  })

  normalized.company = String(parsed.company || '').trim() || deriveCompanyName(fileName)
  normalized.period = order.at(-1).year
  const parsedCurrency = normalizeCurrencyCode(parsed.originalCurrency || parsed.currency)
  normalized.currency = parsedCurrency?.code || UNKNOWN_CURRENCY
  normalized.originalCurrency = normalized.currency
  normalized.currencyConfidence = parsedCurrency?.confidence || 'none'
  normalized.currencySource = parsedCurrency?.source || 'not detected'
  normalized.standard = parsed.standard || standard || 'international'
  normalized.years = order.map(item=>item.year)

  ;[
    'revenue', 'netIncome', 'grossProfit', 'ebit',
    'totalAssets', 'totalLiabilities', 'equity',
    'currentAssets', 'currentLiabilities', 'fixedAssets',
    'receivables', 'payables', 'cash', 'inventory',
    'interest', 'tax', 'cashFlow', 'debt', 'retainedEarnings', 'shareCapital', 'reserves'
  ].forEach((field) => {
    normalized[field] = order.map(item=>normalizeSeries(parsed[field], years.length)[item.index])
  })

  ;[
    'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
    'prevRevenue', 'prevGrossProfit', 'prevReceivables',
    'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA', 'prevDotAmort'
  ].forEach((field) => {
    normalized[field] = clampNumber(parsed[field])
  })

  if (parsed._extraction) normalized._extraction = parsed._extraction
  if (parsed.originalCurrency) {
    const originalCurrency = normalizeCurrencyCode(parsed.originalCurrency)
    normalized.originalCurrency = originalCurrency?.code || UNKNOWN_CURRENCY
    normalized.currency = normalized.originalCurrency
    normalized.currencyConfidence = originalCurrency?.confidence || normalized.currencyConfidence
    normalized.currencySource = originalCurrency?.source || normalized.currencySource
  }
  if (parsed.sector) normalized.sector = parsed.sector

  return normalized
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

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function parseLooseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value ?? '').trim()
  if (!raw || !/\d/.test(raw)) return null
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw)
  let cleaned = raw
    .replace(/\((.*)\)/, '$1')
    .replace(/[^\d,.\-']/g, '')
    .replace(/'/g, '')
    .replace(/\s/g, '')

  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',')
    const lastDot = cleaned.lastIndexOf('.')
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '')
  }

  cleaned = cleaned.replace(/(?!^)-/g, '')
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return negative && parsed > 0 ? -parsed : parsed
}

function isYearOnly(value) {
  return /^(19|20)\d{2}$/.test(String(value ?? '').trim())
}

function detectCurrency(text = '') {
  const normalized = normalizeSearchText(text)
  if (/\b(mad|dh|dirham|dirhams)\b/.test(normalized)) return 'MAD'
  if (/\b(tnd|dt|dinar tunisien|dinars tunisiens)\b/.test(normalized)) return 'TND'
  if (/\b(ron|lei|leu)\b/.test(normalized)) return 'RON'
  if (/\b(usd|us dollar|dollars?)\b|\$/.test(normalized)) return 'USD'
  if (/\b(gbp|pound sterling|pounds?)\b|£/.test(normalized)) return 'GBP'
  if (/\b(eur|euro|euros)\b|€/.test(normalized)) return 'EUR'
  return null
}

function detectCompanyFromText(text = '') {
  const patterns = [
    /\bcompany\s*(?:name)?\s*:\s*([^\n\r]+)/i,
    /\bentity\s*(?:name)?\s*:\s*([^\n\r]+)/i,
    /\bsociete\s*:\s*([^\n\r]+)/i,
    /\bdenomination\s*:\s*([^\n\r]+)/i,
    /\braison\s+sociale\s*:\s*([^\n\r]+)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1]
        .replace(/\s{2,}.*/, '')
        .replace(/[|;].*/, '')
        .trim()
    }
  }

  return null
}

function unitMultiplierForText(text = '', fallback = 1) {
  const normalized = normalizeSearchText(text)
  if (
    /\b(million|millions|mio|mn)\b/.test(normalized) ||
    /[$€£]\s*m\b/i.test(text) ||
    /\bm\s*(eur|usd|mad|tnd|ron|gbp)\b/.test(normalized)
  ) {
    return 1_000_000
  }

  if (
    /\b(thousand|thousands|millier|milliers)\b/.test(normalized) ||
    /\bk\s*(eur|usd|mad|tnd|ron|gbp)\b/.test(normalized) ||
    /[$€£]\s*k\b/i.test(text)
  ) {
    return 1_000
  }

  return fallback
}

function detectGlobalUnitMultiplier(text = '') {
  const normalized = normalizeSearchText(text)
  if (/\b(figures|amounts|values|montants|donnees|data)\b.{0,35}\b(million|millions|mio|mn)\b/.test(normalized)) {
    return 1_000_000
  }
  if (/\b(figures|amounts|values|montants|donnees|data)\b.{0,35}\b(thousand|thousands|millier|milliers)\b/.test(normalized)) {
    return 1_000
  }
  return 1
}

function hasFinancialHint(value = '') {
  const normalized = normalizeSearchText(value)
  return FINANCIAL_TEXT_HINTS.some((hint) => normalized.includes(hint))
}

function hasNumericToken(value = '') {
  return /[-(]?\d/.test(String(value))
}

function cleanPdfLine(line = '') {
  return String(line)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([:;,.])/g, '$1')
    .trim()
}

function moneyCellToString(cell, multiplier) {
  if (multiplier === 1 || isYearOnly(cell)) return cell
  const parsed = parseLooseNumber(cell)
  if (parsed === null) return cell
  return String(parsed * multiplier)
}

function applyLineUnits(row, line, globalMultiplier) {
  if (!row.length) return row
  const lineMultiplier = unitMultiplierForText(line, globalMultiplier)
  const shouldScale = lineMultiplier !== 1 && hasFinancialHint(row[0])
  if (!shouldScale) return row
  return row.map((cell, index) => (index === 0 ? cell : moneyCellToString(cell, lineMultiplier)))
}

function splitPdfTextLine(line, globalMultiplier = 1) {
  const cleaned = cleanPdfLine(line)
  if (!cleaned || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(cleaned)) return null

  if (/^(?:19|20)\d{2}(?:\s+(?:19|20)\d{2})+$/.test(cleaned)) {
    return cleaned.split(/\s+/)
  }

  const colonMatch = cleaned.match(/^(.{2,}?):\s*(.+)$/)
  if (colonMatch) {
    return applyLineUnits([colonMatch[1].trim(), colonMatch[2].trim()], cleaned, globalMultiplier)
  }

  if (/[\t|;]/.test(cleaned)) {
    const separator = cleaned.includes('\t') ? /\t+/ : cleaned.includes('|') ? /\|+/ : /;/
    const parts = cleaned.split(separator).map((part) => cleanPdfLine(part)).filter(Boolean)
    if (parts.length > 1) return applyLineUnits(parts, cleaned, globalMultiplier)
  }

  if (/\s{2,}/.test(line)) {
    const parts = line.split(/\s{2,}/).map((part) => cleanPdfLine(part)).filter(Boolean)
    if (parts.length > 1) return applyLineUnits(parts, line, globalMultiplier)
  }

  const firstNumberIndex = cleaned.search(/[-(]?\d/)
  if (firstNumberIndex > 1 && /[a-z]/i.test(cleaned.slice(0, firstNumberIndex))) {
    const label = cleanPdfLine(cleaned.slice(0, firstNumberIndex))
    const numericSide = cleanPdfLine(cleaned.slice(firstNumberIndex))
    const values = numericSide
      .split(/\s+(?=[-($€£]?\d)/)
      .map((part) => cleanPdfLine(part))
      .filter(Boolean)
    if (label && values.length) {
      return applyLineUnits([label, ...values], cleaned, globalMultiplier)
    }
  }

  return null
}

function pdfTextToRows(text = '') {
  const globalMultiplier = detectGlobalUnitMultiplier(text)
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map(cleanPdfLine)
    .filter(Boolean)

  const rows = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const row = splitPdfTextLine(line, globalMultiplier)
    if (row && row.length > 1) {
      rows.push(row)
      continue
    }

    const nextLine = lines[index + 1]
    if (
      hasFinancialHint(line) &&
      !hasNumericToken(line) &&
      nextLine &&
      hasNumericToken(nextLine)
    ) {
      rows.push(applyLineUnits([line, nextLine], `${line} ${nextLine}`, globalMultiplier))
      index += 1
    }
  }

  return rows
}

function flattenPdfTableRows(tableResult) {
  const rows = []
  const pages = Array.isArray(tableResult?.pages) ? tableResult.pages : []
  pages.forEach((page) => {
    ;(page.tables || []).forEach((table) => {
      table.forEach((row) => {
        if (Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())) {
          rows.push(row.map((cell) => String(cell ?? '').trim()))
        }
      })
    })
  })
  return rows
}

function countLocalMatches(company) {
  const matched = new Set(company?._extraction?.matchedFields || [])
  CORE_LOCAL_FIELDS.forEach((field) => {
    const value = company?.[field]
    if (Array.isArray(value) && value.some((entry) => Math.abs(Number(entry) || 0) > 0)) {
      matched.add(field)
    }
  })
  return matched.size
}

function hasUsableLocalExtraction(company) {
  if (!company) return false
  return countLocalMatches(company) >= 3
}

function refineLocalExtraction(company, { text = '', sourceType, rowCount, pageCount }) {
  const detectedCurrency = normalizeCurrencyCode(company.currency) || detectCurrencyFromText(text)
  const sourceCurrency = detectedCurrency?.code || UNKNOWN_CURRENCY
  const detectedCompany = detectCompanyFromText(text)
  const confidenceBase = company._extraction?.confidence ?? 60
  const matchedCount = countLocalMatches(company)
  const warnings = [...(company._extraction?.warnings || [])]
  const fallbackCompany = deriveCompanyName(company._filename || '')

  if (sourceCurrency === UNKNOWN_CURRENCY) {
    warnings.push('Currency was not detected. Confirm the source currency before accepting the extraction.')
  } else if (detectedCurrency?.confidence === 'ambiguous') {
    warnings.push(`Currency signal was ambiguous (${detectedCurrency.source}). Confirm the source currency before accepting.`)
  }

  if (text && text.length < 80) {
    warnings.push('The PDF exposed very little selectable text. If values look incomplete, export the report as text-based PDF or use CSV/XLSX.')
  }

  return {
    ...company,
    company: detectedCompany && (!company.company || company.company === fallbackCompany)
      ? detectedCompany
      : company.company,
    currency: sourceCurrency,
    originalCurrency: sourceCurrency,
    currencyConfidence: detectedCurrency?.confidence || 'none',
    currencySource: detectedCurrency?.source || 'not detected',
    _extraction: {
      ...(company._extraction || {}),
      sourceType,
      parser: 'local-pdf-text',
      confidence: Math.max(35, Math.min(96, confidenceBase + Math.min(matchedCount * 2, 12))),
      warnings: [...new Set(warnings)],
      matchedFields: [...new Set(company._extraction?.matchedFields || [])],
      currencyCode: sourceCurrency,
      currencyConfidence: detectedCurrency?.confidence || 'none',
      currencySource: detectedCurrency?.source || 'not detected',
      currencyReviewRequired: sourceCurrency === UNKNOWN_CURRENCY || detectedCurrency?.confidence === 'ambiguous',
      rowCount,
      pageCount,
      reviewed: false,
    },
  }
}

function parseTextLocally(text, { fileName, standard, sourceType = 'text-local' }) {
  const rows = pdfTextToRows(text)
  const parsed = parseRowsToCompany(rows, { fileName, standard, sourceType })
  if (!parsed) return null
  return refineLocalExtraction(parsed, {
    text,
    sourceType,
    rowCount: rows.length,
    pageCount: null,
  })
}

async function loadPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs')
      .then((module) => module.default || module)
  }
  return pdfjsModulePromise
}

function textContentToLines(content) {
  const positioned = (content?.items || [])
    .map((item) => ({
      text: String(item.str || '').trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .filter((item) => item.text)
    .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x))

  const lines = []
  positioned.forEach((item) => {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= 2)
    if (line) {
      line.items.push(item)
      line.y = (line.y + item.y) / 2
    } else {
      lines.push({ y: item.y, items: [item] })
    }
  })

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '))
    .join('\n')
}

function textContentToPdfRows(content, pageNumber) {
  const positioned = (content?.items || [])
    .map((item) => ({
      text: String(item.str || '').trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .filter((item) => item.text)
    .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x))

  const lines = []
  positioned.forEach((item) => {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= 2)
    if (line) {
      line.items.push(item)
      line.y = (line.y + item.y) / 2
    } else {
      lines.push({ y: item.y, items: [item] })
    }
  })

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const items = line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => ({ text: item.text, x: item.x }))
      return {
        page: pageNumber,
        text: items.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim(),
        items,
      }
    })
    .filter((row) => row.text)
}

async function parsePdfLocally(buffer, { fileName, standard }) {
  const pdfjs = await loadPdfJs()
  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const document = await documentTask.promise
  const pageCount = document.numPages
  let text = ''
  let pdfRows = []

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      text += `${textContentToLines(content)}\n`
      pdfRows = pdfRows.concat(textContentToPdfRows(content, pageNumber))
    }
  } finally {
    await document.destroy()
  }

  const riscoParsed = extractRisCoFinancialReport(pdfRows, { fileName, standard })
  if (riscoParsed) {
    return {
      ...riscoParsed,
      _extraction: {
        ...(riscoParsed._extraction || {}),
        pageCount,
        backendUsed: false,
      },
    }
  }

  const rows = pdfTextToRows(text)
  const parsed = parseRowsToCompany(rows, { fileName, standard, sourceType: 'pdf-local' })
  if (!parsed) return null

  return refineLocalExtraction(parsed, {
    text,
    sourceType: 'pdf-local',
    rowCount: rows.length,
    pageCount,
  })
}

function requireAiAnalystKey(response, requestId) {
  if (GEMINI_API_KEY || OPENAI_API_KEY || AI_ANALYST_API_KEY) return true
  response.status(503).json({
    error: 'GEMINI_API_KEY is not configured. Local parsing and frontend analysis still work; only optional AI analyst generation is disabled.',
    requestId,
  })
  return false
}

function geminiHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': GEMINI_API_KEY,
    ...extra,
  }
}

function aiAnalystHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': AI_ANALYST_API_KEY,
    'anthropic-version': '2023-06-01',
  }
}

function openAiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  }
}

const OPENAI_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'company', 'period', 'currency', 'standard', 'years',
    ...MONEY_ARRAY_FIELDS,
    ...MONEY_SCALAR_FIELDS,
    'fieldEvidence', 'warnings',
  ],
  properties: {
    company: { type: 'string' },
    period: { type: 'string' },
    currency: { type: 'string' },
    standard: { type: 'string' },
    years: { type: 'array', items: { type: 'string' } },
    ...Object.fromEntries(MONEY_ARRAY_FIELDS.map(field => [field, {
      type: 'array',
      items: { type: ['number', 'null'] },
    }])),
    ...Object.fromEntries(MONEY_SCALAR_FIELDS.map(field => [field, { type: ['number', 'null'] }])),
    fieldEvidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'label', 'snippet', 'page', 'sheet', 'cell', 'confidence'],
        properties: {
          field: { type: 'string' },
          label: { type: 'string' },
          snippet: { type: 'string' },
          page: { type: ['number', 'null'] },
          sheet: { type: ['string', 'null'] },
          cell: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

function buildOpenAiExtractionPrompt({ standard, mode, fileName }) {
  return `Extract canonical financial statement values from ${fileName || 'the uploaded file'}.

Return only the structured schema. Do not guess. Use null when a statement line is absent.

Rules:
- Preserve source currency and raw monetary units from the document.
- Map French PCG/CGNC labels carefully: Chiffre d'affaires -> revenue, Resultat net -> netIncome, Resultat d'exploitation -> ebit, Creances clients -> receivables, Dettes fournisseurs -> payables, Stocks -> inventory, Tresorerie -> cash.
- Extract forensic-model inputs when disclosed: report a nouveau / retained earnings / accumulated results -> retainedEarnings; capital social -> shareCapital; reserves -> reserves; dotations aux amortissements -> dotAmort and prior-year dotations -> prevDotAmort; selling/general/admin or other operating expenses -> curSGA and prevSGA.
- Map Romanian/RisCo labels carefully: Sales revenues -> revenue, Gross Profit / Loss -> grossProfit, Net Profit / Loss -> netIncome, Current asset(s) -> currentAssets, House and accounts -> cash, Own Capitals -> equity, Liabilities -> totalLiabilities.
- Arrays must align exactly to years, oldest to newest.
- Monetary values must be numbers without separators.
- Preserve decimal scale exactly: 40 527,801 or 40.527,801 means 40527.801, not 40527801. In Tunisian statements, three decimal places are millimes; in MAD/EUR statements, comma decimals are cents.
- For absent fields, return null or arrays of nulls; do not use 0 unless the document explicitly reports zero.
- fieldEvidence must include the source page/sheet/cell when visible and a short snippet/label for every extracted non-null field.
- This request is ${mode}. Prefer precision over completeness.`
}

function extractOpenAiText(payload) {
  if (payload.output_text) return payload.output_text
  const parts = []
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text)
      if (content.type === 'output_text' && content.text) parts.push(content.text)
    }
  }
  return parts.join('').trim()
}

function extractGeminiText(payload) {
  const parts = []
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.text) parts.push(part.text)
    }
  }
  return parts.join('').trim()
}

async function callGeminiGenerateContent({ model, contents, generationConfig = {}, maxOutputTokens = 3200 }) {
  let lastError = null

  for (let attempt = 0; attempt < AI_ANALYST_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_ANALYST_TIMEOUT_MS)

    try {
      const apiResponse = await fetch(`${GEMINI_API_BASE}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: geminiHeaders(),
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens,
            thinkingConfig: { thinkingLevel: 'medium' },
            ...generationConfig,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!apiResponse.ok) {
        const errorPayload = await apiResponse.json().catch(() => ({}))
        const message = errorPayload.error?.message || `Gemini API error ${apiResponse.status}`
        lastError = new Error(message)
        lastError.status = apiResponse.status
        if (attempt < AI_ANALYST_MAX_RETRIES - 1 && [408, 429, 500, 502, 503, 504].includes(apiResponse.status)) {
          await sleep(1200 * (attempt + 1))
          continue
        }
        throw lastError
      }

      return apiResponse.json()
    } catch (error) {
      clearTimeout(timeout)
      lastError = error.name === 'AbortError'
        ? new Error('Gemini-assisted parsing timed out for this file.')
        : error
      if (attempt < AI_ANALYST_MAX_RETRIES - 1) {
        await sleep(1200 * (attempt + 1))
        continue
      }
      throw lastError
    }
  }

  throw lastError || new Error('Gemini request failed')
}

async function uploadGeminiFile({ fileData, mimeType, fileName }) {
  const buffer = Buffer.from(fileData, 'base64')
  const startResponse = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: geminiHeaders({
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    }),
    body: JSON.stringify({
      file: {
        display_name: fileName || 'uploaded-financial-statement',
      },
    }),
  })

  if (!startResponse.ok) {
    const payload = await startResponse.json().catch(() => ({}))
    const error = new Error(payload.error?.message || `Gemini file upload start failed ${startResponse.status}`)
    error.status = startResponse.status
    throw error
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini file upload did not return an upload URL.')

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  })

  if (!uploadResponse.ok) {
    const payload = await uploadResponse.json().catch(() => ({}))
    const error = new Error(payload.error?.message || `Gemini file upload failed ${uploadResponse.status}`)
    error.status = uploadResponse.status
    throw error
  }

  let file = (await uploadResponse.json()).file
  if (!file?.uri || !file?.name) throw new Error('Gemini file upload returned no usable file URI.')

  for (let poll = 0; poll < 24 && file.state === 'PROCESSING'; poll += 1) {
    await sleep(2500)
    const getResponse = await fetch(`${GEMINI_API_BASE}/v1beta/${file.name}`, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    })
    if (!getResponse.ok) break
    file = (await getResponse.json()).file || file
  }

  if (file.state === 'FAILED') {
    throw new Error('Gemini file processing failed for this upload.')
  }

  return file
}

async function callOpenAiResponses({ input, model, maxTokens = 2400, textFormat = null }) {
  let lastError = null

  for (let attempt = 0; attempt < AI_ANALYST_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_ANALYST_TIMEOUT_MS)

    try {
      const body = {
        model,
        input,
        max_output_tokens: maxTokens,
        reasoning: { effort: 'medium' },
      }
      if (textFormat) body.text = { format: textFormat }

      const apiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: openAiHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!apiResponse.ok) {
        const errorPayload = await apiResponse.json().catch(() => ({}))
        const message = errorPayload.error?.message || `OpenAI API error ${apiResponse.status}`
        lastError = new Error(message)
        lastError.status = apiResponse.status
        if (attempt < AI_ANALYST_MAX_RETRIES - 1 && [408, 429, 500, 502, 503, 504].includes(apiResponse.status)) {
          await sleep(900 * (attempt + 1))
          continue
        }
        throw lastError
      }

      return apiResponse.json()
    } catch (error) {
      clearTimeout(timeout)
      lastError = error.name === 'AbortError'
        ? new Error('OpenAI-assisted parsing timed out for this file.')
        : error
      if (attempt < AI_ANALYST_MAX_RETRIES - 1) {
        await sleep(900 * (attempt + 1))
        continue
      }
      throw lastError
    }
  }

  throw lastError || new Error('OpenAI request failed')
}

function buildExtractionPrompt({ standard, mode }) {
  const standardLabels = {
    international: 'IFRS / US GAAP (International)',
    french: 'PCG - Plan Comptable General (France)',
    moroccan: 'CGNC - Code General de la Normalisation Comptable (Morocco)',
  }

  const standardHint = standardLabels[standard] || standardLabels.international
  const resilienceInstructions =
    mode === 'resilient'
      ? 'This is resilient mode. Prioritize core balance sheet and cash conversion fields first. If a secondary metric is not clearly disclosed, return null instead of stalling or guessing.'
      : 'This is balanced mode. Return the richest accurate extraction you can while still preferring precision over guesses.'

  return `You are a financial data extraction expert specializing in ${standardHint} statements.

Analyze the uploaded financial document and return only one valid JSON object. Do not include markdown, prose, or code fences.

${resilienceInstructions}

Use this exact shape:
{
  "company": "exact company name from document",
  "period": "most recent fiscal year, e.g. 2024",
  "currency": "detected ISO 4217 source currency code; use UNKNOWN if not explicitly supported by the filing",
  "standard": "${standard || 'international'}",
  "years": ["2022", "2023", "2024"],
  "revenue": [number, number, number],
  "netIncome": [number, number, number],
  "grossProfit": [number, number, number],
  "ebit": [number, number, number],
  "totalAssets": [number, number, number],
  "totalLiabilities": [number, number, number],
  "equity": [number, number, number],
  "currentAssets": [number, number, number],
  "currentLiabilities": [number, number, number],
  "fixedAssets": [number, number, number],
  "receivables": [number, number, number],
  "payables": [number, number, number],
  "cash": [number, number, number],
  "inventory": [number, number, number],
  "interest": [number, number, number],
  "tax": [number, number, number],
  "cashFlow": [number, number, number],
  "debt": [number, number, number],
  "retainedEarnings": [number, number, number],
  "shareCapital": [number, number, number],
  "reserves": [number, number, number],
  "cogs": number,
  "chPersonnel": number,
  "dotAmort": number,
  "autresCharges": number,
  "prevRevenue": number,
  "prevGrossProfit": number,
  "prevReceivables": number,
  "prevTotalAssets": number,
  "prevNetIncome": number,
  "prevSGA": number,
  "curSGA": number,
  "prevDotAmort": number
}

Rules:
- Arrays must contain one value per year detected in the file.
- Monetary values must be raw numbers only, with no spaces or separators.
- Use null only when a value is truly absent from the document.
- Map French and Moroccan terminology carefully: Chiffre d'affaires -> revenue, Resultat net -> netIncome, Resultat d'exploitation -> ebit, Creances clients -> receivables, Dettes fournisseurs -> payables, Stocks -> inventory, Tresorerie -> cash.
- For the prev* scalar fields, use the second-most-recent year when available.
- Extract operating cash flow into cashFlow whenever a cash flow statement is available.
- If trade payables are not explicitly disclosed, return null instead of estimating.
- Never invent values to fill the schema.

Return only the JSON object.`
}

function cleanJsonText(rawText) {
  return rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

function parseJsonPayload(rawText) {
  const cleaned = cleanJsonText(rawText)
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function callAiAnalyst({ content, maxTokens }) {
  let lastError = null

  for (let attempt = 0; attempt < AI_ANALYST_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_ANALYST_TIMEOUT_MS)

    try {
      const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: aiAnalystHeaders(),
        body: JSON.stringify({
          model: AI_ANALYST_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content }]
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!apiResponse.ok) {
        const errorPayload = await apiResponse.json().catch(() => ({}))
        const message = errorPayload.error?.message || `AI analyst API error ${apiResponse.status}`
        lastError = new Error(message)
        lastError.status = apiResponse.status
        if (attempt < AI_ANALYST_MAX_RETRIES - 1 && [408, 429, 500, 502, 503, 504].includes(apiResponse.status)) {
          await sleep(900 * (attempt + 1))
          continue
        }
        throw lastError
      }

      return apiResponse.json()
    } catch (error) {
      clearTimeout(timeout)
      lastError = error.name === 'AbortError'
        ? new Error('AI-assisted parsing timed out for this file.')
        : error
      if (attempt < AI_ANALYST_MAX_RETRIES - 1) {
        await sleep(900 * (attempt + 1))
        continue
      }
      throw lastError
    }
  }

  throw lastError || new Error('AI analyst request failed')
}

function buildCacheKey({ fileData, mimeType, standard, parseMode, fileName }) {
  return createHash('sha256')
    .update(mimeType || '')
    .update('|')
    .update(standard || '')
    .update('|')
    .update(parseMode || '')
    .update('|')
    .update(fileData).update(fileName || '')
    .digest('hex')
}

function rememberParse(key, value) {
  if (parseCache.has(key)) parseCache.delete(key)
  parseCache.set(key, value)
  if (parseCache.size > 40) {
    const oldestKey = parseCache.keys().next().value
    parseCache.delete(oldestKey)
  }
}

async function parseWithAiAnalystExtraction({ fileData, mimeType, standard, effectiveMode, fileName }) {
  const prompt = buildExtractionPrompt({ standard, mode: effectiveMode })
  let content

  if (mimeType === 'application/pdf') {
    content = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileData,
        }
      },
      { type: 'text', text: prompt }
    ]
  } else {
    const decoded = Buffer.from(fileData, 'base64').toString('utf-8')
    content = [
      { type: 'text', text: `Here is the uploaded financial text:\n\n${decoded}\n\n${prompt}` }
    ]
  }

  const payload = await callAiAnalyst({
    content,
    maxTokens: effectiveMode === 'resilient' ? 1800 : 2200,
  })

  const rawText = payload.content?.map((block) => block.text || '').join('').trim() || ''
  const parsed = parseJsonPayload(rawText)
  if (!parsed) return null

  return normalizeExtraction(parsed, standard, fileName)
}

function normalizeStructuredExtraction(parsed, standard, fileName, provider) {
  const normalized = normalizeExtraction(parsed, standard, fileName)
  const sources = {}
  const matchedFields = new Set()

  ;(parsed.fieldEvidence || []).forEach((entry) => {
    if (!entry?.field) return
    sources[entry.field] = {
      page: entry.page ?? null,
      sheet: entry.sheet || null,
      cell: entry.cell || null,
      label: entry.label || entry.snippet || entry.field,
      snippet: entry.snippet || entry.label || entry.field,
      confidence: entry.confidence,
    }
    matchedFields.add(entry.field)
  })

  CORE_LOCAL_FIELDS.concat(['grossProfit', 'ebit', 'fixedAssets', 'debt', 'interest', 'tax', 'cashFlow']).forEach((field) => {
    const value = normalized[field]
    if (Array.isArray(value) && value.some(entry => entry !== null && entry !== undefined && Number.isFinite(Number(entry)))) {
      matchedFields.add(field)
    }
  })

  const warnings = [...new Set([...(parsed.warnings || []), ...currencyWarningsFor(normalized)])]
  return finalizeStatementExtraction(normalized, {
    sourceType: provider.sourceType,
    parser: provider.parser,
    confidence: provider.confidence || 88,
    warnings,
    matchedFields,
    sources,
  })
}

function normalizeOpenAiExtraction(parsed, standard, fileName) {
  return normalizeStructuredExtraction(parsed, standard, fileName, {
    sourceType: 'openai-responses',
    parser: `openai-${OPENAI_EXTRACTION_MODEL}`,
    confidence: 88,
  })
}

function normalizeGeminiExtraction(parsed, standard, fileName) {
  return normalizeStructuredExtraction(parsed, standard, fileName, {
    sourceType: 'gemini-generate-content',
    parser: GEMINI_EXTRACTION_MODEL,
    confidence: 90,
  })
}

async function parseWithGeminiExtraction({ fileData, mimeType, standard, effectiveMode, fileName }) {
  const prompt = `${buildOpenAiExtractionPrompt({ standard, mode: effectiveMode, fileName })}

Extra Gemini extraction rules:
- Read the rendered document visually when table text extraction is weak.
- Moroccan and French statements may use PCG/CGNC line labels; preserve signs and units exactly.
- Include fieldEvidence for every non-null accepted field with page number when available.`

  const approximateBytes = decodeApproxBytes(fileData)
  const parts = []

  if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') {
    const decoded = Buffer.from(fileData, 'base64').toString('utf-8')
    parts.push({ text: `Uploaded financial text:\n\n${decoded}` })
  } else if (approximateBytes > GEMINI_FILE_UPLOAD_THRESHOLD_BYTES) {
    const file = await uploadGeminiFile({ fileData, mimeType, fileName })
    parts.push({
      file_data: {
        mime_type: file.mimeType || mimeType,
        file_uri: file.uri,
      },
    })
  } else {
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: fileData,
      },
    })
  }

  parts.push({ text: prompt })

  const payload = await callGeminiGenerateContent({
    model: GEMINI_EXTRACTION_MODEL,
    maxOutputTokens: effectiveMode === 'resilient' ? 10000 : 14000,
    contents: [{ role: 'user', parts }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'medium' },
      responseMimeType: 'application/json',
      responseJsonSchema: OPENAI_EXTRACTION_SCHEMA,
    },
  })

  const rawText = extractGeminiText(payload)
  const parsed = parseJsonPayload(rawText)
  if (!parsed) return null
  return normalizeGeminiExtraction(parsed, standard, fileName)
}

async function parseWithOpenAiExtraction({ fileData, mimeType, standard, effectiveMode, fileName }) {
  const prompt = buildOpenAiExtractionPrompt({ standard, mode: effectiveMode, fileName })
  const content = []

  if (/^image\//i.test(mimeType)) {
    content.push({
      type: 'input_image',
      image_url: `data:${mimeType};base64,${fileData}`,
      detail: 'high',
    })
  } else if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') {
    const decoded = Buffer.from(fileData, 'base64').toString('utf-8')
    content.push({ type: 'input_text', text: `Uploaded financial text:\n\n${decoded}` })
  } else {
    content.push({
      type: 'input_file',
      filename: fileName,
      file_data: `data:${mimeType};base64,${fileData}`,
    })
  }

  content.push({ type: 'input_text', text: prompt })

  const payload = await callOpenAiResponses({
    model: OPENAI_EXTRACTION_MODEL,
    maxTokens: effectiveMode === 'resilient' ? 2200 : 3200,
    input: [{ role: 'user', content }],
    textFormat: {
      type: 'json_schema',
      name: 'statement_extraction',
      schema: OPENAI_EXTRACTION_SCHEMA,
      strict: true,
    },
  })

  const rawText = extractOpenAiText(payload)
  const parsed = parseJsonPayload(rawText)
  if (!parsed) return null
  return normalizeOpenAiExtraction(parsed, standard, fileName)
}

app.get('/api/status', (request, response) => {
  response.json({
    status: 'FinScan server running',
    version: APP_VERSION,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    geminiModel: GEMINI_EXTRACTION_MODEL,
    openAiConfigured: Boolean(OPENAI_API_KEY),
    aiAnalystConfigured: Boolean(GEMINI_API_KEY || OPENAI_API_KEY || AI_ANALYST_API_KEY),
    note: 'PDF/CSV/XLS/XLSX/image parsing, ratios, liquidity, benchmark, and local memo generation are local-first. Optional Gemini fallback is primary for advanced extraction and report language generation.'
  })
})

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    version: APP_VERSION,
    geminiConfigured: Boolean(GEMINI_API_KEY),
    openAiConfigured: Boolean(OPENAI_API_KEY),
    aiAnalystConfigured: Boolean(GEMINI_API_KEY || OPENAI_API_KEY || AI_ANALYST_API_KEY),
    model: GEMINI_API_KEY ? GEMINI_EXTRACTION_MODEL : (OPENAI_API_KEY ? OPENAI_EXTRACTION_MODEL : (AI_ANALYST_API_KEY ? AI_ANALYST_MODEL : null)),
    parseCacheSize: parseCache.size,
    requestId: request.id,
  })
})

app.post('/api/parse-file', parseLimiter, validateBody(parseFileSchema), async (request, response) => {
  const { fileData, mimeType, standard, parseMode, fileName } = request.validatedBody

  if (!fileData) {
    return response.status(400).json({ error: 'Missing fileData', requestId: request.id })
  }

  if (!isSupportedParseMime(mimeType)) {
    return response.status(415).json({
      error: 'Unsupported file type for server parsing.',
      requestId: request.id,
    })
  }

  const requestedMode = parseMode === 'balanced' ? 'balanced' : 'resilient'
  const approximateBytes = decodeApproxBytes(fileData)

  if (approximateBytes > MAX_ACCEPTED_UPLOAD_BYTES) {
    return response.status(413).json({
      error: 'This file is too large for stable direct parsing. Export a lighter PDF or split the report into smaller files.',
      requestId: request.id,
    })
  }

  const effectiveMode =
    mimeType === 'application/pdf' && approximateBytes > PDF_SIZE_WARNING_BYTES
      ? 'resilient'
      : requestedMode

  const cacheKey = buildCacheKey({ fileData, mimeType, standard, parseMode: effectiveMode, fileName })
  const cached = parseCache.get(cacheKey)
  if (cached) {
    return response.json(cached)
  }

  try {
    let localParsed = null
    if (mimeType === 'application/vnd.ms-excel') {
      return response.status(415).json({error:'Legacy XLS is not supported. Save this workbook as XLSX or CSV before uploading.',requestId:request.id})
    }
    if (mimeType === 'application/pdf') {
      const buffer = Buffer.from(fileData, 'base64')
      localParsed = await parsePdfLocally(buffer, { fileName, standard })
    } else if (mimeType === 'text/csv') {
      const decoded = Buffer.from(fileData, 'base64').toString('utf-8')
      localParsed = parseCSVText(decoded, { fileName, standard, sourceType: 'csv-server' })
    } else if (mimeType === 'text/plain') {
      const decoded = Buffer.from(fileData, 'base64').toString('utf-8')
      localParsed = parseTextLocally(decoded, { fileName, standard, sourceType: 'text-server' })
    } else if (mimeType === 'application/json') {
      const decoded = Buffer.from(fileData, 'base64').toString('utf-8')
      const parsedJson = JSON.parse(decoded)
      localParsed = normalizeExtraction(parsedJson, standard, fileName)
      localParsed._extraction = {
        sourceType: 'json-server',
        confidence: 95,
        warnings: currencyWarningsFor(localParsed),
        matchedFields: CORE_LOCAL_FIELDS.filter((field) => Array.isArray(localParsed[field]) && localParsed[field].some((value) => Math.abs(Number(value) || 0) > 0)),
        currencyCode: localParsed.originalCurrency || localParsed.currency || UNKNOWN_CURRENCY,
        currencyConfidence: localParsed.currencyConfidence || 'none',
        currencySource: localParsed.currencySource || 'not detected',
        currencyReviewRequired: currencyWarningsFor(localParsed).length > 0,
        sources: {},
        reviewed: false,
      }
    }

    const preferGemini = shouldPreferGeminiExtraction(mimeType, requestedMode)

    if (hasUsableLocalExtraction(localParsed) && !preferGemini) {
      rememberParse(cacheKey, localParsed)
      return response.json(localParsed)
    }

    if (!GEMINI_API_KEY && !OPENAI_API_KEY && !AI_ANALYST_API_KEY) {
      return response.status(422).json({
        error: mimeType === 'application/pdf'
          ? 'Local PDF parsing could not detect enough financial fields. Configure GEMINI_API_KEY and switch to Local + AI Analyst mode, export CSV/XLSX, or use manual entry.'
          : 'Local parsing could not detect enough financial fields in this file. Configure GEMINI_API_KEY and switch to Local + AI Analyst mode for fallback extraction.',
        requestId: request.id,
      })
    }

    if (requestedMode === 'resilient') {
      return response.status(422).json({
        error: 'Local parsing did not detect enough fields. Switch PDF Extraction Mode to Local + AI Analyst to allow optional Gemini fallback, or upload CSV/XLS/XLSX for deterministic extraction.',
        requestId: request.id,
      })
    }

    let aiParsed = null
    try {
      if (GEMINI_API_KEY) {
        aiParsed = await parseWithGeminiExtraction({
          fileData,
          mimeType,
          standard,
          effectiveMode,
          fileName,
        })
      } else if (OPENAI_API_KEY) {
        aiParsed = await parseWithOpenAiExtraction({
          fileData,
          mimeType,
          standard,
          effectiveMode,
          fileName,
        })
      } else {
        aiParsed = await parseWithAiAnalystExtraction({
          fileData,
          mimeType,
          standard,
          effectiveMode,
          fileName,
        })
      }
    } catch (error) {
      if (hasUsableLocalExtraction(localParsed)) {
        const providerName = GEMINI_API_KEY ? 'Gemini' : (OPENAI_API_KEY ? 'OpenAI' : 'legacy AI')
        localParsed._extraction = {
          ...(localParsed._extraction || {}),
          warnings: [...new Set([...(localParsed._extraction?.warnings || []), `${providerName} fallback was unavailable: ${error.message}`])],
        }
        rememberParse(cacheKey, localParsed)
        return response.json(localParsed)
      }
      throw error
    }

    if (!aiParsed) {
      return response.status(422).json({
        error: 'Structured extraction could not be parsed. Try resilient local mode, CSV/XLSX, or a cleaner PDF export.',
        requestId: request.id,
      })
    }

    const aiMatchedFields = new Set(aiParsed._extraction?.matchedFields || CORE_LOCAL_FIELDS.filter((field) => (
      Array.isArray(aiParsed[field]) && aiParsed[field].some((value) => value !== null && value !== undefined)
    )))
    const aiFinal = finalizeStatementExtraction(aiParsed, {
      sourceType: aiParsed._extraction?.sourceType || (GEMINI_API_KEY ? 'gemini-generate-content' : (OPENAI_API_KEY ? 'openai-responses' : 'ai-analyst-fallback')),
      parser: aiParsed._extraction?.parser || (GEMINI_API_KEY ? GEMINI_EXTRACTION_MODEL : (OPENAI_API_KEY ? `openai-${OPENAI_EXTRACTION_MODEL}` : 'anthropic-legacy')),
      confidence: aiParsed._extraction?.confidence || 86,
      warnings: [...new Set([...(aiParsed._extraction?.warnings || []), ...currencyWarningsFor(aiParsed)])],
      matchedFields: aiMatchedFields,
      sources: aiParsed._extraction?.sources || {},
    })

    if (!aiFinal.company || aiFinal._extraction.matchedFields.length < 2) {
      return response.status(422).json({
        error: 'No company data was detected in the uploaded document.',
        requestId: request.id,
      })
    }

    rememberParse(cacheKey, aiFinal)
    return response.json(aiFinal)
  } catch (error) {
    console.error('parse-file error:', error)
    response.status(error.status || 500).json({
      error: error.message || 'Unexpected parse error',
      requestId: request.id,
    })
  }
})

app.post('/api/analyze', validateBody(analyzeSchema), async (request, response) => {
  const { companyData } = request.validatedBody
  if (!companyData) {
    return response.status(400).json({ error: 'Missing companyData', requestId: request.id })
  }

  if (!requireAiAnalystKey(response, request.id)) {
    return undefined
  }

  const revenue = Array.isArray(companyData.revenue) ? companyData.revenue : [companyData.revenue]
  const netIncome = Array.isArray(companyData.netIncome) ? companyData.netIncome : [companyData.netIncome]

  const isFrenchReport = companyData.reportLanguage === 'french'
  const headings = isFrenchReport
    ? ['RESUME EXECUTIF', 'ANALYSE DE LIQUIDITE', 'RISQUES CLES', 'RECOMMANDATION']
    : ['EXECUTIVE SUMMARY', 'LIQUIDITY VIEW', 'KEY RISKS', 'RECOMMENDATION']

  const prompt = `You are a senior financial analyst.

Write a concise executive memo in ${isFrenchReport ? 'French' : 'English'} plain text using the following data:
Company: ${companyData.company}
Period: ${companyData.period}
Currency: ${companyData.displayCurrency || companyData.currency || UNKNOWN_CURRENCY}
Revenue trend: ${revenue.map(fmtN).join(' -> ')}
Net income trend: ${netIncome.map(fmtN).join(' -> ')}
Current assets: ${fmtN(last(companyData.currentAssets))}
Current liabilities: ${fmtN(last(companyData.currentLiabilities))}
Cash: ${fmtN(last(companyData.cash))}
Operating cash flow: ${fmtN(last(companyData.cashFlow))}
Debt: ${fmtN(last(companyData.debt))}
Flags: ${(companyData.flags || []).map((flag) => `[${flag.level}] ${flag.text}`).join(' | ') || 'none'}

Return four short sections with these headings:
${headings.join('\n')}`

  try {
    let report = ''
    if (GEMINI_API_KEY) {
      const payload = await callGeminiGenerateContent({
        model: GEMINI_REPORT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        maxOutputTokens: 1200,
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'medium' },
        },
      })
      report = extractGeminiText(payload)
    } else if (OPENAI_API_KEY) {
      const payload = await callOpenAiResponses({
        model: OPENAI_REPORT_MODEL,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        maxTokens: 1000,
      })
      report = extractOpenAiText(payload)
    } else {
      const payload = await callAiAnalyst({
        content: prompt,
        maxTokens: 900,
      })
      report = payload.content?.map((block) => block.text || '').join('') || ''
    }
    response.json({ report })
  } catch (error) {
    console.error('analyze error:', error)
    response.status(error.status || 500).json({
      error: error.message || 'Unexpected analysis error',
      requestId: request.id,
    })
  }
})

if (existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR))
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) {
      next()
      return
    }
    response.sendFile(DIST_INDEX)
  })
}

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error)
    return
  }
  response.status(error.status || 500).json({
    error: error.type === 'entity.parse.failed' ? 'Invalid JSON request body.' : error.message || 'Unexpected server error',
    requestId: request.id,
  })
})

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
  console.log(`FinScan server running on http://localhost:${server.address().port}`)
  if (!GEMINI_API_KEY && !OPENAI_API_KEY && !AI_ANALYST_API_KEY) {
    console.log('GEMINI_API_KEY not configured: local PDF/CSV/XLS/XLSX/image parsing and frontend analysis remain available.')
  } else if (GEMINI_API_KEY) {
    console.log(`Gemini parsing enabled with ${GEMINI_EXTRACTION_MODEL}.`)
  }
})
