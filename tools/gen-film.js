/* Cuts one or more clips into the scroll-scrubbed frame sequence that the
   landing page's film plays (js/motion.js → film()).

     node gen-film.js story shot1.mp4@3.5-10 shot2.mp4@0-6 shot3.mp4 --frames 144

   "@from-to" trims a clip (seconds) — generated shots tend to idle at
   either end, and dead frames on a scroll film are dead scroll distance.

   writes images/film/<name>/
     lg/001.webp …  every frame, 4:3 at 1080×810 — desktop and tablets
     sm/001.webp …  every OTHER frame, the centre square at 600×600 — phones
                    and Save-Data (a phone shows the film square, so there is
                    no point shipping the sides it would crop away)
     still.webp     the static page's picture: the last frame, or --still
     film.json      { frames, smStep } — read by nothing at runtime; the
                    count also lives in the page's data-frames attribute,
                    and this file is the record of what was cut.

   Why frames and not <video>: seeking a video to an arbitrary time on every
   scroll tick stutters (worst on iOS Safari, which the Instagram crowd uses),
   because each seek waits on the decoder. Pre-cut frames on a canvas answer
   instantly in both directions — which is also what lets the visitor run
   the film backwards by scrolling up. */
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const FRAMES = parseInt(flag('frames', '120'), 10);
const STILL = flag('still', null);
const [name, ...clips] = args;
if (!name || !clips.length) {
  console.error("usage: node gen-film.js <name> <clip.mp4> [more.mp4 …] [--frames 120] [--still image]");
  process.exit(1);
}

const OUT = path.resolve(__dirname, '../images/film', name);
const TMP = path.join(__dirname, 'out', 'film-' + name);
fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of [OUT, path.join(OUT, 'lg'), path.join(OUT, 'sm'), TMP]) fs.mkdirSync(d, { recursive: true });

const run = (a) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...a]);

// 1. Normalise every clip to one 4:3 1440×1080 intermediate and join them.
//    (Models return different sizes and shapes, so crop-to-fill rather than
//    letterbox; the shots are composed with the subject in the centre third.)
//    The 16:9 masters are cut to 4:3 by trimming the SIDES only: the
//    keyframes came back with faint pillarbox bars, and the exploded view
//    needs every pixel of height for the top layer.
const norm = clips.map((spec, i) => {
  const o = path.join(TMP, `n${i}.mp4`);
  const [c, trim] = spec.split('@');
  const cut = trim ? ['-ss', trim.split('-')[0], '-to', trim.split('-')[1]] : [];
  run([...cut, '-i', c, '-an', '-vf', 'scale=-2:1080,crop=1440:1080,fps=24,setsar=1',
    '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-y', o]);
  return o;
});
const list = path.join(TMP, 'list.txt');
fs.writeFileSync(list, norm.map((f) => `file '${f}'`).join('\n'));
const joined = path.join(TMP, 'joined.mp4');
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', joined]);

// 2. Sample FRAMES evenly across the whole joined clip.
// ffmpeg with no output exits non-zero but prints the duration first.
let dur = 0;
try {
  execFileSync(ffmpeg, ['-hide_banner', '-i', joined], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (m) dur = +m[1] * 3600 + +m[2] * 60 + +m[3];
}
if (!dur) throw new Error('could not read duration');
const rate = (FRAMES / dur).toFixed(5);
run(['-i', joined, '-vf', `fps=${rate},scale=1080:810`, '-frames:v', String(FRAMES),
  '-c:v', 'libwebp', '-quality', '60', '-compression_level', '6', '-y', path.join(OUT, 'lg', '%03d.webp')]);
const got = fs.readdirSync(path.join(OUT, 'lg')).length;

// 3. The phone set: every other frame, the centre square. Cut from the
//    full-size intermediate, not from lg, so it is not a copy of a copy.
const sq = path.join(TMP, 'sq');
fs.mkdirSync(sq, { recursive: true });
run(['-i', joined, '-vf', `fps=${rate},crop=1080:1080,scale=600:600`, '-frames:v', String(FRAMES),
  '-c:v', 'libwebp', '-quality', '56', '-compression_level', '6', '-y', path.join(sq, '%03d.webp')]);
for (let i = 1; i <= got; i += 2) {
  const n = String(i).padStart(3, '0');
  fs.copyFileSync(path.join(sq, n + '.webp'), path.join(OUT, 'sm', n + '.webp'));
}

// 4. The still, at a higher quality: the last frame unless one is named.
if (STILL) {
  run(['-i', STILL, '-vf', 'scale=-2:1080,crop=1440:1080,scale=1200:900', '-c:v', 'libwebp', '-quality', '78', '-y', path.join(OUT, 'still.webp')]);
} else {
  run(['-sseof', '-0.05', '-i', joined, '-frames:v', '1', '-vf', 'scale=1200:900', '-c:v', 'libwebp', '-quality', '78', '-y', path.join(OUT, 'still.webp')]);
}

fs.writeFileSync(path.join(OUT, 'film.json'), JSON.stringify({ frames: got, smStep: 2, lg: [1080, 810], sm: [600, 600], sources: clips.map((c) => path.basename(c)) }, null, 2) + '\n');
const kb = (d) => Math.round(fs.readdirSync(d).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0) / 1024);
console.log(`${name}: ${got} frames over ${dur.toFixed(2)}s — lg ${kb(path.join(OUT, 'lg'))}KB, sm ${kb(path.join(OUT, 'sm'))}KB`);
