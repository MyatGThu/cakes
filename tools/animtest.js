const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..');
const OUT = __dirname + '/out';
const GSAP = require('path').join(__dirname, 'node_modules/gsap/dist');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp' };

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
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
}

(async () => {
  await new Promise(r => server.listen(8100, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const errors = [];
  const track = (p, tag) => { p.on('pageerror', e => errors.push('[' + tag + '] ' + e.message)); };

  // ---- 1. Cards use animated sources and the pixels actually change ----
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p1, 'anim');
  await withGsap(p1);
  await p1.goto('http://localhost:8100/shop.html', { waitUntil: 'networkidle' });
  await p1.waitForSelector('.card .photo');
  const srcs = await p1.evaluate(() => Array.from(document.querySelectorAll('.card .photo')).map(i => i.getAttribute('src')));
  const anim = srcs.filter(s => s.startsWith('images/3d/anim/'));
  console.log('spinning:', anim.length, 'of', srcs.length, '(want 3 — the tiered cakes)',
    '| cakes only:', anim.every(s => /(classic-vanilla|chocolate-fudge|custom-celebration)/.test(s)),
    '| loaded:', await p1.evaluate(() => Array.from(document.querySelectorAll('.card .photo')).every(i => i.complete && i.naturalWidth > 0)));
  const firstPhoto = p1.locator('.card .photo').first();
  const shotA = await firstPhoto.screenshot();
  await p1.waitForTimeout(700);
  const shotB = await firstPhoto.screenshot();
  console.log('animation playing (frames differ):', !shotA.equals(shotB));
  await p1.screenshot({ path: OUT + '/v7-anim-cards.png' });
  await p1.close();

  // ---- 2. Reduced motion gets the static renders ----
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  track(p2, 'reduced');
  await withGsap(p2);
  await p2.goto('http://localhost:8100/shop.html', { waitUntil: 'networkidle' });
  await p2.waitForSelector('.card .photo');
  const rmSrcs = await p2.evaluate(() => Array.from(document.querySelectorAll('.card .photo')).map(i => i.getAttribute('src')));
  console.log('reduced-motion uses stills:', rmSrcs.every(s => /^images\/3d\/[\w-]+\.webp$/.test(s)));
  await p2.close();

  // ---- 3. Missing animation file falls back to the still ----
  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p3, 'fallback');
  await withGsap(p3);
  await p3.route('**/images/3d/anim/**', r => r.abort());
  await p3.goto('http://localhost:8100/shop.html', { waitUntil: 'networkidle' });
  await p3.waitForSelector('.card .photo');
  await p3.waitForTimeout(800);
  const fb = await p3.evaluate(() => Array.from(document.querySelectorAll('.card .photo')).map(i => ({
    src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0,
  })));
  console.log('fallback to stills:', fb.every(f => f.ok && !f.src.includes('/anim/')));
  await p3.close();

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none ✅');
  await browser.close();
  server.close();
})().catch(e => { console.error('ANIMTEST FAILED:', e); process.exit(1); });
