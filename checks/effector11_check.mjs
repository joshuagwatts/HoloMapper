/* HoloMapper mobile: 11-effector Cloner 3D (HoloMoGraph parity) verification.
   Exercises the full new vertex-shader stack headless via renderSourceInto
   into the thumbnail target + readPixels, plus DOM checks for the new UI. */
import puppeteer from 'puppeteer-core';

const URL = 'file:///home/hatch/workspace/holomapper/mobile.html';
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
await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof S !== 'undefined' && typeof renderSourceInto === 'function', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2000));
const q = async (expr) => page.evaluate(`(() => { try { return (${expr}); } catch(e){ return 'EVALERR:'+e.message; } })()`);

check('no page errors on load', errors.length === 0, errors.slice(0, 2).join(' || '));
check('cloner shader compiled+linked', await q(`!!PROG.cloner && !lastGlslErr`), await q(`(lastGlslErr||'').slice(0,120)`));

/* in-page pixel helpers: render cloner (src 4) on layer 0 into thumb target */
await page.evaluate(() => {
  window._shot = (t) => {
    renderSourceInto(4, 0, t, thT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, thT.fb);
    gl.readPixels(0, 0, THW, THH, gl.RGBA, gl.UNSIGNED_BYTE, thPx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from(thPx);
  };
  window._mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / (a.length * 255); };
  window._mean = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / (a.length * 255); };
  window._cl = (n, v) => setParam('L0.cl' + n, v);
  window._effReset = () => {
    for (const k of ['POn','ROn','SOn','SndOn','DOn','STPOn','FRMOn','PAOn','TGTOn','SPLOn','TMOn']) _cl(k, 0);
    _cl('RFall', 0); _cl('SFall', 0); _cl('SndFall', 0); // infinite falloffs
    _cl('Orb', 0); // fixed camera: time-separated shots must be comparable
    _cl('FRMMode', 0); _cl('FRMTgt', 0); _cl('FRMSpd', 0.25); // deterministic formula state
  };
});
check('thumb target dims sane', await q(`THW>0 && THH>0`), await q(`THW+'x'+THH`));

await page.evaluate(() => { _effReset(); });
const base = await page.evaluate(() => _shot(10.0));
const baseMean = await page.evaluate((p) => _mean(p).toFixed(3), base);
check('baseline cloner renders non-black', parseFloat(baseMean) > 0.01, `mean=${baseMean}`);

const diffCases = [
  ['Step moves clones', () => { _effReset(); _cl('STPOn', 1); _cl('STPPz', 1); _cl('STPN', 0.214); }],
  ['Formula sine displaces', () => { _effReset(); _cl('FRMOn', 1); _cl('FRMAmp', 0.5); _cl('FRMMode', 0); _cl('FRMSpd', 0.25); }],
  ['Formula noise mode works', () => { _effReset(); _cl('FRMOn', 1); _cl('FRMMode', 1); _cl('FRMAmp', 0.5); }],
  ['Push Apart separates', () => { _effReset(); _cl('PAOn', 1); _cl('PAAmt', 1); }],
  ['Target re-aims shading', () => { _effReset(); _cl('TGTOn', 1); }],
  ['Spline offsets along path', () => { _effReset(); _cl('SPLOn', 1); _cl('SPLAmt', 1); }],
  ['Random (own falloff, infinite)', () => { _effReset(); _cl('ROn', 1); _cl('RPx', 0.5); _cl('RPy', 0.5); }],
];
for (const [name, setup] of diffCases) {
  await page.evaluate(setup);
  const px = await page.evaluate(() => _shot(10.0));
  const mad = await page.evaluate(([a, b]) => _mad(a, b), [base, px]);
  check(name + ' changes pixels vs baseline', mad > 0.02, `mad=${mad.toFixed(3)}`);
}

/* Formula color target: phase inversion must flip which clones are bright/dark */
await page.evaluate(() => { _effReset(); _cl('FRMOn', 1); _cl('FRMTgt', 1); _cl('FRMAmp', 1); _cl('FRMPh', 0); });
const cph0 = await page.evaluate(() => _shot(10.0));
await page.evaluate(() => _cl('FRMPh', 0.5));
const cph1 = await page.evaluate(() => _shot(10.0));
const madCol = await page.evaluate(([a, b]) => _mad(a, b), [cph0, cph1]);
check('Formula color target responds to phase', madCol > 0.01, `mad=${madCol.toFixed(3)}`);

/* per-effector falloff: sphere-small vs infinite on Random */
await page.evaluate(() => { _effReset(); _cl('ROn', 1); _cl('RPx', 0.5); _cl('RPy', 0.5); _cl('RFall', 0); });
const rndInf = await page.evaluate(() => _shot(10.0));
await page.evaluate(() => { _cl('RFall', 2 / 3); _cl('RSize', 0); }); // sphere, min size
const rndSph = await page.evaluate(() => _shot(10.0));
const madFall = await page.evaluate(([a, b]) => _mad(a, b), [rndInf, rndSph]);
check('per-effector falloff shapes the Random output', madFall > 0.02, `mad=${madFall.toFixed(3)}`);

/* Animated Random: seed advances with time when on, frozen when off */
await page.evaluate(() => { _effReset(); _cl('ROn', 1); _cl('RPx', 0.5); _cl('RAnim', 1); _cl('RAnSp', 0.5); });
const ra1 = await page.evaluate(() => _shot(10.0));
const ra2 = await page.evaluate(() => _shot(12.5));
const madAnim = await page.evaluate(([a, b]) => _mad(a, b), [ra1, ra2]);
check('Animated Random changes over time', madAnim > 0.02, `mad=${madAnim.toFixed(3)}`);
await page.evaluate(() => { _cl('RAnim', 0); });
const rs1 = await page.evaluate(() => _shot(10.0));
const rs2 = await page.evaluate(() => _shot(12.5));
const madStatic = await page.evaluate(([a, b]) => _mad(a, b), [rs1, rs2]);
check('Random frozen when Animate off', madStatic < 1e-6, `mad=${madStatic.toExponential(1)}`);

/* Time effector: stagger shifts per-clone phase vs no time effect */
await page.evaluate(() => { _effReset(); _cl('FRMOn', 1); _cl('FRMAmp', 0.5); _cl('FRMSpd', 0.25); _cl('TMOn', 0); });
const tmOff = await page.evaluate(() => _shot(10.0));
await page.evaluate(() => { _cl('TMOn', 1); _cl('TMStag', 1); });
const tmOn = await page.evaluate(() => _shot(10.0));
const madTm = await page.evaluate(([a, b]) => _mad(a, b), [tmOff, tmOn]);
check('Time stagger offsets per-clone animation', madTm > 0.02, `mad=${madTm.toFixed(3)}`);

/* Delay still works (lag on animated inputs, no crash) */
await page.evaluate(() => { _effReset(); _cl('FRMOn', 1); _cl('FRMAmp', 0.5); _cl('DOn', 1); _cl('DAmt', 1); });
const dlPx = await page.evaluate(() => _shot(10.0));
check('Delay renders without errors', await page.evaluate((p) => _mean(p), dlPx) > 0.005);

/* UI: all 11 effector groups build */
const groups = await page.evaluate(() => {
  const tmp = document.createElement('div');
  buildClonerUI(tmp, 0);
  const heads = [...tmp.querySelectorAll('.cghead,.cgrpt,.ctitle')].map((e) => e.textContent.trim());
  const html = tmp.innerHTML;
  const want = ['Plain', 'Random', 'Shader', 'Sound', 'Delay', 'Step', 'Formula', 'Push Apart', 'Target', 'Spline', 'Time'];
  return { want: want.map((w) => ({ w, found: html.includes(w) })), heads: heads.slice(0, 4) };
});
for (const g of groups.want) check(`UI group "${g.w}" present`, g.found);

/* new params flow through the param system (MIDI/macro/preset plumbing) */
const paramKeys = ['RAnim', 'RFall', 'SFall', 'SndFall', 'STPOn', 'STPN', 'FRMOn', 'FRMMode', 'FRMTgt', 'PAOn', 'TGTOn', 'SPLOn', 'SPLPath', 'TMOn', 'TMStag'];
let missing = [];
for (const k of paramKeys) {
  const has = await q(`!!PARAMS['L0.cl${k}']`);
  if (!has) missing.push(k);
}
check('all new params registered', missing.length === 0, missing.join(','));
await page.evaluate(() => setParam('L0.clSTPOn', 1));
check('setParam round-trips on new key', await q(`S.params['L0.clSTPOn']===1`));

/* visual proof: fire cloner clip with Step+Formula, rebuild thumbs, screenshot deck */
await page.evaluate(() => {
  _effReset();
  _cl('STPOn', 1); _cl('STPPz', 1);
  _cl('FRMOn', 1); _cl('FRMAmp', 0.4); _cl('FRMSpd', 0.2);
  S.clips[0][0] = 4; // L1, first slot = cloner
  for (const k in thumbCache) delete thumbCache[k];
  buildDeck();
  queueThumbs();
});
await page.waitForFunction(() => thumbQueue.length === 0, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 800));
const clipBox = await page.$('#deck .clip[data-i="0"][data-k="0"] .cbox');
if (clipBox) await clipBox.screenshot({ path: '/home/hatch/workspace/holomapper/checks/effector11_thumb.png' });
check('effector thumbnail captured', !!clipBox);

check('zero page errors after all effector work', errors.length === 0, errors.slice(0, 3).join(' || '));

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} pass${fails.length ? ` — FAILURES: ${fails.map((f) => f.name).join('; ')}` : ''}`);
await browser.close();
process.exit(fails.length ? 1 : 0);
