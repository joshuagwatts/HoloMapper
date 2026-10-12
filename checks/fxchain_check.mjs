import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/mobile.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
const errs=[];
page.on('pageerror',(e)=>errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof S !== 'undefined' && typeof applyFxChain === 'function', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,1500));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  S.paused=true;
  const r={};
  r.hasLayerFx=Array.isArray(S.layerFx)&&S.layerFx.length===4;
  r.hasClipFx=Array.isArray(S.clipFx)&&S.clipFx.length===4&&S.clipFx[0].length===8;
  // make instances
  const inst1=makeFxInst('px_swirl');
  const inst2=makeFxInst('kaleido');
  r.mk1=!!inst1&&inst1.k==='px_swirl'&&inst1.on===true;
  r.mk2=!!inst2&&inst2.k==='kaleido';
  r.mkBad=makeFxInst('nonexistent')===null;
  // own knobs: set different values
  inst1.v['P.px_swirl']=0.9;
  const inst1b=makeFxInst('px_swirl');
  r.ownKnobs=Math.abs(inst1.v['P.px_swirl']-inst1b.v['P.px_swirl'])>0.1;
  // add to layer chain
  S.layerFx[0].push(inst1);
  r.layerChain=S.layerFx[0].length===1;
  // render with layer FX
  const mean=()=>{
    const T=makeTarget(80,45,true,true);
    renderSourceInto(0,0,10.0,T); // tunnel
    const px=new Uint8Array(80*45*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,T.fb);
    gl.readPixels(0,0,80,45,gl.RGBA,gl.UNSIGNED_BYTE,px);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    let m=0,n=0; for(let i=0;i<px.length;i+=4){ m+=px[i]+px[i+1]+px[i+2]; n+=3; }
    return m/(n*255);
  };
  const T1=makeTarget(80,45,true,true);
  renderSourceInto(0,0,10.0,T1);
  const px1=new Uint8Array(80*45*4);
  gl.bindFramebuffer(gl.FRAMEBUFFER,T1.fb);
  gl.readPixels(0,0,80,45,gl.RGBA,gl.UNSIGNED_BYTE,px1);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  r.before=Array.from(px1.slice(0,100));
  applyFxChain(T1,[inst1],10.0);
  const px2=new Uint8Array(80*45*4);
  gl.bindFramebuffer(gl.FRAMEBUFFER,T1.fb);
  gl.readPixels(0,0,80,45,gl.RGBA,gl.UNSIGNED_BYTE,px2);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  let diff=0; for(let i=0;i<100;i++) diff+=Math.abs(px1[i]-px2[i]);
  r.fxChanges=diff>100;
  r.diffVal=diff;
  // UI: build chain editor
  const tmp=document.createElement('div'); document.body.appendChild(tmp);
  buildFxChainEditor(tmp,S.layerFx[0],()=>{});
  r.uiCards=tmp.querySelectorAll('.fxcard').length;
  return r;
});
check('layerFx/clipFx arrays exist', out.hasLayerFx&&out.hasClipFx);
check('makeFxInst creates instances', out.mk1&&out.mk2);
check('makeFxInst rejects bad key', out.mkBad);
check('instances have own knobs', out.ownKnobs);
check('layer chain stores instance', out.layerChain);
check('applyFxChain changes image', out.fxChanges, 'diff='+out.diffVal);
check('chain editor UI builds', out.uiCards===1, 'cards='+out.uiCards);
check('zero page errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
