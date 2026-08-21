const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..');
const OUT = __dirname + '/out';
const GSAP = require('path').join(__dirname, 'node_modules/gsap/dist');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});

async function withGsap(page) {
  await page.route('https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/*', route => {
    route.fulfill({ body: fs.readFileSync(path.join(GSAP, route.request().url().split('/').pop()), 'utf8'), contentType: 'text/javascript' });
  });
  await page.route('https://cdn.jsdelivr.net/npm/lenis@*/dist/*', route => {
    route.fulfill({ body: fs.readFileSync(path.join(__dirname, 'node_modules/lenis/dist', route.request().url().split('/').pop())), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
}

(async () => {
  await new Promise(r => server.listen(8099, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const errors = [];
  const track = (p, tag) => { p.on('pageerror', e => errors.push('[' + tag + '] ' + e.message)); };

  // ---- 1. Magnetic + hover-fill on the landing CTA ----
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p1, 'magnetic');
  await withGsap(p1);
  await p1.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(1600); // let the intro finish
  const btn = p1.locator('.cta-row .btn-primary');
  const box = await btn.boundingBox();
  const before = await btn.evaluate(el => getComputedStyle(el).transform);
  const fillBefore = await btn.evaluate(el => getComputedStyle(el, '::after').transform);
  await p1.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await p1.waitForTimeout(120);
  await p1.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.15);
  await p1.waitForTimeout(400);
  const during = await btn.evaluate(el => getComputedStyle(el).transform);
  const fillDuring = await btn.evaluate(el => getComputedStyle(el, '::after').transform);
  console.log('magnetic: transform changed:', before !== during, JSON.stringify({ before, during }));
  console.log('hover-fill: ::after moved:', fillBefore !== fillDuring);
  await p1.mouse.move(10, 10);
  await p1.waitForTimeout(1400); // the viscous return settles over ~0.85s
  const after = await btn.evaluate(el => getComputedStyle(el).transform);
  console.log('magnetic: springs back near identity:', after === 'none' || /matrix\(1, 0, 0, 1, -?0?\.?\d*, -?0?\.?\d*\)/.test(after), after);

  // ---- 2. Wipe navigation landing -> shop ----
  await btn.click();
  const visibleMidWipe = await p1.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    (function poll() {
      const w = document.querySelector('.page-wipe');
      if (w && getComputedStyle(w).visibility === 'visible' && parseFloat(getComputedStyle(w).opacity) > 0) return res(true);
      if (performance.now() - t0 > 1500) return res(false);
      requestAnimationFrame(poll);
    })();
  }));
  console.log('wipe: overlay covered on click:', visibleMidWipe);
  await p1.waitForURL('**/shop.html', { timeout: 6000 });
  await p1.waitForSelector('.card');
  await p1.waitForTimeout(1800); // reveal finishes
  const arrivedState = await p1.evaluate(() => ({
    holdClass: document.documentElement.classList.contains('wipe-hold'),
    wipeHidden: getComputedStyle(document.querySelector('.page-wipe')).visibility === 'hidden',
    flagCleared: sessionStorage.getItem('auretteWipe') === null,
  }));
  console.log('wipe arrive:', JSON.stringify(arrivedState), '(want hold false, hidden true, cleared true)');

  // ---- 3. In-page anchor is NOT intercepted ----
  await p1.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p1.locator('.scroll-cue').click();
  await p1.waitForTimeout(400);
  const anchorState = await p1.evaluate(() => ({
    hash: location.hash,
    wipeVisible: getComputedStyle(document.querySelector('.page-wipe')).visibility === 'visible',
  }));
  console.log('anchor click:', JSON.stringify(anchorState), '(want #story, wipeVisible false)');
  await p1.close();

  // ---- 4. Mid-wipe screenshot ----
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p2, 'shot');
  await withGsap(p2);
  await p2.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1400);
  await p2.locator('.cta-row .btn-primary').click();
  await p2.waitForTimeout(600);
  await p2.screenshot({ path: OUT + '/v6-wipe-mid.png' });
  await p2.waitForURL('**/shop.html', { timeout: 6000 });
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: OUT + '/v6-wipe-reveal.png' });
  await p2.close();

  // ---- 5. Reduced motion: plain navigation ----
  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  track(p3, 'reduced');
  await withGsap(p3);
  await p3.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p3.locator('.nav-links a[href="shop.html"]').click();
  await p3.waitForURL('**/shop.html', { timeout: 4000 });
  console.log('reduced-motion: navigated natively:', p3.url().endsWith('shop.html'),
    '| wipe-hold:', await p3.evaluate(() => document.documentElement.classList.contains('wipe-hold')));
  await p3.close();

  // ---- 6. No-CDN fallback: plain navigation, hold never sticks ----
  const p4 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p4, 'nocdn');
  await p4.route('https://cdn.jsdelivr.net/**', r => r.abort());
  await p4.route('https://fonts.googleapis.com/**', r => r.abort());
  await p4.route('https://fonts.gstatic.com/**', r => r.abort());
  await p4.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p4.locator('.nav-links a[href="shop.html"]').click();
  await p4.waitForURL('**/shop.html', { timeout: 4000 });
  await p4.waitForSelector('.card');
  console.log('no-CDN: navigated natively, cards render:', await p4.locator('.card').count());
  await p4.close();

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none ✅');
  await browser.close();
  server.close();
})().catch(e => { console.error('WIPETEST FAILED:', e); process.exit(1); });
