import fs from 'node:fs'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {parseCSVText,parseRowsToCompany,parseWorkbookSheets,parseFile} from '../src/lib/api.js'
import {finalizeStatementExtraction} from '../src/lib/extractionSchema.js'
import {normalizeCompanyData} from '../src/lib/companyData.js'
import {parseOcrPages,parseOcrAmount} from '../src/lib/ocrLayout.js'
import {updateReviewedValue} from '../src/lib/review.js'
import {buildCorporateDecision} from '../src/lib/corporateDecision.js'
import {buildLiquidityAnalysis,buildAnalystMemoText} from '../src/lib/liquidity.js'
import {computeBeneishDetails} from '../src/lib/finance.js'
import {divide,changePercent,fixed} from '../src/lib/numeric.js'
const csv=(body)=>parseCSVText('Company,Example\nCurrency,EUR\nMetric,2024\n'+body,{fileName:'example.csv'})

describe('tabular ingestion',()=>{
  it.each([';', '\t','|'])('supports %j delimiters, metadata and descending years',delimiter=>{
    const c=parseCSVText(['Company;Acme','Currency;EUR','Metric;2024;2023','Revenue;1200;1000','Net Income;(120);0'].join('\n').replaceAll(';',delimiter))
    expect(c.company).toBe('Acme');expect(c.currency).toBe('EUR')
    expect(c.years).toEqual(['2023','2024']);expect(c.revenue).toEqual([1000,1200]);expect(c.netIncome).toEqual([0,-120])
  })
  it('handles UTF-8 BOM, quoted decimals and escaped quotes',()=>{
    const c=parseCSVText('\uFEFFCompany,"Acme ""Holdings"""\nCurrency,EUR\nMetric,2024\nRevenue,"1.234,56"')
    expect(c.company).toBe('Acme "Holdings"');expect(c.revenue).toEqual([1234.56])
  })
  it('rejects malformed CSV quoting',()=>expect(()=>parseCSVText('Metric,2024\nRevenue,"123')).toThrow('unclosed'))
  it('preserves zero and missing cells separately',()=>{
    const c=parseCSVText('Metric,2023,2024\nRevenue,1000,\nNet Income,0,0\nTotal Assets,500,600\nEquity,200,300')
    expect(c.revenue).toEqual([1000,null]);expect(c._extraction.missingCritical).toContain('revenue')
    expect(c.netIncome).toEqual([0,0]);expect(c._extraction.fields.netIncome.status).toBe('extracted')
  })
  it('keeps every year in a column-oriented export',()=>{
    const c=parseCSVText('Year,Company,Revenue,Net Income\n2024,Acme,1200,100\n2023,Acme,1000,80')
    expect(c.revenue).toEqual([1000,1200]);expect(c.years).toEqual(['2023','2024'])
  })
  it('rejects mixed company rows instead of discarding companies',()=>expect(()=>parseCSVText('Year,Company,Revenue,Net Income\n2024,A,100,5\n2024,B,200,6')).toThrow('multiple companies'))
  it('does not confuse equity-inclusive French passif with liabilities',()=>{
    const c=csv('Revenue,1000\nTotal actif,900\nTotal passif,900\nCapitaux propres,300')
    expect(c.totalLiabilities).toEqual([600]);expect(c._extraction.hasBalanceSheetError).toBe(false)
  })
  it('does not overwrite current assets with non-current or change rows',()=>{
    const c=csv('Revenue,1000\nCurrent Assets,500\nNon Current Assets,800\nChange in current assets,50')
    expect(c.currentAssets).toEqual([500]);expect(c.fixedAssets).toEqual([800])
  })
  it('merges complementary workbook sheets and keeps actual source cells',()=>{
    const c=parseWorkbookSheets([{sheet:'Cover',data:[['Financial statements']]},{sheet:'Income',data:[['Metric','2024'],['Revenue',1000]]},{sheet:'Balance',data:[['Metric','2024'],[],['Total Assets',900],['Equity',300]]}],{fileName:'Acme.xlsx'})
    expect(c.revenue).toEqual([1000]);expect(c.totalLiabilities).toEqual([600]);expect(c._extraction.sources.totalAssets.cell).toBe('B3')
  })
})

describe('evidence, review and financial calculations',()=>{
  it('derives with zero equity and never coerces null to zero',()=>{
    const c=finalizeStatementExtraction({years:['2023','2024'],totalAssets:[null,900],equity:[0,0]},{matchedFields:new Set(['totalAssets','equity'])})
    expect(c.totalLiabilities).toEqual([null,900]);expect(c._extraction.fields.equity.status).toBe('extracted')
  })
  it('does not replace an explicitly extracted zero with a derivation',()=>{
    const c=csv('Revenue,1000\nGross Profit,0\nCOGS,400')
    expect(c.grossProfit).toEqual([0]);expect(c._extraction.fields.grossProfit.status).toBe('extracted')
  })
  it('recalculates dependent figures after editing and preserves reviewed zero',()=>{
    let c=csv('Revenue,1000\nTotal Assets,900\nEquity,300')
    c=updateReviewedValue(c,'equity',0,'0')
    expect(c.totalLiabilities).toEqual([900]);expect(c._extraction.fields.equity.status).toBe('reviewed')
    c=updateReviewedValue(c,'equity',0,'')
    expect(c.equity).toEqual([null]);expect(c._extraction.fields.equity.status).toBe('missing')
  })
  it('converts source currency once across cache restoration',()=>{
    const c=csv('Revenue,1000\nCurrent Liabilities,100')
    c.currency='MAD';c.originalCurrency='MAD'
    const first=normalizeCompanyData(c),restored=normalizeCompanyData(first)
    expect(restored.revenue).toEqual(first.revenue);expect(first.payables).toEqual([null])
  })
  it('keeps missing OCF and inventory metrics unavailable',()=>{
    const c=normalizeCompanyData(csv('Revenue,1000\nNet Income,100\nCurrent Assets,500\nCurrent Liabilities,200'))
    const l=buildLiquidityAnalysis(c)
    expect(l.metrics.find(m=>m.key==='cashBurnRate').current.value).toBe(null)
    expect(l.metrics.find(m=>m.key==='dio').current.value).toBe(null)
    expect(buildAnalystMemoText(c)).not.toMatch(/NaN|undefined/)
  })
  it('withholds exposure recommendations for incomplete or inconsistent statements',()=>{
    const c=normalizeCompanyData(csv('Revenue,1000\nNet Income,100'))
    const d=buildCorporateDecision(c)
    expect(d.recommendation.title).toBe('Review required')
    const bad=csv('Revenue,1000\nNet Income,100\nTotal Assets,1000\nTotal Liabilities,500\nEquity,800\nCurrent Assets,600\nCurrent Liabilities,200')
    expect(bad._extraction.hasBalanceSheetError).toBe(true)
    expect(buildCorporateDecision(normalizeCompanyData(bad)).recommendation.title).toBe('Review required')
  })
})

describe('user-supplied scans: frozen OCR layout regression fixtures',()=>{
  const fixture=name=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name+'-ocr.json',import.meta.url)))
  it.skipIf(!fs.existsSync(new URL('./fixtures/gems-ocr.json',import.meta.url)))('matches the GEMS 2023 and 2022 statement totals and cash flow',()=>{
    const c=parseOcrPages(fixture('gems'),{fileName:'Bilan GEMS Construction 2023.pdf'})
    expect(c.years).toEqual(['2022','2023'])
    expect(c.revenue).toEqual([245692.569,1119279.152]);expect(c.netIncome).toEqual([7376.958,127545.644])
    expect(c.totalAssets).toEqual([719569.625,566198.511]);expect(c.equity).toEqual([194517.684,322063.328])
    expect(c.totalLiabilities).toEqual([525051.941,244135.183]);expect(c.cashFlow).toEqual([16107.693,182752.754])
    expect(c.inventory).toEqual([336954.394,0]);expect(c.payables).toEqual([98384.042,82007.673])
    expect(c._extraction.sources.revenue.page).toBe(4)
  })
  it.skipIf(!fs.existsSync(new URL('./fixtures/mzabi-ocr.json',import.meta.url)))('handles MZABI reverse cash-flow columns and blank current revenue',()=>{
    const c=parseOcrPages(fixture('mzabi'),{fileName:'ETATS FINANCIERS 2024 SUARL MZABI.pdf'})
    expect(c.currency).toBe('TND');expect(c.years).toEqual(['2023','2024'])
    expect(c.revenue).toEqual([40527.801,null]);expect(c.netIncome).toEqual([2461.103,-5203.281])
    expect(c.totalAssets).toEqual([82362.67,83966.939]);expect(c.totalLiabilities).toEqual([38129.898,44937.448])
    expect(c.currentAssets).toEqual([81568.832,83633.759]);expect(c.cash.at(-1)).toBe(63239.402)
    expect(c.cashFlow).toEqual([null,1710.967]);expect(c._extraction.missingCritical).toContain('revenue')
  })
  it('preserves millimes, accounting negatives and rejects mangled numbers',()=>{
    expect(parseOcrAmount('333.180')).toBe(333.18);expect(parseOcrAmount('(5 203,281)')).toBe(-5203.281)
    expect(parseOcrAmount('61 . o7e7')).toBe(null)
  })
})

describe('API retry behavior',()=>{
  afterEach(()=>vi.unstubAllGlobals())
  it('does not repeat a non-retryable failed upload',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:false,status:415,json:async()=>({error:'Unsupported'})})
    vi.stubGlobal('fetch',fetch)
    await expect(parseFile({fileData:'x',mimeType:'invalid'})).rejects.toThrow('Unsupported')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('calculation accuracy',()=>{
  it('keeps missing and zero denominators unavailable and preserves negative equity',()=>{
    expect(fixed(divide(null,100))).toBe('n/a')
    expect(fixed(divide(100,0))).toBe('n/a')
    expect(divide(100,-200)).toBe(-0.5)
    expect(fixed(changePercent(null,100))).toBe('n/a')
    expect(changePercent(0,100)).toBe(-100)
    const c=normalizeCompanyData(csv('Net Income,100\nTotal Assets,1000'))
    expect(Number.isNaN(buildCorporateDecision(c).values.netMargin)).toBe(true)
  })
  it('uses gross margins and positive expense magnitudes in Beneish indicators',()=>{
    const d={revenue:[1000,1200],grossProfit:[400,360],fixedAssets:[200,240],dotAmort:-60,prevDotAmort:-50}
    const rows=computeBeneishDetails(d).rows
    expect(rows.find(r=>r.id==='GMI').value).toBe(1.33)
    expect(rows.find(r=>r.id==='DEPI').value).toBe(1)
    expect(rows.find(r=>r.id==='TATA').missingInput).toBe(true)
    delete d.grossProfit
    expect(computeBeneishDetails(d).rows.find(r=>r.id==='GMI').missingInput).toBe(true)
  })
  it('does not collapse years or detect a currency from stray text in notes',()=>{
    const layout={yearColumns:['2023','2023'],columns:[100,200],rows:[
      {page:1,label:'Revenus',cells:['120.000','100.000'],confidence:[90,90]},
      {page:1,label:'Resultat net de l exercice',cells:['12.000','10.000'],confidence:[90,90]},
    ]}
    const c=parseOcrPages([{page:1,text:'Montants en Dinars\nSysteme comptable tunisien\nEUR\n',confidence:90,layout}],{fileName:'Statement 2023.pdf'})
    expect(c.currency).toBe('TND');expect(c.currencyConfidence).toBe('ambiguous')
    expect(c.years).toEqual(['2022','2023'])
    expect(c.revenue).toEqual([100,120])
  })
})
