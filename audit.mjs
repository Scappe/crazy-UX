import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('audit-artifacts');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const targets = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
];

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const allAssets = [];
const savedText = new Set();

function dumpInteresting() {
  const nodes = [...document.querySelectorAll('button,a,h1,h2,h3,p,canvas,img,video')];
  return nodes.map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      tag: el.tagName,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180),
      className: typeof el.className === 'string' ? el.className : '',
      id: el.id || '',
      x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2),
      display: s.display, visibility: s.visibility, opacity: s.opacity, pointerEvents: s.pointerEvents,
      transform: s.transform, transition: s.transition, animation: s.animation,
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontStyle: s.fontStyle,
      fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
      color: s.color, background: s.backgroundColor, borderRadius: s.borderRadius,
      src: el.currentSrc || el.src || el.href || ''
    };
  }).filter(x => x.width > 0 && x.height > 0);
}

async function attachCapture(page, label) {
  page.on('response', async response => {
    try {
      const req = response.request();
      const type = req.resourceType();
      const ct = response.headers()['content-type'] || '';
      const url = response.url();
      if (['image','media','font','stylesheet','script'].includes(type) || /image|video|font|css|javascript/.test(ct)) {
        allAssets.push({ label, url, type, contentType: ct, status: response.status() });
      }
      if (!savedText.has(url) && url.includes('/wp-content/themes/unseen/public/') && (type === 'stylesheet' || type === 'script')) {
        savedText.add(url);
        const txt = await response.text().catch(() => '');
        if (txt) {
          const base = url.includes('style.css') ? 'live-style.css' : url.includes('theme.js') ? 'live-theme.js' : url.includes('vendor.js') ? 'live-vendor.js' : url.includes('manifest.js') ? 'live-manifest.js' : null;
          if (base) fs.writeFileSync(path.join(OUT, base), txt);
        }
      }
    } catch {}
  });
  page.on('pageerror', e => fs.appendFileSync(path.join(OUT, 'errors.log'), `[${label}] PAGEERROR ${e.message}\n`));
  page.on('console', m => { if (m.type() === 'error') fs.appendFileSync(path.join(OUT, 'errors.log'), `[${label}] CONSOLE ${m.text()}\n`); });
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const b = document.querySelector('.js-enter-btn');
    if (!b) return false;
    const s = getComputedStyle(b), r = b.getBoundingClientRect();
    return r.width > 40 && r.height > 20 && Number(s.opacity || 1) > .75 && s.pointerEvents !== 'none';
  }, null, { timeout: 16000 }).catch(() => {});
}

async function forceEnter(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('.js-enter-btn');
    if (!btn) return { ok:false, reason:'missing' };
    const fire = type => btn.dispatchEvent(new PointerEvent(type, { bubbles:true, cancelable:true, pointerId:1, pointerType:'mouse', isPrimary:true, clientX: innerWidth/2, clientY: innerHeight*.58 }));
    fire('pointerover'); fire('pointerenter'); fire('pointerdown'); fire('pointerup');
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, clientX:innerWidth/2, clientY:innerHeight*.58 }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, cancelable:true, clientX:innerWidth/2, clientY:innerHeight*.58 }));
    btn.click();
    btn.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, clientX:innerWidth/2, clientY:innerHeight*.58 }));
    return { ok:true, cls:btn.className, body:document.body.className };
  }).catch(e => ({ ok:false, reason:e.message }));
}

async function openMenu(page) {
  return page.evaluate(() => {
    const b = document.querySelector('.js-menu-toggle');
    if (!b) return false;
    b.click();
    b.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true }));
    return true;
  }).catch(() => false);
}

async function capturePage(page, viewportName, slug, url, waitMs=5000) {
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 }).catch(e => fs.appendFileSync(path.join(OUT,'errors.log'), `[${viewportName}/${slug}] goto ${e.message}\n`));
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path:path.join(OUT, `reference-${viewportName}-${slug}.png`), animations:'allow', timeout:20000 });
  const dom = await page.evaluate(dumpInteresting);
  fs.writeFileSync(path.join(OUT, `dom-${viewportName}-${slug}.json`), JSON.stringify({ url:page.url(), title:await page.title().catch(()=>''), bodyClass:await page.evaluate(()=>document.body.className), interesting:dom }, null, 2));
}

for (const cfg of targets) {
  const context = await browser.newContext({
    viewport: cfg.viewport,
    deviceScaleFactor: 1,
    locale:'en-GB',
    isMobile: !!cfg.isMobile,
    hasTouch: !!cfg.hasTouch,
    recordVideo: { dir: path.join(OUT, `video-${cfg.name}`), size: cfg.viewport }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(20000);
  await attachCapture(page, cfg.name);

  await page.goto('https://unseen.co/', { waitUntil:'domcontentloaded', timeout:20000 }).catch(e => fs.appendFileSync(path.join(OUT,'errors.log'), `[${cfg.name}/home] goto ${e.message}\n`));
  await page.waitForTimeout(1000);
  await page.screenshot({ path:path.join(OUT, `reference-${cfg.name}-loader-1s.png`), animations:'allow' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path:path.join(OUT, `reference-${cfg.name}-loader-2_5s.png`), animations:'allow' });
  await waitReady(page);
  await page.screenshot({ path:path.join(OUT, `reference-${cfg.name}-ready.png`), animations:'allow' });

  const enterResult = await forceEnter(page);
  fs.appendFileSync(path.join(OUT,'events.log'), `[${cfg.name}] enter ${JSON.stringify(enterResult)}\n`);
  await page.waitForTimeout(4200);
  const afterEnter = await page.evaluate(() => ({ body:document.body.className, loader:document.querySelector('.loader') ? getComputedStyle(document.querySelector('.loader')).opacity : 'missing', url:location.href }));
  fs.appendFileSync(path.join(OUT,'events.log'), `[${cfg.name}] afterEnter ${JSON.stringify(afterEnter)}\n`);
  await page.screenshot({ path:path.join(OUT, `reference-${cfg.name}-world.png`), animations:'allow', timeout:20000 });
  fs.writeFileSync(path.join(OUT, `dom-${cfg.name}-world.json`), JSON.stringify({ state:afterEnter, interesting:await page.evaluate(dumpInteresting) }, null, 2));

  const x1 = Math.round(cfg.viewport.width*.43), y1 = Math.round(cfg.viewport.height*.55);
  const x2 = Math.round(cfg.viewport.width*.61), y2 = Math.round(cfg.viewport.height*.43);
  await page.mouse.move(x1,y1); await page.mouse.down(); await page.mouse.move(x2,y2,{steps:18}); await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path:path.join(OUT, `reference-${cfg.name}-dragged.png`), animations:'allow', timeout:20000 });

  const menuResult = await openMenu(page);
  fs.appendFileSync(path.join(OUT,'events.log'), `[${cfg.name}] menu ${menuResult}\n`);
  await page.waitForTimeout(1300);
  await page.screenshot({ path:path.join(OUT, `reference-${cfg.name}-menu.png`), animations:'allow', timeout:20000 });
  fs.writeFileSync(path.join(OUT, `dom-${cfg.name}-menu.json`), JSON.stringify(await page.evaluate(dumpInteresting), null, 2));

  await capturePage(page, cfg.name, 'projects', 'https://unseen.co/projects/', 5200);
  await capturePage(page, cfg.name, 'contact', 'https://unseen.co/contact/', 5200);

  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'assets.json'), JSON.stringify([...new Map(allAssets.map(x => [x.url, x])).values()], null, 2));
console.log(`captured ${allAssets.length} responses across desktop/mobile plus videos`);
