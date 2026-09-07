import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
let child,base
beforeAll(async()=>{
  child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:'0',GEMINI_API_KEY:'',GOOGLE_API_KEY:'',OPENAI_API_KEY:'',AI_ANALYST_API_KEY:'',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']})
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),10000)
    child.stdout.on('data',chunk=>{
      const match=String(chunk).match(/http:\/\/localhost:(\d+)/)
      if(match){base='http://127.0.0.1:'+match[1];clearTimeout(timeout);resolve()}
    })
    child.once('error',reject)
  })
},15000)
afterAll(async()=>{if(child&&!child.killed){child.kill();await once(child,'exit')}})
const post=(body,headers={})=>fetch(base+'/api/parse-file',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})
describe('production server contract',()=>{
  it('serves health and the built app',async()=>{
    expect((await (await fetch(base+'/api/health')).json()).version).toBe('3.8.0')
    const r=await fetch(base+'/');expect(r.status).toBe(200)
    expect(r.headers.get('content-security-policy')).toContain("worker-src 'self' blob:")
    expect(await r.text()).toContain('<div id="root">')
  })
  it('accepts same-origin requests and extracts CSV without keys',async()=>{
    const r=await post({fileData:Buffer.from('Currency,EUR\nMetric,2024\nRevenue,1000\nNet Income,100\nTotal Assets,900\nEquity,300').toString('base64'),mimeType:'text/csv',fileName:'sample.csv'}, {Origin:base})
    expect(r.status).toBe(200);const c=await r.json();expect(c.totalLiabilities).toEqual([600])
  })
  it('returns 400 for malformed JSON and invalid base64',async()=>{
    expect((await post({fileData:'not base64!',mimeType:'text/csv'})).status).toBe(400)
    const r=await fetch(base+'/api/parse-file',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})
    expect(r.status).toBe(400);expect((await r.json()).error).toContain('Invalid JSON')
  })
  it('rejects unknown origins with a useful status',async()=>expect((await post({}, {Origin:'https://untrusted.example'})).status).toBe(403))
  it('serves OCR assets locally with JavaScript and WebAssembly MIME types',async()=>{
    expect((await fetch(base+'/ocr/worker.min.js')).headers.get('content-type')).toContain('javascript')
    expect((await fetch(base+'/ocr/core/tesseract-core-simd-lstm.wasm')).headers.get('content-type')).toContain('wasm')
  })
  it('does not return a previous filename from the content cache',async()=>{
    const fileData=Buffer.from('Currency,EUR\nMetric,2024\nRevenue,1000\nNet Income,100\nTotal Assets,900\nEquity,300').toString('base64')
    const a=await (await post({fileData,mimeType:'text/csv',fileName:'first.csv'})).json()
    const b=await (await post({fileData,mimeType:'text/csv',fileName:'second.csv'})).json()
    expect(a.company).toBe('first');expect(b.company).toBe('second')
  })
})
