import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { fileToBase64, parseCSVText, parseFile, parseSpreadsheetFile } from '../lib/api'
import { parsePdfLocally } from '../lib/pdfLocal'
import { buildSampleData, STD_DESC, STD_LABELS } from '../lib/finance'
import { SECTOR_OPTIONS } from '../lib/companyData'
import { REVIEW_CURRENCY_CODES, UNKNOWN_CURRENCY, currencyLabel, normalizeCurrencyCode } from '../lib/currency'
import { updateReviewedValue, reviewValidationMessage } from '../lib/review'
import { ALLOWED } from './upload/constants'
import CachedStatementsCard from './upload/CachedStatementsCard'
import FileQueueCard from './upload/FileQueueCard'
import ExtractionReviewCard from './upload/ExtractionReviewCard'
import ManualEntryCard from './upload/ManualEntryCard'

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
          <div className="workspace-eyebrow">STATEMENTS / INTAKE</div>
          <h2>Financial statements</h2>
          <p>Load PDF, image, CSV, or XLSX statements, then review the detected currency before running analysis.</p>
        </div>
      </div>

      <div className="intake-grid">
      <div className="card intake-parameters">
        <div className="card-title">Analysis parameters</div>
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
        <div className="intake-file-types" aria-hidden="true"><span>PDF</span><span>CSV</span><span>XLSX</span></div>
        <div className="intake-upload-glyph" aria-hidden="true">↑</div>
        <h3>Add your statements</h3>
        <p style={{ marginBottom: 8 }}>Drop files here, or select to browse. Image scans are also supported.</p>
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

      </div>

      <CachedStatementsCard cachedStatements={cachedStatements} clearCached={clearCached} forgetCached={forgetCached} restoreCached={restoreCached} />

      <FileQueueCard
        queue={queue}
        parsing={parsing}
        parseMsg={parseMsg}
        pendingCount={pendingCount}
        parseAll={parseAll}
        clearQueue={clearQueue}
        removeFromQueue={removeFromQueue}
      />

      <ExtractionReviewCard
        reviewItems={reviewItems}
        analysisSector={analysisSector}
        currencyNeedsReview={currencyNeedsReview}
        openSource={openSource}
        setReviewMeta={setReviewMeta}
        setReviewYear={setReviewYear}
        setReviewNumber={setReviewNumber}
        setReviewScalarNumber={setReviewScalarNumber}
        acceptReviewItem={acceptReviewItem}
        acceptAllReviewItems={acceptAllReviewItems}
        discardReviewItem={discardReviewItem}
      />

      <div style={{ textAlign: 'center', margin: '1.2rem 0', color: 'var(--text2)', fontSize: 13 }}>- or enter manually -</div>

      <ManualEntryCard form={form} setField={setField} standard={standard} isFrench={isFrench} loadManual={loadManual} loadSample={loadSample} />
    </div>
  )
}
