import { detectCurrencyFromText, UNKNOWN_CURRENCY } from './currency.js'
import { finalizeStatementExtraction, MONEY_ARRAY_FIELDS, MONEY_SCALAR_FIELDS } from './extractionSchema.js'

const norm = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' et ').replace(/[^a-z0-9]+/g,' ').trim()
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)] || 0
export function ocrWords(page) {
  return (page.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(p => (p.lines || []).flatMap(l => l.words || [])))
    .filter(w => w.bbox && w.text?.trim())
}

// OCR statements often print three decimals (Tunisian millimes). A printed
// decimal is preserved; missing separators are never silently guessed.
export function parseOcrAmount(text) {
  const raw = text.trim().replace(/[|\[\]{}_~“”]/g,'').replace(/−/g,'-').trim()
  if (!/^\(?-?\s*\d[\d\s.,']*\)?$/.test(raw)) return null
  const negative = raw.startsWith('-') || raw.startsWith('(')
  let cleaned = raw.replace(/[()\s'-]/g,'')
  if ((cleaned.match(/[.,]/g)||[]).length > 1) {
    // Mixed decimal conventions are valid; repeated decimal separators are
    // accepted only as consistent three-digit grouping.
    if (!/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,3})?$/.test(cleaned)) return null
    const split=Math.max(cleaned.lastIndexOf('.'),cleaned.lastIndexOf(','))
    cleaned=cleaned.slice(0,split).replace(/[.,]/g,'')+'.'+cleaned.slice(split+1)
  } else cleaned=cleaned.replace(',','.')
  const value=Number(cleaned)
  return Number.isFinite(value) ? (negative ? -value : value) : null
}

export function layoutOcrPage(page) {
  const words=ocrWords(page)
  const width=page.width || Math.max(...words.map(w=>w.bbox.x1),1)
  const height=page.height || Math.max(...words.map(w=>w.bbox.y1),1)
  const yearWords=words.filter(w=>/^20\d{2}$/.test(w.text.replace(/[^\d]/g,'')) && w.bbox.x0>width*.5 && w.bbox.y0>height*.10 && w.bbox.y0<height*.4)
  const sortedYears=[...yearWords].sort((a,b)=>a.bbox.x0-b.bbox.x0)
  const firstYear=sortedYears[0]
  const secondYear=sortedYears.find(w=>w!==firstYear && w.text.replace(/\D/g,'')!==firstYear.text.replace(/\D/g,'') && Math.abs(w.bbox.y0-firstYear.bbox.y0)<height*.04)
  const yearPair=secondYear ? [firstYear,secondYear] : []
  const slope=yearPair.length && Math.abs(yearPair[1].bbox.y0-yearPair[0].bbox.y0)<height*.04
    ? (yearPair[1].bbox.y0-yearPair[0].bbox.y0)/(yearPair[1].bbox.x0-yearPair[0].bbox.x0) : 0
  const buckets=[]
  words.filter(w=>/\d[.,]\d{3}[|\])}]*$/.test(w.text) && w.bbox.x1>width*.55).forEach(w=>{
    let b=buckets.find(b=>Math.abs(b.x-w.bbox.x1)<width*.035)
    if(!b) { b={x:w.bbox.x1,items:[]};buckets.push(b) }
    b.items.push(w);b.x=median(b.items.map(w=>w.bbox.x1))
  })
  const columns=buckets.sort((a,b)=>b.items.length-a.items.length).slice(0, /var\s*en/i.test(page.text) ? 3 : 2).sort((a,b)=>a.x-b.x).map(b=>b.x)
  if (!columns.length) return {rows:[],yearColumns:[],columns:[]}
  const gap=columns.length>1 ? median(columns.slice(1).map((x,i)=>x-columns[i])) : width*.2
  const cutoff=columns[0]-gap*1.05
  const heights=words.map(w=>w.bbox.y1-w.bbox.y0).filter(h=>h>5 && h<height*.03)
  const tolerance=Math.max(8,median(heights)*.65)
  const sorted=words.map(w=>({...w,y:(w.bbox.y0+w.bbox.y1)/2-slope*w.bbox.x0})).sort((a,b)=>a.y-b.y || a.bbox.x0-b.bbox.x0)
  const lines=[]
  for(const w of sorted) {
    let line=lines.at(-1)
    if(!line || Math.abs(w.y-line.y)>tolerance) {line={y:w.y,words:[]};lines.push(line)}
    line.words.push(w);line.y=median(line.words.map(w=>w.y))
  }
  const rows=lines.map(line=>{
    const ws=line.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)
    const cells=columns.map((x,i)=>{
      const candidates=ws.filter(w=>w.bbox.x1>(i===0?cutoff:columns[i-1]+gap*.2) && w.bbox.x1<=x+gap*.2 && /\d/.test(w.text))
      const groups=[]
      for(const w of candidates) {
        if(!groups.length || w.bbox.x0-groups.at(-1).at(-1).bbox.x1>median(heights)*1.2) groups.push([])
        groups.at(-1).push(w)
      }
      return groups.at(-1)||[]
    })
    return {page:page.page,baseline:line.y,cellBoxes:cells.map(c=>c.length?{x0:Math.min(...c.map(w=>w.bbox.x0)),y0:Math.min(...c.map(w=>w.bbox.y0)),x1:Math.max(...c.map(w=>w.bbox.x1)),y1:Math.max(...c.map(w=>w.bbox.y1))}:null),label:ws.filter(w=>w.bbox.x0<cutoff).map(w=>w.text).join(' ').replace(/\s+\d{1,4}\s*$/, ''),cells:cells.map(c=>c.map(w=>w.text).join(' ')), confidence:cells.map(c=>c.length ? median(c.map(w=>w.confidence)) : 0),bbox:{x0:Math.min(...ws.map(w=>w.bbox.x0)),y0:Math.min(...ws.map(w=>w.bbox.y0)),x1:Math.max(...ws.map(w=>w.bbox.x1)),y1:Math.max(...ws.map(w=>w.bbox.y1))}}
  })
  for(let i=0;i<rows.length-1;i++) {
    const row=rows[i], next=rows[i+1]
    if(row.label && !row.cells.some(c=>/\d/.test(c)) && !next.label && next.cells.some(c=>/\d/.test(c)) && next.baseline-row.baseline<tolerance*2.5) {
      row.cells=next.cells;row.cellBoxes=next.cellBoxes;row.confidence=next.confidence
    }
  }
  return {rows,columns,yearColumns:yearPair.map(w=>w.text.replace(/\D/g,'')),slope,gap,cutoff,textHeight:median(heights)}
}

const rules=[
  ['totalAssets', /total des capitaux propres (et )?(des )?passifs|total des actifs(?: res)?$|total actif$/,1],
  ['equity', /total des (c |cap |capitaux )?propres (av |avant |ev )?affectation/,1],
  ['equity', /^total des capitaux propres$/,2],
  ['totalLiabilities', /^total des passifs$/,1],
  ['currentAssets', /total des actifs courants$/,1],
  ['currentLiabilities', /total des passifs courants$/,1],
  ['fixedAssets', /total des actifs immobilises$/,1],
  ['revenue', /^revenus$|^revenue$|chiffre d affaires/,1],
  ['netIncome', /resultat net de l exercice|resultatnetdel exercice/,1],
  ['netIncome', /resultat des activites ord.*apres impot|resultat de l ex[er]*cice/,2],
  ['ebit', /resultat d exploitation/,1],
  ['receivables', /^clients et comptes rat[ta]*ches$|^creances clients$/,1],
  ['payables', /^fournisseurs et comptes rattaches$/,1],
  ['cash', /^liquidites et equivalents de liquidites$/,1],
  ['inventory', /^stocks$|^inventory$/,1],
  ['retainedEarnings', /^resultats reportes$|^report a nouveau$/,1],
  ['shareCapital', /^capital social$/,1],
  ['reserves', /^reserves$/,1],
  ['dotAmort', /^dotations aux amortissements/,1],
  ['chPersonnel', /^charges de personnel$/,1],
  ['autresCharges', /^autres charges d exploitation$|^autres charges exploitation$/,1],
  ['interest', /^charges financieres nettes$/,1],
  ['tax', /^impot sur les benefices$/,1],
  ['cashFlow', /flux d[eou ]+ tresorerie provenant de.*(exploitation|affectes a)/,1],
]

export function parseOcrPages(pages, options={}) {
  const layouts=pages.map(page=>page.layout || layoutOcrPage(page))
  const text=pages.map(p=>p.text).join('\n')
  const detected=options.currency ? detectCurrencyFromText(options.currency) : /dinars?\s+tunisiens?/i.test(text) ? detectCurrencyFromText('Dinar Tunisien') : /dinars?/i.test(text) && /tunisien/i.test(text) ? {code:'TND',confidence:'ambiguous',source:'Dinar amounts and Tunisian accounting context; confirm currency'} : detectCurrencyFromText(text.split('\n').filter(line=>/currency|devise|monnaie|expressed in|exprime|amounts in|milliers|millions/i.test(line)).join('\n'))
  const headerYears=layouts.find(l=>l.yearColumns.length===2 && new Set(l.yearColumns).size===2)?.yearColumns
  const periodMatches=[...text.matchAll(/(?:bilan au|financiers au|resultat au|arrete au)\s+\d{2}[-/]\d{2}[-/](20\d{2})/gi)]
  const currentYear=periodMatches[0]?.[1] || String(options.fileName || '').match(/20\d{2}/)?.[0]
  const years=headerYears ? [...new Set(headerYears)].sort() : currentYear ? [String(Number(currentYear)-1),currentYear] : ['Prior','Current']
  const company={company:options.fileName?.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ') || 'Uploaded Company',years,period:years.at(-1),currency:detected.code||UNKNOWN_CURRENCY,originalCurrency:detected.code||UNKNOWN_CURRENCY,currencyConfidence:detected.confidence,currencySource:detected.source,standard:options.standard||'international',_filename:options.fileName}
  for(const f of MONEY_ARRAY_FIELDS) company[f]=years.map(()=>null)
  for(const f of MONEY_SCALAR_FIELDS) company[f]=null
  const matches=new Map(), warnings=[], sources={}, matchedFields=new Set()
  const candidates=pages.flatMap((page,i)=>[{page,layout:layouts[i]},...(page.alternativeLayout?[{page,layout:page.alternativeLayout}]:[])])
  for(const {layout,page} of candidates) {
    const pageNorm=norm(page.text)
    const isNotes=/notes aux etats|note 1 presentation|note 8 clients/.test(pageNorm)
    if(isNotes) continue
    const order=layout.yearColumns.length===years.length && new Set(layout.yearColumns).size===years.length ? layout.yearColumns : [...years].reverse()
    for(const row of layout.rows) {
      const label=norm(row.label).replace(/^\d+ /,'').replace(/^[a-z] /,'')
      const rule=rules.find(([,pattern])=>pattern.test(label))
      if(!rule) continue
      const [field,,priority]=rule
      if(field==='cashFlow' && /invest|financement/.test(label)) continue
      const parsed=row.cells.map((raw,index)=>{
        const value=parseOcrAmount(raw)
        // A nonzero integer in a three-decimal monetary table may have lost
        // its decimal point. Withhold it rather than inflate it 1,000-fold.
        if(value!==null && value!==0 && !/[.,]/.test(raw) && detected.code==='TND') {
          warnings.push('Missing decimal separator for '+field+' on page '+row.page+'. Enter the amount from the source: '+raw)
          return null
        }
        if(value!==null && /[.,]\d{4,}/.test(raw)) {
          warnings.push('Unclear decimal digits for '+field+' on page '+row.page+'. Verify the source cell.')
          return null
        }
        return value
      })
      if(!parsed.some(v=>v!==null)) continue
      let values=years.map(year=>parsed[order.indexOf(year)] ?? null)
      if(layout.columns.length===3 && field==='cashFlow') values=years.map((_,j)=>j===years.length-1 ? parsed.at(-1) : null)
      const uncertain=row.cells.some((raw,j)=>parsed[j]!==null && (/\d{7,}/.test(raw.replace(/\s/g,'')) && !/[.,]/.test(raw) || row.confidence[j]<55))
      // Never let cash-flow reconciliation or note tables override the primary statement.
      if(field==='netIncome' && /etat de flux|flux de tresorerie lies/.test(pageNorm)) continue
      const old=matches.get(field)
      const quality=priority*100+(uncertain?50:0)
      if(old && old.quality<=quality) continue
      matches.set(field,{values,row,quality,uncertain})
    }
  }
  for(const [field,{values,row,uncertain}] of matches) {
    company[field]=MONEY_ARRAY_FIELDS.includes(field) ? values : values.at(-1)
    matchedFields.add(field)
    sources[field]={page:row.page,label:row.label,snippet:row.label+' | '+row.cells.join(' | '),bbox:row.bbox,confidence:median(row.confidence),evidence:years.map((year,index)=>({page:row.page,label:row.label,year,value:values[index],bbox:row.bbox}))}
    if(uncertain) warnings.push('Verify '+field+' on page '+row.page+': OCR confidence is low or a number separator may be missing.')
    if(field==='dotAmort' && values.length>1 && values.at(-2)!==null) {company.prevDotAmort=values.at(-2);matchedFields.add('prevDotAmort');sources.prevDotAmort=sources[field]}
  }
  if(matchedFields.size<2) throw Object.assign(new Error('OCR could not reliably match financial tables. Use AI-assisted extraction or a clearer scan.'),{code:'OCR_NO_FIELDS'})
  warnings.unshift('OCR was used. Review extracted values, blank cells and page evidence against the document before accepting.')
  company._extraction={ocrUsed:true,backendUsed:false,reviewed:false,currencyCode:company.currency,currencyConfidence:detected.confidence,currencySource:detected.source,currencyReviewRequired:company.currency===UNKNOWN_CURRENCY||detected.confidence==='ambiguous'}
  return finalizeStatementExtraction(company,{matchedFields,sources,warnings,sourceType:options.sourceType||'pdf-ocr',parser:'tesseract-layout',pageCount:pages.length,confidence:Math.min(90,Math.round(pages.reduce((s,p)=>s+p.confidence,0)/pages.length))})
}
