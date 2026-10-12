/* Desktop azimuth fix check: two different Az values must give different views
   (before the fix both rendered the identical collapsed column). */
import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const results = [];
const check = (name, ok, extra = '') => { results.push({name, ok}); console.log(`${ok?'PASS':'FAIL'}  ${name}${extra?'  — '+extra:''}`); };
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0,160)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof S !== 'undefined' && typeof renderCloner === 'function', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
check('no page errors on load', errors.length === 0, errors.slice(0,2).join(' || '));
const shots = await page.evaluate(() => {
  const _cl = (n,v) => setParam('L0.cl'+n, v);
  _cl('Orb', 0);
  const grab = () => {
    const T = makeTarget8(320, 180);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    gl.viewport(0, 0, T.w, T.h);
    renderCloner(0, 10.0, T);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    const px = new Uint8Array(320*180*4);
    gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from(px);
  };
  _cl('Az', 0.125);
  const a = grab();
  _cl('Az', 0.375);
  const b = grab();
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i]-b[i]);
  const mad = s/(a.length*255);
  let m = 0; for (let i = 0; i < a.length; i++) m += a[i];
  return { mad, mean: m/(a.length*255) };
});
check('azimuth slider changes the view', shots.mad > 0.05, `mad=${shots.mad.toFixed(3)}`);
check('cloner renders non-black', shots.mean > 0.02, `mean=${shots.mean.toFixed(3)}`);
check('zero page errors', errors.length === 0, errors.slice(0,3).join(' || '));
const fails = results.filter(r => !r.ok);
console.log(`\n${results.length-fails.length}/${results.length} pass`);
await browser.close();
process.exit(fails.length ? 1 : 0);
