// Records docs/demo.gif from the demo, frame by frame.
//
//   node scripts/record-demo.mjs [url] [out.gif]
//
// Needs playwright-core (dev dependency), a Chromium (CHROMIUM_PATH, default /usr/bin/chromium) and ffmpeg.
// Headless Chromium often renders without a GPU and too slowly for a smooth real-time capture, so the page
// gets a virtual clock instead: performance.now, Date.now and requestAnimationFrame only advance when the
// script steps them, exactly 1/30 s per captured frame.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'https://surfacescratcher.github.io/infra3d/';
const out = path.resolve(process.argv[3] ?? 'docs/demo.gif');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infra3d-demo-'));
const W = 1280, H = 720, FPS = 30, DT = 1000 / FPS;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => {
  let now = 0;
  const start = Date.now();
  const queue = new Map();
  let id = 0;
  performance.now = () => now;
  Date.now = () => start + now;
  window.requestAnimationFrame = (cb) => (queue.set(++id, cb), id);
  window.cancelAnimationFrame = (i) => queue.delete(i);
  window.__step = (dt) => {
    now += dt;
    const cbs = [...queue.values()];
    queue.clear();
    for (const cb of cbs) cb(now);
  };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
let frames = 0;

/** Advances the virtual clock by `count` frames, capturing each one. */
async function step(count = 1, capture = true) {
  for (let i = 0; i < count; i++) {
    await page.evaluate((dt) => window.__step(dt), DT);
    if (!capture) continue;
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    fs.writeFileSync(path.join(dir, `f${String(frames++).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
  }
}
/** Lets React commit after a click; the virtual clock does not drive its scheduler. */
async function settle() {
  await page.waitForTimeout(80);
  await step(1, false);
  await page.waitForTimeout(40);
}

await page.goto(url);
await page.waitForSelector('canvas');
for (let i = 0; i < 40; i++) {
  await step(4, false);
  await page.waitForTimeout(50);
}

// 1. The demo opens in the middle of an outage
await step(55);

// 2. A slow orbit: drag a little every frame, then let the damping settle
const box = await (await page.$('canvas')).boundingBox();
let x = box.x + box.width / 2;
let y = box.y + box.height / 2;
await page.mouse.move(x, y);
await page.mouse.down();
for (let i = 0; i < 60; i++) {
  x -= 0.8;
  y += 0.1;
  await page.mouse.move(x, y);
  await step(1);
}
await page.mouse.up();
await step(30);

// 3. The most likely cause: what fails with it
await page.click('.simulation .edges button');
await settle();
await step(85);

// 4. Repair, then back to the overview
await page.click('text=Repair everything');
await settle();
await step(40);
await page.click('.fit');
await settle();
await step(80);
await browser.close();

// 20 fps, 880 px and 64 colours keep the GIF under 5 MB
execFileSync('ffmpeg', [
  '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'),
  '-vf', 'fps=20,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  '-loop', '0', out,
]);
fs.rmSync(dir, { recursive: true });
console.log(`${frames} frames → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
