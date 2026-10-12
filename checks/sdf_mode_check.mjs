/* SDF raymarch cloner mode verification (mobile): shader compiles, SDF renders
   non-black, primitives/blend/effectors change the image, mesh mode unbroken. */
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
await page.waitForFunction(() => typeof S !== 'undefined' && typeof renderSDFCloner === 'function', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2000));
check('no page errors on load', errors.length === 0, errors.slice(0, 2).join(' || '));

const setup = await page.evaluate(() => {
  const out = { clsdf: !!PROG.clsdf, glslErr: lastGlslErr || '' };
  // small target for fast software renders
  window._t = makeTarget(160, 90, true, true);
  setParam('L0.clRMode', 1);          // SDF mode
  setParam('L0.clSSteps', 0);         // 16 steps for speed
  setParam('L0.clSBlend', 0.3);
  setParam('L0.clMode', 0);           // grid
  setParam('L0.clCntX', 0.25); setParam('L0.clCntY', 0.25); setParam('L0.clCntZ', 0);
  setParam('L0.clSpX', 0.4); setParam('L0.clSpY', 0.4); setParam('L0.clSpZ', 0.4);
  setParam('L0.clIScl', 0.35);
  return out;
});
check('SDF program compiled', setup.clsdf, setup.glslErr.slice(0, 120));
check('zero GLSL errors', !setup.glslErr, setup.glslErr.slice(0, 120));

const render = (t) => page.evaluate((tt) => {
  const T = makeTarget(160, 90, true, true); // fresh target each render
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
  gl.viewport(0, 0, T.w, T.h);
  renderSourceInto(4, 0, tt, T);
  const px = new Uint8Array(T.w * T.h * 4);
  gl.readPixels(0, 0, T.w, T.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return Array.from(px);
}, t);
const stats = (px) => {
  let m = 0, n = 0; for (let i = 0; i < px.length; i += 4) { m += px[i] + px[i+1] + px[i+2]; n += 3; }
  return m / (n * 255);
};
const mad = (a, b) => {
  let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]); n += 3; }
  return s / (n * 255);
};

console.log('      rendering SDF sphere (this takes a bit under SwiftShader)...');
const a = await render(10.0);
check('SDF mode renders non-black', stats(a) > 0.005, `mean=${stats(a).toFixed(3)}`);

await page.evaluate(() => setParam('L0.clSPrim', 3 / 6)); // torus
const b = await render(10.0);
check('different SDF primitive changes image', mad(a, b) > 0.02, `mad=${mad(a, b).toFixed(3)}`);

await page.evaluate(() => { setParam('L0.clSPrim', 0); setParam('L0.clSBlend', 0); });
const c = await render(10.0);
check('blend 0 vs 0.27 changes image', mad(a, c) > 0.005, `mad=${mad(a, c).toFixed(3)}`);

await page.evaluate(() => {
  setParam('L0.clSBlend', 0.3);
  setParam('L0.clFRMOn', 1); setParam('L0.clFRMAmp', 0.8); setParam('L0.clFRMFreq', 0.5);
});
const d = await render(10.0);
check('formula effector warps SDF cells', mad(a, d) > 0.02, `mad=${mad(a, d).toFixed(3)}`);

await page.evaluate(() => {
  setParam('L0.clFRMOn', 0);
  setParam('L0.clRMode', 0); // back to mesh
});
const e = await render(10.0);
check('mesh mode still renders (regression)', stats(e) > 0.005, `mean=${stats(e).toFixed(3)}`);

const ui = await page.evaluate(() => {
  document.querySelectorAll('[id^="clbox"]').forEach((e) => e.remove());
  document.querySelectorAll('[id^="clsdf"],[id^="clmeshm"],[id^="clmatm"]').forEach((e) => e.remove());
  const tmp = document.createElement('div');
  document.body.appendChild(tmp);
  buildClonerUI(tmp, 0);
  const q = (s) => tmp.querySelector(s);
  return {
    rmodeRow: !!q('[data-ctrl="L0.clRMode"]'),
    sdfGroup: !!q('#clsdf0'),
    sdfHidden: q('#clsdf0')?.style.display === 'none',
  };
});
check('RMode UI row exists', ui.rmodeRow);
check('SDF group hidden in mesh mode', ui.sdfGroup && ui.sdfHidden);

await page.evaluate(() => setParam('L0.clRMode', 1));
const ui2 = await page.evaluate(() => ({
  sdfShown: document.querySelector('#clsdf0')?.style.display !== 'none',
  meshHidden: document.querySelector('#clmeshm0')?.style.display === 'none',
}));
check('SDF group shows / mesh hides in SDF mode', ui2.sdfShown && ui2.meshHidden);

check('zero page errors after all renders', errors.length === 0, errors.slice(0, 3).join(' || '));

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} pass${fails.length ? ` — FAILURES: ${fails.map((f) => f.name).join('; ')}` : ''}`);
await browser.close();
process.exit(fails.length ? 1 : 0);
