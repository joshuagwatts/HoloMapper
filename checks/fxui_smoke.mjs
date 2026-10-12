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
await page.waitForFunction(() => typeof S !== 'undefined' && typeof buildMixSheet === 'function', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,1000));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  // Mix sheet with layer FX buttons
  const tmp=document.createElement('div'); document.body.appendChild(tmp);
  buildMixSheet(tmp);
  const fxBtns=tmp.querySelectorAll('button.minibtn');
  r.fxBtn=[...fxBtns].some(b=>b.textContent.indexOf('FX')===0);
  // Click first FX button to expand
  const btn=[...fxBtns].find(b=>b.textContent.indexOf('FX')===0);
  if(btn){ btn.click(); r.expanded=tmp.querySelector('.fxchain')!==null; }
  // Clip inspector
  const tmp2=document.createElement('div'); document.body.appendChild(tmp2);
  S.sel={kind:'clip', i:0, c:0};
  buildInspector(tmp2);
  r.clipFx=tmp2.textContent.indexOf('Clip FX')>=0;
  return r;
});
check('Mix sheet has FX buttons', out.fxBtn);
check('FX button expands chain editor', out.expanded);
check('Clip inspector has Clip FX section', out.clipFx);
check('zero page errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
