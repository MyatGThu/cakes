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
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
}

(async () => {
  await new Promise(r => server.listen(8098, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const errors = [];
  const track = (p, tag) => { p.on('pageerror', e => errors.push('[' + tag + '] ' + e.message)); };

  // ---- Landing (rich) ----
  const land = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(land, 'landing');
  await withGsap(land);
  await land.goto('http://localhost:8098/', { waitUntil: 'networkidle' });
  console.log('landing: motion-on:', await land.evaluate(() => document.documentElement.classList.contains('motion-on')),
    '| words:', await land.locator('#heroTitle .word').count(),
    '| announcement:', (await land.locator('#announcement').textContent()).slice(0, 30) + '…');
  await land.waitForTimeout(2200); // ingredient fly-in settles
  console.log('landing collage:', await land.evaluate(() => ({
    flyers: document.querySelectorAll('.act-hero .ing-fly').length,
    loaded: Array.from(document.querySelectorAll('.ing, .stage-ing, .hero-cake')).every(i => i.complete && i.naturalWidth > 0),
    marquee: !!document.querySelector('.marquee-track'),
    scraps: document.querySelectorAll('.scrap').length,
    tape: document.querySelectorAll('.tape').length,
    hand: getComputedStyle(document.querySelector('.scribble')).fontFamily.includes('Caveat'),
  })));
  await land.screenshot({ path: OUT + '/v4-landing-hero.png' });

  // scroll into the turntable stage
  await land.evaluate(() => document.querySelector('.cake-stage').scrollIntoView());
  for (let i = 0; i < 10; i++) { await land.mouse.wheel(0, 400); await land.waitForTimeout(120); }
  const stageState = await land.evaluate(() => {
    const tier = document.querySelector('#sTier1');
    const visibleCaptions = Array.from(document.querySelectorAll('.stage-caption')).filter(el => parseFloat(getComputedStyle(el).opacity) > 0.5).length;
    return { cakeBuilding: parseFloat(getComputedStyle(tier).opacity) > 0, visibleCaptions };
  });
  console.log('landing stage:', JSON.stringify(stageState), '(cakeBuilding true, 1 caption)');
  await land.screenshot({ path: OUT + '/v4-turntable.png' });

  // teaser floats + footer
  await land.evaluate(() => document.querySelector('.teaser').scrollIntoView());
  await land.waitForTimeout(700);
  await land.screenshot({ path: OUT + '/v4-teaser.png' });
  console.log('landing h-scroll:', await land.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  await land.close();

  // ---- Shop (rich) ----
  const shop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(shop, 'shop');
  await withGsap(shop);
  await shop.goto('http://localhost:8098/shop.html', { waitUntil: 'networkidle' });
  await shop.waitForSelector('.card');
  console.log('shop: cards:', await shop.locator('.card').count(),
    '| media loaded:', await shop.evaluate(() => Array.from(document.querySelectorAll('.card .photo')).every(i =>
      i.tagName === 'VIDEO' ? i.readyState >= 1 : (i.complete && i.naturalWidth > 0))));
  await shop.locator('.card', { hasText: 'Banana Bread' }).locator('[data-add]').click();
  await shop.locator('#modalAdd').click();
  console.log('shop: cart count:', await shop.locator('#cartCount').textContent());
  await shop.evaluate(() => document.querySelector('#menu').scrollIntoView());
  await shop.waitForTimeout(800);
  await shop.screenshot({ path: OUT + '/v4-shop.png' });
  console.log('shop h-scroll:', await shop.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  await shop.close();

  // ---- Landing again: cart chip should reflect the order ----
  const land2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(land2, 'landing2');
  await withGsap(land2);
  await land2.goto('http://localhost:8098/', { waitUntil: 'networkidle' });
  console.log('landing cart chip:', await land2.locator('#orderNow').textContent().then(t => t.replace(/\s+/g, ' ').trim()));
  await land2.close();

  // ---- About (rich) ----
  const about = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(about, 'about');
  await withGsap(about);
  await about.goto('http://localhost:8098/about.html', { waitUntil: 'networkidle' });
  await about.waitForTimeout(600);
  await about.screenshot({ path: OUT + '/v4-about.png', fullPage: true });
  console.log('about: follow btn:', await about.locator('#igFollowAbout').textContent(),
    '| h-scroll:', await about.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  await about.close();

  // ---- No-CDN fallback: landing must be fully readable ----
  const nofx = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  track(nofx, 'nofx');
  await nofx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  await nofx.route('https://fonts.googleapis.com/**', r => r.abort());
  await nofx.route('https://fonts.gstatic.com/**', r => r.abort());
  await nofx.goto('http://localhost:8098/', { waitUntil: 'networkidle' });
  const fb = await nofx.evaluate(() => ({
    motionOn: document.documentElement.classList.contains('motion-on'),
    stageAuto: getComputedStyle(document.querySelector('.cake-stage')).height,
    cakeComplete: Array.from(document.querySelectorAll('#stageCake g, #stageCake rect')).every(el => parseFloat(getComputedStyle(el).opacity) === 1),
    captionsVisible: Array.from(document.querySelectorAll('.stage-caption')).every(el => parseFloat(getComputedStyle(el).opacity) === 1),
    heroVisible: parseFloat(getComputedStyle(document.getElementById('heroTitle')).opacity) === 1,
  }));
  console.log('no-CDN landing:', JSON.stringify(fb));
  await nofx.close();

  // ---- Reduced motion ----
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  track(rm, 'rm');
  await withGsap(rm);
  await rm.goto('http://localhost:8098/', { waitUntil: 'networkidle' });
  console.log('reduced-motion: motion-on class:', await rm.evaluate(() => document.documentElement.classList.contains('motion-on')), '(expect false)');
  await rm.close();

  // ---- Mobile all three ----
  // The nav used to be display:none below 720px with nothing in its place, which
  // made shop.html a dead end on a phone. These assertions are here so that
  // cannot come back quietly: every page must offer all three destinations, and
  // every tab must stay thumb-sized.
  for (const [name, url] of [['landing', '/'], ['shop', '/shop.html'], ['about', '/about.html']]) {
    for (const w of [320, 360, 390]) { // 320 is the tightest point in the header
      const mob = await browser.newPage({ viewport: { width: w, height: 844 } });
      track(mob, 'mob-' + name + '-' + w);
      await withGsap(mob);
      await mob.goto('http://localhost:8098' + url, { waitUntil: 'networkidle' });
      await mob.waitForTimeout(500);
      const nav = await mob.evaluate(() => {
        const seen = (sel) => Array.from(document.querySelectorAll(sel))
          .filter(a => a.offsetParent !== null)
          .map(a => (a.getAttribute('href') || '').split('#')[0].split('?')[0]);
        const head = seen('.nav-links a'), foot = seen('.footer-nav a');
        const wanted = ['index.html', 'shop.html', 'about.html'];
        const chips = Array.from(document.querySelectorAll('.chip'))
          .map(c => c.getBoundingClientRect());
        return {
          headerNav: head.length,
          reaches: wanted.every(w => head.includes(w)),
          footerNav: foot.length,
          brandVisible: document.querySelector('.brand').getBoundingClientRect().x >= 0,
          smallestTab: chips.length
            ? Math.round(Math.min(...chips.map(c => Math.min(c.width, c.height))))
            : null,
          hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      // --header-h is a hand-maintained mirror of the header's real height. If
      // the bar padding, nav font-size or monogram size drifts, the sticky tab
      // strip stops meeting the header and nothing else here would notice.
      if (name === 'shop') {
        const dock = await mob.evaluate(() => {
          const c = document.getElementById('categoryChips');
          if (!c || c.hidden || getComputedStyle(c).position !== 'sticky') return null;
          const h = document.querySelector('.site-header').getBoundingClientRect();
          return Math.round(parseFloat(getComputedStyle(c).top) - h.height);
        });
        if (dock !== null && (dock < 4 || dock > 10)) {
          errors.push('[mob-' + name + '-' + w + '] tab strip offset drifted: ' + dock);
        }
      }
      const bad = [];
      if (nav.headerNav !== 3 || !nav.reaches) bad.push('header nav incomplete');
      if (nav.footerNav !== 3) bad.push('footer nav incomplete');
      if (!nav.brandVisible) bad.push('brand pushed off-screen');
      if (nav.smallestTab !== null && nav.smallestTab < 44) bad.push('tab under 44px: ' + nav.smallestTab);
      if (nav.hScroll) bad.push('horizontal scroll');
      console.log('mobile', name, w + 'px:', JSON.stringify(nav), bad.length ? '❌ ' + bad.join(', ') : '✅');
      if (bad.length) errors.push('[mob-' + name + '-' + w + '] ' + bad.join(', '));
      if (name === 'landing' && w === 390) await mob.screenshot({ path: OUT + '/v4-mobile.png' });
      await mob.close();
    }
  }

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none ✅');
  await browser.close();
  server.close();
})().catch(e => { console.error('SMOKE FAILED:', e); process.exit(1); });
