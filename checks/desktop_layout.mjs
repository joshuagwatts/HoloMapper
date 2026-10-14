import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs=[];
page.on('pageerror',(e)=>errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof dockInit === 'function', { timeout: 90000 });
await new Promise((r)=>setTimeout(r,2000));
const R=[];
const check=(n,ok,d='')=>{ R.push((ok?'PASS':'FAIL')+'  '+n+(d?'  — '+d:'')); };
const out = await page.evaluate(() => {
  const r={};
  try{
    // 1. Default layout has 7 panels
    r.ids=DOCK_IDS.slice().sort().join(',');
    // 2. All panels rendered
    r.rendered={};
    for(const pid of DOCK_IDS){
      const elp=document.querySelector('.dockpanel[data-panel="'+pid+'"]');
      r.rendered[pid]=!!elp;
    }
    // 3. Layout structure: transport on top, 3 cols below
    r.rows=dockLayout.rows.length;
    r.topRowPanels=dockLayout.rows[0].cols[0].panels.map(p=>p.id).join(',');
    const mainRow=dockLayout.rows[1];
    r.cols=mainRow.cols.length;
    r.leftCol=mainRow.cols[0].panels.map(p=>p.id).join(',');
    r.centerCol=mainRow.cols[1].panels.map(p=>p.id).join(',');
    r.rightCol=mainRow.cols[2].panels.map(p=>p.id).join(',');
    // 4. Windows menu
    r.winBtn=!!document.getElementById('btnWindows');
    dockRefreshWindowsMenu();
    r.winItems=document.querySelectorAll('#winmenu .winitem').length;
    // 5. Hide a panel
    dockHidePanel('preview');
    r.hiddenAfterHide=(dockLayout.hidden||[]).slice().join(',');
    r.previewGone=!document.querySelector('.dockpanel[data-panel="preview"]');
    // 6. Show it back
    dockShowPanel('preview');
    r.hiddenAfterShow=(dockLayout.hidden||[]).join(',');
    r.previewBack=!!document.querySelector('.dockpanel[data-panel="preview"]');
    // 7. Reset restores all
    dockHidePanel('browser');
    dockLayout=dockDefault();dockRender();dockSave();dockRefreshWindowsMenu();
    const allBack=DOCK_IDS.every(pid=>!!document.querySelector('.dockpanel[data-panel="'+pid+'"]'));
    r.resetRestores=allBack;
    r.hiddenAfterReset=(dockLayout.hidden||[]).length;
    // 8. Output canvas exists in output panel
    const outPanel=document.querySelector('.dockpanel[data-panel="output"]');
    r.glInOutput=!!(outPanel&&outPanel.querySelector('#gl'));
    const pvPanel=document.querySelector('.dockpanel[data-panel="preview"]');
    r.pvInPreview=!!(pvPanel&&pvPanel.querySelector('#pv'));
    r.status='ok';
  }catch(e){ r.status='FAIL:'+e.message+' @ '+(e.stack||'').split('\n')[1]; }
  return r;
});
check('7 panel ids', out.ids==='browser,clip,deck,output,preview,proptabs,transport', out.ids);
check('all panels rendered', Object.values(out.rendered||{}).every(v=>v), JSON.stringify(out.rendered));
check('transport on top row', out.topRowPanels==='transport', out.topRowPanels);
check('3 columns in main row', out.cols===3);
check('deck left', out.leftCol==='deck', out.leftCol);
check('output+preview center', out.centerCol==='output,preview', out.centerCol);
check('props+browser+clip right', out.rightCol==='proptabs,browser,clip', out.rightCol);
check('Windows button exists', out.winBtn);
check('7 items in Windows menu', out.winItems===7, 'items='+out.winItems);
check('hide panel works', out.previewGone&&out.hiddenAfterHide==='preview', out.hiddenAfterHide);
check('show panel works', out.previewBack&&out.hiddenAfterShow==='', 'hidden='+out.hiddenAfterShow);
check('reset restores all', out.resetRestores&&out.hiddenAfterReset===0);
check('#gl in output panel', out.glInOutput);
check('#pv in preview panel', out.pvInPreview);
check('zero page errors', errs.length===0, errs.slice(0,3).join('|'));
console.log('status:', out.status);
console.log(R.join('\n'));
console.log('\n'+R.filter(r=>r.startsWith('PASS')).length+'/'+R.length+' pass');
await browser.close();
process.exit(R.some(r=>r.startsWith('FAIL'))?1:0);
