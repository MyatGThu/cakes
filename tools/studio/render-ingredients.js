/* Renders the ingredient sprite set (transparent WebP) for the landing page. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SCRATCH = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, '../../images/ingredients');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const file = path.join(SCRATCH, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const SET = ['strawberry', 'cherry', 'egg', 'butter', 'chocolate', 'lemon', 'raspberry', 'blueberry', 'whisk', 'sugar', 'vanilla'];

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

  for (const key of SET) {
    const url = await page.evaluate(([k]) => window.renderSprite(k, 380, 24, 0.9), [key]);
    const file = path.join(OUT, key + '.webp');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log(key, Math.round(fs.statSync(file).size / 1024) + 'KB');
  }
  const total = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('total:', Math.round(total / 1024) + 'KB');
  await browser.close();
  server.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
