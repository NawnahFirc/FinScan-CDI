import {
  computeAltmanDetails,
  computeBeneishDetails,
  computeRiskScore,
  fmt,
  last,
} from './finance.js'
import { buildLiquidityAnalysis } from './liquidity.js'

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function round(value, digits = 0) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0
}

function safeRatio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / Math.abs(denominator) : NaN
}

function previous(series) {
  return Array.isArray(series) && series.length > 1 ? series[series.length - 2] : null
}

function scoreHigh(value, strong, acceptable, weak = 0) {
  if (!Number.isFinite(value)) return 45
  if (value >= strong) return 90
  if (value >= acceptable) return 70
  if (value >= weak) return 50
  return 25
}

function scoreLow(value, strong, acceptable, stressed) {
  if (!Number.isFinite(value)) return 45
  if (value <= strong) return 90
  if (value <= acceptable) return 70
  if (value <= stressed) return 45
  return 20
}

function levelFromScore(score) {
  if (score >= 75) return 'low'
  if (score >= 55) return 'medium'
  return 'high'
}

function statusFromLevel(level) {
  if (level === 'low') return 'Green'
  if (level === 'medium') return 'Amber'
  return 'Red'
}

function pct(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'n/a'
}

function ratio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : 'n/a'
}

function days(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} days` : 'n/a'
}

function nearestExposure(value) {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1_000_000) return Math.round(value / 50_000) * 50_000
  if (value >= 100_000) return Math.round(value / 10_000) * 10_000
  return Math.round(value / 1_000) * 1_000
}

function getRecommendation(score, altman, beneish, riskScore) {
  const severeFraud = beneish.manipulated || riskScore >= 70
  const distressed = altman.zone === 'distress'

  if (score >= 82 && !severeFraud && altman.zone === 'safe') {
    return {
      title: 'Approve',
      short: 'Approved counterparty',
      level: 'low',
      summary: 'Financial quality is strong enough to support normal commercial exposure under standard monitoring.',
    }
  }

  if (score >= 68 && !severeFraud && !distressed) {
    return {
      title: 'Approve with monitoring',
      short: 'Approved with monitoring',
      level: 'low',
      summary: 'The counterparty can be used commercially, but finance should keep recurring controls on liquidity, receivables, and cash conversion.',
    }
  }

  if (score >= 55 && !distressed) {
    return {
      title: 'Request guarantees',
      short: 'Conditional approval',
      level: 'medium',
      summary: 'Business can continue only with protective conditions such as credit limits, shorter payment terms, or guarantees.',
    }
  }

  if (score >= 42) {
    return {
      title: 'Reduce exposure',
      short: 'Exposure reduction required',
      level: 'high',
      summary: 'The company should remain on watchlist and new exposure should be reduced until financial evidence improves.',
    }
  }

  return {
    title: 'Reject or escalate',
    short: 'Senior escalation',
    level: 'high',
    summary: 'The current risk profile is not suitable for unsecured commercial dependency without senior approval.',
  }
}

function buildExposureLimit({ company, score, recommendation, values }) {
  const {
    revenue,
    currentAssets,
    equity,
    cash,
    cashFlow,
    workingCapital,
  } = values

  const positiveBases = [
    revenue * 0.04,
    currentAssets * 0.18,
    equity * 0.25,
    (cash + Math.max(cashFlow, 0)) * 0.45,
    Math.max(workingCapital, 0) * 0.55,
  ].filter(value => Number.isFinite(value) && value > 0)

  const base = positiveBases.length ? Math.min(...positiveBases) : 0
  const multiplier =
    score >= 82 ? 1
      : score >= 68 ? 0.75
        : score >= 55 ? 0.45
          : score >= 42 ? 0.2
            : 0

  const recommended = ['Reject or escalate','Review required'].includes(recommendation.title)
    ? 0
    : nearestExposure(base * multiplier)

  const termDays =
    recommendation.title === 'Approve' ? 60
      : recommendation.title === 'Approve with monitoring' ? 45
        : recommendation.title === 'Request guarantees' ? 30
          : recommendation.title === 'Reduce exposure' ? 15
            : 0

  const guarantee =
    recommendation.title === 'Approve' ? 'No additional guarantee required under normal monitoring.'
      : recommendation.title === 'Approve with monitoring' ? 'Keep exposure below the approved cap and review receivables monthly.'
        : recommendation.title === 'Request guarantees' ? 'Require bank guarantee, parent support, advance payment, or credit insurance before increasing exposure.'
          : recommendation.title === 'Reduce exposure' ? 'No new unsecured exposure; reduce open balance and require advance payment for new orders.'
            : 'Do not approve exposure unless senior management signs an exception.'

  const reviewCadence =
    score >= 82 ? 'Quarterly review'
      : score >= 68 ? 'Monthly review'
        : score >= 55 ? 'Bi-weekly review'
          : 'Review before every new order'

  return {
    amount: recommended,
    displayAmount: fmt(recommended, company.displayCurrency || company.currency || 'EUR'),
    termDays,
    guarantee,
    reviewCadence,
    methodology: 'Limit uses the lowest supportable base among revenue, current assets, equity, liquidity resources, and working-capital headroom, then applies a risk multiplier from the corporate score.',
  }
}

function evidenceItem({ metric, reading, threshold, level, source, interpretation }) {
  return {
    metric,
    reading,
    threshold,
    level,
    status: statusFromLevel(level),
    source,
    interpretation,
  }
}

export function buildCorporateDecision(company) {
  const liquidity = buildLiquidityAnalysis(company)
  const altman = computeAltmanDetails(company)
  const beneish = computeBeneishDetails(company)
  const fraudRiskScore = computeRiskScore(company)
  const displayCurrency = company.displayCurrency || company.currency || 'EUR'

  const revenue = last(company.revenue)
  const prevRevenue = previous(company.revenue)
  const netIncome = last(company.netIncome)
  const grossProfit = last(company.grossProfit)
  const totalAssets = last(company.totalAssets)
  const totalLiabilities = last(company.totalLiabilities)
  const equity = last(company.equity)
  const currentAssets = last(company.currentAssets)
  const currentLiabilities = last(company.currentLiabilities)
  const receivables = last(company.receivables)
  const cash = last(company.cash)
  const cashFlow = last(company.cashFlow)
  const workingCapital = Number.isFinite(currentAssets) && Number.isFinite(currentLiabilities) ? currentAssets - currentLiabilities : NaN

  const netMargin = safeRatio(netIncome, revenue) * 100
  const grossMargin = safeRatio(grossProfit, revenue) * 100
  const roa = safeRatio(netIncome, totalAssets) * 100
  const roe = safeRatio(netIncome, equity) * 100
  const revenueGrowth = Number.isFinite(revenue) && prevRevenue ? ((revenue - prevRevenue) / Math.abs(prevRevenue)) * 100 : null
  const currentRatio = safeRatio(currentAssets, currentLiabilities)
  const debtRatio = safeRatio(totalLiabilities, totalAssets) * 100
  const receivablesToRevenue = safeRatio(receivables, revenue) * 100
  const cashFlowToNetIncome = netIncome > 0 ? safeRatio(cashFlow, netIncome) : NaN
  const ocfMargin = safeRatio(cashFlow, revenue) * 100

  const liquidityScore = liquidity.executiveMemo.score
  const altmanSolvencyBase = altman.available === false
    ? 55
    : altman.zone === 'safe' ? 90 : altman.zone === 'grey' ? 62 : 28
  const solvencyScore = round(
    altmanSolvencyBase * 0.62 +
    scoreLow(debtRatio, 50, 65, 80) * 0.23 +
    scoreHigh(currentRatio, 1.5, 1, 0.75) * 0.15
  )
  const profitabilityScore = round(
    scoreHigh(netMargin, 10, 5, 0) * 0.36 +
    scoreHigh(roa, 5, 2, 0) * 0.24 +
    scoreHigh(roe, 12, 6, 0) * 0.20 +
    (revenueGrowth === null ? 55 : scoreHigh(revenueGrowth, 5, 0, -10)) * 0.20
  )
  const cashQualityScore = round(
    scoreHigh(cashFlowToNetIncome, 1, 0.8, 0.5) * 0.45 +
    scoreHigh(ocfMargin, 10, 5, 0) * 0.35 +
    (cashFlow > 0 ? 80 : 25) * 0.20
  )
  const fraudQualityScore = clamp(
    100 - fraudRiskScore - (beneish.manipulated ? 18 : 0),
    5,
    95
  )

  const scoreBreakdown = [
    {
      key: 'liquidity',
      label: 'Liquidity & working capital',
      score: liquidityScore,
      weight: 25,
      level: levelFromScore(liquidityScore),
      driver: `Liquidity score ${liquidityScore}/100; ${liquidity.executiveMemo.overallStatus.toLowerCase()} status.`,
    },
    {
      key: 'solvency',
      label: 'Solvency & balance sheet',
      score: solvencyScore,
      weight: 20,
      level: levelFromScore(solvencyScore),
      driver: `Altman ${altman.scoreDisplay || (Number.isFinite(altman.score) ? altman.score.toFixed(2) : 'n/a')} (${altman.zoneLabel}); debt ratio ${pct(debtRatio)}.`,
    },
    {
      key: 'profitability',
      label: 'Profitability strength',
      score: profitabilityScore,
      weight: 18,
      level: levelFromScore(profitabilityScore),
      driver: `Net margin ${pct(netMargin)}, ROA ${pct(roa)}, ROE ${pct(roe)}.`,
    },
    {
      key: 'cashQuality',
      label: 'Cash-flow quality',
      score: cashQualityScore,
      weight: 17,
      level: levelFromScore(cashQualityScore),
      driver: `OCF / net income ${ratio(cashFlowToNetIncome)}; OCF margin ${pct(ocfMargin)}.`,
    },
    {
      key: 'integrity',
      label: 'Fraud & earnings quality',
      score: fraudQualityScore,
      weight: 20,
      level: levelFromScore(fraudQualityScore),
      driver: `Fraud risk ${fraudRiskScore}/100; Beneish ${beneish.mscore}.`,
    },
  ]

  const compositeScore = round(scoreBreakdown.reduce((sum, item) => (
    sum + item.score * (item.weight / 100)
  ), 0))

  const missingRequired = ['revenue','netIncome','totalAssets','totalLiabilities','equity','currentAssets','currentLiabilities'].filter(field => !Number.isFinite(last(company[field])) || company._extraction?.fields?.[field]?.status === 'missing')
  const decisionReady = missingRequired.length === 0 && !company._extraction?.hasBalanceSheetError && !company.currencyReviewRequired
  const recommendation = decisionReady ? getRecommendation(compositeScore, altman, beneish, fraudRiskScore) : {
    title:'Review required', short:'Insufficient verified data', level:'medium',
    summary:'A commercial recommendation is withheld until missing figures, currency and balance-sheet inconsistencies are resolved. Any displayed scores are provisional.',
  }
  const exposure = buildExposureLimit({
    company,
    score: compositeScore,
    recommendation,
    values: {
      revenue,
      currentAssets,
      equity,
      cash,
      cashFlow,
      workingCapital,
    },
  })

  const cccMetric = liquidity.metrics.find(metric => metric.key === 'ccc')
  const dsoMetric = liquidity.metrics.find(metric => metric.key === 'dso')
  const wcMetric = liquidity.metrics.find(metric => metric.key === 'workingCapitalAdequacy')
  const ocfMetric = liquidity.metrics.find(metric => metric.key === 'ocfVsNetIncome')
  const debtCoverageMetric = liquidity.metrics.find(metric => metric.key === 'shortTermDebtCoverage')

  const evidence = [
    evidenceItem({
      metric: 'Corporate score',
      reading: `${compositeScore}/100`,
      threshold: '>= 68 for normal approval',
      level: recommendation.level,
      source: 'Weighted blend of liquidity, solvency, profitability, cash quality, and integrity signals.',
      interpretation: recommendation.summary,
    }),
    evidenceItem({
      metric: 'Recommended exposure limit',
      reading: exposure.displayAmount,
      threshold: `${exposure.termDays} day terms`,
      level: recommendation.level,
      source: exposure.methodology,
      interpretation: exposure.guarantee,
    }),
    evidenceItem({
      metric: 'Altman Z-Score',
      reading: altman.scoreDisplay || (Number.isFinite(altman.score) ? altman.score.toFixed(2) : 'n/a'),
      threshold: altman.benchmarkText,
      level: altman.level,
      source: 'Computed from working capital, earnings, equity proxy, liabilities, revenue, and assets.',
      interpretation: altman.explanation,
    }),
    evidenceItem({
      metric: 'Beneish M-Score',
      reading: beneish.mscore,
      threshold: 'Flag when M-Score > -1.78',
      level: beneish.level,
      source: 'Eight-factor Beneish screen; the composite is withheld when required inputs are unavailable.',
      interpretation: beneish.explanation,
    }),
    evidenceItem({
      metric: 'Cash Conversion Cycle',
      reading: cccMetric?.current.displayValue || 'n/a',
      threshold: cccMetric?.benchmarkText || 'Sector benchmark',
      level: cccMetric?.badgeLevel || 'medium',
      source: 'CCC = DSO + DIO - DPO, using uploaded receivables, inventory, payables, revenue, and COGS.',
      interpretation: cccMetric?.commentary || 'Cash-conversion analysis was limited by available data.',
    }),
    evidenceItem({
      metric: 'Days Sales Outstanding',
      reading: dsoMetric?.current.displayValue || 'n/a',
      threshold: dsoMetric?.benchmarkText || 'Sector benchmark',
      level: dsoMetric?.badgeLevel || 'medium',
      source: 'DSO = average receivables / revenue x 365.',
      interpretation: dsoMetric?.commentary || 'Receivables timing could not be fully assessed.',
    }),
    evidenceItem({
      metric: 'Working-capital adequacy',
      reading: wcMetric?.current.displayValue || 'n/a',
      threshold: wcMetric?.benchmarkText || 'Sector benchmark',
      level: wcMetric?.badgeLevel || 'medium',
      source: 'Net working capital / revenue.',
      interpretation: wcMetric?.commentary || 'Working-capital support could not be fully assessed.',
    }),
    evidenceItem({
      metric: 'OCF vs net income',
      reading: ocfMetric?.current.displayValue || ratio(cashFlowToNetIncome),
      threshold: ocfMetric?.benchmarkText || '>= 1.0x preferred',
      level: ocfMetric?.badgeLevel || levelFromScore(cashQualityScore),
      source: 'Operating cash flow divided by net income.',
      interpretation: ocfMetric?.commentary || 'Cash support for earnings was assessed from uploaded cash-flow data.',
    }),
    evidenceItem({
      metric: 'Short-term debt coverage',
      reading: debtCoverageMetric?.current.displayValue || 'n/a',
      threshold: debtCoverageMetric?.benchmarkText || '>= 1.0x preferred',
      level: debtCoverageMetric?.badgeLevel || 'medium',
      source: '(Cash + positive operating cash flow) / current liabilities.',
      interpretation: debtCoverageMetric?.commentary || 'Near-term debt coverage was assessed from cash, OCF, and current liabilities.',
    }),
    evidenceItem({
      metric: 'Profitability quality',
      reading: `Net margin ${pct(netMargin)}`,
      threshold: '>= 10% strong; 5%-10% acceptable',
      level: levelFromScore(profitabilityScore),
      source: `Revenue ${fmt(revenue, displayCurrency)}; net income ${fmt(netIncome, displayCurrency)}; gross margin ${pct(grossMargin)}.`,
      interpretation: profitabilityScore >= 75
        ? 'Profitability provides a positive cushion for counterparty confidence.'
        : profitabilityScore >= 55
          ? 'Profitability is usable but should be monitored against volume growth and cash conversion.'
          : 'Profitability does not provide enough cushion for relaxed exposure terms.',
    }),
    evidenceItem({
      metric: 'Receivables intensity',
      reading: pct(receivablesToRevenue),
      threshold: '<= 25% preferred',
      level: receivablesToRevenue <= 25 ? 'low' : receivablesToRevenue <= 35 ? 'medium' : 'high',
      source: `Receivables ${fmt(receivables, displayCurrency)} divided by revenue ${fmt(revenue, displayCurrency)}.`,
      interpretation: !Number.isFinite(receivablesToRevenue) ? 'Receivables intensity cannot be assessed until revenue and receivables are available.' : receivablesToRevenue > 25
        ? 'Receivables are high relative to revenue, so collection discipline is a key approval condition.'
        : 'Receivables intensity is not a primary concern on the uploaded data.',
    }),
  ]

  const alerts = evidence
    .filter(item => item.level !== 'low')
    .slice(0, 6)
    .map(item => ({
      title: item.metric,
      level: item.level,
      text: item.interpretation,
    }))

  const actionItems = [
    `Set maximum unsecured exposure at ${exposure.displayAmount}.`,
    exposure.termDays > 0
      ? `Use maximum payment terms of ${exposure.termDays} days until the next review.`
      : 'Do not grant payment terms without senior exception approval.',
    exposure.guarantee,
    `Review cadence: ${exposure.reviewCadence}.`,
  ]

  if (dsoMetric?.status !== 'green') {
    actionItems.push('Require a receivables aging review before increasing exposure.')
  }
  if (beneish.manipulated || fraudRiskScore >= 55) {
    actionItems.push('Request supporting documents for revenue cut-off, receivables, and margin movements.')
  }
  if (cashQualityScore < 55) {
    actionItems.push('Ask finance to validate operating cash flow and reconcile it with reported net income.')
  }

  return {
    company: company.company,
    compositeScore,
    decisionReady,
    level: levelFromScore(compositeScore),
    recommendation,
    exposure,
    scoreBreakdown,
    evidence,
    alerts,
    actionItems: [...new Set(actionItems)],
    liquidity,
    altman,
    beneish,
    values: {
      revenue,
      netIncome,
      grossMargin,
      netMargin,
      roa,
      roe,
      revenueGrowth,
      currentRatio,
      debtRatio,
      receivablesToRevenue,
      cashFlowToNetIncome,
      ocfMargin,
      workingCapital,
    },
  }
}

export function buildCorporateMemo(company) {
  const decision = buildCorporateDecision(company)
  return [
    `CORPORATE DECISION: ${decision.recommendation.title}`,
    `Company: ${decision.company}`,
    `Counterparty score: ${decision.compositeScore}/100`,
    `Recommended exposure: ${decision.exposure.displayAmount}`,
    `Payment terms: ${decision.exposure.termDays} days`,
    `Review cadence: ${decision.exposure.reviewCadence}`,
    '',
    'Rationale:',
    decision.recommendation.summary,
    '',
    'Required actions:',
    ...decision.actionItems.map(item => `- ${item}`),
    '',
    'Key evidence:',
    ...decision.evidence.slice(0, 8).map(item => `- ${item.metric}: ${item.reading} versus ${item.threshold}. ${item.status}.`),
  ].join('\n')
}
