import {parseOcrPages, parseOcrAmount} from './ocrLayout.js'
import {cleanTableImage} from './ocrImage.js'
import {refineOcrNumbers} from './ocrRefine.js'
import {parseRowsToCompany} from './api.js'

let workerPromise=null
let progressHandler=null
export const parseEuropean=parseOcrAmount
async function getWorker(onProgress) {
  progressHandler=onProgress
  if(!workerPromise) workerPromise=(async()=>{
    const {createWorker}=await import('tesseract.js')
    const base=import.meta.env?.BASE_URL || '/'
    const w=await createWorker(['fra','eng'],1,{
      workerPath:base+'ocr/worker.min.js',corePath:base+'ocr/core',langPath:base+'ocr/lang',gzip:false,workerBlobURL:false,
      logger:m=>progressHandler?.({stage:'recognize',status:m.status,progress:m.progress||0}),
    })
    await w.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'})
    return w
  })().catch(error=>{workerPromise=null;throw error})
  return workerPromise
}
const makeCanvas=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas}

export async function recognizeFinancialPage(canvas,worker,pageNumber) {
  const {data:raw}=await worker.recognize(canvas,{}, {blocks:true})
  const clean=makeCanvas(canvas.width,canvas.height),ctx=clean.getContext('2d')
  ctx.drawImage(canvas,0,0)
  ctx.putImageData(cleanTableImage(ctx.getImageData(0,0,clean.width,clean.height)),0,0)
  const {data:cleaned}=await worker.recognize(clean,{}, {blocks:true})
  const best=raw.confidence>=cleaned.confidence?raw:cleaned
  const page=await refineOcrNumbers({page:pageNumber,width:canvas.width,height:canvas.height,text:best.text,blocks:best.blocks,confidence:best.confidence},canvas,worker,makeCanvas)
  const other=best===raw?cleaned:raw
  const alternate=await refineOcrNumbers({page:pageNumber,width:canvas.width,height:canvas.height,text:other.text,blocks:other.blocks,confidence:other.confidence},canvas,worker,makeCanvas)
  page.alternativeLayout=alternate.layout
  clean.width=0;clean.height=0
  return page
}

export function parseOcrText(text, options={}) {
  const rows=text.split(/\r?\n/).map(line=>line.trim().split(/\s*[|\t]\s*|\s{2,}/))
  const company=parseRowsToCompany(rows,{...options,sourceType:'ocr-text'})
  if(!company) throw Object.assign(new Error('OCR text does not contain readable financial tables.'),{code:'OCR_NO_FIELDS'})
  return company
}

export async function ocrPdfToCompany(file,{onProgress,renderScale=2.5,...options}={}) {
  const lib=await import('pdfjs-dist/build/pdf.mjs')
  lib.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise
  try {
    if(pdf.numPages>40) throw new Error('This scan has more than 40 pages. Split it into smaller statement sets before OCR.')
    onProgress?.({stage:'init'})
    const worker=await getWorker(onProgress),pages=[]
    for(let p=1;p<=pdf.numPages;p++) {
      onProgress?.({stage:'page',page:p,total:pdf.numPages})
      const page=await pdf.getPage(p),natural=page.getViewport({scale:renderScale})
      const scale=Math.min(renderScale,renderScale*Math.sqrt(12000000/(natural.width*natural.height)))
      const viewport=page.getViewport({scale}),canvas=makeCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height))
      try {
        await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise
        pages.push(await recognizeFinancialPage(canvas,worker,p))
      } finally {canvas.width=0;canvas.height=0;page.cleanup()}
    }
    const totalChars=pages.reduce((n,p)=>n+p.text.length,0)
    const company=parseOcrPages(pages,{...options,fileName:file.name})
    return {company,totalChars,pageCount:pages.length}
  } finally {await pdf.destroy();await disposeOcrWorker()}
}

export async function ocrImageToCompany(file,{onProgress,...options}={}) {
  onProgress?.({stage:'init'})
  const worker=await getWorker(onProgress),bitmap=await createImageBitmap(file)
  const scale=Math.min(1,Math.sqrt(12000000/(bitmap.width*bitmap.height)))
  const canvas=makeCanvas(Math.ceil(bitmap.width*scale),Math.ceil(bitmap.height*scale))
  try {
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
    onProgress?.({stage:'page',page:1,total:1})
    const page=await recognizeFinancialPage(canvas,worker,1)
    return {company:parseOcrPages([page],{...options,fileName:file.name,sourceType:'image-ocr'}),totalChars:page.text.length,pageCount:1}
  } finally {bitmap.close();canvas.width=0;canvas.height=0;await disposeOcrWorker()}
}

export async function disposeOcrWorker() {
  const pending=workerPromise;workerPromise=null
  if(pending) {const worker=await pending;await worker.terminate()}
}
