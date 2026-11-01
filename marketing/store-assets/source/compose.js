const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const S = process.argv[2];
const out = p => path.join(S, 'out', p);
const img = p => `data:image/png;base64,${fs.readFileSync(out(p)).toString('base64')}`;
const icon = img('icon128.png');

const base = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; }
  .brand img { width: 34px; height: 34px; }
`;

const slides = [
  { file: 'raw-overview.png', out: 'screenshot-1-overview.png', theme: 'light',
    title: 'Your SEO score and the fixes that matter most',
    sub: 'One click gives you a score, a ranked fix list and your progress since the last check.',
    points: ['Instant audit, no sign-up', 'Top fixes ranked by impact', 'Score history on your device'] },
  { file: 'raw-serp.png', out: 'screenshot-2-search-preview.png', theme: 'light',
    title: 'See how Google will show your page',
    sub: 'Desktop and mobile previews measured in pixels. Edit your title and description live before you publish.',
    points: ['Pixel width meters', 'Desktop and mobile', 'Copy as HTML tags'] },
  { file: 'raw-checklist.png', out: 'screenshot-3-checklist.png', theme: 'light',
    title: 'Every check explains why and how to fix it',
    sub: '20 checks across basic SEO, content, indexing, social sharing and technical health.',
    points: ['Indexability & canonical', 'Schema & analytics', 'Image size & broken links'] },
  { file: 'raw-links.png', out: 'screenshot-4-links-images.png', theme: 'light',
    title: 'Find broken links, heading gaps and heavy images',
    sub: 'Internal links are checked automatically. External links and images on other sites only if you allow it.',
    points: ['Broken link checker', 'Headings outline', 'Image size & alt text'] },
  { file: 'raw-dark-tools.png', out: 'screenshot-5-dark-tools.png', theme: 'dark',
    title: 'Dark mode, PDF reports and one\u2011click tools',
    sub: 'Private by design: no access to your websites at install, and nothing you analyze leaves your browser.',
    points: ['PDF report & copy summary', 'Rich Results, PageSpeed & more', 'Shortcut Alt+Shift+S'] }
];

function slideHtml(s) {
  const dark = s.theme === 'dark';
  return `<!doctype html><html><head><style>${base}
  body { width: 1280px; height: 800px; overflow: hidden; position: relative;
    background: ${dark
      ? 'radial-gradient(900px 600px at 85% 20%, #2a2f7a 0%, transparent 60%), radial-gradient(700px 500px at 0% 100%, #1d2b57 0%, transparent 60%), #0b0e1a'
      : 'radial-gradient(900px 600px at 90% 10%, #dfe6ff 0%, transparent 60%), radial-gradient(700px 500px at 0% 100%, #efe9ff 0%, transparent 60%), #f7f8fc'};
    color: ${dark ? '#eef1fa' : '#0f172a'}; }
  .copy { position: absolute; left: 64px; top: 0; bottom: 0; width: 400px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  h1 { font-size: 40px; line-height: 1.12; letter-spacing: -0.025em; font-weight: 800; }
  .sub { font-size: 18px; line-height: 1.5; color: ${dark ? '#aeb6cc' : '#4b5567'}; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  li { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; }
  li::before { content: "✓"; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%;
    background: ${dark ? '#1f3a2c' : '#dcf5e6'}; color: ${dark ? '#4ade80' : '#15994a'}; font-size: 13px; font-weight: 800; }
  .shot { position: absolute; right: 48px; top: 50%; transform: translateY(-50%); width: 740px; border-radius: 16px; overflow: hidden;
    box-shadow: 0 30px 60px -20px rgba(15, 23, 42, ${dark ? '0.7' : '0.35'}), 0 0 0 1px ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}; }
  .shot img { display: block; width: 100%; }
  </style></head><body>
  <div class="copy">
    <div class="brand"><img src="${icon}" alt="">SEO Checklist</div>
    <h1>${s.title}</h1>
    <p class="sub">${s.sub}</p>
    <ul>${s.points.map(p => `<li>${p}</li>`).join('')}</ul>
  </div>
  <div class="shot"><img src="${img(s.file)}" alt=""></div>
  </body></html>`;
}

const tileHtml = `<!doctype html><html><head><style>${base}
  body { width: 440px; height: 280px; overflow: hidden; color: #fff;
    background: radial-gradient(300px 220px at 100% 0%, #6d4aff 0%, transparent 70%), linear-gradient(135deg, #1e3a8a, #2f5bea); }
  .wrap { position: absolute; inset: 0; padding: 30px 32px; display: flex; flex-direction: column; justify-content: space-between; }
  .top { display: flex; align-items: center; gap: 14px; }
  .top img { width: 64px; height: 64px; background: #fff; border-radius: 16px; padding: 6px; }
  .name { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
  .tag { font-size: 22px; font-weight: 700; line-height: 1.25; max-width: 230px; }
  .ring { position: absolute; right: 30px; bottom: 28px; width: 104px; height: 104px; }
  .ring svg { transform: rotate(-90deg); }
  .ring .num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; }
  </style></head><body><div class="wrap">
  <div class="top"><img src="${icon}" alt=""><div class="name">SEO Checklist</div></div>
  <div class="tag">On-page SEO audit<br>in one click</div></div>
  <div class="ring"><svg viewBox="0 0 120 120" width="104" height="104"><circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="12"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="#4ade80" stroke-width="12" stroke-linecap="round" stroke-dasharray="314.16" stroke-dashoffset="37.7"/></svg><div class="num">88</div></div>
  </body></html>`;

const marqueeHtml = `<!doctype html><html><head><style>${base}
  body { width: 1400px; height: 560px; overflow: hidden; color: #fff; position: relative;
    background: radial-gradient(700px 500px at 100% 0%, #6d4aff 0%, transparent 65%), linear-gradient(135deg, #172554, #2f5bea); }
  .copy { position: absolute; left: 72px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; gap: 20px; }
  .brand { color: #fff; }
  .brand img { background: #fff; border-radius: 10px; padding: 3px; }
  h1 { font-size: 46px; line-height: 1.1; letter-spacing: -0.025em; font-weight: 800; }
  p { font-size: 19px; line-height: 1.5; color: #c7d2fe; }
  .shot { position: absolute; right: 64px; top: 56px; width: 700px; border-radius: 16px; overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.55); }
  .shot img { display: block; width: 100%; }
  </style></head><body>
  <div class="copy"><div class="brand"><img src="${icon}" alt="">SEO Checklist</div>
  <h1>Audit any page's SEO in one click</h1>
  <p>Score, ranked fixes, Google search preview, broken links and PDF reports. Private by design.</p></div>
  <div class="shot"><img src="${img('raw-overview.png')}" alt=""></div>
  </body></html>`;

(async () => {
  const browser = await chromium.launch();
  async function render(html, w, h, file) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: out(file) });
    await page.close();
  }
  for (const s of slides) await render(slideHtml(s), 1280, 800, s.out);
  await render(tileHtml, 440, 280, 'promo-tile-440x280.png');
  await render(marqueeHtml, 1400, 560, 'marquee-1400x560.png');
  await browser.close();
})();
