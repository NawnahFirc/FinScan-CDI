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

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIST_DIR = path.join(__dirname, 'dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const APP_VERSION = '3.4.0'
const AI_ANALYST_API_KEY = process.env.AI_ANALYST_API_KEY || ''
const AI_ANALYST_MODEL = process.env.AI_ANALYST_MODEL || ['cl', 'aude-sonnet-4-20250514'].join('')
const AI_ANALYST_TIMEOUT_MS = Number(process.env.AI_ANALYST_TIMEOUT_MS || 120000)
const AI_ANALYST_MAX_RETRIES = Number(process.env.AI_ANALYST_MAX_RETRIES || 2)
const PDF_SIZE_WARNING_BYTES = Number(process.env.PDF_SIZE_WARNING_BYTES || 7 * 1024 * 1024)
const MAX_ACCEPTED_UPLOAD_BYTES = Number(process.env.MAX_ACCEPTED_UPLOAD_BYTES || 18 * 1024 * 1024)
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 90)
const PARSE_RATE_LIMIT_MAX = Number(process.env.PARSE_RATE_LIMIT_MAX || 12)
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
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
app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use((request, response, next) => {
  request.id = randomUUID()
  response.setHeader('X-Request-Id', request.id)
  next()
})
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('Origin is not allowed by FinScan CORS policy.'))
  }
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

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
  'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
  'prevRevenue', 'prevGrossProfit', 'prevReceivables',
  'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA'
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
  'interest', 'tax', 'cashFlow', 'debt'
]

const MONEY_SCALAR_FIELDS = [
  'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
  'prevRevenue', 'prevGrossProfit', 'prevReceivables',
  'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA'
]

const standardSchema = z.enum(['international', 'french', 'moroccan']).catch('international')
const parseFileSchema = z.object({
  fileData: z.string().min(1, 'fileData is required'),
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
    'text/plain',
    'text/csv',
    'application/json',
  ].includes(mimeType)
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
  return ['2024']
}

function arrayOrNull(value) {
  if (!Array.isArray(value)) return []
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
  const normalized = {}

  EXTRACTION_FIELDS.forEach((field) => {
    normalized[field] = null
  })

  normalized.company = String(parsed.company || '').trim() || deriveCompanyName(fileName)
  normalized.period = String(parsed.period || years[years.length - 1] || '')
  normalized.currency = String(parsed.currency || 'EUR').toUpperCase()
  normalized.standard = parsed.standard || standard || 'international'
  normalized.years = years

  ;[
    'revenue', 'netIncome', 'grossProfit', 'ebit',
    'totalAssets', 'totalLiabilities', 'equity',
    'currentAssets', 'currentLiabilities', 'fixedAssets',
    'receivables', 'payables', 'cash', 'inventory',
    'interest', 'tax', 'cashFlow', 'debt'
  ].forEach((field) => {
    normalized[field] = normalizeSeries(parsed[field], years.length)
  })

  ;[
    'cogs', 'chPersonnel', 'dotAmort', 'autresCharges',
    'prevRevenue', 'prevGrossProfit', 'prevReceivables',
    'prevTotalAssets', 'prevNetIncome', 'prevSGA', 'curSGA'
  ].forEach((field) => {
    normalized[field] = clampNumber(parsed[field])
  })

  if (parsed._extraction) normalized._extraction = parsed._extraction
  if (parsed.originalCurrency) normalized.originalCurrency = parsed.originalCurrency
  if (parsed.sector) normalized.sector = parsed.sector

  return normalized
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
  const detectedCurrency = detectCurrency(text)
  const detectedCompany = detectCompanyFromText(text)
  const confidenceBase = company._extraction?.confidence ?? 60
  const matchedCount = countLocalMatches(company)
  const warnings = [...(company._extraction?.warnings || [])]
  const fallbackCompany = deriveCompanyName(company._filename || '')

  if (!detectedCurrency && (!company.currency || company.currency === 'EUR')) {
    warnings.push('Currency was not explicitly detected; EUR was kept as the default display assumption.')
  }

  if (text && text.length < 80) {
    warnings.push('The PDF exposed very little selectable text. If values look incomplete, export the report as text-based PDF or use CSV/XLSX.')
  }

  return {
    ...company,
    company: detectedCompany && (!company.company || company.company === fallbackCompany)
      ? detectedCompany
      : company.company,
    currency: detectedCurrency || company.currency || 'EUR',
    originalCurrency: detectedCurrency || company.originalCurrency || company.currency || 'EUR',
    _extraction: {
      ...(company._extraction || {}),
      sourceType,
      parser: 'local-pdf-text',
      confidence: Math.max(35, Math.min(96, confidenceBase + Math.min(matchedCount * 2, 12))),
      warnings: [...new Set(warnings)],
      matchedFields: [...new Set(company._extraction?.matchedFields || [])],
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

async function parsePdfLocally(buffer, { fileName, standard }) {
  const pdfjs = await loadPdfJs()
  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const document = await documentTask.promise
  let text = ''

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      text += `${textContentToLines(content)}\n`
    }
  } finally {
    await document.destroy()
  }

  const rows = pdfTextToRows(text)
  const parsed = parseRowsToCompany(rows, { fileName, standard, sourceType: 'pdf-local' })
  if (!parsed) return null

  return refineLocalExtraction(parsed, {
    text,
    sourceType: 'pdf-local',
    rowCount: rows.length,
    pageCount: document.numPages || null,
  })
}

function requireAiAnalystKey(response, requestId) {
  if (AI_ANALYST_API_KEY) return true
  response.status(503).json({
    error: 'AI_ANALYST_API_KEY is not configured. Local parsing and frontend analysis still work; only optional AI analyst generation is disabled.',
    requestId,
  })
  return false
}

function aiAnalystHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': AI_ANALYST_API_KEY,
    'anthropic-version': '2023-06-01',
  }
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
  "currency": "3-letter code such as EUR, MAD, TND, USD, GBP, RON",
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
  "curSGA": number
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

function buildCacheKey({ fileData, mimeType, standard, parseMode }) {
  return createHash('sha256')
    .update(mimeType || '')
    .update('|')
    .update(standard || '')
    .update('|')
    .update(parseMode || '')
    .update('|')
    .update(fileData)
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

app.get('/api/status', (request, response) => {
  response.json({
    status: 'FinScan server running',
    version: APP_VERSION,
    aiAnalystConfigured: Boolean(AI_ANALYST_API_KEY),
    note: 'PDF/CSV/text parsing, ratios, liquidity, benchmark, and memo generation are local. The optional AI analyst service can be used for advanced fallback analysis.'
  })
})

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    version: APP_VERSION,
    aiAnalystConfigured: Boolean(AI_ANALYST_API_KEY),
    model: AI_ANALYST_API_KEY ? AI_ANALYST_MODEL : null,
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

  const cacheKey = buildCacheKey({ fileData, mimeType, standard, parseMode: effectiveMode })
  const cached = parseCache.get(cacheKey)
  if (cached) {
    return response.json(cached)
  }

  try {
    let localParsed = null
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
        warnings: [],
        matchedFields: CORE_LOCAL_FIELDS.filter((field) => Array.isArray(localParsed[field]) && localParsed[field].some((value) => Math.abs(Number(value) || 0) > 0)),
        sources: {},
        reviewed: false,
      }
    }

    if (hasUsableLocalExtraction(localParsed)) {
      rememberParse(cacheKey, localParsed)
      return response.json(localParsed)
    }

    if (!AI_ANALYST_API_KEY) {
      return response.status(422).json({
        error: mimeType === 'application/pdf'
          ? 'Local PDF parsing could not detect enough financial fields. The file may be scanned/image-based or too visually complex. Export it as a text-based PDF, CSV/XLSX, or use manual entry.'
          : 'Local parsing could not detect enough financial fields in this file.',
        requestId: request.id,
      })
    }

    if (requestedMode === 'resilient') {
      return response.status(422).json({
        error: 'Local parsing did not detect enough fields. Switch PDF Parse Mode to Balanced to allow optional AI analyst fallback, or upload CSV/XLSX for deterministic extraction.',
        requestId: request.id,
      })
    }

    const aiParsed = await parseWithAiAnalystExtraction({
      fileData,
      mimeType,
      standard,
      effectiveMode,
      fileName,
    })

    if (!aiParsed) {
      return response.status(422).json({
        error: 'Structured extraction could not be parsed. Try resilient local mode, CSV/XLSX, or a cleaner PDF export.',
        requestId: request.id,
      })
    }

    aiParsed._extraction = {
      ...(aiParsed._extraction || {}),
      sourceType: 'ai-analyst-fallback',
      confidence: aiParsed._extraction?.confidence || 86,
      warnings: aiParsed._extraction?.warnings || [],
      matchedFields: CORE_LOCAL_FIELDS.filter((field) => Array.isArray(aiParsed[field]) && aiParsed[field].some((value) => value !== null && value !== undefined)),
      sources: aiParsed._extraction?.sources || {},
      reviewed: false,
    }

    if (!aiParsed.company) {
      return response.status(422).json({
        error: 'No company data was detected in the uploaded document.',
        requestId: request.id,
      })
    }

    rememberParse(cacheKey, aiParsed)
    return response.json(aiParsed)
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

  const prompt = `You are a senior financial analyst.

Write a concise executive memo in plain text using the following data:
Company: ${companyData.company}
Period: ${companyData.period}
Currency: ${companyData.currency || 'EUR'}
Revenue trend: ${revenue.map(fmtN).join(' -> ')}
Net income trend: ${netIncome.map(fmtN).join(' -> ')}
Current assets: ${fmtN(last(companyData.currentAssets))}
Current liabilities: ${fmtN(last(companyData.currentLiabilities))}
Cash: ${fmtN(last(companyData.cash))}
Operating cash flow: ${fmtN(last(companyData.cashFlow))}
Debt: ${fmtN(last(companyData.debt))}
Flags: ${(companyData.flags || []).map((flag) => `[${flag.level}] ${flag.text}`).join(' | ') || 'none'}

Return four short sections with these headings:
EXECUTIVE SUMMARY
LIQUIDITY VIEW
KEY RISKS
RECOMMENDATION`

  try {
    const payload = await callAiAnalyst({
      content: prompt,
      maxTokens: 900,
    })
    const report = payload.content?.map((block) => block.text || '').join('') || ''
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
  response.status(500).json({
    error: error.message || 'Unexpected server error',
    requestId: request.id,
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`FinScan server running on http://localhost:${PORT}`)
  if (!AI_ANALYST_API_KEY) {
    console.log('AI_ANALYST_API_KEY not configured: local PDF/CSV parsing and frontend analysis remain available.')
  }
})
