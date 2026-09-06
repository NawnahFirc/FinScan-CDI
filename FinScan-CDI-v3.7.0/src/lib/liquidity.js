import { fmt } from './finance.js'
import { DEFAULT_SECTOR, SECTOR_MAP } from './companyData.js'

const METRIC_DEFS = [
  {
    key: 'ccc',
    label: 'Cash Conversion Cycle (CCC)',
    unit: 'days',
    better: 'low',
    meaning: 'CCC combines collection, inventory, and supplier-payment timing to show how long cash stays tied up in operations.'
  },
  {
    key: 'dso',
    label: 'Days Sales Outstanding (DSO)',
    unit: 'days',
    better: 'low',
    meaning: 'DSO measures how quickly the company converts booked revenue into cash collections.'
  },
  {
    key: 'dpo',
    label: 'Days Payable Outstanding (DPO)',
    unit: 'days',
    better: 'high',
    meaning: 'DPO shows how much supplier credit the company is using before settling operating purchases.'
  },
  {
    key: 'dio',
    label: 'Days Inventory Outstanding (DIO)',
    unit: 'days',
    better: 'low',
    meaning: 'DIO tracks how long inventory remains on hand before it is sold or consumed.'
  },
  {
    key: 'workingCapitalAdequacy',
    label: 'Working Capital Adequacy',
    unit: 'percent',
    better: 'high',
    meaning: 'Working-capital adequacy compares net working capital with revenue to show how much liquidity cushion supports operations.'
  },
  {
    key: 'ocfVsNetIncome',
    label: 'Operating Cash Flow vs Net Income',
    unit: 'ratio',
    better: 'high',
    meaning: 'This ratio tests whether accounting earnings are supported by actual cash generation.'
  },
  {
    key: 'shortTermDebtCoverage',
    label: 'Short-Term Debt Coverage',
    unit: 'ratio',
    better: 'high',
    meaning: 'Short-term debt coverage estimates how comfortably cash on hand and positive operating cash flow support near-term obligations.'
  },
  {
    key: 'cashBurnRate',
    label: 'Cash Burn Rate',
    unit: 'money',
    better: 'special',
    meaning: 'Cash burn rate measures how much cash the business consumes per month when operating cash flow is negative.'
  },
]

const BENCHMARKS = {
  general: {
    context: 'General corporate benchmark balancing collection discipline, supplier support, and a moderate working-capital buffer.',
    metrics: {
      ccc: { good: 60, warn: 90, target: '<= 60 days' },
      dso: { good: 45, warn: 60, target: '<= 45 days' },
      dpo: { good: 45, warn: 30, target: '>= 45 days' },
      dio: { good: 70, warn: 95, target: '<= 70 days' },
      workingCapitalAdequacy: { good: 10, warn: 5, target: '>= 10% of revenue' },
      ocfVsNetIncome: { good: 1.0, warn: 0.8, target: '>= 1.0x' },
      shortTermDebtCoverage: { good: 1.0, warn: 0.6, target: '>= 1.0x' },
      cashBurnRate: { goodRunway: 12, warnRunway: 6, target: 'Positive OCF preferred; otherwise >12 months runway' },
    }
  },
  manufacturing: {
    context: 'Manufacturing benchmark assumes longer inventory holding periods and structurally heavier working-capital requirements.',
    metrics: {
      ccc: { good: 75, warn: 100, target: '<= 75 days' },
      dso: { good: 55, warn: 70, target: '<= 55 days' },
      dpo: { good: 50, warn: 35, target: '>= 50 days' },
      dio: { good: 85, warn: 110, target: '<= 85 days' },
      workingCapitalAdequacy: { good: 12, warn: 6, target: '>= 12% of revenue' },
      ocfVsNetIncome: { good: 1.0, warn: 0.8, target: '>= 1.0x' },
      shortTermDebtCoverage: { good: 1.0, warn: 0.7, target: '>= 1.0x' },
      cashBurnRate: { goodRunway: 12, warnRunway: 8, target: 'Positive OCF preferred; otherwise >12 months runway' },
    }
  },
  retail: {
    context: 'Retail and consumer companies usually need faster turns, lower DSO, and tighter CCC control.',
    metrics: {
      ccc: { good: 25, warn: 45, target: '<= 25 days' },
      dso: { good: 20, warn: 35, target: '<= 20 days' },
      dpo: { good: 45, warn: 30, target: '>= 45 days' },
      dio: { good: 50, warn: 70, target: '<= 50 days' },
      workingCapitalAdequacy: { good: 5, warn: 0, target: '>= 5% of revenue' },
      ocfVsNetIncome: { good: 1.0, warn: 0.85, target: '>= 1.0x' },
      shortTermDebtCoverage: { good: 0.9, warn: 0.6, target: '>= 0.9x' },
      cashBurnRate: { goodRunway: 12, warnRunway: 8, target: 'Positive OCF preferred; otherwise >12 months runway' },
    }
  },
  technology: {
    context: 'Technology and software businesses can tolerate investment-led volatility, but cash conversion still matters when earnings are recognized early.',
    metrics: {
      ccc: { good: 45, warn: 70, target: '<= 45 days' },
      dso: { good: 60, warn: 80, target: '<= 60 days' },
      dpo: { good: 30, warn: 20, target: '>= 30 days' },
      dio: { good: 15, warn: 30, target: '<= 15 days' },
      workingCapitalAdequacy: { good: 5, warn: 0, target: '>= 5% of revenue' },
      ocfVsNetIncome: { good: 0.9, warn: 0.7, target: '>= 0.9x' },
      shortTermDebtCoverage: { good: 0.8, warn: 0.5, target: '>= 0.8x' },
      cashBurnRate: { goodRunway: 18, warnRunway: 12, target: 'Positive OCF preferred; otherwise >18 months runway' },
    }
  },
  healthcare: {
    context: 'Healthcare and pharma companies often carry slower operating cycles, so the balance sheet must absorb longer cash conversion periods.',
    metrics: {
      ccc: { good: 120, warn: 150, target: '<= 120 days' },
      dso: { good: 65, warn: 85, target: '<= 65 days' },
      dpo: { good: 55, warn: 40, target: '>= 55 days' },
      dio: { good: 110, warn: 140, target: '<= 110 days' },
      workingCapitalAdequacy: { good: 12, warn: 6, target: '>= 12% of revenue' },
      ocfVsNetIncome: { good: 0.9, warn: 0.75, target: '>= 0.9x' },
      shortTermDebtCoverage: { good: 0.9, warn: 0.6, target: '>= 0.9x' },
      cashBurnRate: { goodRunway: 18, warnRunway: 12, target: 'Positive OCF preferred; otherwise >18 months runway' },
    }
  },
  construction: {
    context: 'Construction and real-estate businesses face project-based cash timing, making receivables discipline and supplier support especially important.',
    metrics: {
      ccc: { good: 60, warn: 85, target: '<= 60 days' },
      dso: { good: 75, warn: 100, target: '<= 75 days' },
      dpo: { good: 60, warn: 45, target: '>= 60 days' },
      dio: { good: 45, warn: 70, target: '<= 45 days' },
      workingCapitalAdequacy: { good: 8, warn: 3, target: '>= 8% of revenue' },
      ocfVsNetIncome: { good: 0.8, warn: 0.6, target: '>= 0.8x' },
      shortTermDebtCoverage: { good: 0.8, warn: 0.5, target: '>= 0.8x' },
      cashBurnRate: { goodRunway: 15, warnRunway: 9, target: 'Positive OCF preferred; otherwise >15 months runway' },
    }
  },
  logistics: {
    context: 'Logistics and distribution companies generally rely on leaner working capital and faster turnover than asset-heavy sectors.',
    metrics: {
      ccc: { good: 30, warn: 50, target: '<= 30 days' },
      dso: { good: 45, warn: 60, target: '<= 45 days' },
      dpo: { good: 45, warn: 30, target: '>= 45 days' },
      dio: { good: 35, warn: 50, target: '<= 35 days' },
      workingCapitalAdequacy: { good: 7, warn: 2, target: '>= 7% of revenue' },
      ocfVsNetIncome: { good: 1.0, warn: 0.8, target: '>= 1.0x' },
      shortTermDebtCoverage: { good: 0.9, warn: 0.6, target: '>= 0.9x' },
      cashBurnRate: { goodRunway: 12, warnRunway: 8, target: 'Positive OCF preferred; otherwise >12 months runway' },
    }
  },
}

function getArray(data, key) {
  if (Array.isArray(data[key])) return data[key]
  if (data[key] === null || data[key] === undefined) return [null]
  return [data[key]]
}

function valueAt(values,index) {
  return Number.isFinite(values[index]) ? values[index] : null
}
function averageBalance(values,index) {
  const current=valueAt(values,index),previous=valueAt(values,index-1)
  if(current===null) return null
  return previous===null ? current : (current+previous)/2
}
function deriveCogs(data,index) {
  const revenue=valueAt(getArray(data,'revenue'),index),grossProfit=valueAt(getArray(data,'grossProfit'),index)
  if(revenue!==null && grossProfit!==null) return revenue-grossProfit
  return index===(data.years?.length||1)-1 && Number.isFinite(data.cogs) ? Math.abs(data.cogs) : null
}

function formatMetricValue(metricKey, value, currency = 'EUR') {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  switch (metricKey) {
    case 'ccc':
    case 'dso':
    case 'dpo':
    case 'dio':
      return `${value.toFixed(1)} days`
    case 'workingCapitalAdequacy':
      return `${value.toFixed(1)}%`
    case 'ocfVsNetIncome':
    case 'shortTermDebtCoverage':
      return `${value.toFixed(2)}x`
    case 'cashBurnRate':
      return value <= 0 ? 'Cash-generative' : `${fmt(value, currency)} / month`
    default:
      return value.toFixed(2)
  }
}

function metricDeltaIsMaterial(metricKey, previousValue) {
  if (!Number.isFinite(previousValue)) return 0
  if (metricKey === 'workingCapitalAdequacy') return 1.5
  if (metricKey === 'ocfVsNetIncome' || metricKey === 'shortTermDebtCoverage') return Math.max(Math.abs(previousValue) * 0.08, 0.08)
  if (metricKey === 'cashBurnRate') return Math.max(previousValue * 0.1, 2000)
  return Math.max(Math.abs(previousValue) * 0.05, 2)
}

function statusToBadge(status) {
  return status === 'green' ? 'low' : status === 'amber' ? 'medium' : 'high'
}

function statusToLabel(status) {
  return status === 'green' ? 'Green' : status === 'amber' ? 'Amber' : 'Red'
}

function compareToBenchmark(metric, value, benchmark, extras = {}) {
  if (!Number.isFinite(value)) {
    return {
      status: 'amber',
      benchmarkText: benchmark.target,
      explanation: 'The source data is incomplete, so this reading should be treated cautiously.'
    }
  }

  if (metric.key === 'cashBurnRate') {
    const runway = extras.runwayMonths
    if (value <= 0) {
      return {
        status: 'green',
        benchmarkText: benchmark.target,
        explanation: 'Operating cash flow is positive, so the company is not consuming cash to sustain operations.'
      }
    }
    if (Number.isFinite(runway) && runway >= benchmark.goodRunway) {
      return {
        status: 'green',
        benchmarkText: benchmark.target,
        explanation: `The company is burning cash, but current cash reserves still imply roughly ${runway.toFixed(1)} months of runway.`
      }
    }
    if (Number.isFinite(runway) && runway >= benchmark.warnRunway) {
      return {
        status: 'amber',
        benchmarkText: benchmark.target,
        explanation: `Cash consumption is manageable for now, but runway of about ${runway.toFixed(1)} months leaves limited room for execution slippage.`
      }
    }
    return {
      status: 'red',
      benchmarkText: benchmark.target,
      explanation: Number.isFinite(runway)
        ? `Cash burn is materially pressuring liquidity, with only about ${runway.toFixed(1)} months of runway at the current pace.`
        : 'Cash burn is negative for liquidity and the current data does not show enough reserve coverage to offset that pressure.'
    }
  }

  if (metric.better === 'low') {
    if (value <= benchmark.good) {
      return {
        status: 'green',
        benchmarkText: benchmark.target,
        explanation: `The reading is inside the stronger end of the ${benchmark.target} benchmark range.`
      }
    }
    if (value <= benchmark.warn) {
      return {
        status: 'amber',
        benchmarkText: benchmark.target,
        explanation: 'The company is still within a manageable range, but working-capital timing is looser than best-in-class peers.'
      }
    }
    return {
      status: 'red',
      benchmarkText: benchmark.target,
      explanation: 'The company is materially outside the benchmark range, signalling cash is staying tied up for too long.'
    }
  }

  if (value >= benchmark.good) {
    return {
      status: 'green',
      benchmarkText: benchmark.target,
      explanation: `The reading is stronger than the ${benchmark.target} benchmark and supports balance-sheet resilience.`
    }
  }
  if (value >= benchmark.warn) {
    return {
      status: 'amber',
      benchmarkText: benchmark.target,
      explanation: 'The metric is serviceable, but it does not leave much room for adverse cash-flow volatility.'
    }
  }
  return {
    status: 'red',
    benchmarkText: benchmark.target,
    explanation: 'The metric is below the sector benchmark and points to weaker liquidity support than expected.'
  }
}

function buildTrend(metric, series, extras = {}) {
  const latestValue = series.at(-1)
  const previousValue = series.length > 1 ? series.at(-2) : null

  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) {
    return {
      label: 'Limited history',
      direction: 'flat',
      text: 'Trend analysis is limited because only one reliable period is available.'
    }
  }

  if (metric.key === 'cashBurnRate') {
    const latestRunway = extras.runwaySeries?.at(-1)
    const previousRunway = extras.runwaySeries?.length > 1 ? extras.runwaySeries.at(-2) : null

    if (latestValue <= 0 && previousValue > 0) {
      return {
        label: 'Improving',
        direction: 'up',
        text: 'The company moved from burning cash to generating operating cash, which is a clear liquidity improvement.'
      }
    }

    if (latestValue > 0 && previousValue <= 0) {
      return {
        label: 'Deteriorating',
        direction: 'down',
        text: 'The business shifted from cash generation into cash consumption, which weakens short-term flexibility.'
      }
    }

    if (Number.isFinite(latestRunway) && Number.isFinite(previousRunway)) {
      const change = latestRunway - previousRunway
      if (change > 1) {
        return {
          label: 'Improving',
          direction: 'up',
          text: `Estimated liquidity runway improved from ${previousRunway.toFixed(1)} to ${latestRunway.toFixed(1)} months.`
        }
      }
      if (change < -1) {
        return {
          label: 'Deteriorating',
          direction: 'down',
          text: `Estimated liquidity runway compressed from ${previousRunway.toFixed(1)} to ${latestRunway.toFixed(1)} months.`
        }
      }
    }

    return {
      label: 'Stable',
      direction: 'flat',
      text: 'The burn profile is broadly stable versus the prior period.'
    }
  }

  const delta = latestValue - previousValue
  const threshold = metricDeltaIsMaterial(metric.key, previousValue)
  const better = metric.better === 'low' ? -1 : 1

  if (delta * better > threshold) {
    return {
      label: 'Improving',
      direction: 'up',
      text: `${metric.label} improved from ${formatMetricValue(metric.key, previousValue, extras.currency)} to ${formatMetricValue(metric.key, latestValue, extras.currency)}.`
    }
  }

  if (delta * better < -threshold) {
    return {
      label: 'Deteriorating',
      direction: 'down',
      text: `${metric.label} deteriorated from ${formatMetricValue(metric.key, previousValue, extras.currency)} to ${formatMetricValue(metric.key, latestValue, extras.currency)}.`
    }
  }

  return {
    label: 'Stable',
    direction: 'flat',
    text: `${metric.label} is broadly stable versus the previous reported period.`
  }
}

function buildCommentary({ company, sectorLabel, sectorContext, metric, current, evaluation, trend, runRateData, payablesEstimated }) {
  if (!Number.isFinite(current.value)) return metric.meaning + ' This metric is unavailable because a required source figure is missing. Confirm the extraction before interpreting it.'
  const benchmarkSentence = `Against the ${sectorLabel.toLowerCase()} benchmark, management is being measured against ${evaluation.benchmarkText}. ${evaluation.explanation}`
  const trendSentence = `${trend.text}`

  switch (metric.key) {
    case 'ccc':
      return `${metric.meaning} ${company.company} is currently cycling cash through operations in about ${current.displayValue}. ${benchmarkSentence} ${trendSentence}`
    case 'dso':
      return `${metric.meaning} ${company.company} is collecting receivables in roughly ${current.displayValue}, which directly affects how quickly reported sales become usable cash. ${benchmarkSentence} ${trendSentence}`
    case 'dpo':
      return `${metric.meaning} ${company.company} is taking about ${current.displayValue} to pay suppliers.${payablesEstimated ? ' Trade payables were not supplied separately, so a conservative payables proxy was used from current liabilities. ' : ' '} ${benchmarkSentence} ${trendSentence}`
    case 'dio':
      return `${metric.meaning} Inventory is currently tied up for around ${current.displayValue} before conversion into revenue. ${benchmarkSentence} ${trendSentence}`
    case 'workingCapitalAdequacy':
      return `${metric.meaning} Net working capital currently supports about ${current.displayValue} of annual revenue for ${company.company}. ${benchmarkSentence} ${trendSentence}`
    case 'ocfVsNetIncome':
      return `${metric.meaning} The current cash-conversion reading is ${current.displayValue}, so operating cash flow is ${current.value >= 1 ? 'covering' : 'lagging'} accounting earnings in liquidity terms. ${benchmarkSentence} ${trendSentence}`
    case 'shortTermDebtCoverage':
      return `${metric.meaning} ${company.company} is covering near-term obligations at about ${current.displayValue} using cash on hand plus positive operating cash flow. ${benchmarkSentence} ${trendSentence}`
    case 'cashBurnRate':
      if (current.value <= 0) {
        return `${metric.meaning} The company is not currently burning cash because operating cash flow remains positive. ${benchmarkSentence} ${trendSentence}`
      }
      return `${metric.meaning} ${company.company} is consuming around ${current.displayValue}. ${runRateData.runwayMonths !== null ? `At the current pace, cash reserves imply about ${runRateData.runwayMonths.toFixed(1)} months of runway. ` : ''}${benchmarkSentence} ${trendSentence}`
    default:
      return `${metric.meaning} ${sectorContext}`
  }
}

function scoreStatus(status) {
  if (status === 'green') return 100
  if (status === 'amber') return 60
  return 25
}

function buildExecutiveMemo(company, sectorLabel, metrics, sectorContext) {
  const score = Math.round(metrics.reduce((sum, metric) => sum + scoreStatus(metric.status), 0) / metrics.length)
  const overallStatus = score >= 75 ? 'Contained' : score >= 55 ? 'Watchlist' : 'Stressed'
  const weaknesses = metrics.filter(metric => metric.status === 'red')
  const watchItems = metrics.filter(metric => metric.status === 'amber')
  const strengths = metrics.filter(metric => metric.status === 'green')

  const primaryPressures = [...weaknesses, ...watchItems].slice(0, 3).map(metric => metric.label)
  const offsets = strengths.slice(0, 2).map(metric => metric.label)

  const firstParagraph = `${company.company}'s liquidity profile screens as ${overallStatus.toLowerCase()} on the current front-end assessment, with an internal liquidity score of ${score}/100. The operating model is being assessed against the ${sectorLabel.toLowerCase()} benchmark. ${sectorContext} ${primaryPressures.length ? `The main pressure points are ${primaryPressures.join(', ')}.` : 'No major liquidity pressure points are standing out at the moment.'}`

  const secondParagraph = `${offsets.length ? `The principal offsets are ${offsets.join(', ')}, which help stabilize the short-term funding picture. ` : ''}${weaknesses.length ? 'Management attention should stay on shortening the cash cycle, protecting working-capital headroom, and preserving cash conversion discipline before balance-sheet flexibility tightens further.' : 'The near-term balance-sheet agenda should focus on maintaining collection discipline and avoiding unnecessary slippage in working-capital timing.'}`

  return {
    score,
    overallStatus,
    paragraphs: [firstParagraph, secondParagraph]
  }
}

function getSectorConfiguration(sectorId) {
  return BENCHMARKS[sectorId] || BENCHMARKS[DEFAULT_SECTOR]
}

function cloneScenarioCompany(company) {
  const clone = { ...company }
  const arrayFields = ['revenue', 'grossProfit', 'netIncome', 'receivables', 'inventory', 'payables', 'cash', 'cashFlow', 'currentAssets', 'currentLiabilities', 'debt']
  arrayFields.forEach(field => {
    if (Array.isArray(company[field])) clone[field] = [...company[field]]
  })
  return clone
}

function updateLast(values, updater) {
  const next = Array.isArray(values) ? [...values] : [values || 0]
  const index = Math.max(next.length - 1, 0)
  next[index] = updater(Number(next[index]) || 0)
  return next
}

function applyBoundedTransfer(maxMove, preferredMove) {
  const magnitude = Math.min(Math.abs(preferredMove), Math.max(maxMove, 0))
  return preferredMove >= 0 ? magnitude : -magnitude
}

export function applyLiquidityScenario(company, controls = {}) {
  const next = cloneScenarioCompany(company)

  const latestReceivables = valueAt(getArray(next, 'receivables'), getArray(next, 'receivables').length - 1)
  const latestInventory = valueAt(getArray(next, 'inventory'), getArray(next, 'inventory').length - 1)
  const latestPayables = valueAt(getArray(next, 'payables'), getArray(next, 'payables').length - 1)
  const latestCash = valueAt(getArray(next, 'cash'), getArray(next, 'cash').length - 1)
  const latestCashFlow = valueAt(getArray(next, 'cashFlow'), getArray(next, 'cashFlow').length - 1)
  const latestCurrentLiabilities = valueAt(getArray(next, 'currentLiabilities'), getArray(next, 'currentLiabilities').length - 1)
  const latestRevenue = valueAt(getArray(next, 'revenue'), getArray(next, 'revenue').length - 1)

  const collectionShiftRequested = latestReceivables * ((controls.collectionsPct || 0) / 100)
  const collectionShift = collectionShiftRequested >= 0
    ? collectionShiftRequested
    : applyBoundedTransfer(latestCash, collectionShiftRequested)

  next.receivables = updateLast(next.receivables, value => value - collectionShift)
  next.cash = updateLast(next.cash, value => value + collectionShift)

  const inventoryReleaseRequested = latestInventory * ((controls.inventoryPct || 0) / 100)
  const inventoryRelease = inventoryReleaseRequested >= 0
    ? inventoryReleaseRequested
    : applyBoundedTransfer(latestCash + Math.max(collectionShift, 0), inventoryReleaseRequested)

  next.inventory = updateLast(next.inventory, value => value - inventoryRelease)
  next.cash = updateLast(next.cash, value => value + inventoryRelease)

  const payableShiftRequested = latestPayables * ((controls.supplierPct || 0) / 100)
  const payableShift = payableShiftRequested >= 0
    ? payableShiftRequested
    : applyBoundedTransfer(latestCash + Math.max(collectionShift, 0) + Math.max(inventoryRelease, 0), payableShiftRequested)

  next.payables = updateLast(next.payables, value => Math.max(value + payableShift, 0))
  next.currentLiabilities = updateLast(next.currentLiabilities, value => Math.max(value + payableShift, 0))
  next.cash = updateLast(next.cash, value => value + payableShift)

  const ocfBase = Math.max(Math.abs(latestCashFlow), latestRevenue * 0.05, 1)
  const cashFlowShift = ocfBase * ((controls.ocfPct || 0) / 100)
  next.cashFlow = updateLast(next.cashFlow, value => value + cashFlowShift)
  next.cash = updateLast(next.cash, value => value + cashFlowShift)

  const cashBufferShift = latestCash * ((controls.cashBufferPct || 0) / 100)
  next.cash = updateLast(next.cash, value => Math.max(value + cashBufferShift, 0))

  const latestCurrentAssets = valueAt(getArray(next, 'currentAssets'), getArray(next, 'currentAssets').length - 1)
  const recalculatedCurrentAssets = Math.max(latestCurrentAssets + payableShift + cashFlowShift + cashBufferShift, 0)
  next.currentAssets = updateLast(next.currentAssets, () => recalculatedCurrentAssets)

  return {
    company: next,
    adjustments: {
      collectionShift,
      inventoryRelease,
      payableShift,
      cashFlowShift,
      cashBufferShift,
      latestCurrentLiabilities,
    }
  }
}

export function buildLiquidityAnalysis(company) {
  const sectorId = company?.sector && BENCHMARKS[company.sector] ? company.sector : DEFAULT_SECTOR
  const sector = SECTOR_MAP[sectorId] || SECTOR_MAP[DEFAULT_SECTOR]
  const sectorConfig = getSectorConfiguration(sectorId)
  const years = company?.years?.length ? company.years : ['Current']
  const displayCurrency = company?.displayCurrency || company?.currency || 'EUR'

  const revenue = getArray(company, 'revenue')
  const receivables = getArray(company, 'receivables')
  const inventory = getArray(company, 'inventory')
  const payables = getArray(company, 'payables')
  const currentAssets = getArray(company, 'currentAssets')
  const currentLiabilities = getArray(company, 'currentLiabilities')
  const cash = getArray(company, 'cash')
  const cashFlow = getArray(company, 'cashFlow')
  const netIncome = getArray(company, 'netIncome')

  const seriesMap = {
    ccc: [],
    dso: [],
    dpo: [],
    dio: [],
    workingCapitalAdequacy: [],
    ocfVsNetIncome: [],
    shortTermDebtCoverage: [],
    cashBurnRate: [],
  }

  const runwaySeries = []

  years.forEach((_, index) => {
    const sales = valueAt(revenue, index)
    const cogs = deriveCogs(company, index)
    const recAvg = averageBalance(receivables, index)
    const invAvg = averageBalance(inventory, index)
    const payAvg = averageBalance(payables, index)
    const ca = valueAt(currentAssets, index)
    const cl = valueAt(currentLiabilities, index)
    const cashOnHand = valueAt(cash, index)
    const ocf = valueAt(cashFlow, index)
    const ni = valueAt(netIncome, index)

    const dso = sales > 0 && Number.isFinite(recAvg) ? recAvg / sales * 365 : null
    const dio = cogs > 0 && Number.isFinite(invAvg) ? invAvg / cogs * 365 : null
    const dpo = cogs > 0 && Number.isFinite(payAvg) ? payAvg / cogs * 365 : null
    const ccc = Number.isFinite(dso) && Number.isFinite(dio) && Number.isFinite(dpo) ? dso + dio - dpo : null
    const workingCapitalAdequacy = sales > 0 && Number.isFinite(ca) && Number.isFinite(cl) ? ((ca - cl) / sales) * 100 : null
    const ocfVsNetIncome = Number.isFinite(ocf) && ni > 0 ? ocf / ni : null
    const shortTermDebtCoverage = cl > 0 && Number.isFinite(cashOnHand) && Number.isFinite(ocf) ? (cashOnHand + Math.max(ocf, 0)) / cl : null
    const cashBurnRate = !Number.isFinite(ocf) ? null : ocf < 0 ? Math.abs(ocf) / 12 : 0
    const runwayMonths = cashBurnRate > 0 && Number.isFinite(cashOnHand) ? cashOnHand / cashBurnRate : null

    seriesMap.dso.push(dso)
    seriesMap.dio.push(dio)
    seriesMap.dpo.push(dpo)
    seriesMap.ccc.push(ccc)
    seriesMap.workingCapitalAdequacy.push(workingCapitalAdequacy)
    seriesMap.ocfVsNetIncome.push(ocfVsNetIncome)
    seriesMap.shortTermDebtCoverage.push(shortTermDebtCoverage)
    seriesMap.cashBurnRate.push(cashBurnRate)
    runwaySeries.push(runwayMonths)
  })

  const metrics = METRIC_DEFS.map(metric => {
    const series = seriesMap[metric.key]
    const currentValue = series.at(-1)
    const benchmark = sectorConfig.metrics[metric.key]
    const currentRunway = runwaySeries.at(-1)
    const evaluation = compareToBenchmark(metric, currentValue, benchmark, { runwayMonths: currentRunway })
    const trend = buildTrend(metric, series, { runwaySeries, currency: displayCurrency })

    const current = {
      value: currentValue,
      displayValue: formatMetricValue(metric.key, currentValue, displayCurrency)
    }

    return {
      ...metric,
      status: evaluation.status,
      badgeLevel: statusToBadge(evaluation.status),
      statusLabel: statusToLabel(evaluation.status),
      benchmarkText: evaluation.benchmarkText,
      explanation: evaluation.explanation,
      trend,
      current,
      series,
      commentary: buildCommentary({
        company,
        sectorLabel: sector.label,
        sectorContext: sectorConfig.context,
        metric,
        current,
        evaluation,
        trend,
        payablesEstimated: company.payablesEstimated,
        runRateData: { runwayMonths: currentRunway }
      }),
      runwayMonths: metric.key === 'cashBurnRate' ? currentRunway : null,
    }
  })

  const executiveMemo = buildExecutiveMemo(company, sector.label, metrics, sectorConfig.context)

  return {
    sector,
    sectorContext: sectorConfig.context,
    metrics,
    executiveMemo,
    years,
    seriesMap,
    runwaySeries,
  }
}

export function buildAnalystReportSections(company) {
  const analysis = buildLiquidityAnalysis(company)
  const criticalMetrics = analysis.metrics.filter(metric => metric.status !== 'green').slice(0, 4)
  const strengths = analysis.metrics.filter(metric => metric.status === 'green').slice(0, 3)

  return [
    {
      title: 'Executive Summary',
      body: analysis.executiveMemo.paragraphs[0]
    },
    {
      title: 'Liquidity View',
      body: analysis.executiveMemo.paragraphs[1]
    },
    {
      title: 'Priority Risks',
      body: criticalMetrics.length
        ? criticalMetrics.map(metric => `${metric.label}: ${metric.commentary}`).join('\n\n')
        : 'No immediate liquidity stress points stand out relative to the selected sector benchmark.'
    },
    {
      title: 'Positive Offsets',
      body: strengths.length
        ? strengths.map(metric => `${metric.label}: ${metric.commentary}`).join('\n\n')
        : 'The current dataset does not show strong liquidity offsets, so the position should be monitored conservatively.'
    }
  ]
}

export function buildAnalystMemoText(company) {
  return buildAnalystReportSections(company)
    .map(section => `${section.title.toUpperCase()}\n${section.body}`)
    .join('\n\n')
}
