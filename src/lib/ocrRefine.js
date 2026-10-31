import { layoutOcrPage } from './ocrLayout.js'

export async function refineOcrNumbers(page, canvas, worker, makeCanvas) {
  const layout=layoutOcrPage(page)
  if(!layout.columns.length) return page
  await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,()- '})
  try {
    for(const row of layout.rows) {
      if(!/[a-z]{3}/i.test(row.label) || !row.cells.some(c=>/\d/.test(c))) continue
      for(let i=0;i<layout.columns.length;i++) {
        const box=row.cellBoxes[i]
        if(!box) continue
        const right=box.x1+2
        const left=Math.max(0,box.x0-2)
        const h=box.y1-box.y0+4
        const top=Math.max(0,box.y0-2)
        if(top+h>canvas.height) continue
        const crop=makeCanvas(Math.ceil((right-left)*2+20),Math.ceil(h*2+20))
        const ctx=crop.getContext('2d')
        ctx.fillStyle='#fff';ctx.fillRect(0,0,crop.width,crop.height)
        ctx.drawImage(canvas,left,top,right-left,h,10,10,(right-left)*2,h*2)
        const input=crop.toBuffer ? crop.toBuffer('image/png') : crop
        const {data}=await worker.recognize(input)
        const value=data.text.trim()
        if(value && /\d/.test(value) && (!/[.,]/.test(row.cells[i]) || /[.,]/.test(value))) {
          row.cells[i]=value;row.confidence[i]=data.confidence
        }
        crop.width=0;crop.height=0
      }
    }
    return {...page,layout}
  } finally {
    await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''})
  }
}
