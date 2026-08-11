/* Rebuilds images/og.png (1200x630 social-share card) around the REAL
   monogram at images/brand/logo.png — the artwork is only placed, never
   redrawn. */
const { chromium } = require('playwright');
const fs = require('fs');

const LOGO = require('path').resolve(__dirname, '../images/brand/logo.png');
const OG = require('path').resolve(__dirname, '../images/og.png');

(async () => {
  const logoData = 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(`
    <style>
      * { margin: 0; box-sizing: border-box; }
      body { width: 1200px; height: 630px; background: #fbf7ef; display: flex;
             align-items: center; justify-content: center; gap: 72px;
             font-family: Georgia, 'Times New Roman', serif; color: #33241c; }
      .seal { width: 300px; height: 300px; border-radius: 50%;
              box-shadow: 0 18px 50px rgba(51,36,28,0.18); }
      .rule { width: 84px; height: 3px; background: #b08d3f; margin: 26px 0; }
      h1 { font-size: 78px; font-weight: 600; letter-spacing: 0.01em; }
      p { font-size: 30px; font-style: italic; color: #b03052; margin-top: 4px; }
      small { display: block; font-size: 22px; color: #7a685c; margin-top: 26px;
              font-style: normal; letter-spacing: 0.14em; text-transform: uppercase; }
    </style>
    <img class="seal" src="${logoData}">
    <div>
      <h1>Aurette by Mia</h1>
      <div class="rule"></div>
      <p>Cakes made slowly, for moments that matter.</p>
      <small>Made to order &middot; Pickup &amp; delivery &middot; Melbourne</small>
    </div>`);
  await og.screenshot({ path: OG });
  console.log('og.png', Math.round(fs.statSync(OG).size / 1024) + 'KB');
  await browser.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
