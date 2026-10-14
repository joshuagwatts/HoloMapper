import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs=[];
page.on('pageerror',(e)=>errs.push(e.message));
// Seed an OLD v1 layout with 'monitors' before page scripts run
await page.evaluateOnNewDocument(() => {
  const oldLayout = {v:1, rows:[
    {h:'auto',cols:[{w:'1fr',panels:[{id:'deck',size:'auto'}]}]},
    {h:'32px',cols:[{w:'1fr',panels:[{id:'transport',size:'auto'}]}]},
    {h:'1fr',cols:[{w:'392px',panels:[{id:'monitors',size:'1fr'}]},
                   {w:'1fr',panels:[{id:'proptabs',size:'1fr'}]},
                   {w:'300px',panels:[{id:'browser',size:'1fr'},{id:'clip',size:'1fr'}]}]}
  ]};
  localStorage.setItem('holomapper.dock.v1', JSON.stringify(oldLayout));
});
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof dockLayout !== 'undefined' && dockLayout!==null, { timeout: 90000 });
await new Promise((r)=>setTimeout(r,2000));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  try{
    r.version=dockLayout.v;
    const ids=[];
    for(const row of dockLayout.rows)for(const col of row.cols)for(const p of col.panels)ids.push(p.id);
    r.ids=ids.sort().join(',');
    r.hasMonitors=ids.includes('monitors');
    r.hasOutput=ids.includes('output');
    r.hasPreview=ids.includes('preview');
    // output+preview should be where monitors was (first col of last row)
    const lastRow=dockLayout.rows[dockLayout.rows.length-1];
    r.migratedSpot=lastRow.cols[0].panels.map(p=>p.id).join(',');
    r.outputRendered=!!document.querySelector('.dockpanel[data-panel="output"] #gl');
    r.previewRendered=!!document.querySelector('.dockpanel[data-panel="preview"] #pv');
    r.status='ok';
  }catch(e){ r.status='FAIL:'+e.message; }
  return r;
});
check('migrated to v2', out.version===2, 'v='+out.version);
check('monitors gone', !out.hasMonitors);
check('output+preview present', out.hasOutput&&out.hasPreview, out.ids);
check('migrated in place', out.migratedSpot==='output,preview', out.migratedSpot);
check('output renders with #gl', out.outputRendered);
check('preview renders with #pv', out.previewRendered);
check('zero page errors', errs.length===0, errs.slice(0,3).join('|'));
console.log('status:', out.status);
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
