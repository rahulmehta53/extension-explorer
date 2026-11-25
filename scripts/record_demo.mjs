/**
 * Automated Playwright + FFmpeg walkthrough recorder for Extension Explorer v2.
 * Launches the local server (if not running), navigates Explorer -> Photos -> Showcase,
 * records at 1440x900, and encodes web-ready MP4, WebM, and JPG poster into rahulmehta_fyi.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TMP_VIDEO_DIR = join(ROOT, '.tmp_demo_capture');
const OUT_DIR = process.env.DEMO_OUT_DIR || join(ROOT, 'assets');
const BASE_URL = 'http://127.0.0.1:3000';

async function isServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/extensions`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerUp()) {
    console.log('[+] Reusing existing server on', BASE_URL);
    return null;
  }
  console.log('[+] Starting Extension Explorer v2 server...');
  const proc = spawn('node', ['server/server.cjs'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i++) {
    if (await isServerUp()) {
      console.log('[+] Server ready.');
      return proc;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('Server did not become ready on port 3000.');
}

async function installDemoCursor(page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('demo-cursor')) return;
      const style = document.createElement('style');
      style.textContent = `
        #demo-cursor {
          position: fixed;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          border: 2px solid rgba(24, 24, 27, 0.9);
          background: rgba(255, 255, 255, 0.45);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
          pointer-events: none;
          z-index: 999999;
          transform: translate(-50%, -50%) scale(1);
          transition: transform 0.14s ease, background 0.14s ease;
          left: -100px;
          top: -100px;
        }
        #demo-cursor.clicking {
          transform: translate(-50%, -50%) scale(0.72);
          background: rgba(37, 99, 235, 0.45);
          border-color: rgb(37, 99, 235);
        }
      `;
      document.head.appendChild(style);
      const cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      document.body.appendChild(cursor);
      window.__moveDemoCursor = (x, y) => {
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
      };
      window.__clickDemoCursor = () => {
        cursor.classList.add('clicking');
        setTimeout(() => cursor.classList.remove('clicking'), 180);
      };
    });
  });
}

async function glideAndClick(page, locator, pauseAfterMs = 900) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) return false;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y, { steps: 18 });
  await page.evaluate(([cx, cy]) => window.__moveDemoCursor?.(cx, cy), [x, y]);
  await page.waitForTimeout(180);
  await page.evaluate(() => window.__clickDemoCursor?.());
  await page.mouse.click(x, y);
  await page.waitForTimeout(pauseAfterMs);
  return true;
}

async function smoothScrollMain(page, deltaY, steps = 16, delayMs = 35) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY / steps);
    await page.waitForTimeout(delayMs);
  }
}

function runFfmpeg(args) {
  const res = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed: ${args.join(' ')}`);
  }
}

async function waitForContent(page, selector, timeoutMs = 10000) {
  await page.waitForSelector(selector, { state: 'visible', timeout: timeoutMs });
}

async function main() {
  rmSync(TMP_VIDEO_DIR, { recursive: true, force: true });
  mkdirSync(TMP_VIDEO_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const serverProc = await ensureServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    // --- CLIP 1: Explorer HUD (pre-loaded, zero blank frame) ---
    const tCtx1 = Date.now();
    const ctx1 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: TMP_VIDEO_DIR, size: { width: 1440, height: 900 } },
    });
    const p1 = await ctx1.newPage();
    await installDemoCursor(p1);
    await p1.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForContent(p1, 'button[title*="technical specifications"]');
    await p1.waitForTimeout(2400); // let initial toast fade cleanly
    const ss1 = ((Date.now() - tCtx1) / 1000).toFixed(2);
    await p1.mouse.move(900, 420);
    await p1.evaluate(() => window.__moveDemoCursor?.(900, 420));
    await p1.waitForTimeout(600);
    await smoothScrollMain(p1, 520, 16, 35);
    await p1.waitForTimeout(650);
    await smoothScrollMain(p1, -520, 14, 30);
    await p1.waitForTimeout(400);
    const specsBtn = p1.locator('button[title*="technical specifications"]').first();
    await glideAndClick(p1, specsBtn, 1600);
    await ctx1.close();
    const clip1File = readdirSync(TMP_VIDEO_DIR).filter((f) => f.endsWith('.webm')).map((f) => join(TMP_VIDEO_DIR, f))[0];

    // --- CLIP 2: Photos Vault Bento Gallery (wait for spinner to disappear) ---
    const dir2 = join(TMP_VIDEO_DIR, 'c2');
    mkdirSync(dir2, { recursive: true });
    const tCtx2 = Date.now();
    const ctx2 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: dir2, size: { width: 1440, height: 900 } },
    });
    const p2 = await ctx2.newPage();
    await installDemoCursor(p2);
    await p2.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForContent(p2, 'button[title="Photos Gallery"]');
    await p2.locator('button[title="Photos Gallery"]').first().click();
    await p2.waitForFunction(() => !document.body.innerText.includes('Loading capture vault'), { timeout: 15000 });
    await p2.waitForTimeout(700);
    const ss2 = ((Date.now() - tCtx2) / 1000).toFixed(2);
    await p2.mouse.move(860, 420);
    await p2.evaluate(() => window.__moveDemoCursor?.(860, 420));
    await p2.waitForTimeout(600);
    await smoothScrollMain(p2, 680, 20, 35);
    await p2.waitForTimeout(1000);
    await ctx2.close();
    const clip2File = readdirSync(dir2).filter((f) => f.endsWith('.webm')).map((f) => join(dir2, f))[0];

    // --- CLIP 3: Showcase Lab (Momentum interactive panel + Otto interactive onboarding) ---
    const dir3 = join(TMP_VIDEO_DIR, 'c3');
    mkdirSync(dir3, { recursive: true });
    const tCtx3 = Date.now();
    const ctx3 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: dir3, size: { width: 1440, height: 900 } },
    });
    const p3 = await ctx3.newPage();
    await installDemoCursor(p3);
    await p3.goto(BASE_URL, { waitUntil: 'networkidle' });
    await waitForContent(p3, 'button[title="Showcase Lab"]');
    await p3.locator('button[title="Showcase Lab"]').first().click();
    await waitForContent(p3, 'text=Momentum Below-Center');
    await p3.waitForTimeout(800);
    const ss3 = ((Date.now() - tCtx3) / 1000).toFixed(2);
    await p3.mouse.move(620, 460);
    await p3.evaluate(() => window.__moveDemoCursor?.(620, 460));
    await p3.waitForTimeout(1200);
    const gridBtn = p3.locator('button:has-text("Grid")').first();
    if (await gridBtn.isVisible().catch(() => false)) {
      await glideAndClick(p3, gridBtn, 1000);
    }
    const ottoItem = p3.getByText('Otto Onboarding Setup', { exact: false }).first();
    if (await ottoItem.isVisible().catch(() => false)) {
      await glideAndClick(p3, ottoItem, 1600);
    }
    const lightBtn = p3.locator('button:has-text("Light")').first();
    if (await lightBtn.isVisible().catch(() => false)) {
      await glideAndClick(p3, lightBtn, 1200);
    }
    await ctx3.close();
    const clip3File = readdirSync(dir3).filter((f) => f.endsWith('.webm')).map((f) => join(dir3, f))[0];

    await browser.close();
    browser = null;

    // Trim initial load frames off each clip and stitch cleanly into one MP4
    const t1 = join(TMP_VIDEO_DIR, 't1.mp4');
    const t2 = join(TMP_VIDEO_DIR, 't2.mp4');
    const t3 = join(TMP_VIDEO_DIR, 't3.mp4');
    const scaleFilter = 'scale=1280:-2:flags=lanczos,fps=30';

    runFfmpeg(['-ss', ss1, '-i', clip1File, '-vf', scaleFilter, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', t1]);
    runFfmpeg(['-ss', ss2, '-i', clip2File, '-vf', scaleFilter, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', t2]);
    runFfmpeg(['-ss', ss3, '-i', clip3File, '-vf', scaleFilter, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', t3]);

    const getDur = (file) => {
      const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
      return parseFloat(r.stdout.trim()) || 4.0;
    };
    const d1 = getDur(t1);
    const d2 = getDur(t2);
    const fade = 0.35;
    const off1 = Math.max(0.5, d1 - fade).toFixed(2);
    const off2 = Math.max(1.0, d1 + d2 - 2 * fade).toFixed(2);

    const mp4Out = join(OUT_DIR, 'extension-explorer.mp4');
    const webmOut = join(OUT_DIR, 'extension-explorer.webm');
    const jpgOut = join(OUT_DIR, 'extension-explorer.jpg');

    // Crossfade stitch into final MP4
    runFfmpeg([
      '-i', t1, '-i', t2, '-i', t3,
      '-filter_complex',
      `[0:v][1:v]xfade=transition=fade:duration=${fade}:offset=${off1}[v01];[v01][2:v]xfade=transition=fade:duration=${fade}:offset=${off2},format=yuv420p[vout]`,
      '-map', '[vout]',
      '-an', '-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart',
      mp4Out,
    ]);

    // Fast VP9 WebM from stitched MP4
    runFfmpeg([
      '-i', mp4Out,
      '-an', '-c:v', 'libvpx-vp9', '-crf', '35', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
      webmOut,
    ]);

    // Poster frame from Showcase Lab section
    const posterAt = (d1 + d2 - 2 * fade + 1.2).toFixed(2);
    runFfmpeg([
      '-ss', posterAt,
      '-i', mp4Out,
      '-frames:v', '1',
      '-q:v', '3',
      jpgOut,
    ]);

    const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;
    console.log(`[+] Final duration: ${getDur(mp4Out).toFixed(1)}s`);
    console.log(`[+] Encoded outputs in ${OUT_DIR}:`);
    console.log('    MP4 :', mp4Out, kb(mp4Out));
    console.log('    WebM:', webmOut, kb(webmOut));
    console.log('    JPG :', jpgOut, kb(jpgOut));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverProc) serverProc.kill();
    rmSync(TMP_VIDEO_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[-] Demo capture failed:', err);
  process.exit(1);
});
