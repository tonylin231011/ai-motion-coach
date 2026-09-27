const base='https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com/ai-motion-coach/'
const page=await fetch(base+'?v=coach16')
const html=await page.text()
if(!page.ok || !html.includes('index-cfO2_1PW.js')) throw new Error('Latest page not served')
console.log('PASS: latest page and bundle reference')
for(const path of ['assets/index-cfO2_1PW.js','voice/v16-twist-start.mp3','voice/v16-twist-good.mp3','voice/v16-twist-finished.mp3','voice/v15-crunch-start.mp3']) {
 const r=await fetch(base+path), bytes=(await r.arrayBuffer()).byteLength
 if(!r.ok || bytes<1000) throw new Error(`Missing asset: ${path}`)
 console.log(path,r.status,r.headers.get('content-type'),bytes)
}
