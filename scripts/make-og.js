#!/usr/bin/env node
// Renders the social preview (assets/og.png) and PNG icons from data/portfolio.json.
// Needs Playwright only on the machine that regenerates them:
//   npm install --no-save playwright && npx playwright install chromium && node scripts/make-og.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/portfolio.json'), 'utf8'));
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'assets/fonts', f)).toString('base64');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const mark = fs.readFileSync(path.join(ROOT, 'assets/mark.svg'), 'utf8').trim();
const stats = d.stats.map((s) => `<div class="s"><b>${esc(s.value)}</b><span>${esc(s.label)}</span>${s.detail ? `<small>${esc(s.detail)}</small>` : ''}</div>`).join('');
const card = `<!doctype html><html><head><style>
@font-face { font-family: G; src: url(${font('Geist-Variable.woff2')}); font-weight: 100 900; }
@font-face { font-family: GM; src: url(${font('GeistMono-Variable.woff2')}); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #09090b; color: #ededef; font-family: G, sans-serif; position: relative; overflow: hidden; }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px);
  background-size: 56px 56px; -webkit-mask-image: radial-gradient(ellipse 80% 70% at 75% 10%, #000 25%, transparent 75%); }
.glow { position: absolute; width: 900px; height: 600px; top: -300px; right: -200px; background: radial-gradient(closest-side, rgba(122,162,255,.16), transparent); }
.wrap { position: relative; padding: 72px 80px; height: 100%; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 26px; letter-spacing: .5px; }
.mark { width: 48px; height: 48px; display: block; }
.brand em { font-style: normal; color: #7aa2ff; }
.who { font-family: GM, monospace; font-size: 22px; color: #9a9ca7; margin-top: 56px; }
h1 { font-size: 64px; line-height: 1.05; letter-spacing: -2px; font-weight: 600; margin-top: 14px; max-width: 900px; }
.stats { display: flex; gap: 0; margin-top: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; overflow: hidden; }
.s { flex: 1; padding: 20px 24px; border-right: 1px solid rgba(255,255,255,.1); }
.s:last-child { border-right: 0; }
.s b { display: block; font-size: 34px; font-weight: 600; letter-spacing: -1px; }
.s span { font-size: 17px; color: #9a9ca7; }
.s small { display: block; font-family: GM, monospace; font-size: 14px; color: #80838d; margin-top: 2px; }
</style></head><body><div class="grid"></div><div class="glow"></div><div class="wrap">
<div class="brand">${mark.replace('<svg ', '<svg class="mark" ')}<span>JAY<em>.OS</em></span></div>
<div class="who">${esc(d.profile.name)}, ${esc(d.profile.role)}</div>
<h1>${esc(d.profile.headline)}</h1>
<div class="stats">${stats}</div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(card);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, 'assets/og.png') });

  // PNG favicon keeps the tile (readable on light and dark tab bars). The iOS icon is full-bleed: iOS masks the corners itself.
  const icons = [
    [32, 'favicon-32.png', '#09090b', mark],
    [180, 'apple-touch-icon.png', '#111114', mark.replace(/<rect[^>]*\/>/, '')],
  ];
  for (const [size, file, bg, svg] of icons) {
    const icon = await browser.newPage({ viewport: { width: size, height: size } });
    await icon.setContent(`<body style="margin:0;background:${bg}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body>`);
    await icon.screenshot({ path: path.join(ROOT, 'assets', file), omitBackground: false });
    await icon.close();
  }
  await browser.close();
  console.log('wrote assets/og.png, assets/favicon-32.png, assets/apple-touch-icon.png');
})();
