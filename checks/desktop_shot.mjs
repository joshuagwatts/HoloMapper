import puppeteer from 'puppeteer-core';
const URL = 'file:///home/hatch/workspace/holomapper/holomapper.html';
const browser = await puppeteer.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio','--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => typeof dockLayout !== 'undefined' && dockLayout!==null, { timeout: 90000 });
await new Promise((r)=>setTimeout(r,2500));
await page.screenshot({ path: '/tmp/desktop_layout.png' });
await browser.close();
console.log('shot saved');
