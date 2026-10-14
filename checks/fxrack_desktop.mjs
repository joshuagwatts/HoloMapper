import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs=[];
page.on('pageerror',(e)=>errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof makeFxInst === 'function' && typeof S !== 'undefined', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,2500));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  try{
    // 1. Data model
    r.hasChains=Array.isArray(S.layerFx)&&Array.isArray(S.clipFx)&&Array.isArray(S.compFx);
    // 2. makeFxInst
    const inst=makeFxInst('kaleido');
    r.mkInst=!!inst&&inst.k==='kaleido'&&inst.on===true&&inst.v['P.kseg']!==undefined;
    r.mkBad=makeFxInst('nope')===null;
    // 3. Drop on clip (simulates drag-drop)
    dropFxOnClip('kaleido',0,0);
    r.clipChain=S.clipFx[0][0].length===1&&S.clipFx[0][0][0].k==='kaleido';
    // 4. Drop on layer
    dropFxOnLayer('glitch',1);
    r.layerChain=S.layerFx[1].length===1&&S.layerFx[1][0].k==='glitch';
    // 5. Comp FX
    const cinst=makeFxInst('mirror'); S.compFx.push(cinst);
    r.compChain=S.compFx.length===1;
    // 6. FX rack renders
    const tmp=document.createElement('div'); document.body.appendChild(tmp);
    buildFxRack(tmp,S.clipFx[0][0],()=>{});
    r.rackCards=tmp.querySelectorAll('.fxcard').length;
    r.rackParams=tmp.querySelectorAll('.fxparam').length;
    // 7. Browser has draggable FX
    buildFxBrowser();
    r.draggable=document.querySelectorAll('#btab-fx .fxrow.chainable[draggable="true"]').length;
    // 8. Deck clips have drop handlers (check via dataset or class)
    buildDeck();
    const clip=document.querySelector('.clip[data-i="0"][data-k="0"]');
    r.clipDrop=!!clip;
    // 9. applyFxChain doesn't throw
    try{
      const T=makeTarget(80,45);
      applyFxChain(T,S.clipFx[0][0],1.0);
      r.applyOk=true;
    }catch(e){ r.applyOk=false; r.applyErr=e.message; }
    r.status='ok';
  }catch(e){ r.status='FAIL:'+e.message+' @ '+((e.stack||'').split('\n')[1]||''); }
  return r;
});
check('chain data model exists', out.hasChains);
check('makeFxInst works', out.mkInst);
check('makeFxInst rejects bad key', out.mkBad);
check('dropFxOnClip adds to chain', out.clipChain);
check('dropFxOnLayer adds to chain', out.layerChain);
check('compFx chain works', out.compChain);
check('rack renders cards', out.rackCards===1, 'cards='+out.rackCards);
check('rack renders params', out.rackParams===2, 'params='+out.rackParams);
check('browser has draggable FX', out.draggable===7, 'draggable='+out.draggable);
check('deck clip exists for drop', out.clipDrop);
check('applyFxChain runs', out.applyOk, out.applyErr||'');
check('zero page errors', errs.length===0, errs.slice(0,3).join('|'));
console.log('status:', out.status);
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
