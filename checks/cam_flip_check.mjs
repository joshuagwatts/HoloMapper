/* Camera upside-down fix verification: render the REAL camSlate() texture through
   the REAL PROG.copy + quadDraw path (exactly like renderCamera's slate branch),
   read back, and check the "NO CAMERA" title sits in the top half. Negative
   control: same canvas uploaded WITHOUT the flip must read upside-down. */
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
await page.waitForFunction(() => typeof S !== 'undefined' && typeof camSlate === 'function', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
check('no page errors on load', errors.length === 0, errors.slice(0, 2).join(' || '));

/* band brightness: title "NO CAMERA" (bold 34px @ y=120/270 = 44%) dominates the
   upper-middle; if flipped it lands in the lower-middle instead. */
const bandMeans = await page.evaluate(() => {
  const renderTex = (tex) => {
    renderSourceInto(4, 0, 10.0, thT); // ensure GL warm; then draw our own
    gl.bindFramebuffer(gl.FRAMEBUFFER, thT.fb);
    gl.viewport(0, 0, THW, THH);
    const P = PROG.copy;
    gl.useProgram(P); setTex(P, 'u_tex', 0, tex);
    quadDraw();
    gl.readPixels(0, 0, THW, THH, gl.RGBA, gl.UNSIGNED_BYTE, thPx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from(thPx);
  };
  const bands = (px) => {
    // thPx rows: row 0 = BOTTOM (no flip). top band = rows 55%-80% of THH.
    let top = 0, bot = 0, nt = 0, nb = 0;
    for (let y = 0; y < THH; y++) for (let x = 0; x < THW; x++) {
      const o = (y * THW + x) * 4, l = (px[o] + px[o + 1] + px[o + 2]) / 3;
      const f = y / THH; // 0 = bottom
      if (f > 0.55 && f < 0.85) { top += l; nt++; }
      else if (f > 0.15 && f < 0.45) { bot += l; nb++; }
    }
    return { top: top / nt / 255, bot: bot / nb / 255 };
  };
  // 1) the REAL slate texture (goes through the fixed camSlate upload)
  const realTex = camSlate();
  const realBands = bands(renderTex(realTex));
  // 2) negative control: same canvas, old behavior (no flip)
  const c = document.createElement('canvas'); c.width = 480; c.height = 270;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 480, 270);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 135); // white TOP half
  const t2 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t2);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // OLD behavior
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  const oldBands = bands(renderTex(t2));
  // 3) same canvas, NEW behavior (flip) — mechanism check
  gl.bindTexture(gl.TEXTURE_2D, t2);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const newBands = bands(renderTex(t2));
  return { realBands, oldBands, newBands };
});
console.log('      real slate :', JSON.stringify(bandMeans.realBands));
console.log('      old upload :', JSON.stringify(bandMeans.oldBands));
console.log('      new upload :', JSON.stringify(bandMeans.newBands));
check('negative control: old upload reads upside-down (white at bottom)',
  bandMeans.oldBands.bot > bandMeans.oldBands.top + 0.2,
  `top=${bandMeans.oldBands.top.toFixed(2)} bot=${bandMeans.oldBands.bot.toFixed(2)}`);
check('mechanism: flipped upload reads upright (white on top)',
  bandMeans.newBands.top > bandMeans.newBands.bot + 0.2,
  `top=${bandMeans.newBands.top.toFixed(2)} bot=${bandMeans.newBands.bot.toFixed(2)}`);
check('real camSlate() renders upright (title band brighter on top)',
  bandMeans.realBands.top > bandMeans.realBands.bot,
  `top=${bandMeans.realBands.top.toFixed(3)} bot=${bandMeans.realBands.bot.toFixed(3)}`);
check('zero page errors after camera work', errors.length === 0, errors.slice(0, 3).join(' || '));

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} pass${fails.length ? ` — FAILURES: ${fails.map((f) => f.name).join('; ')}` : ''}`);
await browser.close();
process.exit(fails.length ? 1 : 0);
