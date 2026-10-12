import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/mobile.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
const errs=[];
page.on('pageerror',(e)=>errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof S !== 'undefined' && typeof renderLayer === 'function', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,1500));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  S.paused=true;
  const r={};
  // Use a byte target to capture layer output via copy
  const snap=(i)=>{
    renderLayer(i,10.0);
    const T=layerT[i];
    const B=makeTarget(80,45,true,true);
    gl.bindFramebuffer(gl.FRAMEBUFFER,B.fb); gl.viewport(0,0,80,45);
    const C=PROG.copy; gl.useProgram(C); setTex(C,'u_tex',0,T.tex); quadDraw();
    const px=new Uint8Array(80*45*4);
    gl.readPixels(0,0,80,45,gl.RGBA,gl.UNSIGNED_BYTE,px);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    let m=0,n=0; for(let k=0;k<px.length;k+=4){ m+=px[k]+px[k+1]+px[k+2]; n+=3; }
    return {mean:m/(n*255), px:Array.from(px.slice(0,400))};
  };
  const a=snap(0); r.base=a.mean;
  const inst=makeFxInst('px_swirl'); inst.v['P.px_swirl']=0.8;
  S.layerFx[0].push(inst);
  const b=snap(0); r.withFx=b.mean;
  let d=0; for(let k=0;k<400;k++) d+=Math.abs(a.px[k]-b.px[k]);
  r.diff=d;
  return r;
});
check('layer FX changes output', out.diff>500, 'diff='+out.diff+' base='+out.base.toFixed(3));
check('zero page errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
