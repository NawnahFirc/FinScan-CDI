import { finalizeStatementExtraction, MONEY_ARRAY_FIELDS } from './extractionSchema.js'

export function updateReviewedValue(data, field, index, text) {
  const value=text.trim()==='' ? null : Number(text)
  if(value!==null && !Number.isFinite(value)) return data
  const next={...data,_extraction:{...data._extraction,fields:{...data._extraction?.fields},sources:{...data._extraction?.sources}}}
  next[field]=MONEY_ARRAY_FIELDS.includes(field) ? [...(data[field] || data.years.map(()=>null))] : value
  if(Array.isArray(next[field])) next[field][index]=value
  const matched=new Set(data._extraction?.matchedFields || [])
  const present=(Array.isArray(next[field])?next[field]:[next[field]]).some(Number.isFinite)
  if(present) matched.add(field);else matched.delete(field)
  const derived=new Set(data._extraction?.derivedFields || [])
  derived.delete(field)
  // Invalidate derived dependants so corrections update their calculations.
  for(const dependent of derived) {
    if(next._extraction.sources[dependent]?.inputs?.includes(field)) {
      next[dependent]=Array.isArray(next[dependent])?next[dependent].map(()=>null):null
      matched.delete(dependent);derived.delete(dependent)
    }
  }
  next._extraction.fields[field]={...next._extraction.fields[field],status:present?'reviewed':'missing',confidence:present?100:0}
  next._extraction.sources[field]={...next._extraction.sources[field],formula:null,derived:false,inputs:[],reviewedAt:new Date().toISOString()}
  next._extraction.reviewed=false
  return finalizeStatementExtraction(next,{matchedFields:matched,derivedFields:derived,sources:next._extraction.sources})
}

export function reviewValidationMessage(data) {
  if(!String(data.company||'').trim()) return 'Enter the company name before accepting.'
  if(!data.years?.length || data.years.some(y=>!/^20\d{2}$/.test(y))) return 'Confirm a four-digit fiscal year for every column.'
  if(data.years.some((y,i)=>i>0 && Number(y)<=Number(data.years[i-1]))) return 'Year columns must be unique and ordered from oldest to newest.'
  return ''
}
