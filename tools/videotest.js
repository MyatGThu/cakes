const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '..');
const OUT = __dirname + '/out';
const GSAP = require('path').join(__dirname, 'node_modules/gsap/dist');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    const type = MIME[path.extname(file)] || 'text/plain';
    // Range support so <video> can seek
    const range = req.headers.range && req.headers.range.match(/bytes=(\d+)-(\d*)/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    }
  });
});

async function withGsap(page) {
  await page.route('https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/*', route => {
    route.fulfill({ body: fs.readFileSync(path.join(GSAP, route.request().url().split('/').pop()), 'utf8'), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
}

// This Chromium build has no H.264 decoder (production browsers all do), so
// playback tests get VP9 re-encodes of the same clips.
async function withVp9Videos(page) {
  await page.route('**/images/video/*.mp4', route => {
    const name = route.request().url().split('/').pop();
    route.fulfill({ body: fs.readFileSync(path.join(__dirname, 'testmedia', name)), contentType: 'video/mp4' });
  });
}

(async () => {
  await new Promise(r => server.listen(8102, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const errors = [];
  const track = (p, tag) => { p.on('pageerror', e => errors.push('[' + tag + '] ' + e.message)); };

  // ---- 1. Desktop: video cards idle on poster, hover plays, unhover rewinds ----
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p1, 'desktop');
  await withGsap(p1);
  await withVp9Videos(p1);
  await p1.goto('http://localhost:8102/shop.html', { waitUntil: 'networkidle' });
  await p1.waitForSelector('.card .photo');
  const setup = await p1.evaluate(() => {
    const vids = Array.from(document.querySelectorAll('.card video.photo'));
    const imgs = Array.from(document.querySelectorAll('.card img.photo'));
    return {
      videos: vids.length, stills: imgs.length,
      chromeless: vids.every(v => !v.hasAttribute('controls')),
      muted: vids.every(v => v.muted),
      idle: vids.every(v => v.paused),
      postered: vids.every(v => (v.getAttribute('poster') || '').includes('-poster.webp')),
      noAnimLeft: imgs.every(i => !i.getAttribute('src').includes('/anim/')),
    };
  });
  console.log('desktop setup:', JSON.stringify(setup), '(want 3 videos, 3 stills, all true)');

  const vanillaCard = p1.locator('.card', { hasText: 'Classic Vanilla' });
  await vanillaCard.hover();
  await p1.waitForTimeout(900);
  const during = await vanillaCard.locator('video').evaluate(v => ({ playing: !v.paused, t: v.currentTime }));
  console.log('hover: playing:', during.playing, '| currentTime:', during.t.toFixed(2), '(want > 0)');
  await vanillaCard.screenshot({ path: OUT + '/v8-hover-play.png' });
  await p1.mouse.move(10, 10);
  await p1.waitForTimeout(250);
  const after = await vanillaCard.locator('video').evaluate(v => ({ paused: v.paused, t: v.currentTime }));
  console.log('unhover: paused:', after.paused, '| rewound:', after.t === 0);
  await p1.screenshot({ path: OUT + '/v8-grid.png' });
  await p1.close();

  // ---- 2. Reduced motion: plain poster imgs, no videos at all ----
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  track(p2, 'reduced');
  await withGsap(p2);
  await withVp9Videos(p2);
  await p2.goto('http://localhost:8102/shop.html', { waitUntil: 'networkidle' });
  await p2.waitForSelector('.card .photo');
  console.log('reduced motion:', await p2.evaluate(() => ({
    videos: document.querySelectorAll('.card video').length,
    posterStills: Array.from(document.querySelectorAll('.card img.photo')).filter(i => i.getAttribute('src').includes('-poster.webp')).length,
  })), '(want 0 videos, 3 poster stills)');
  await p2.close();

  // ---- 3. Video file missing: card falls back to an image ----
  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(p3, 'fallback');
  await withGsap(p3);
  await p3.route('**/images/video/*.mp4', r => r.abort());
  await p3.goto('http://localhost:8102/shop.html', { waitUntil: 'networkidle' });
  await p3.waitForSelector('.card .photo');
  await p3.waitForTimeout(1800);
  console.log('missing-video fallback:', await p3.evaluate(() => ({
    videosLeft: document.querySelectorAll('.card video').length,
    allShowing: Array.from(document.querySelectorAll('.card img.photo')).every(i => i.complete && i.naturalWidth > 0),
    notLoaded: Array.from(document.querySelectorAll('.card img.photo')).filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')),
  })), '(want 0 videos left, allShowing true)');
  await p3.close();

  // ---- 4. Touch device: plays while in view, pauses out of view ----
  const p4 = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  track(p4, 'touch');
  await withGsap(p4);
  await withVp9Videos(p4);
  await p4.goto('http://localhost:8102/shop.html', { waitUntil: 'networkidle' });
  await p4.waitForSelector('.card .photo');
  console.log('touch env: hover media:', await p4.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches), '(want false)');
  await p4.evaluate(() => document.querySelector('.card video').scrollIntoView({ block: 'center' }));
  await p4.waitForTimeout(900);
  const inView = await p4.evaluate(() => { const v = document.querySelector('.card video'); return { playing: !v.paused, t: v.currentTime }; });
  console.log('in view: playing:', inView.playing, '| t:', inView.t.toFixed(2));
  await p4.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p4.waitForTimeout(600);
  console.log('scrolled away: paused:', await p4.evaluate(() => document.querySelector('.card video').paused));
  await p4.close();

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none ✅');
  await browser.close();
  server.close();
})().catch(e => { console.error('VIDEOTEST FAILED:', e); process.exit(1); });
