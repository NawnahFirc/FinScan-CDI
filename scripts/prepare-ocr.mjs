import { mkdir, copyFile, readdir } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'public/ocr')
await mkdir(path.join(output, 'core'), {recursive:true})
await mkdir(path.join(output, 'lang'), {recursive:true})
await copyFile(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(output, 'worker.min.js'))
for (const file of await readdir(path.join(root, 'node_modules/tesseract.js-core'))) {
  if (/\.wasm(\.js)?$/.test(file)) await copyFile(path.join(root, 'node_modules/tesseract.js-core', file), path.join(output, 'core', file))
}
for (const lang of ['eng', 'fra']) await copyFile(path.join(root, lang + '.traineddata'), path.join(output, 'lang', lang + '.traineddata'))
console.log('Local OCR assets ready.')
