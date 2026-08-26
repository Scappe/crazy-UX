import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('audit-artifacts');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB' });
const page = await context.newPage();
page.setDefaultTimeout(5000);
const assets = [];
page.on('response', async response => {
  try {
    const type = response.request().resourceType();
    const ct = response.headers()['content-type'] || '';
    if (['image','media','font','stylesheet'].includes(type) || /image|video|font|css/.test(ct)) {
      assets.push({ url: response.url(), type, contentType: ct, status: response.status() });
    }
  } catch {}
});
page.on('pageerror', e => fs.appendFileSync(path.join(OUT, 'errors.log'), `PAGEERROR ${e.message}\n`));

await page.goto('https://unseen.co/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => fs.appendFileSync(path.join(OUT, 'errors.log'), `goto ${e.message}\n`));
await page.waitForTimeout(7200);
await page.screenshot({ path: path.join(OUT, 'reference-desktop-ready.png'), animations: 'disabled', timeout: 20000 });

// Enter button is consistently centred at ~57.7% viewport height on the live entry.
await page.mouse.click(720, 519);
await page.waitForTimeout(3200);
await page.screenshot({ path: path.join(OUT, 'reference-desktop-world.png'), animations: 'disabled', timeout: 20000 });

const dump = await page.evaluate(() => {
  const interesting = [...document.querySelectorAll('button,a,h1,h2,p,canvas,img,video')].map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      tag: el.tagName,
      text: (el.textContent || '').trim().replace(/\s+/g,' ').slice(0,160),
      className: typeof el.className === 'string' ? el.className : '',
      id: el.id || '',
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1),
      display: s.display, visibility: s.visibility, opacity: s.opacity,
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
      lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
      color: s.color, background: s.backgroundColor,
      src: el.currentSrc || el.src || el.href || ''
    };
  }).filter(x => x.width > 0 && x.height > 0);
  return { title: document.title, bodyClass: document.body.className, interesting };
});
fs.writeFileSync(path.join(OUT, 'dom-world.json'), JSON.stringify(dump, null, 2));
fs.writeFileSync(path.join(OUT, 'assets.json'), JSON.stringify([...new Map(assets.map(x => [x.url,x])).values()], null, 2));

// Open menu using its semantic control, with coordinate fallback.
let menu = page.getByText('Toggle Menu', { exact: true });
if (await menu.count()) await menu.first().click({ force: true, noWaitAfter: true }).catch(() => page.mouse.click(1380, 40));
else await page.mouse.click(1380, 40);
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(OUT, 'reference-desktop-menu.png'), animations: 'disabled', timeout: 20000 });
const menuDump = await page.evaluate(() => [...document.querySelectorAll('button,a')].map(el => {
  const r=el.getBoundingClientRect(),s=getComputedStyle(el); return {text:(el.textContent||'').trim().replace(/\s+/g,' '),className:typeof el.className==='string'?el.className:'',x:r.x,y:r.y,width:r.width,height:r.height,fontFamily:s.fontFamily,fontSize:s.fontSize,color:s.color,opacity:s.opacity,display:s.display};
}).filter(x=>x.width>0&&x.height>0));
fs.writeFileSync(path.join(OUT, 'dom-menu.json'), JSON.stringify(menuDump, null, 2));

await context.close();
await browser.close();
console.log(`captured ${assets.length} media/font/css responses`);
