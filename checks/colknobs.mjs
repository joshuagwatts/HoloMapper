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
await page.waitForFunction(() => typeof S !== 'undefined', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,2000));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={status:'start'};
  try{
    buildColumns();
    r.knobs=document.querySelectorAll('#colbtns .mknob').length;
    r.cbtns=document.querySelectorAll('#colbtns .colbtn').length;
    const lab=document.querySelector('#colbtns .collab');
    r.label=lab?lab.textContent:'NO LABEL';
    const sl=document.querySelector('#colbtns .mknob input');
    if(sl){ sl.value=0.75; sl.dispatchEvent(new Event('input',{bubbles:true})); }
    r.works=Math.abs(S.macros[0].val-0.75)<0.01;
    r.midiCol=!!CTRLS['col0'];
    r.status='ok';
  }catch(e){ r.status='FAIL:'+e.message; }
  return r;
});
check('buildColumns runs', out.status==='ok', out.status);
check('8 macro knobs in column bar', out.knobs===8, 'knobs='+out.knobs);
check('C1-C8 buttons gone', out.cbtns===0);
check('label says MACROS', out.label==='MACROS', out.label);
check('knobs work', out.works);
check('MIDI column fire preserved', out.midiCol);
check('zero page errors', errs.length===0, errs.slice(0,2).join('|'));
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
