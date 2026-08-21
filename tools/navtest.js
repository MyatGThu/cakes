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
const LENIS = path.join(__dirname, 'node_modules/lenis/dist');
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
      await p.route('https://cdn.jsdelivr.net/npm/lenis@*/dist/*', r =>
        r.fulfill({ body: fs.readFileSync(path.join(LENIS, r.request().url().split('/').pop())), contentType: 'text/javascript' }));
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

    // A shared deep link opens the cake on the entry the visitor ARRIVED on.
    // That entry is adopted, not pushed: closing consumes nothing, so Back
    // still returns to whoever sent them here instead of costing a press to
    // leave a page they only entered once.
    await step('deep-linked cake', async () => {
      await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
      await p.waitForTimeout(300);
      await p.goto(B + '/shop.html#cake-classic-vanilla', { waitUntil: 'networkidle' });
      await p.waitForTimeout(900);
      check('deep link opens the cake', (await state(p)).modal, true);
      await p.locator('#modalClose').click({ timeout: 5000 });
      await p.waitForTimeout(500);
      const s3 = await state(p);
      check('closing a deep-linked cake reveals the menu', { modal: s3.modal, hash: s3.hash, page: s3.page },
        { modal: false, hash: '', page: 'shop.html' });
      await p.goBack().catch(() => {});
      await p.waitForTimeout(700);
      check('Back from an adopted overlay returns to the referrer', (await state(p)).page, 'index.html');
    });

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

    // Hit-test every region of the card: each must belong to the cake link,
    // except the Add button which keeps its own. This is a stronger assertion
    // than clicking — a direct .photo-frame click is correctly refused by the
    // browser precisely because the link's sheet covers it.
    // scroll first and let it land — html has scroll-behavior: smooth, so
    // scrollIntoView is asynchronous and hit-testing straight after it reads
    // positions the page has not moved to yet.
    await p.evaluate(() => document.querySelector('.card').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await p.waitForTimeout(400);
    const regions = await p.evaluate(() => {
      const c = document.querySelector('.card');
      const at = (el, dx, dy) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + (dx == null ? r.width / 2 : dx), r.top + (dy == null ? r.height / 2 : dy));
        return hit ? (hit.closest('[data-add]') ? 'add-button' : (hit.closest('a.card-link') ? 'cake-link' : hit.tagName + '.' + hit.className)) : 'nothing';
      };
      return {
        photo: at(c.querySelector('.photo-frame')),
        badge: at(c.querySelector('.badge')),
        title: at(c.querySelector('h3')),
        desc: at(c.querySelector('.desc')),
        pickup: at(c.querySelector('.pickup-note')),
        price: at(c.querySelector('.price')),
        add: at(c.querySelector('[data-add]')),
      };
    });
    check('every region of the card opens the cake, except the button', regions, {
      photo: 'cake-link', badge: 'cake-link', title: 'cake-link', desc: 'cake-link',
      pickup: 'cake-link', price: 'cake-link', add: 'add-button',
    });

    // And a real tap over the photo does open it.
    await step('photo tap', async () => {
      const box = await p.locator('.card .photo-frame').first().boundingBox();
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForTimeout(600);
      check('tapping the photo opens the modal', (await state(p)).modal, true);
      await p.locator('#modalClose').click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(500);
    });

    // The card's own button does NOT add to the order — it opens the same cake
    // the card does, because size, quantity and the note are all chosen in the
    // modal. So it must open exactly one modal for the right cake, and must not
    // fire twice by also triggering the card link it sits inside the card with.
    // Start from a clean page so no leftover overlay can fake a pass.
    await arrive(p);
    await p.locator('.card [data-add]').first().click();
    await p.waitForTimeout(600);
    const viaButton = await p.evaluate(() => ({
      modal: !document.getElementById('productOverlay').hidden,
      title: document.getElementById('modalTitle').textContent,
      firstCardName: (document.querySelector('.card h3') || {}).textContent,
    }));
    check('the card button opens the modal', viaButton.modal, true);
    check('and opens the cake it belongs to', viaButton.title, viaButton.firstCardName);
    // One press, one entry: Back must return to the menu, not skip past it.
    await p.goBack().catch(() => {});
    await p.waitForTimeout(700);
    const afterBack = await state(p);
    check('the button did not stack two history entries', { page: afterBack.page, modal: afterBack.modal },
      { page: 'shop.html', modal: false });

    // Keyboard: tab until the first card link has focus. Real Tab presses, not
    // .focus() — :focus-visible does not match a programmatic focus, so the
    // ring would read as missing when it is really there.
    await arrive(p);
    let onLink = false;
    for (let i = 0; i < 25 && !onLink; i++) {
      await p.keyboard.press('Tab');
      onLink = await p.evaluate(() => {
        const a = document.activeElement;
        return !!(a && a.matches && a.matches('.card a.card-link'));
      });
    }
    check('card link is reachable by Tab', onLink, true);
    const ring = await p.evaluate(() => {
      const a = document.activeElement;
      if (!a || !a.matches('.card a.card-link')) return null;
      const card = a.closest('.card');
      const cs = getComputedStyle(card);
      const own = getComputedStyle(a);
      return {
        focusVisible: a.matches(':focus-visible'),
        // the ring is drawn on the whole card, not on the title alone
        cardOutline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        cardOutlineWidth: Math.round(parseFloat(cs.outlineWidth)),
        linkOwnRingSuppressed: own.outlineStyle === 'none' || parseFloat(own.outlineWidth) === 0,
      };
    });
    check('and the whole card shows the focus ring', ring && {
      focusVisible: ring.focusVisible, cardOutline: ring.cardOutline, linkOwnRingSuppressed: ring.linkOwnRingSuppressed,
    }, { focusVisible: true, cardOutline: true, linkOwnRingSuppressed: true });

    await step('Enter opens the card', async () => {
      await p.keyboard.press('Enter');
      await p.waitForTimeout(600);
      check('Enter on the card opens the modal', (await state(p)).modal, true);
    });

    await p.context().close();
  }

  // Ceremony Coffee's flavour coding only works if the colours are actually
  // distinguishable. The first version hashed the category NAME into five fixed
  // pastels, so Cupcakes/Cookies/Celebration collided; the second drew from the
  // theme's three named hues, which collided again on Pistachio because it
  // defined --accent and --green as the same hex. Assert per theme.
  console.log('\n--- A category colour means one category, in every theme');
  {
    const p = await newPage(false);
    for (const theme of ['default', 'butter', 'fairy', 'midnight', 'pistachio']) {
      await p.goto(B + '/shop.html?theme=' + theme, { waitUntil: 'networkidle' });
      await p.waitForTimeout(700);
      const swatches = await p.evaluate(() => Array.from(document.querySelectorAll('.chip--coded'))
        .map(c => ({ cat: c.getAttribute('data-cat'), colour: getComputedStyle(c, '::after').backgroundColor })));
      const colours = swatches.map(s => s.colour);
      const unique = new Set(colours).size === colours.length;
      // and each card's ground must match the tab it belongs to
      const tied = await p.evaluate(() => {
        const chipGround = {};
        document.querySelectorAll('.chip--coded').forEach(c => {
          chipGround[c.getAttribute('data-cat')] = c.style.getPropertyValue('--cat-ground').trim();
        });
        return Array.from(document.querySelectorAll('.card')).every(card => {
          const g = card.style.getPropertyValue('--cat-ground').trim();
          return !g || Object.values(chipGround).indexOf(g) !== -1;
        });
      });
      check(theme + ': ' + colours.length + ' category colours, all distinct', unique, true);
      if (!unique) console.log('      ', JSON.stringify(swatches));
      check(theme + ': every card matches its tab', tied, true);
    }
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
      const rb = await p.locator('.card .photo-frame').first().boundingBox();
      await p.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
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
    const gb = await p.locator('.card .photo-frame').first().boundingBox();
    if (gb) await p.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2);
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
