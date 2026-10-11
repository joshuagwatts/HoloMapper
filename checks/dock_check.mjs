/* HoloMapper: dockable panels (Resolume-style) verification */
import puppeteer from 'puppeteer-core';

const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--mute-audio', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(
  () => typeof S !== 'undefined' && typeof dockInit === 'function' && document.querySelectorAll(".dockpanel").length === 6,
  { timeout: 90000 });
await new Promise(r => setTimeout(r, 2500));

const q = async (expr) => page.evaluate(`(() => { try { return (${expr}); } catch(e){ return 'EVALERR:'+e.message; } })()`);
const rect = async (sel) => page.evaluate((s) => {
  const n = document.querySelector(s); if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
}, sel);
const layoutIds = () => q(`JSON.stringify(dockLayout.rows.map(r=>r.cols.map(c=>c.panels.map(p=>p.id))))`);
const DEF = JSON.stringify([[["deck"]], [["transport"]], [["monitors"], ["proptabs"], ["browser"]]]);

check('no page errors on load', errors.length === 0, errors.slice(0, 3).join(' || '));
check('6 dock panels wrapped', await q(`document.querySelectorAll('.dockpanel').length`) === 6);
check('clipinsp re-anchored to #main', await q(`document.querySelector('#clipinsp').parentElement.id`) === 'main');
check('lowerzone removed', await q(`document.querySelector('#lowerzone')===null`) === true);
check('default layout = today\'s arrangement', await layoutIds() === DEF, await layoutIds());
check('transport has inline grip, no header', await q(`document.querySelector('.dockpanel[data-panel="transport"] .dockhead')===null && !!document.querySelector('.tgrip')`) === true);
await page.screenshot({ path: '/home/hatch/workspace/holomapper/checks/dock_default.png' });

// --- drag Properties panel: drop on bottom half of Monitors panel -> insert after
const ph = await rect('.dockpanel[data-panel="proptabs"] .dockhead');
const mr = await rect('.dockpanel[data-panel="monitors"]');
await page.mouse.move(ph.x, ph.y);
await page.mouse.down();
await page.mouse.move(mr.x, mr.top + mr.height * 0.78, { steps: 14 });
await new Promise(r => setTimeout(r, 400));
const indOn = await q(`(()=>{const n=document.querySelector('.dockind');return n&&n.style.display==='block';})()`);
check('drop indicator shown mid-drag', indOn === true);
await page.screenshot({ path: '/home/hatch/workspace/holomapper/checks/dock_midrag.png' });
await page.mouse.up();
await new Promise(r => setTimeout(r, 600));
const col1 = await q(`JSON.stringify(dockLayout.rows[2].cols[0].panels.map(p=>p.id))`);
check('proptabs snapped after monitors in col 1', col1 === JSON.stringify(['monitors', 'proptabs']), col1);

// --- divider resize
const dv = await page.evaluate(() => {
  const n = document.querySelectorAll('.dockdiv')[0]; if (!n) return null;
  const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const wBefore = await q(`dockLayout.rows[2].cols[0].w`);
await page.mouse.move(dv.x, dv.y);
await page.mouse.down();
await page.mouse.move(dv.x + 70, dv.y, { steps: 10 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 400));
const wAfter = await q(`dockLayout.rows[2].cols[0].w`);
check('column divider resizes', wBefore !== wAfter && /px$/.test(wAfter), `${wBefore} -> ${wAfter}`);

// --- persistence across reload
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(
  () => typeof S !== 'undefined' && typeof dockInit === 'function' && document.querySelectorAll(".dockpanel").length === 6,
  { timeout: 90000 });
await new Promise(r => setTimeout(r, 2000));
const persisted = await q(`JSON.stringify(dockLayout.rows[2].cols.map(c=>c.panels.map(p=>p.id)))`);
check('layout persisted across reload', persisted === JSON.stringify([["monitors", "proptabs"], ["browser"]]), persisted);

// --- reset layout (two-step arm)
await page.evaluate(() => document.querySelector('#btnDockReset').click());
await new Promise(r => setTimeout(r, 300));
const armed = await q(`document.querySelector('#btnDockReset').classList.contains('armed')`);
await page.evaluate(() => document.querySelector('#btnDockReset').click());
await new Promise(r => setTimeout(r, 500));
check('reset arms then restores default', armed === true && await layoutIds() === DEF, await layoutIds());

// --- drag Deck to a new row at the bottom, then fire a clip
const dh = await rect('.dockpanel[data-panel="deck"] .dockhead');
const lastRowB = await page.evaluate(() => {
  const rs = [...document.querySelectorAll('#main > .dockrow')];
  return rs[rs.length - 1].getBoundingClientRect().bottom;
});
await page.mouse.move(dh.x, dh.y);
await page.mouse.down();
await page.mouse.move(dh.x, lastRowB - 5, { steps: 16 });
await new Promise(r => setTimeout(r, 300));
await page.mouse.up();
await new Promise(r => setTimeout(r, 600));
const nrows = await q(`dockLayout.rows.length`);
const firstRow = await q(`JSON.stringify(dockLayout.rows[0].cols.map(c=>c.panels.map(p=>p.id)))`);
const lastRow = await q(`JSON.stringify(dockLayout.rows[dockLayout.rows.length-1].cols.map(c=>c.panels.map(p=>p.id)))`);
check('deck moved to new bottom row (old row pruned)', nrows === 3 && firstRow === JSON.stringify([["transport"]]) && lastRow === JSON.stringify([["deck"]]), `rows=${nrows} first=${firstRow} last=${lastRow}`);
await page.screenshot({ path: '/home/hatch/workspace/holomapper/checks/dock_moved.png' });

// fire a clip on the moved deck (snap off for immediate fire)
await page.evaluate(() => { S.snap = 'none'; S.clips[0][0] = 0; buildDeck(); });
await new Promise(r => setTimeout(r, 400));
const clicked = await page.evaluate(() => {
  const b = document.querySelector('.dockpanel[data-panel="deck"] [data-ctrl="clip0.0"] .cthumb');
  if (!b) return 'nobox';
  b.click(); return 'clicked';
});
await new Promise(r => setTimeout(r, 800));
check('clip fires after deck move', clicked === 'clicked' && await q(`S.fired[0]===0`) === true, `click=${clicked} fired=${await q(`JSON.stringify(S.fired[0])`)}`);

// --- Tab toggle still works
await page.evaluate(() => { if(document.activeElement) document.activeElement.blur(); });
await page.mouse.click(40, 17); // brand span: neutral, non-input focus
await new Promise(r => setTimeout(r, 200));
await page.keyboard.press('Tab');
await new Promise(r => setTimeout(r, 700));
check('Tab opens node view', await q(`typeof neOpen!=='undefined' && neOpen`) === true);
await page.keyboard.press('Tab');
await new Promise(r => setTimeout(r, 700));
check('Tab returns to deck', await q(`!neOpen`) === true);

// --- perform mode CSS sanity (end, so a failure can't cascade)
await page.keyboard.press('p');
await new Promise(r => setTimeout(r, 600));
const perfOn = await q(`document.body.classList.contains('perform')`);
const monVis = await q(`getComputedStyle(document.querySelector('.dockpanel[data-panel="monitors"]')).display`);
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 600));
const perfOff = await q(`!document.body.classList.contains('perform')`);
check('perform mode shows only monitors', perfOn === true && monVis === 'flex' && perfOff === true, `on=${perfOn} mon=${monVis} off=${perfOff}`);

check('zero page errors total', errors.length === 0, errors.slice(0, 5).join(' || '));
const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS`);
await browser.close();
process.exit(fails ? 1 : 0);
