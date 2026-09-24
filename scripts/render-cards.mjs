// Renders the site's sections into images for the profile README.
// Usage: node scripts/render-cards.mjs <site/index.html> <out-dir>
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [site = 'site/index.html', out = 'dist'] = process.argv.slice(2);
const SECTIONS = ['hero', 'ch1', 'ch2', 'ch3'];
const ANIMATED = new Set(['hero']);
const FPS = 12, SECONDS = 4, WIDTH = 960;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file://' + resolve(site), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });

// Freeze every CSS animation at time t (ms) so frames are deterministic.
const seek = t => page.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; }), t);

for (const id of SECTIONS) {
  const el = page.locator('#' + id);
  if (!ANIMATED.has(id)) {
    await seek(1200);
    await el.screenshot({ path: join(out, `${id}.png`) });
    continue;
  }
  const tmp = join(out, `.${id}-frames`);
  mkdirSync(tmp, { recursive: true });
  const n = FPS * SECONDS;
  for (let i = 0; i < n; i++) {
    await seek((i * 1000) / FPS);
    await el.screenshot({ path: join(tmp, `f${String(i).padStart(3, '0')}.png`) });
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(tmp, 'f%03d.png'),
    '-vf', `scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
    '-loop', '0', join(out, `${id}.gif`)]);
  rmSync(tmp, { recursive: true });
}
await browser.close();
console.log('rendered', SECTIONS.join(', '), 'to', out);
