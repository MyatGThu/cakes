/* Encodes a clip into the product-card format the shop already plays:
   720×540 (the card's 4:3 frame), H.264 Main, 24fps, no audio, faststart,
   plus a poster cut from the FIRST frame so hover-play starts on exactly the
   picture that was showing.

     node gen-card-video.js cupcake-box path/to/clip.mp4[@from-to]

   writes images/video/<id>.mp4 and images/video/<id>-poster.webp.
   H.264 on purpose — see CLAUDE.md: every real browser plays it, and the
   test suite plays VP9 twins made by gen-testmedia.js instead. */
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const [id, spec] = process.argv.slice(2);
if (!id || !spec) {
  console.error('usage: node gen-card-video.js <product-id> <clip.mp4>[@from-to]');
  process.exit(1);
}
const [src, trim] = spec.split('@');
const cut = trim ? ['-ss', trim.split('-')[0], '-to', trim.split('-')[1]] : [];
const OUT = path.resolve(__dirname, '../images/video');
const mp4 = path.join(OUT, id + '.mp4');
const poster = path.join(OUT, id + '-poster.webp');
const run = (a) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...a]);

run([...cut, '-i', src, '-an', '-vf', 'scale=720:540:force_original_aspect_ratio=increase,crop=720:540,fps=24,setsar=1',
  '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-y', mp4]);
run(['-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '78', '-y', poster]);
const kb = (f) => Math.round(fs.statSync(f).size / 1024) + 'KB';
console.log(`${id}: ${kb(mp4)} video, ${kb(poster)} poster`);
