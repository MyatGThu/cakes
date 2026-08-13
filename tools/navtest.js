/* Aurette — the two mobile navigation traps, and the contracts that keep them shut.
 *
 * 1. The modal and the cart drawer cover the whole phone screen, so they look
 *    like a new page and every instinct says swipe/press Back. Back must close
 *    the overlay, not leave the site with an order half-built.
 * 2. A product card is mostly photograph. Tapping the photo or the name must
 *    open that cake — it used to do nothing at all, because only the Add
 *    button was bound.
 *
 * Run with `npm run test:nav` from tools/.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GSAP = path.join(__dirname, 'node_modules/gsap/dist');
const PORT = 8079;
const B = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});

const fails = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + ': ' + JSON.stringify(got) + (ok ? '' : ' — wanted ' + JSON.stringify(want)));
  if (!ok) fails.push(name);
}
// One broken contract should not hide the other nine, so a step that depends on
// a previous one having worked reports its own failure instead of throwing.
async function step(name, fn) {
  try { await fn(); }
  catch (e) {
    console.log('  ❌ ' + name + ' — could not run: ' + String(e.message).split('\n')[0]);
    fails.push(name);
  }
}

const state = (p) => p.evaluate(() => {
  const o = document.getElementById('productOverlay');
  const d = document.getElementById('cartDrawer');
  return {
    page: location.pathname.split('/').pop() || 'index.html',
    hash: location.hash,
    modal: o ? !o.hidden : null,
    drawer: d ? d.classList.contains('open') : null,
  };
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  });
  const errors = [];

  async function newPage(withGsap) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    if (withGsap) {
      await p.route('https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/*', r =>
        r.fulfill({ body: fs.readFileSync(path.join(GSAP, r.request().url().split('/').pop()), 'utf8'), contentType: 'text/javascript' }));
    } else {
      await p.route('https://cdn.jsdelivr.net/**', r => r.abort());
    }
    await p.route('https://fonts.googleapis.com/**', r => r.abort());
    await p.route('https://fonts.gstatic.com/**', r => r.abort());
    return p;
  }

  // Arrive on the menu the way a visitor does — from the landing page, so there
  // is a real previous entry for Back to fall through to if we get this wrong.
  async function arrive(p, url) {
    await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await p.goto(B + (url || '/shop.html'), { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
  }

  console.log('\n--- Back closes the overlay, it does not leave the site');
  {
    const p = await newPage(false);

    await arrive(p);
    await p.locator('#cartButton').click();
    await p.waitForTimeout(500);
    check('drawer opens', (await state(p)).drawer, true);
    await p.goBack().catch(() => {});
    await p.waitForTimeout(700);
    let s = await state(p);
    check('Back closes the drawer and stays put', { page: s.page, drawer: s.drawer }, { page: 'shop.html', drawer: false });
    await p.goBack().catch(() => {});
    await p.waitForTimeout(700);
    check('a second Back then leaves the menu', (await state(p)).page, 'index.html');

    await step('card tap + Back', async () => {
      await arrive(p);
      await p.locator('.card').first().click({ position: { x: 80, y: 60 } });
      await p.waitForTimeout(600);
      check('card tap opens the modal', (await state(p)).modal, true);
      await p.goBack().catch(() => {});
      await p.waitForTimeout(700);
      const s2 = await state(p);
      check('Back closes the modal and stays put', { page: s2.page, modal: s2.modal, hash: s2.hash }, { page: 'shop.html', modal: false, hash: '' });
    });

    // Closing with the × must not leave a phantom entry behind.
    await step('close with x', async () => {
      await arrive(p);
      await p.locator('.card').first().click({ position: { x: 80, y: 60 } });
      await p.waitForTimeout(600);
      await p.locator('#modalClose').click({ timeout: 5000 });
      await p.waitForTimeout(600);
      check('x closes the modal', (await state(p)).modal, false);
      await p.goBack().catch(() => {});
      await p.waitForTimeout(700);
      check('one Back after x leaves the menu (no phantom entry)', (await state(p)).page, 'index.html');
    });

    // Escape, same contract.
    await arrive(p);
    await p.locator('#cartButton').click();
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
    check('Escape closes the drawer', (await state(p)).drawer, false);
    await p.goBack().catch(() => {});
    await p.waitForTimeout(700);
    check('one Back after Escape leaves the menu', (await state(p)).page, 'index.html');

    // A shared deep link still opens the cake, and Back returns to the referrer.
    await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await p.goto(B + '/shop.html#cake-classic-vanilla', { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    check('deep link opens the cake', (await state(p)).modal, true);
    await p.goBack().catch(() => {});
    await p.waitForTimeout(700);
    check('Back from a deep-linked cake closes it', (await state(p)).modal, false);

    // The header CTA on the other pages points at shop.html#order.
    await p.goto(B + '/shop.html#order', { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    check('#order opens the drawer', (await state(p)).drawer, true);

    // Adding from the modal closes it; history must not be left dangling.
    await step('add from modal', async () => {
      await arrive(p);
      await p.locator('.card').first().click({ position: { x: 80, y: 60 } });
      await p.waitForTimeout(600);
      await p.locator('#modalAdd').click({ timeout: 5000 });
      await p.waitForTimeout(700);
      check('add-to-order closes the modal', (await state(p)).modal, false);
      await p.goBack().catch(() => {});
      await p.waitForTimeout(700);
      check('one Back after adding leaves the menu', (await state(p)).page, 'index.html');
    });

    await p.context().close();
  }

  console.log('\n--- The whole card is the tap target');
  {
    const p = await newPage(false);
    await arrive(p);

    const anatomy = await p.evaluate(() => {
      const c = document.querySelector('.card');
      const link = c.querySelector('a[href^="#cake-"]');
      const add = c.querySelector('[data-add]');
      const lr = link && link.getBoundingClientRect();
      const ar = add && add.getBoundingClientRect();
      return {
        hasCakeLink: !!link,
        linkTag: link && link.tagName,
        nestedInteractive: !!(link && link.querySelector('a,button,input,select,textarea')),
        addInsideLink: !!(link && add && link.contains(add)),
        addSize: ar ? [Math.round(ar.width), Math.round(ar.height)] : null,
      };
    });
    check('card carries a #cake- link', anatomy.hasCakeLink, true);
    check('no interactive element nested inside it', anatomy.nestedInteractive, false);
    check('the Add button is not inside the link', anatomy.addInsideLink, false);
    check('Add button stays >=44px', anatomy.addSize && Math.min(anatomy.addSize[0], anatomy.addSize[1]) >= 44, true);

    // Tapping the photo opens the cake.
    await step('photo tap', async () => {
      await p.locator('.card .photo-frame').first().click();
      await p.waitForTimeout(600);
      check('photo tap opens the modal', (await state(p)).modal, true);
      await p.locator('#modalClose').click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(500);
    });

    // Tapping Add must add to the order, NOT open the modal. Start from a
    // known-clean page so a leftover overlay from an earlier step cannot make
    // this look like a pass or a fail on its own.
    await arrive(p);
    const before = await p.evaluate(() => document.getElementById('cartCount').textContent);
    await p.locator('.card [data-add]').first().click();
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({
      count: document.getElementById('cartCount').textContent,
      modal: !document.getElementById('productOverlay').hidden,
    }));
    check('Add adds to the order', after.count !== before, true);
    check('Add does not also open the modal', after.modal, false);

    // Keyboard: the card must be reachable and operable, with a visible ring.
    const kb = await p.evaluate(() => {
      const link = document.querySelector('.card a[href^="#cake-"]');
      if (!link) return null;
      link.focus();
      const cs = getComputedStyle(link);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
        || cs.boxShadow !== 'none';
      return { focused: document.activeElement === link || link.contains(document.activeElement), ring: ring };
    });
    check('card link takes keyboard focus', kb && kb.focused, true);
    check('and shows a focus indicator', kb && kb.ring, true);

    await step('Enter opens the card', async () => {
      await p.keyboard.press('Enter');
      await p.waitForTimeout(600);
      check('Enter on the card opens the modal', (await state(p)).modal, true);
    });

    await p.context().close();
  }

  console.log('\n--- Still fine on the other rungs of the ladder');
  {
    // Reduced motion.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.route('https://cdn.jsdelivr.net/**', r => r.abort());
    await step('reduced motion', async () => {
      await arrive(p);
      await p.locator('.card .photo-frame').first().click();
      await p.waitForTimeout(600);
      check('reduced motion: card still opens', (await state(p)).modal, true);
      await p.goBack().catch(() => {});
      await p.waitForTimeout(700);
      check('reduced motion: Back still closes it', (await state(p)).modal, false);
    });
    await ctx.close();
  }
  {
    // GSAP present (the wipe interceptor is live) — a #cake- link must not wipe.
    const p = await newPage(true);
    await arrive(p);
    await p.locator('.card .photo-frame').first().click().catch(() => {});
    await p.waitForTimeout(900);
    const s = await p.evaluate(() => ({
      modal: !document.getElementById('productOverlay').hidden,
      wipeVisible: getComputedStyle(document.querySelector('.page-wipe')).visibility === 'visible',
    }));
    check('with GSAP: card opens and does not trigger the page wipe', s, { modal: true, wipeVisible: false });
    await p.context().close();
  }

  console.log('\nPAGE ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none ✅');
  console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nALL NAV CHECKS PASS ✅');
  await browser.close();
  server.close();
  if (fails.length || errors.length) process.exit(1);
})().catch(e => { console.error('NAVTEST FAILED:', e); process.exit(1); });
