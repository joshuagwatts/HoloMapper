import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/mobile.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof S !== 'undefined' && typeof buildClonerUI === 'function', { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1000));
const out = await page.evaluate(() => {
  const tmp = document.createElement('div');
  document.body.appendChild(tmp);
  buildClonerUI(tmp, 0); // RMode defaults 0 (mesh)
  const q = (s) => tmp.querySelector(s);
  const r1 = {
    rmodeRow: !!q('[data-ctrl="L0.clRMode"]'),
    sdfHidden: q('#clsdf0')?.style.display === 'none',
    meshShown: q('#clmeshm0')?.style.display !== 'none',
  };
  setParam('L0.clRMode', 1);
  const r2 = {
    sdfShown: q('#clsdf0')?.style.display !== 'none',
    meshHidden: q('#clmeshm0')?.style.display === 'none',
    matHidden: q('#clmatm0')?.style.display === 'none',
  };
  setParam('L0.clRMode', 0);
  const r3 = { sdfHiddenAgain: q('#clsdf0')?.style.display === 'none' };
  return { r1, r2, r3 };
});
console.log(JSON.stringify(out, null, 1));
const ok = out.r1.rmodeRow && out.r1.sdfHidden && out.r1.meshShown && out.r2.sdfShown && out.r2.meshHidden && out.r2.matHidden && out.r3.sdfHiddenAgain;
console.log(ok ? 'UI TOGGLE 4/4 PASS' : 'UI TOGGLE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
