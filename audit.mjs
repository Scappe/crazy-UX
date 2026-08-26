import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const OUT = path.resolve('audit-artifacts');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const targets = { reference: 'https://unseen.co/', clone: 'http://127.0.0.1:4173/' };
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

async function clickVisible(page, text) {
  const loc = page.getByText(text, { exact: true });
  for (let i = (await loc.count()) - 1; i >= 0; i--) {
    const n = loc.nth(i);
    if (await n.isVisible().catch(() => false)) {
      await n.click({ timeout: 3500, noWaitAfter: true }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false, animations: 'disabled', timeout: 7000 });
}

async function auditOne(browser, kind, viewportName) {
  const viewport = viewports[viewportName];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-GB' });
  const page = await context.newPage();
  page.setDefaultTimeout(3500);
  page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', e => fs.appendFileSync(path.join(OUT, 'errors.log'), `[${kind}/${viewportName}] ${e.message}\n`));
  page.on('console', m => { if (m.type() === 'error') fs.appendFileSync(path.join(OUT, 'errors.log'), `[${kind}/${viewportName}] console: ${m.text()}\n`); });

  try { await page.goto(targets[kind], { waitUntil: 'domcontentloaded', timeout: 15000 }); }
  catch (e) { fs.appendFileSync(path.join(OUT, 'errors.log'), `[${kind}/${viewportName}] goto: ${e.message}\n`); }

  await page.waitForTimeout(2400);
  await shot(page, `${kind}-${viewportName}-intro`);

  let entered = await clickVisible(page, 'Enter without audio');
  if (!entered) entered = await clickVisible(page, 'Enter');
  await page.waitForTimeout(2100);
  await shot(page, `${kind}-${viewportName}-world`);

  const x1 = Math.round(viewport.width * .40), y1 = Math.round(viewport.height * .50);
  const x2 = Math.round(viewport.width * .61), y2 = Math.round(viewport.height * .43);
  await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(500);
  await shot(page, `${kind}-${viewportName}-dragged`);

  await clickVisible(page, 'Toggle Menu');
  await page.waitForTimeout(950);
  await shot(page, `${kind}-${viewportName}-menu`);
  await context.close();
}

function compare(refPath, clonePath, diffPath) {
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const clone = PNG.sync.read(fs.readFileSync(clonePath));
  if (ref.width !== clone.width || ref.height !== clone.height) return { comparable: false, reason: 'dimension mismatch' };
  const diff = new PNG({ width: ref.width, height: ref.height });
  const pixels = pixelmatch(ref.data, clone.data, diff.data, ref.width, ref.height, { threshold: .12, includeAA: false, alpha: .6 });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return { comparable: true, mismatchPixels: pixels, totalPixels: ref.width * ref.height, mismatchPercent: +(pixels / (ref.width * ref.height) * 100).toFixed(3) };
}

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
for (const viewportName of Object.keys(viewports)) {
  for (const kind of ['reference', 'clone']) {
    try { await auditOne(browser, kind, viewportName); }
    catch (e) { fs.appendFileSync(path.join(OUT, 'errors.log'), `[${kind}/${viewportName}] fatal: ${e.stack || e.message}\n`); }
  }
}
await browser.close();

const report = { generatedAt: new Date().toISOString(), comparisons: {} };
for (const viewportName of Object.keys(viewports)) {
  for (const state of ['intro','world','dragged','menu']) {
    const r = path.join(OUT, `reference-${viewportName}-${state}.png`), c = path.join(OUT, `clone-${viewportName}-${state}.png`);
    const key = `${viewportName}-${state}`;
    report.comparisons[key] = fs.existsSync(r) && fs.existsSync(c)
      ? compare(r, c, path.join(OUT, `diff-${key}.png`))
      : { comparable: false, reason: 'missing screenshot' };
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
