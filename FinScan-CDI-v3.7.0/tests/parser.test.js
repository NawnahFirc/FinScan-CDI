import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseCSVText } from '../src/lib/api.js'
import { finalizeStatementExtraction } from '../src/lib/extractionSchema.js'
import { buildAvailableDataSignals, buildForensicReadiness, computeAltmanDetails, computeBeneishDetails, postProcessParsed } from '../src/lib/finance.js'
import { extractRisCoFinancialReport } from '../src/lib/pdfLocal.js'

function groupItemsIntoRows(items, yTolerance = 2.5) {
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

function rowText(row) {
  return [...row]
    .sort((a, b) => a.x - b.x)
    .map(item => item.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function pdfRowsFromFixture(filePath) {
  const data = await fs.readFile(filePath)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true }).promise
  const rows = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const items = textContent.items
      .filter(item => item.str?.trim())
      .map(item => ({
        text: item.str.trim(),
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
        page: pageNumber,
      }))
    groupItemsIntoRows(items).forEach(row => {
      rows.push({
        page: row[0]?.page || pageNumber,
        text: rowText(row),
        items: row.map(item => ({ text: item.text, x: item.x })),
      })
    })
  }
  await doc.destroy()
  return rows
}

describe('v3.5 parser contract', () => {
  it('extracts the attached DEKADENT RisCo financial report as a golden fixture', async () => {
    const fixture = path.resolve('samples/dekadent_risco_report.pdf')
    const rows = await pdfRowsFromFixture(fixture)
    const company = extractRisCoFinancialReport(rows, {
      fileName: 'dekadent_risco_report.pdf',
      standard: 'international',
    })

    expect(company.company).toBe('DEKADENT CONSTRUCT S.R.L.')
    expect(company.currency).toBe('EUR')
    expect(company.years).toEqual(['2022', '2023', '2024'])
    expect(company.revenue).toEqual([843302, 4401539, 7389296])
    expect(company.netIncome).toEqual([167736, 431011, 807697])
    expect(company.grossProfit).toEqual([176000, 516960, 952031])
    expect(company.currentAssets).toEqual([417023, 2056682, 2916060])
    expect(company.receivables).toEqual([184851, 1113749, 2155200])
    expect(company.cash).toEqual([98278, 887415, 435974])
    expect(company.equity).toEqual([167738, 423793, 792043])
    expect(company.totalLiabilities).toEqual([249602, 1600432, 2468138])
    expect(company._extraction.sourceType).toBe('pdf-risco-report')
    expect(company._extraction.fields.revenue.evidence[0].page).toBe(2)
  }, 30000)

  it('parses European thousands and marks source evidence for CSV rows', () => {
    const csv = [
      'Metric,2022,2023,2024',
      'Sales revenues,843.302,4.401.539,7.389.296',
      'Gross Profit / Loss,176.000,516.960,952.031',
      'Net Profit / Loss,167.736,431.011,807.697',
      'Current asset,417.023,2.056.682,2.916.060',
      'Own Capitals,167.738,423.793,792.043',
      'Liabilities,249.602,1.600.432,2.468.138',
    ].join('\n')
    const company = parseCSVText(csv, { fileName: 'risco.csv', standard: 'international' })
    expect(company.revenue).toEqual([843302, 4401539, 7389296])
    expect(company._extraction.fields.revenue.status).toBe('extracted')
  })

  it('computes deterministic missing fields and keeps derivation evidence', () => {
    const result = finalizeStatementExtraction({
      company: 'Derivation SAS',
      period: '2024',
      currency: 'EUR',
      years: ['2024'],
      revenue: [1000],
      cogs: 600,
      totalAssets: [900],
      equity: [300],
    }, {
      sourceType: 'unit-test',
      matchedFields: new Set(['revenue', 'cogs', 'totalAssets', 'equity']),
      sources: {
        revenue: { label: 'Chiffre affaires 1000' },
        cogs: { label: 'Achats consommes 600' },
        totalAssets: { label: 'Total actif 900' },
        equity: { label: 'Capitaux propres 300' },
      },
    })
    expect(result.grossProfit).toEqual([400])
    expect(result.totalLiabilities).toEqual([600])
    expect(result._extraction.fields.grossProfit.status).toBe('derived')
    expect(result._extraction.fields.grossProfit.formula).toBe('grossProfit = revenue - cogs')
  })

  it('keeps absent values explicit instead of treating every zero as extracted', () => {
    const company = parseCSVText([
      'Metric,2024',
      'Revenue,1000',
      'Net Income,120',
      'Total Assets,900',
      'Equity,300',
    ].join('\n'), { fileName: 'partial.csv', standard: 'international' })
    expect(company.totalLiabilities).toEqual([600])
    expect(company._extraction.fields.totalLiabilities.status).toBe('derived')
    expect(company._extraction.fields.currentLiabilities.status).toBe('missing')
  })

  it('does not suppress fraud models solely because a reporting-basis review warning exists', () => {
    const company = postProcessParsed({
      company: 'Warning Basis SARL',
      period: '2024',
      years: ['2023', '2024'],
      revenue: [1000, 1250],
      grossProfit: [320, 420],
      ebit: [120, 160],
      netIncome: [80, 115],
      totalAssets: [900, 1100],
      totalLiabilities: [420, 500],
      equity: [480, 600],
      retainedEarnings: [130, 180],
      currentAssets: [520, 650],
      currentLiabilities: [260, 300],
      receivables: [180, 210],
      fixedAssets: [240, 300],
      cash: [90, 120],
      inventory: [80, 110],
      cashFlow: [70, 105],
      debt: [420, 500],
      dotAmort: 28,
      prevDotAmort: 24,
      curSGA: 160,
      prevSGA: 140,
      _extraction: {
        warnings: ['Income statement values were matched from consolidated tables while balance-sheet values were matched from the statutory balance sheet. Review extracted values before relying on the ratios.'],
      },
    })

    const altman = computeAltmanDetails(company)
    const beneish = computeBeneishDetails(company)
    const readiness = buildForensicReadiness(company)

    expect(altman.available).toBe(true)
    expect(altman.scoreDisplay).not.toBe('n/a')
    expect(altman.note).toContain('reporting-basis caution')
    expect(beneish.available).toBe(true)
    expect(beneish.mscore).not.toBe('n/a')
    expect(beneish.note).toContain('reporting-basis caution')
    expect(readiness.altman.ready).toBe(true)
    expect(readiness.beneish.ready).toBe(true)
  })

  it('uses exact private non-manufacturing Altman inputs when revenue is unavailable', () => {
    const company = postProcessParsed({
      company: 'No Revenue Holdco',
      period: '2024',
      years: ['2023', '2024'],
      revenue: [0, 0],
      ebit: [100, 140],
      netIncome: [70, 95],
      totalAssets: [900, 1000],
      totalLiabilities: [400, 440],
      equity: [500, 560],
      retainedEarnings: [120, 160],
      currentAssets: [420, 500],
      currentLiabilities: [210, 230],
      receivables: [0, 0],
      cash: [150, 170],
      inventory: [0, 0],
      cashFlow: [80, 100],
      debt: [400, 440],
    })

    const altman = computeAltmanDetails(company)

    expect(altman.available).toBe(true)
    expect(altman.variant).toBe('private-non-manufacturing-z-double-prime')
    expect(altman.components.map(component => component.id)).not.toContain('X5')
    expect(altman.benchmarkText).toContain('2.60')
  })

  it('withholds the Beneish composite instead of neutral-filling missing variables', () => {
    const company = postProcessParsed({
      company: 'Partial Beneish SARL',
      period: '2024',
      years: ['2023', '2024'],
      revenue: [1000, 1200],
      grossProfit: [300, 360],
      netIncome: [80, 90],
      totalAssets: [900, 1000],
      totalLiabilities: [400, 450],
      equity: [500, 550],
      currentAssets: [400, 450],
      currentLiabilities: [200, 230],
      receivables: [120, 160],
      fixedAssets: [300, 340],
      cashFlow: [70, 85],
    })

    const beneish = computeBeneishDetails(company)
    const readiness = buildForensicReadiness(company)
    const availableSignals = buildAvailableDataSignals(company)

    expect(beneish.available).toBe(false)
    expect(beneish.statusLabel).toBe('Input Gap')
    expect(beneish.mscore).toBe('not computed')
    expect(beneish.note).toContain('No neutral-filled')
    expect(availableSignals.available).toBe(true)
    expect(availableSignals.checks.length).toBeGreaterThan(3)
    expect(availableSignals.note).toContain('available-data financial screen')
    expect(readiness.beneish.ready).toBe(false)
    expect(readiness.beneish.groups.find(group => group.id === 'DEPI').missing).toContain('Depreciation / Amortization')
    expect(readiness.beneish.groups.find(group => group.id === 'SGAI').missing).toContain('Current SG&A / Operating Expenses')
  })
})
