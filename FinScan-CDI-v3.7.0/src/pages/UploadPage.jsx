import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { fileToBase64, parseCSVText, parseFile, parseSpreadsheetFile } from '../lib/api'
import { parsePdfLocally } from '../lib/pdfLocal'
import { buildSampleData, STD_DESC, STD_LABELS } from '../lib/finance'
import { SECTOR_OPTIONS } from '../lib/companyData'
import { REVIEW_CURRENCY_CODES, UNKNOWN_CURRENCY, currencyLabel, normalizeCurrencyCode } from '../lib/currency'

import { updateReviewedValue, reviewValidationMessage } from '../lib/review'

const ALLOWED = ['pdf', 'csv', 'xlsx', 'png', 'jpg', 'jpeg']
const FILE_ICONS = { pdf: 'PDF', csv: 'CSV', xlsx: 'XLS', xls: 'XLS', png: 'IMG', jpg: 'IMG', jpeg: 'IMG' }
const REVIEW_FIELDS = [
  ['revenue', 'Revenue'],
  ['grossProfit', 'Gross Profit'],
  ['ebit', 'EBIT'],
  ['netIncome', 'Net Income'],
  ['totalAssets', 'Total Assets'],
  ['totalLiabilities', 'Total Liabilities'],
  ['equity', 'Equity'],
  ['retainedEarnings', 'Retained Earnings'],
  ['shareCapital', 'Share Capital'],
  ['reserves', 'Reserves'],
  ['currentAssets', 'Current Assets'],
  ['currentLiabilities', 'Current Liabilities'],
  ['receivables', 'Receivables'],
  ['payables', 'Payables'],
  ['inventory', 'Inventory'],
  ['cash', 'Cash'],
  ['cashFlow', 'Operating Cash Flow'],
  ['debt', 'Debt'],
  ['fixedAssets', 'Fixed Assets'],
  ['interest', 'Interest Expense'],
  ['tax', 'Income Tax'],
]

const REVIEW_SCALAR_FIELDS = [
  ['dotAmort', 'Depreciation / Amortization'],
  ['prevDotAmort', 'Prior Depreciation / Amortization'],
  ['curSGA', 'Current SG&A / Operating Expenses'],
  ['prevSGA', 'Prior SG&A / Operating Expenses'],
  ['cogs', 'Cost of Goods Sold'],
]

export default function UploadPage() {
  const {
    standard,
    setStandard,
    addOrUpdateCompany,
    setActivePage,
    addToast,
    parseMode,
    setParseMode,
    reportLanguage,
    setReportLanguage,
    backendUrl,
    cachedStatements,
    restoreCachedStatement,
    removeCachedStatement,
    clearCachedStatements,
  } = useStore()
  const [analysisSector, setAnalysisSector] = useState('general')
  const [queue, setQueue] = useState([])
  const [reviewItems, setReviewItems] = useState([])
  const [parsing, setParsing] = useState(false)
  const [parseMsg, setParseMsg] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)
  const sourceUrls=useRef([])
  useEffect(()=>()=>sourceUrls.current.forEach(url=>URL.revokeObjectURL(url)),[])
  function openSource(file) {
    if(!file) return
    const url=URL.createObjectURL(file);sourceUrls.current.push(url)
    window.open(url,'_blank','noopener,noreferrer')
  }

  const [form, setForm] = useState({
    company: '',
    year: '2024',
    currency: 'MAD',
    unit: '1',
    revenue: '',
    cogs: '',
    grossProfit: '',
    opex: '',
    ebit: '',
    interest: '',
    tax: '',
    netIncome: '',
    totalAssets: '',
    totalLiabilities: '',
    currentAssets: '',
    currentLiab: '',
    equity: '',
    retainedEarnings: '',
    shareCapital: '',
    reserves: '',
    inventory: '',
    receivables: '',
    payables: '',
    cash: '',
    fixedAssets: '',
    debt: '',
    prevRevenue: '',
    prevNetIncome: '',
    prevAssets: '',
    prevTotalLiabilities: '',
    prevCurrentAssets: '',
    prevCurrentLiab: '',
    prevFixedAssets: '',
    prevReceivables: '',
    prevGrossProfit: '',
    prevDotAmort: '',
    prevSGA: '',
    curSGA: '',
    cashFlow: '',
    chPersonnel: '',
    dotAmort: '',
    autresCharges: '',
    resFinancier: '',
  })

  const isFrench = standard === 'french' || standard === 'moroccan'
  const pendingCount = queue.filter((file) => file.status === 'pending').length

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function getFieldNumber(key) {
    return parseFloat(form[key]) || 0
  }

  function enqueue(files) {
    const incoming = Array.from(files || [])
    const additions = []

    incoming.forEach((file) => {
      const ext = file.name.split('.').pop().toLowerCase()
      if (file.size > 45 * 1024 * 1024) { addToast(file.name + ': maximum file size is 45 MB', 'warn'); return }
      if (!ALLOWED.includes(ext)) {
        addToast(`Skipped ${file.name} - unsupported format`, 'warn')
        return
      }
      if (queue.length + additions.length >= 5) {
        addToast('Maximum 5 files at once', 'warn')
        return
      }
      if ([...queue,...additions].some((entry) => entry.name === file.name)) {
        addToast(`${file.name} is already queued`, 'warn')
        return
      }
      additions.push({ file, name: file.name, ext, status: 'pending', error: null })
    })

    if (additions.length) {
      setQueue((prev) => [...prev, ...additions])
    }
  }

  function updateStatus(name, status, error = null) {
    setQueue((prev) => prev.map((file) => (file.name === name ? { ...file, status, error } : file)))
  }

  function removeFromQueue(name) {
    setQueue((prev) => prev.filter((file) => file.name !== name))
  }

  function clearQueue() {
    setQueue([])
  }

  function updateReviewItem(id, updater) {
    setReviewItems((prev) => prev.map((item) => (
      item.id === id ? { ...item, data: updater(item.data) } : item
    )))
  }

  function setReviewMeta(id, key, value) {
    updateReviewItem(id, (data) => {
      const nextValue = key === 'currency' ? value.toUpperCase().trim() : value
      const next = { ...data, [key]: nextValue }
      if (key === 'currency') {
        const normalized = normalizeCurrencyCode(nextValue)
        const code = normalized?.code
        next.currency = code || nextValue
        next.originalCurrency = code || nextValue
        next.currencyConfidence = normalized?.confidence || 'none'
        next.currencySource = normalized?.source || 'manual review'
        next._extraction = {
          ...(data._extraction || {}),
          currencyCode: code || UNKNOWN_CURRENCY,
          currencyConfidence: next.currencyConfidence,
          currencySource: next.currencySource,
          currencyReviewRequired: !code || code === UNKNOWN_CURRENCY || next.currencyConfidence === 'ambiguous',
        }
      }
      return next
    })
  }

  function currencyNeedsReview(data) {
    const normalized = normalizeCurrencyCode(data?.currency || data?.originalCurrency)
    return !normalized?.code || normalized.code === UNKNOWN_CURRENCY || data?._extraction?.currencyReviewRequired || data?.currencyConfidence === 'ambiguous'
  }

  function setReviewYear(id, index, value) {
    updateReviewItem(id, (data) => {
      const years = [...(data.years || [])]
      years[index] = value
      return { ...data, years, period: years[years.length - 1] || data.period }
    })
  }

  function setReviewNumber(id,field,index,value) {updateReviewItem(id,data=>updateReviewedValue(data,field,index,value))}
  function setReviewScalarNumber(id,field,value) {updateReviewItem(id,data=>updateReviewedValue(data,field,0,value))}

  function acceptReviewItem(id) {
    const item = reviewItems.find((entry) => entry.id === id)
    if (!item) return
    const validation=reviewValidationMessage(item.data)
    if(validation) {addToast(validation,'warn');return}
    if (currencyNeedsReview(item.data)) {
      addToast(`Confirm the source currency for ${item.name} before accepting`, 'warn')
      return
    }
    addOrUpdateCompany({
      ...item.data,
      sector: item.data.sector || analysisSector,
      reportLanguage,
      _extraction: {
        ...(item.data._extraction || {}),
        reviewed: true,
        reviewedAt: new Date().toISOString(),
      },
    })
    setReviewItems((prev) => prev.filter((entry) => entry.id !== id))
    addToast(`${item.data.company || item.name} added to analysis`, 'info')
    setActivePage('liquidity')
  }

  function acceptAllReviewItems() {
    const readyItems = reviewItems.filter((item) => !currencyNeedsReview(item.data) && !reviewValidationMessage(item.data))
    const blockedCount = reviewItems.length - readyItems.length
    if (!readyItems.length) {
      addToast('Confirm source currency for the reviewed files before accepting', 'warn')
      return
    }
    readyItems.forEach((item) => {
      addOrUpdateCompany({
        ...item.data,
        sector: item.data.sector || analysisSector,
        reportLanguage,
        _extraction: {
          ...(item.data._extraction || {}),
          reviewed: true,
          reviewedAt: new Date().toISOString(),
        },
      })
    })
    const count = readyItems.length
    setReviewItems((prev) => prev.filter((item) => currencyNeedsReview(item.data) || reviewValidationMessage(item.data)))
    if (count) {
      addToast(`${count} reviewed compan${count > 1 ? 'ies' : 'y'} added to analysis`, 'info')
      setActivePage('compare')
    }
    if (blockedCount) {
      addToast(`${blockedCount} file${blockedCount > 1 ? 's need' : ' needs'} currency confirmation`, 'warn')
    }
  }

  function discardReviewItem(id) {
    setReviewItems((prev) => prev.filter((entry) => entry.id !== id))
  }

  async function parseAll() {
    const pending = queue.filter((file) => file.status === 'pending')
    if (!pending.length) return

    setParsing(true)

    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index]
      setParseMsg(`Parsing ${item.name} (${index + 1}/${pending.length})...`)
      updateStatus(item.name, 'parsing')

      try {
        let data

        if (item.ext === 'pdf') {
          // Try fully local PDF parsing first (no backend, no AI).
          try {
            data = await parsePdfLocally(item.file, {
              fileName: item.name,
              standard,
              onProgress: (info) => {
                if (info.stage === 'ocr-start') {
                  setParseMsg(`OCR fallback: scanning ${info.pageCount}-page image PDF — this may take a minute...`)
                } else if (info.stage === 'init') {
                  setParseMsg(`Loading OCR engine (French + English language data)...`)
                } else if (info.stage === 'page') {
                  setParseMsg(`OCR: reading page ${info.page} of ${info.total}...`)
                } else if (info.stage === 'recognize') {
                  // very granular updates from tesseract — only show occasionally
                }
              },
            })
          } catch (localErr) {
            const allowBackendFallback = parseMode === 'balanced'
            if (!allowBackendFallback) {
              throw new Error(`${item.name}: ${localErr.message} (Switch to "Local + AI Analyst" mode in the Upload settings to allow optional backend fallback.)`)
            }

            const base64 = await fileToBase64(item.file)
            data = await parseFile({
              fileData: base64,
              mimeType: 'application/pdf',
              fileName: item.name,
              standard,
              parseMode,
              fileSize: item.file.size,
              backendUrl,
            })
            data._extraction = {
              ...(data._extraction || {}),
              sourceType: data._extraction?.sourceType || 'pdf-backend',
              backendUsed: true,
              localFallbackReason: localErr.message,
              warnings: data._extraction?.warnings || [],
              matchedFields: data._extraction?.matchedFields || [],
              sources: data._extraction?.sources || {},
              reviewed: false,
            }
          }
        } else if (['png', 'jpg', 'jpeg'].includes(item.ext)) {
          try {
            const { ocrImageToCompany } = await import('../lib/pdfOcr')
            const { company } = await ocrImageToCompany(item.file, {
              standard,
              onProgress: (info) => {
                if (info.stage === 'init') {
                  setParseMsg(`Loading OCR engine (French + English language data)...`)
                } else if (info.stage === 'page') {
                  setParseMsg(`OCR: reading image ${item.name}...`)
                }
              },
            })
            data = company
          } catch (localErr) {
            const allowBackendFallback = parseMode === 'balanced'
            if (!allowBackendFallback) {
              throw new Error(`${item.name}: ${localErr.message} (Switch to "Local + AI Analyst" mode in the Upload settings to allow optional Gemini fallback.)`)
            }
            const base64 = await fileToBase64(item.file)
            data = await parseFile({
              fileData: base64,
              mimeType: item.file.type || (item.ext === 'png' ? 'image/png' : 'image/jpeg'),
              fileName: item.name,
              standard,
              parseMode,
              fileSize: item.file.size,
              backendUrl,
            })
            data._extraction = {
              ...(data._extraction || {}),
              sourceType: data._extraction?.sourceType || 'image-openai-fallback',
              backendUsed: true,
              localFallbackReason: localErr.message,
              reviewed: false,
            }
          }
        } else if (item.ext === 'csv') {
          const text = await item.file.text()
          data = parseCSVText(text, { fileName: item.name, standard })
          if (!data) throw new Error('Could not extract enough structured data from the CSV')
        } else if (item.ext === 'xlsx') {
          data = await parseSpreadsheetFile(item.file, { fileName: item.name, standard })
          if (!data) throw new Error('Could not extract enough structured data from the Excel workbook')
        }

        if(parseMode==='balanced' && data?._extraction?.ocrUsed && (data._extraction.missingCritical?.length || data._extraction.warnings?.some(w=>/separator|unclear|confidence/i.test(w)))) {
          try {
            setParseMsg('Checking difficult scan with the optional AI analyst...')
            data=await parseFile({fileData:await fileToBase64(item.file),mimeType:item.ext==='pdf'?'application/pdf':item.file.type,fileName:item.name,standard,parseMode,backendUrl})
          } catch(error) {data._extraction.warnings.push('AI fallback unavailable; local extraction retained: '+error.message)}
        }
        setReviewItems((prev) => [
          ...prev,
          {
            id: `${item.name}-${Date.now()}-${index}`,
            name: item.name,
            file: item.file,
            data: {
              ...data,
              _filename: item.name,
              standard: data.standard || standard,
              sector: data.sector || analysisSector,
              reportLanguage,
            },
          },
        ])

        updateStatus(item.name, 'review')
      } catch (error) {
        updateStatus(item.name, 'error', error.message)
        addToast(`Failed: ${item.name} - ${error.message}`, 'error')
      }
    }

    setParseMsg('Done - review the extracted figures before adding them to analysis')
    setParsing(false)
  }

  function loadManual() {
    const unit = parseInt(form.unit, 10) || 1
    const hasInput = (key) => form[key] !== '' && form[key] !== null && form[key] !== undefined && Number.isFinite(Number(form[key]))
    const value = (key) => hasInput(key) ? Number(form[key]) * unit : null
    const revenue = value('revenue')
    const manualCurrency = normalizeCurrencyCode(form.currency)

    if (revenue === null) {
      addToast('Please enter at least Revenue', 'warn')
      return
    }
    if (!/^20\d{2}$/.test(form.year) || !form.company.trim()) {addToast('Enter a company name and valid four-digit fiscal year','warn');return}
    if (!manualCurrency?.code) {
      addToast('Please enter a valid ISO source currency code', 'warn')
      return
    }

    const fields = {}
    const missingFields = new Set()
    const missingPreviousFields = new Set()
    const addFieldMeta = (field, status, formula = '') => {
      fields[field] = {
        status,
        confidence: status === 'missing' ? 0 : 100,
        ...(formula ? { formula } : {}),
        evidence: [{ source: 'manual entry', label: 'Manual Entry' }],
      }
    }
    const addSeries = (field, current, previous = null, status = 'reviewed', formula = '') => {
      const hasCurrent = Number.isFinite(current)
      const hasPrevious = Number.isFinite(previous)
      if (!hasCurrent) missingFields.add(field)
      if (!hasPrevious) missingPreviousFields.add(field)
      addFieldMeta(field, hasCurrent ? status : 'missing', formula)
      return [hasPrevious ? previous : null, hasCurrent ? current : null]
    }
    const addScalar = (field, current, status = 'reviewed', formula = '') => {
      const hasCurrent = Number.isFinite(current)
      addFieldMeta(field, hasCurrent ? status : 'missing', formula)
      return hasCurrent ? current : null
    }

    const cogsInput = value('cogs')
    const grossProfitInput = value('grossProfit')
    const grossProfit = grossProfitInput ?? (Number.isFinite(cogsInput) ? revenue - cogsInput : null)
    const grossProfitStatus = grossProfitInput !== null ? 'reviewed' : Number.isFinite(grossProfit) ? 'derived' : 'missing'
    const cogs = cogsInput ?? (Number.isFinite(grossProfitInput) ? revenue - grossProfitInput : null)

    const assets = value('totalAssets')
    const liabilities = value('totalLiabilities')
    const equityInput = value('equity')
    const equity = equityInput ?? (Number.isFinite(assets) && Number.isFinite(liabilities) ? assets - liabilities : null)
    const equityStatus = equityInput !== null ? 'reviewed' : Number.isFinite(equity) ? 'derived' : 'missing'

    const currentAssets = value('currentAssets')
    const currentLiabilities = value('currentLiab')
    const fixedAssets = value('fixedAssets')
    const receivables = value('receivables')
    const payables = value('payables')
    const cash = value('cash')
    const inventory = value('inventory')
    const ebit = value('ebit')
    const netIncome = value('netIncome')
    const operatingCashFlow = value('cashFlow')
    const debt = value('debt')

    const prevRevenue = value('prevRevenue')
    const prevAssets = value('prevAssets')
    const prevLiabilities = value('prevTotalLiabilities')
    const prevCurrentAssets = value('prevCurrentAssets')
    const prevCurrentLiabilities = value('prevCurrentLiab')
    const prevFixedAssets = value('prevFixedAssets')
    const prevReceivables = value('prevReceivables')
    const prevGrossProfit = value('prevGrossProfit')
    const prevNetIncome = value('prevNetIncome')

    addOrUpdateCompany({
      company: form.company || 'Your Company',
      period: form.year || '2024',
      standard,
      currency: manualCurrency.code,
      originalCurrency: manualCurrency.code,
      currencyConfidence: 'high',
      currencySource: 'manual entry',
      sector: analysisSector,
      _filename: 'Manual Entry',
      reportLanguage,
      years: [String(parseInt(form.year || '2024', 10) - 1), form.year || '2024'],
      revenue: addSeries('revenue', revenue, prevRevenue),
      netIncome: addSeries('netIncome', netIncome, prevNetIncome),
      grossProfit: addSeries('grossProfit', grossProfit, prevGrossProfit, grossProfitStatus, grossProfitStatus === 'derived' ? 'revenue - cogs' : ''),
      ebit: addSeries('ebit', ebit, null),
      totalAssets: addSeries('totalAssets', assets, prevAssets),
      totalLiabilities: addSeries('totalLiabilities', liabilities, prevLiabilities),
      equity: addSeries('equity', equity, null, equityStatus, equityStatus === 'derived' ? 'totalAssets - totalLiabilities' : ''),
      retainedEarnings: addSeries('retainedEarnings', value('retainedEarnings'), null),
      shareCapital: addSeries('shareCapital', value('shareCapital'), null),
      reserves: addSeries('reserves', value('reserves'), null),
      currentAssets: addSeries('currentAssets', currentAssets, prevCurrentAssets),
      currentLiabilities: addSeries('currentLiabilities', currentLiabilities, prevCurrentLiabilities),
      fixedAssets: addSeries('fixedAssets', fixedAssets, prevFixedAssets),
      receivables: addSeries('receivables', receivables, prevReceivables),
      payables: addSeries('payables', payables, null),
      cash: addSeries('cash', cash, null),
      inventory: addSeries('inventory', inventory, null),
      interest: [value('interest') * 0.9, value('interest')],
      tax: [value('tax') * 0.9, value('tax')],
      cashFlow: addSeries('cashFlow', operatingCashFlow, null),
      debt: addSeries('debt', debt, null),
      cogs: addScalar('cogs', cogs, cogsInput !== null ? 'reviewed' : Number.isFinite(cogs) ? 'derived' : 'missing', cogsInput === null && Number.isFinite(cogs) ? 'revenue - grossProfit' : ''),
      chPersonnel: value('chPersonnel'),
      dotAmort: addScalar('dotAmort', value('dotAmort')),
      prevDotAmort: addScalar('prevDotAmort', value('prevDotAmort')),
      autresCharges: value('autresCharges'),
      resFinancier: value('resFinancier'),
      curSGA: addScalar('curSGA', value('curSGA') ?? value('opex')),
      prevSGA: addScalar('prevSGA', value('prevSGA')),
      prevRevenue,
      prevGrossProfit,
      prevReceivables,
      prevTotalAssets: prevAssets,
      prevNetIncome,
      _missingFields: Array.from(missingFields),
      _missingPreviousFields: Array.from(missingPreviousFields),
      _extraction: {
        schemaVersion: '3.7',
        provider: 'manual',
        reviewed: true,
        fields,
        matchedFields: Object.entries(fields).filter(([, meta]) => meta.status !== 'missing').map(([field]) => field),
        warnings: missingFields.size || missingPreviousFields.size
          ? ['Manual entry leaves undisclosed fields as missing; no percentage proxies were created.']
          : [],
      },
    })

    setActivePage('liquidity')
  }

  function loadSample() {
    addOrUpdateCompany({ ...buildSampleData(standard), sector: analysisSector, reportLanguage })
    setActivePage('liquidity')
  }

  function restoreCached(id) {
    const entry = cachedStatements.find((item) => item.id === id)
    restoreCachedStatement(id)
    if (entry) addToast(`${entry.company || 'Cached statement'} restored for this session`, 'info')
    setActivePage('liquidity')
  }

  function forgetCached(id) {
    removeCachedStatement(id)
    addToast('Cached statement removed', 'info')
  }

  function clearCached() {
    clearCachedStatements()
    addToast('Cached statement archive cleared', 'info')
  }

  return (
    <div>
      <datalist id="currency-options">
        {REVIEW_CURRENCY_CODES.map((currency) => (
          <option key={currency} value={currency}>{currencyLabel(currency)}</option>
        ))}
      </datalist>
      <div className="page-header">
        <div className="page-header-text">
          <div className="workspace-eyebrow">FINANCIAL INTELLIGENCE / NEW ANALYSIS</div>
          <h2>Start with the numbers.</h2>
          <p>Load PDF, image, CSV, or XLSX statements, then review the detected currency before running analysis.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">01 / Configure your analysis</div>
        <div className="std-tabs">
          {Object.entries(STD_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`std-tab${standard === key ? ' active' : ''}`}
              onClick={() => setStandard(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
          {STD_DESC[standard]}
        </div>

        <div className="form-row" style={{ marginTop: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Sector Benchmark</label>
            <select value={analysisSector} onChange={(event) => setAnalysisSector(event.target.value)}>
              {SECTOR_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Report Language</label>
            <select value={reportLanguage} onChange={(event) => setReportLanguage(event.target.value)}>
              <option value="english">English analysis</option>
              <option value="french">Analyse en francais</option>
            </select>
            <div className="table-subnote">This language is stored with each reviewed company and used by reports.</div>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>PDF Extraction Mode</label>
            <div className="std-tabs" style={{ marginBottom: 0 }}>
              <button
                className={`std-tab${parseMode === 'resilient' ? ' active' : ''}`}
                onClick={() => setParseMode('resilient')}
              >
                Local Only
              </button>
              <button
                className={`std-tab${parseMode === 'balanced' ? ' active' : ''}`}
                onClick={() => setParseMode('balanced')}
              >
                Local + AI Analyst
              </button>
            </div>
            <div className="table-subnote">
              Local Only: deterministic in-browser PDF text extraction. No backend, no API key.
              Local + AI Analyst: tries local first; falls back to optional Gemini-assisted extraction only if local extraction fails.
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Visual Mode</label>
            <div style={{ fontSize: 13, color: 'var(--text2)', padding: '9px 12px', background: 'var(--surface2)', borderRadius: 8, minHeight: 42 }}>
              Switch between light and dark using the theme control at the top of your workspace.
            </div>
          </div>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload financial statements"
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileRef.current?.click() } }}
        className={`upload-zone${drag ? ' drag' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDrag(false)
          enqueue(event.dataTransfer.files)
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 12, fontFamily: 'DM Mono, monospace' }}>↑</div>
        <h3>Drop files here or click to browse</h3>
        <p style={{ marginBottom: 8 }}>PDF, image scans, CSV and XLSX files are ready to parse now.</p>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Text PDFs and spreadsheets parse locally first. Scanned PDFs and images use OCR, then optional Gemini fallback in Local + AI Analyst mode.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => {
            enqueue(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {cachedStatements.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Cached Statements ({cachedStatements.length})</div>
              <div className="table-subnote">
                Cached statements are kept only for manual restore. A new app start opens with an empty analysis workspace.
              </div>
            </div>
            <button className="btn sm" onClick={clearCached}>Clear Cache</button>
          </div>

          {cachedStatements.slice(0, 6).map((entry) => (
            <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, minWidth: 36, fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                CACHE
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.company || 'Unknown Company'}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  {entry.period || 'No period'} | {entry.currency || 'UNKNOWN'}{entry.filename ? ` | ${entry.filename}` : ''}
                </div>
              </div>
              <button className="btn sm primary" onClick={() => restoreCached(entry.id)}>Restore</button>
              <button className="btn sm" onClick={() => forgetCached(entry.id)}>Forget</button>
            </div>
          ))}
        </div>
      )}

      {queue.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <div className="card-title">Files Queued ({queue.length})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm primary" onClick={parseAll} disabled={parsing || !pendingCount}>
                {parsing ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} /> Parsing...
                  </>
                ) : (
                  `Parse ${pendingCount} File${pendingCount !== 1 ? 's' : ''} ->`
                )}
              </button>
              <button className="btn sm" onClick={clearQueue}>Clear</button>
            </div>
          </div>

          {queue.map((file) => (
            <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, minWidth: 30, fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                {FILE_ICONS[file.ext] || 'DOC'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  {(file.file.size / 1024).toFixed(1)} KB | {file.ext.toUpperCase()}
                  {file.error && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{file.error}</span>}
                </div>
              </div>
              <span className={`badge ${file.status === 'review' ? 'medium' : file.status === 'done' ? 'low' : file.status === 'error' ? 'high' : file.status === 'parsing' ? 'medium' : 'info'}`}>
                {file.status === 'parsing' ? 'Parsing...' : file.status === 'review' ? 'Review' : file.status === 'done' ? 'Done' : file.status === 'error' ? 'Error' : 'Pending'}
              </span>
              {file.status === 'pending' && <button className="btn sm" onClick={() => removeFromQueue(file.name)}>X</button>}
            </div>
          ))}

          {parseMsg && (
            <div style={{ padding: '8px 0', fontSize: 13, color: parsing ? 'var(--warn)' : 'var(--brand)', fontWeight: 500 }}>
              {parsing ? (
                <span className="thinking">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  {' '}
                  {parseMsg}
                </span>
              ) : parseMsg}
            </div>
          )}
        </div>
      )}

      {reviewItems.length > 0 && (
        <div className="card extraction-review-card">
          <div className="card-header">
            <div>
              <div className="card-title">Extraction Review ({reviewItems.length})</div>
              <div className="table-subnote">
                Confirm the detected figures before they become part of the analysis workspace.
              </div>
            </div>
            <button className="btn sm primary" onClick={acceptAllReviewItems}>
              Accept All Reviewed
            </button>
          </div>

          {reviewItems.map((item) => {
            const data = item.data
            const extraction = data._extraction || {}
            const years = data.years?.length ? data.years : [data.period || '2024']
            const confidence = extraction.confidence ?? 70
            const confidenceLevel = confidence >= 80 ? 'low' : confidence >= 55 ? 'medium' : 'high'

            return (
              <div key={item.id} className="review-item">
                <div className="review-head">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="table-subnote">
                      Matched {(extraction.matchedFields || []).length} fields from {extraction.sourceType || 'uploaded file'}.
                    </div>
                  </div>
                  <div className="review-actions">
                    <span className={`badge ${confidenceLevel}`}>{confidence}% confidence</span>
                    <button className="btn sm" onClick={() => openSource(item.file)}>View source</button>
                    <button className="btn sm" onClick={() => discardReviewItem(item.id)}>Discard</button>
                    <button className="btn sm primary" onClick={() => acceptReviewItem(item.id)}>Accept</button>
                  </div>
                </div>

                {extraction.warnings?.length > 0 && (
                  <div className="review-warning-list">
                    {extraction.warnings.map((warning) => (
                      <span key={warning} className="badge medium">{warning}</span>
                    ))}
                  </div>
                )}

                <div className="review-meta-grid">
                  <label>
                    Company
                    <input value={data.company || ''} onChange={(event) => setReviewMeta(item.id, 'company', event.target.value)} />
                  </label>
                  <label>
                    Currency
                    <input
                      list="currency-options"
                      value={data.currency === UNKNOWN_CURRENCY ? '' : (data.currency || '')}
                      placeholder="e.g. MAD"
                      onChange={(event) => setReviewMeta(item.id, 'currency', event.target.value)}
                    />
                    {currencyNeedsReview(data) && (
                      <span className="table-subnote" style={{ color: 'var(--warn)' }}>
                        Confirm the source currency before accepting this file.
                      </span>
                    )}
                  </label>
                  <label>
                    Latest Period
                    <input value={data.period || years[years.length - 1] || ''} onChange={(event) => setReviewMeta(item.id, 'period', event.target.value)} />
                  </label>
                  <label>
                    Sector
                    <select value={data.sector || analysisSector} onChange={(event) => setReviewMeta(item.id, 'sector', event.target.value)}>
                      {SECTOR_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="review-table-wrap">
                  <table className="dt review-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        {years.map((year, index) => (
                          <th key={`${item.id}-year-${index}`}>
                            <input
                              className="review-year-input"
                              value={year}
                              onChange={(event) => setReviewYear(item.id, index, event.target.value)}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {REVIEW_FIELDS.map(([field, label]) => {
                        const values = Array.isArray(data[field]) ? data[field] : [data[field] ?? null]
                        const fieldMeta = extraction.fields?.[field]
                        return (
                          <tr key={field}>
                            <td>
                              <strong>{label}</strong>
                              {fieldMeta?.status && (
                                <span className={`badge ${fieldMeta.status === 'missing' ? 'high' : fieldMeta.status === 'derived' ? 'medium' : 'low'}`} style={{ marginLeft: 8 }}>
                                  {fieldMeta.status}
                                </span>
                              )}
                              {(fieldMeta?.evidence?.[0] || extraction.sources?.[field]) && (
                                <div className="table-subnote">
                                  Source: {fieldMeta?.evidence?.[0]?.page ? `p.${fieldMeta.evidence[0].page} - ` : ''}
                                  {fieldMeta?.evidence?.[0]?.cell ? `${fieldMeta.evidence[0].sheet || 'Sheet'} ${fieldMeta.evidence[0].cell} - ` : ''}
                                  {fieldMeta?.formula || fieldMeta?.evidence?.[0]?.label || extraction.sources[field]?.label}
                                </div>
                              )}
                            </td>
                            {years.map((year, index) => (
                              <td key={`${field}-${year}`} className="num">
                                <input
                                  className="review-number-input"
                                  type="number" step="any"
                                  value={fieldMeta?.status === 'missing' && !values[index] ? '' : (values[index] ?? '')}
                                  onChange={(event) => setReviewNumber(item.id, field, index, event.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="review-scalar-grid">
                  {REVIEW_SCALAR_FIELDS.map(([field, label]) => {
                    const fieldMeta = extraction.fields?.[field]
                    const value = data[field]
                    return (
                      <label key={field}>
                        {label}
                        <input
                          type="number" step="any"
                          value={fieldMeta?.status === 'missing' && !value ? '' : (value ?? '')}
                          onChange={(event) => setReviewScalarNumber(item.id, field, event.target.value)}
                        />
                        {(fieldMeta?.status || fieldMeta?.evidence?.[0] || extraction.sources?.[field]) && (
                          <span className="table-subnote">
                            {fieldMeta?.status && `${fieldMeta.status} `}
                            {fieldMeta?.evidence?.[0]?.page ? `p.${fieldMeta.evidence[0].page} ` : ''}
                            {fieldMeta?.evidence?.[0]?.cell ? `${fieldMeta.evidence[0].sheet || 'Sheet'} ${fieldMeta.evidence[0].cell} ` : ''}
                            {fieldMeta?.formula || fieldMeta?.evidence?.[0]?.label || extraction.sources?.[field]?.label || ''}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '1.2rem 0', color: 'var(--text2)', fontSize: 13 }}>- or enter manually -</div>

      <div className="card">
        <div className="card-title">{`Manual Entry - ${STD_LABELS[standard]}`}</div>

        <div className="form-row">
          <div className="form-group">
            <label>Company Name</label>
            <input value={form.company} onChange={(event) => setField('company', event.target.value)} placeholder="e.g. KAMEL MZABI SUARL" />
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
    </div>
  )
}
