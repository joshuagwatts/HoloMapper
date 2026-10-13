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
await page.waitForFunction(() => typeof S !== 'undefined' && typeof buildMacrosSheet === 'function', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,1000));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  // Dock button exists
  r.dockBtn=!!document.querySelector('button[data-sheet="macros"]');
  // Build macros sheet
  const tmp=document.createElement('div'); document.body.appendChild(tmp);
  buildMacrosSheet(tmp);
  r.sliders=tmp.querySelectorAll('input.macrobig').length;
  r.labels=tmp.querySelectorAll('.macrorow').length;
  // Test slider interaction
  const sl=tmp.querySelector('input.macrobig');
  r.ctrl=sl.getAttribute('data-ctrl');
  // Mix sheet no longer has macros
  const tmp2=document.createElement('div'); document.body.appendChild(tmp2);
  buildMixSheet(tmp2);
  r.mixHasMacros=tmp2.textContent.indexOf('Performance Macros')>=0;
  r.mixHint=tmp2.textContent.indexOf('own tab')>=0;
  return r;
});
check('Macros dock button exists', out.dockBtn);
check('8 big sliders built', out.sliders===8&&out.labels===8, 'sliders='+out.sliders);
check('sliders are MIDI-learnable', out.ctrl==='macro0');
check('Mix sheet macros removed', !out.mixHasMacros&&out.mixHint);
check('zero page errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
