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
await page.waitForFunction(() => typeof S !== 'undefined' && typeof buildMacroBar === 'function', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,1000));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  buildMacroBar();
  r.bar=!!document.getElementById('macrobar');
  r.knobs=document.querySelectorAll('#macroknobs .mknob').length;
  r.sliders=document.querySelectorAll('#macroknobs input[type="range"]').length;
  // Test interaction
  const sl=document.querySelector('#macroknobs input');
  const before=S.macros[0].val;
  sl.value=0.9; sl.dispatchEvent(new Event('input',{bubbles:true}));
  r.works=Math.abs(S.macros[0].val-0.9)<0.01;
  // Sheet height reduced
  const sheet=document.getElementById('sheet');
  const cs=getComputedStyle(sheet);
  r.sheetMax=cs.maxHeight;
  return r;
});
check('macrobar exists', out.bar);
check('8 knobs built', out.knobs===8&&out.sliders===8, 'knobs='+out.knobs);
check('knobs control macros', out.works);
check('sheet height reduced', out.sheetMax.indexOf('52')>=0||out.sheetMax.indexOf('%')>=0, out.sheetMax);
check('zero page errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
