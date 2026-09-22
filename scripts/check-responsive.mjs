// Browser regression against the actual WebGL application. Run with local Vite.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const base=process.env.REVIEW_URL || "http://127.0.0.1:5204";
const output=resolve(".tools/responsive");await mkdir(output,{recursive:true});
const engine=process.env.REVIEW_ENGINE || "chromium";
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const cases=engine==='webkit' ? [['safari-portrait',390,844,true],['safari-landscape',844,390,true]] :
  [['desktop',1920,1080,false],['laptop',1440,900,false],['wide',2560,1080,false],['ultrawide',3840,1080,false],['tablet',1280,1024,false],['landscape',844,390,true],['portrait',390,844,true],['small',320,568,true],['short-landscape',568,320,true]];
const report=[];
const stats=page=>page.evaluate(()=>window.rhine.stats());
async function bounds(page,selectors){return page.evaluate(selectors=>Object.fromEntries(selectors.map(s=>{const el=document.querySelector(s),r=el.getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}]})),selectors)}
async function inside(page,selectors,w,h){const rects=await bounds(page,selectors);for(const [s,r] of Object.entries(rects))assert.ok(r.x>=-1&&r.y>=-1&&r.right<=w+1&&r.bottom<=h+1,`${s} outside ${w}x${h}: ${JSON.stringify(r)}`);return rects}
async function touch(page,points){
  if(engine==='webkit') {
    // Real WebKit pointer handlers; real multi-touch requires an iPhone.
    await page.evaluate(points=>{const el=document.querySelector('#three-scene canvas');el.setPointerCapture=()=>{};for(const [i,[x,y]] of points.entries())el.dispatchEvent(new PointerEvent(i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove',{pointerId:77,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true}));},points);return;
  }
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:points[0][0],y:points[0][1],id:1}]});
  for(const [x,y] of points.slice(1)){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});await page.waitForTimeout(16)}
  // These are precise single-cell gestures; free flicks have their own momentum checks.
  await page.waitForTimeout(160);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}
try{
for(const [name,width,height,mobile] of cases.filter(([name])=>!process.env.REVIEW_CASES||process.env.REVIEW_CASES.split(',').includes(name))){
 const context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?scene=archive`);
 await page.waitForFunction(()=>window.rhine?.stats().ready&&!document.querySelector('#loading'),null,{timeout:60000});
 await page.waitForFunction(()=>window.rhine.stats().extraction>=.395,null,{timeout:60000});await page.waitForTimeout(300);
 const entry={name,viewport:{width,height},errors};report.push(entry);
 entry.archive=await inside(page,['.brand','.system-nav','.read-file','.archive-navigation','.column-navigation','.archive-counter'],width,height);
 await page.screenshot({path:resolve(output,`${name}-archive-final.png`)});
 const before=await stats(page);
 if(mobile){
   const y=Math.round(height*(width>height?.4:.25)),x=Math.round(width*.4);
   let vector=(await stats(page)).dragProjection.lane;
   await touch(page,[[x,y],[x+vector.x*.4,y+vector.y*.4],[x+vector.x*.8,y+vector.y*.8]]);
   await page.waitForFunction(()=>!rhine.stats().archiveMomentum);
   assert.equal((await stats(page)).selectedCell.lane,before.selectedCell.lane+1,'Projected column travel advances one column');
   const row=(await stats(page)).selectedCell.row;
   vector=(await stats(page)).dragProjection.row;
   await touch(page,[[x,y],[x+vector.x*.4,y+vector.y*.4],[x+vector.x*.8,y+vector.y*.8]]);
   await page.waitForFunction(()=>!rhine.stats().archiveMomentum);
   assert.equal((await stats(page)).selectedCell.row,row+1,'Projected depth travel advances one file');
 }
 // Eight steps traverse the seam without changing the remembered content.
 const loop=await stats(page);
 for(let i=0;i<8;i++){await page.locator('[data-action="next"]').click();await page.waitForTimeout(65)}
 assert.equal((await stats(page)).selected,loop.selected);
 assert.equal((await stats(page)).selectedCell.row,loop.selectedCell.row+8);
 await page.waitForTimeout(2000);
 await page.locator('.read-file').click();
 await page.waitForFunction(()=>window.rhine.stats().decryption.clarity===1,null,{timeout:60000});await page.waitForTimeout(1400);
 entry.detail=await inside(page,['.back-button','.object-caption','.detail-content','.detail-actions'],width,height);
 entry.detailStats=await stats(page);
 await page.screenshot({path:resolve(output,`${name}-detail-final.png`)});
 assert.equal(entry.detailStats.extraction,4.05);
 assert.ok(entry.detailStats.canInspect);
 // The document can reach actions on short displays; bookmarking preserves scroll.
 await page.locator('[data-action="bookmark"]').scrollIntoViewIfNeeded();
 const scroll=await page.locator('.detail-content').evaluate(el=>el.scrollTop);
 await page.locator('[data-action="bookmark"]').click();
 assert.equal(await page.locator('.detail-content').evaluate(el=>el.scrollTop),scroll);
 await page.locator('[data-action="back"]').click();await page.waitForTimeout(350);
 for(const action of ['search','saved','settings']){
   await page.locator(`[data-action="${action}"]`).click();await page.waitForTimeout(350);
   await inside(page,['.terminal-modal','[data-action="close-modal"]'],width,height);
   if(action==='search'){
     await page.locator('#archive-search').fill('X-001');assert.equal(await page.locator('.result-row').count(),1);
     assert.ok(await page.locator('#archive-search').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
   }
   if(action==='settings')await page.screenshot({path:resolve(output,`${name}-settings-final.png`)});
   await page.locator('[data-action="close-modal"]').click();await page.waitForFunction(()=>!document.querySelector('.modal-backdrop'));
 }
 assert.deepEqual(errors,[]);console.log(`${engine} ${name}: passed`);await context.close();
}
}finally{await writeFile(resolve(output,`regression-${engine}.json`),JSON.stringify(report,null,2));await browser.close()}
