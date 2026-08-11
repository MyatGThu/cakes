/* Renders each product as a 32-frame 360° turntable from the Three.js studio
   and muxes the frames into a looping animated WebP (GIF-style autoplay in an
   <img>, ~4x smaller than an actual GIF). Frame 0 starts at the 32° beauty
   angle so the animation begins exactly where the static render stands. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebP = require('node-webpmux');

const SCRATCH = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, '../../images/3d/anim');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const FRAMES = 32;
const SIZE = 480;
const QUALITY = 0.62;
const DELAY_MS = 100; // 3.2s per revolution

const server = http.createServer((req, res) => {
  const file = path.join(SCRATCH, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const PRODUCTS = ['classic-vanilla', 'chocolate-fudge', 'custom-celebration', 'cupcake-box', 'banana-bread', 'cookie-box', 'lemon-drizzle'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(8097, r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
  await page.goto('http://localhost:8097/studio/scene.html');
  await page.waitForFunction('window.studioReady === true', { timeout: 20000 });

  for (const p of PRODUCTS) {
    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
      const angle = 32 + (i / FRAMES) * 360;
      const url = await page.evaluate(
        ([k, a, s, q]) => window.renderShot(k, a, s, q),
        [p, angle, SIZE, QUALITY]
      );
      const buffer = Buffer.from(url.split(',')[1], 'base64');
      frames.push(await WebP.Image.generateFrame({ buffer, delay: DELAY_MS }));
    }
    const file = path.join(OUT, p + '.webp');
    await WebP.Image.save(file, { frames, width: SIZE, height: SIZE, loops: 0, delay: DELAY_MS });
    console.log(p, Math.round(fs.statSync(file).size / 1024) + 'KB');
  }

  const total = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('all animations total:', Math.round(total / 1024) + 'KB');
  await browser.close();
  server.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
