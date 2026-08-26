import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const OUT = path.resolve('audit-artifacts');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const targets = {
  reference: 'https://unseen.co/',
  clone: 'http://127.0.0.1:4173/'
};

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 }
};

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clickVisibleText(page, text) {
  const loc = page.getByText(text, { exact: true });
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i--) {
    const item = loc.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.click({ timeout: 7000 });
      return true;
    }
  }
  return false;
}

async function clickVisibleRole(page, role, name) {
  const loc = page.getByRole(role, { name, exact: true });
  const count = await loc.count();
  for (let i = count - 1; i >= 0; i--) {
    const item = loc.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.click({ timeout: 7000 });
      return true;
    }
  }
  return false;
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
}

async function capture(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false, animations: 'disabled' });
  return p;
}

async function auditOne(browser, kind, viewportName) {
  const viewport = viewports[viewportName];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    locale: 'en-GB'
  });
  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') fs.appendFileSync(path.join(OUT, 'console-errors.log'), `[${kind}/${viewportName}] ${msg.text()}\n`);
  });
  page.on('pageerror', err => fs.appendFileSync(path.join(OUT, 'console-errors.log'), `[${kind}/${viewportName}] PAGEERROR ${err.message}\n`));

  await page.goto(targets[kind], { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page, 2300);
  await capture(page, `${kind}-${viewportName}-intro`);

  let entered = await clickVisibleText(page, 'Enter without audio');
  if (!entered) entered = await clickVisibleRole(page, 'button', 'Enter without audio');
  if (!entered) entered = await clickVisibleRole(page, 'button', 'Enter');
  await settle(page, 2200);
  await capture(page, `${kind}-${viewportName}-world`);

  // Same deterministic world drag for both builds.
  const x1 = Math.round(viewport.width * .38);
  const y1 = Math.round(viewport.height * .48);
  const x2 = Math.round(viewport.width * .64);
  const y2 = Math.round(viewport.height * .41);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 18 });
  await page.mouse.up();
  await settle(page, 650);
  await capture(page, `${kind}-${viewportName}-dragged`);

  let menuOpened = await clickVisibleRole(page, 'button', 'Toggle Menu');
  if (!menuOpened) menuOpened = await clickVisibleText(page, 'Toggle Menu');
  await settle(page, 1150);
  await capture(page, `${kind}-${viewportName}-menu`);

  // Try to reach Projects through the menu when available.
  let projects = await clickVisibleText(page, 'Projects');
  if (!projects) projects = await clickVisibleRole(page, 'button', 'Projects');
  await settle(page, 1400);
  await capture(page, `${kind}-${viewportName}-projects`);

  await context.close();
}

function comparePair(refPath, clonePath, diffPath) {
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const clone = PNG.sync.read(fs.readFileSync(clonePath));
  if (ref.width !== clone.width || ref.height !== clone.height) {
    return { comparable: false, reason: 'dimension mismatch' };
  }
  const diff = new PNG({ width: ref.width, height: ref.height });
  const mismatch = pixelmatch(ref.data, clone.data, diff.data, ref.width, ref.height, {
    threshold: 0.12,
    includeAA: false,
    alpha: 0.6,
    diffColor: [255, 0, 0],
    aaColor: [255, 255, 0]
  });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const total = ref.width * ref.height;
  return {
    comparable: true,
    mismatchPixels: mismatch,
    totalPixels: total,
    mismatchPercent: +(mismatch / total * 100).toFixed(3)
  };
}

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  for (const viewportName of Object.keys(viewports)) {
    for (const kind of ['reference', 'clone']) {
      try {
        await auditOne(browser, kind, viewportName);
      } catch (error) {
        fs.appendFileSync(path.join(OUT, 'audit-errors.log'), `[${kind}/${viewportName}] ${error.stack || error.message}\n`);
      }
    }
  }
} finally {
  await browser.close();
}

const states = ['intro', 'world', 'dragged', 'menu', 'projects'];
const report = { generatedAt: new Date().toISOString(), targets, viewports, comparisons: {} };
for (const viewportName of Object.keys(viewports)) {
  for (const state of states) {
    const ref = path.join(OUT, `reference-${viewportName}-${state}.png`);
    const clone = path.join(OUT, `clone-${viewportName}-${state}.png`);
    const key = `${viewportName}-${state}`;
    if (fs.existsSync(ref) && fs.existsSync(clone)) {
      report.comparisons[key] = comparePair(ref, clone, path.join(OUT, `diff-${key}.png`));
    } else {
      report.comparisons[key] = { comparable: false, reason: 'missing screenshot' };
    }
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
