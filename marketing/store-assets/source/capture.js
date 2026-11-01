const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const S = process.argv[2];
const site = path.join(S, 'site');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sizes = { '/images/hero.jpg': 742000, '/images/pick-1.jpg': 268000, '/images/pick-2.jpg': 96000, '/images/grip-test.jpg': 54000, '/images/size-chart.png': 131000, '/images/author.jpg': 18000 };

async function route(page) {
  await page.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'trailrunner.example') return r.abort();
    let p = u.pathname;
    if (p.startsWith('/ext/')) {
      const f = path.join(site, p);
      return r.fulfill({ status: 200, contentType: mime[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    }
    if (p === '/guides/best-trail-running-shoes') return r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(site, 'demo.html')) });
    if (p === '/favicon.svg') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(site, 'favicon.svg')) });
    if (p === '/images/og.svg') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(site, 'og.svg')) });
    if (sizes[p]) return r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(sizes[p], 1) });
    if (p === '/guides/old-sizing-chart' || p === '/shop/clearance-2024') return r.fulfill({ status: 404, body: 'not found' });
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' });
  });
}

(async () => {
  const browser = await chromium.launch();
  async function popup(theme) {
    const page = await browser.newPage({ viewport: { width: 780, height: 590 }, deviceScaleFactor: 2, colorScheme: theme });
    await route(page);
    await page.addInitScript(t => { try { localStorage.setItem('seoChecklistTheme', t); } catch (e) {} }, theme);
    await page.goto('https://trailrunner.example/ext/popup.html');
    await page.waitForFunction(() => !document.getElementById('app').classList.contains('is-loading'));
    await page.waitForFunction(() => !/\.\.\.$/.test(document.getElementById('brokenLinksStatus').textContent) && !/\.\.\.$/.test(document.getElementById('imageOptimizationStatus').textContent));
    await page.waitForTimeout(1300);
    await page.mouse.move(700, 580);
    return page;
  }
  const shot = async (page, name) => { await page.mouse.move(770, 300); await page.waitForTimeout(250); return page.screenshot({ path: path.join(S, 'out', `raw-${name}.png`) }); };

  let p = await popup('light');
  await shot(p, 'overview');
  await p.click('.nav-item[data-view="serp"]');
  await p.fill('#serpTitleInput', 'Best Trail Running Shoes 2026: 9 Picks Tested on Mud, Rock & Snow');
  await p.waitForTimeout(300);
  await shot(p, 'serp');
  await p.click('.nav-item[data-view="checklist"]');
  await p.evaluate(() => {
    const row = document.getElementById('imageOptimizationStatus').closest('details');
    row.open = true;
    const t = document.getElementById('titleTagStatus').closest('details');
    document.getElementById('main').scrollTop = row.offsetTop - 120;
  });
  await p.waitForTimeout(300);
  await shot(p, 'checklist');
  await p.click('.nav-item[data-view="links"]');
  await p.waitForTimeout(300);
  await shot(p, 'links');
  await p.click('.nav-item[data-view="headings"]');
  await p.waitForTimeout(300);
  await shot(p, 'headings');
  await p.close();

  p = await popup('dark');
  await shot(p, 'dark-overview');
  await p.click('.nav-item[data-view="tools"]');
  await p.waitForTimeout(300);
  await shot(p, 'dark-tools');
  await p.click('.nav-item[data-view="images"]');
  await p.waitForTimeout(300);
  await shot(p, 'dark-images');
  console.log('delta:', await p.textContent('#scoreDelta'), '| score', await p.textContent('#seoScore'));
  await browser.close();
})();
