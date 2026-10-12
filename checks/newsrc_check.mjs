import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/mobile.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof S !== 'undefined' && typeof renderSourceInto === 'function', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
const R = [];
const check = (n, ok, d='') => { R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };

// 1. all new programs compiled, zero GLSL errors
const progs = await page.evaluate(() => {
  const keys=['aurora','voronoi','plexus','wave','plasma'];
  const r={};
  keys.forEach((k)=>{ r[k]=!!PROG[k]; });
  r.log=lastGlslErr?1:0;
  r.srckeys=SRC_KEYS.length; r.layersrc=LAYER_SRC.length;
  return r;
});
check('all 5 new programs compiled', ['aurora','voronoi','plexus','wave','plasma'].every((k)=>progs[k]));
check('zero GLSL errors', progs.log===0, 'log='+progs.log);
check('SRC_KEYS/LAYER_SRC extended', progs.srckeys===11 && progs.layersrc===11, progs.srckeys+'/'+progs.layersrc);

// 2. each new source renders non-black and distinct
const renders = await page.evaluate(() => {
  S.paused=true;
  const out={};
  const idx={aurora:6,voronoi:7,plexus:8,wave:9,plasma:10};
  for(const [name,si] of Object.entries(idx)){
    const T=makeTarget(160,90,true,true);
    renderSourceInto(si,0,10.0,T);
    const px=new Uint8Array(160*90*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,T.fb);
    gl.readPixels(0,0,160,90,gl.RGBA,gl.UNSIGNED_BYTE,px);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    let m=0,n=0; for(let i=0;i<px.length;i+=4){ m+=px[i]+px[i+1]+px[i+2]; n+=3; }
    out[name]={mean:m/(n*255), px:Array.from(px.slice(0,160*90*4))};
  }
  return out;
});
let allNonBlack=true, distinct=true;
const names=Object.keys(renders);
for(const n of names){ if(renders[n].mean<0.005) allNonBlack=false; }
for(let a=0;a<names.length;a++) for(let b=a+1;b<names.length;b++){
  const pa=renders[names[a]].px, pb=renders[names[b]].px;
  let s=0,n=0; for(let i=0;i<pa.length;i+=4){ s+=Math.abs(pa[i]-pb[i])+Math.abs(pa[i+1]-pb[i+1])+Math.abs(pa[i+2]-pb[i+2]); n+=3; }
  if(s/(n*255)<0.02) distinct=false;
}
check('all 5 new sources render non-black', allNonBlack, names.map((n)=>n+'='+renders[n].mean.toFixed(3)).join(' '));
check('all 5 sources visually distinct', distinct);

// 3. camera still at 5
const cam = await page.evaluate(() => {
  S.paused=true;
  const T=makeTarget(160,90,true,true);
  try{ renderSourceInto(5,0,10.0,T); return 'ok'; }catch(e){ return 'ERR:'+e.message; }
});
check('camera source still works at sidx 5', cam==='ok', cam);

// 4. cloner presets apply
const presets = await page.evaluate(() => {
  const r={count:CL_PRESETS.length, names:CL_PRESETS.map((p)=>p.name)};
  applyClonerPreset(0,0);
  r.waveMode=S.params['L0.clMode']; r.waveMesh=S.params['L0.clMesh']; r.waveFRM=S.params['L0.clFRMOn'];
  applyClonerPreset(0,1);
  r.gooRMode=S.params['L0.clRMode']; r.gooBlend=S.params['L0.clSBlend'];
  return r;
});
check('6 cloner presets defined', presets.count===6, presets.names.join(', '));
check('Wave Grid applies', presets.waveMode===0 && presets.waveMesh===0 && presets.waveFRM===1);
check('Metaball Goo applies (SDF)', presets.gooRMode===1 && Math.abs(presets.gooBlend-0.7)<0.01);

check('zero page errors', errs.length===0, errs.slice(0,2).join(' | '));
console.log(R.join('\n'));
console.log('\n'+R.filter((r)=>r.startsWith('PASS')).length+'/'+R.length+' pass'+(R.some((r)=>r.startsWith('FAIL'))?' — FAILURES: '+R.filter((r)=>r.startsWith('FAIL')).map((r)=>r.slice(6)).join('; '):''));
await browser.close();
process.exit(R.some((r)=>r.startsWith('FAIL'))?1:0);
