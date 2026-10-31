export const MONEY_ARRAY_FIELDS = [
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
  'payables',
  'cash',
  'inventory',
  'interest',
  'tax',
  'cashFlow',
  'debt',
  'retainedEarnings',
  'shareCapital',
  'reserves',
]

export const MONEY_SCALAR_FIELDS = [
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
]

export const FIELD_LABELS = {
  revenue: { en: 'Revenue', fr: "Chiffre d'affaires" },
  netIncome: { en: 'Net Income', fr: 'Resultat net' },
  grossProfit: { en: 'Gross Profit', fr: 'Marge brute' },
  ebit: { en: 'EBIT', fr: "Resultat d'exploitation" },
  totalAssets: { en: 'Total Assets', fr: 'Total actif' },
  totalLiabilities: { en: 'Total Liabilities', fr: 'Total passif / dettes' },
  equity: { en: 'Equity', fr: 'Capitaux propres' },
  currentAssets: { en: 'Current Assets', fr: 'Actif circulant' },
  currentLiabilities: { en: 'Current Liabilities', fr: 'Dettes a court terme' },
  fixedAssets: { en: 'Fixed Assets', fr: 'Immobilisations nettes' },
  receivables: { en: 'Receivables', fr: 'Creances clients' },
  payables: { en: 'Payables', fr: 'Dettes fournisseurs' },
  cash: { en: 'Cash', fr: 'Tresorerie' },
  inventory: { en: 'Inventory', fr: 'Stocks' },
  interest: { en: 'Interest Expense', fr: 'Charges financieres' },
  tax: { en: 'Income Tax', fr: 'Impot sur les benefices' },
  cashFlow: { en: 'Operating Cash Flow', fr: "Flux de tresorerie d'exploitation" },
  debt: { en: 'Total Debt', fr: 'Dette financiere totale' },
  retainedEarnings: { en: 'Retained Earnings', fr: 'Report a nouveau / resultats accumules' },
  shareCapital: { en: 'Share Capital', fr: 'Capital social' },
  reserves: { en: 'Reserves', fr: 'Reserves' },
  cogs: { en: 'COGS / Purchases', fr: 'Achats consommes' },
}

export const CRITICAL_FIELDS = [
  'revenue',
  'totalAssets',
  'totalLiabilities',
  'equity',
  'currentAssets',
  'currentLiabilities',
  'netIncome',
]

export const IMPORTANT_FIELDS = [
  'cash',
  'receivables',
  'inventory',
  'payables',
  'cashFlow',
  'ebit',
  'grossProfit',
]

export const OPTIONAL_FIELDS = ['fixedAssets', 'interest', 'tax', 'debt']

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasValue(value) {
  return (Array.isArray(value) ? value : [value]).some(entry => finiteOrNull(entry) !== null)
}

export function hasMeaningfulValue(value) {
  const series = Array.isArray(value) ? value : [value]
  return series.some((entry) => {
    const parsed = finiteOrNull(entry)
    return parsed !== null && Math.abs(parsed) > 1e-9
  })
}

export function normalizeEvidence(source = {}, fallbackLabel = '') {
  const label = source.label || fallbackLabel || ''
  return {
    page: source.page ?? null,
    sheet: source.sheet || null,
    cell: source.cell || source.range || null,
    label,
    snippet: source.snippet || label,
    bbox: source.bbox || null,
  }
}

function latestScalar(value) {
  if (Array.isArray(value)) return finiteOrNull(value[value.length - 1])
  return finiteOrNull(value)
}

function fieldMissing(company, matchedFields, field) {
  return !matchedFields.has(field) || !hasValue(company[field]) || (Array.isArray(company[field]) && company[field].some(value => finiteOrNull(value) === null))
}

function alignSeries(value, yearsLength) {
  if (Array.isArray(value)) {
    if (value.length === yearsLength) return value.map((entry) => finiteOrNull(entry))
    if (value.length > yearsLength) return value.slice(value.length - yearsLength).map((entry) => finiteOrNull(entry))
    return [
      ...Array.from({ length: yearsLength - value.length }, () => null),
      ...value.map((entry) => finiteOrNull(entry)),
    ]
  }
  const parsed = finiteOrNull(value)
  return Array.from({ length: yearsLength }, (_, index) => (
    index === yearsLength - 1 ? parsed : null
  ))
}

function deriveSeriesFromPair(left, right, yearsLength, operation) {
  const a = alignSeries(left, yearsLength)
  const b = alignSeries(right, yearsLength)
  const out = a.map((leftValue, index) => {
    const rightValue = b[index]
    if (leftValue === null || rightValue === null) return null
    return operation(leftValue, rightValue)
  })
  return out.some((entry) => entry !== null && Number.isFinite(entry)) ? out : null
}

function addDerivedField({ company, field, values, formula, inputs, sources, matchedFields, derivedFields }) {
  if (!values || !values.some((value) => Number.isFinite(value))) return false
  const existing = matchedFields.has(field) ? alignSeries(company[field], values.length) : values.map(() => null)
  if (!values.some((value,index) => existing[index] === null && Number.isFinite(value))) return false
  company[field] = values.map((value,index) => existing[index] ?? (Number.isFinite(value) ? value : null))
  matchedFields.add(field)
  derivedFields.add(field)
  sources[field] = {
    label: `Derived: ${formula}`,
    formula,
    inputs,
    derived: true,
    evidence: inputs.map((input) => normalizeEvidence(sources[input], input)),
  }
  return true
}

export function applyDeterministicDerivations(company, context = {}) {
  const yearsLength = Math.max(1, Array.isArray(company.years) && company.years.length ? company.years.length : 1)
  const matchedFields = new Set(context.matchedFields || company._extraction?.matchedFields || [])
  const sources = context.sources || { ...(company._extraction?.sources || {}) }
  const derivedFields = new Set(context.derivedFields || company._extraction?.derivedFields || [])
  const accepted = field => matchedFields.has(field) && hasValue(company[field])

  if (fieldMissing(company, matchedFields, 'grossProfit') && accepted('revenue') && accepted('cogs')) {
    addDerivedField({
      company,
      field: 'grossProfit',
      values: deriveSeriesFromPair(company.revenue, company.cogs, yearsLength, (revenue, cogs) => revenue - cogs),
      formula: 'grossProfit = revenue - cogs',
      inputs: ['revenue', 'cogs'],
      sources,
      matchedFields,
      derivedFields,
    })
  }

  if (fieldMissing(company, matchedFields, 'totalLiabilities') && accepted('totalAssets') && accepted('equity')) {
    addDerivedField({
      company,
      field: 'totalLiabilities',
      values: deriveSeriesFromPair(company.totalAssets, company.equity, yearsLength, (assets, equity) => assets - equity),
      formula: 'totalLiabilities = totalAssets - equity',
      inputs: ['totalAssets', 'equity'],
      sources,
      matchedFields,
      derivedFields,
    })
  }

  if (fieldMissing(company, matchedFields, 'equity') && accepted('totalAssets') && accepted('totalLiabilities')) {
    addDerivedField({
      company,
      field: 'equity',
      values: deriveSeriesFromPair(company.totalAssets, company.totalLiabilities, yearsLength, (assets, liabilities) => assets - liabilities),
      formula: 'equity = totalAssets - totalLiabilities',
      inputs: ['totalAssets', 'totalLiabilities'],
      sources,
      matchedFields,
      derivedFields,
    })
  }

  if (fieldMissing(company, matchedFields, 'cogs') && accepted('revenue') && accepted('grossProfit')) {
    const revenue = latestScalar(company.revenue)
    const grossProfit = latestScalar(company.grossProfit)
    if (revenue !== null && grossProfit !== null) {
      company.cogs = revenue - grossProfit
      matchedFields.add('cogs')
      derivedFields.add('cogs')
      sources.cogs = {
        label: 'Derived: cogs = revenue - grossProfit',
        formula: 'cogs = revenue - grossProfit',
        inputs: ['revenue', 'grossProfit'],
        derived: true,
        evidence: ['revenue', 'grossProfit'].map((input) => normalizeEvidence(sources[input], input)),
      }
    }
  }

  return { matchedFields, sources, derivedFields }
}

export function buildFieldStatusMap(company, context = {}) {
  const matchedFields = new Set(context.matchedFields || company._extraction?.matchedFields || [])
  const derivedFields = new Set(context.derivedFields || company._extraction?.derivedFields || [])
  const sources = context.sources || company._extraction?.sources || {}
  const confidence = context.confidence ?? company._extraction?.confidence ?? 70
  const fields = {}

  ;[...MONEY_ARRAY_FIELDS, ...MONEY_SCALAR_FIELDS].forEach((field) => {
    const status = derivedFields.has(field)
      ? 'derived'
      : matchedFields.has(field) && hasValue(company[field])
        ? company._extraction?.fields?.[field]?.status === 'reviewed' ? 'reviewed' : 'extracted'
        : 'missing'
    const source = sources[field] || {}
    fields[field] = {
      label: FIELD_LABELS[field]?.en || field,
      status,
      periods: (Array.isArray(company[field]) ? company[field] : [company[field]]).map(value => finiteOrNull(value) === null ? 'missing' : status),
      confidence: status === 'missing' ? 0 : confidence,
      formula: source.formula || null,
      inputs: source.inputs || [],
      evidence: source.evidence || (source.label || source.page || source.sheet || source.cell
        ? [normalizeEvidence(source, field)]
        : []),
    }
  })

  return fields
}

export function finalizeStatementExtraction(company, context = {}) {
  const warnings = [...new Set(context.warnings || company._extraction?.warnings || [])].filter(w=>!/^MISSING \(critical\):|^Missing:|^Validation:/.test(w))
  const derivationContext = applyDeterministicDerivations(company, context)
  const matchedFields = [...derivationContext.matchedFields]
  const derivedFields = [...derivationContext.derivedFields]
  const fields = buildFieldStatusMap(company, {
    ...context,
    matchedFields,
    derivedFields,
    sources: derivationContext.sources,
  })
  const missingLatest = field => fields[field]?.status === 'missing' || latestScalar(company[field]) === null
  const missingCritical = CRITICAL_FIELDS.filter(missingLatest)
  const missingImportant = IMPORTANT_FIELDS.filter(missingLatest)
  const missingOptional = OPTIONAL_FIELDS.filter(missingLatest)
  const validationIssues = []
  ;(company.years || ['Current']).forEach((year,index)=>{
    const value = field => matchedFields.includes(field) ? finiteOrNull(company[field]?.[index]) : null
    const assets=value('totalAssets'), liabilities=value('totalLiabilities'), equity=value('equity')
    if(assets!==null && liabilities!==null && equity!==null && Math.abs(assets-liabilities-equity)>Math.max(Math.abs(assets)*.02,.01)) validationIssues.push('Validation: '+year+' assets do not equal liabilities plus equity. Check signs, units and source columns.')
    for(const [part,total] of [['currentAssets','totalAssets'],['currentLiabilities','totalLiabilities'],['cash','currentAssets'],['receivables','currentAssets']]) {
      const p=value(part),t=value(total)
      if(p!==null && t!==null && t>=0 && p>t+Math.max(t*.02,.01)) validationIssues.push('Validation: '+year+' '+part+' exceeds '+total+'. Check the source amount.')
    }
  })
  warnings.push(...validationIssues)

  return {
    ...company,
    _extraction: {
      ...(company._extraction || {}),
      schemaVersion: '3.6',
      sourceType: context.sourceType || company._extraction?.sourceType || 'unknown',
      parser: context.parser || company._extraction?.parser || 'statement-extraction',
      confidence: context.confidence ?? company._extraction?.confidence ?? 70,
      warnings,
      hasBalanceSheetError: validationIssues.length > 0,
      matchedFields,
      derivedFields,
      missingCritical,
      missingImportant,
      missingOptional,
      sources: derivationContext.sources,
      fields,
      rowCount: context.rowCount ?? company._extraction?.rowCount ?? null,
      pageCount: context.pageCount ?? company._extraction?.pageCount ?? null,
      reviewed: Boolean(company._extraction?.reviewed),
      reviewRequired: missingCritical.length > 0 || derivedFields.length > 0 || warnings.length > 0,
    },
  }
}
