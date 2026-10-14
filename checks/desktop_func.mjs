import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs=[];
page.on('pageerror',(e)=>errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof fireClip === 'function' && typeof S !== 'undefined', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,2500));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  try{
    // Fire a clip from the deck (disable quantize for immediate fire)
    S.snap='none';
    fireClip(0, 2);
    r.fired=S.fired[0]===2;
    // Panel drag: move browser panel (should not break)
    const b4=dockSer();
    // Simulate a drag op programmatically
    dockApplyOp('browser',{t:'newcol',pos:'after',ri:1,ci:2});
    dockPrune();dockRender();dockSave();
    r.dragOk=dockSer()!==b4;
    r.browserMoved=dockFind('browser').ci===3;
    // Reset
    dockLayout=dockDefault();dockRender();dockSave();dockRefreshWindowsMenu();
    r.resetOk=dockFind('browser').ci===2;
    // Deck still fires after all the moving
    fireClip(1, 3);
    r.stillFires=S.fired[1]===3;
    r.status='ok';
  }catch(e){ r.status='FAIL:'+e.message; }
  return r;
});
check('clip fires', out.fired);
check('panel drag works', out.dragOk&&out.browserMoved);
check('reset restores', out.resetOk);
check('deck still fires after moves', out.stillFires);
check('zero page errors', errs.length===0, errs.slice(0,3).join('|'));
console.log('status:', out.status);
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
