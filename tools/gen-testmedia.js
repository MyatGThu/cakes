/* Re-encodes the product videos as VP9 twins in tools/testmedia/ — the
   Playwright Chromium build has no H.264 decoder, so videotest.js routes
   the site's mp4 requests to these. Run once before videotest.js. */
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../images/video');
const OUT = path.join(__dirname, 'testmedia');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.mp4'))) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', path.join(SRC, f),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-an', '-y', path.join(OUT, f)]);
  console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + 'KB');
}
