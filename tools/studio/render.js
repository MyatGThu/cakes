const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SCRATCH = path.resolve(__dirname, '..'); // tools/ root: serves studio/ and node_modules/
const OUT = path.resolve(__dirname, '../../images/3d');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(SCRATCH, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const PRODUCTS = ['classic-vanilla', 'chocolate-fudge', 'custom-celebration', 'cupcake-box', 'banana-bread', 'cookie-box', 'lemon-drizzle'];
const HERO_FRAMES = 24;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'hero'), { recursive: true });
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

  const save = (dataUrl, file) => {
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return fs.statSync(file).size;
  };

  for (const p of PRODUCTS) {
    const url = await page.evaluate(([k]) => window.renderShot(k, 32, 800, 0.85), [p]);
    const size = save(url, path.join(OUT, p + '.webp'));
    console.log(p, Math.round(size / 1024) + 'KB');
  }

  for (let i = 0; i < HERO_FRAMES; i++) {
    const angle = (i / HERO_FRAMES) * 360;
    const url = await page.evaluate(([a]) => window.renderShot('hero', a, 640, 0.78), [angle]);
    const size = save(url, path.join(OUT, 'hero', 'frame-' + String(i).padStart(2, '0') + '.webp'));
    if (i % 6 === 0) console.log('hero frame', i, Math.round(size / 1024) + 'KB');
  }

  const total = fs.readdirSync(path.join(OUT, 'hero')).reduce((s, f) => s + fs.statSync(path.join(OUT, 'hero', f)).size, 0);
  console.log('hero sequence total:', Math.round(total / 1024) + 'KB');
  await browser.close();
  server.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
