// Comprobación en Chrome headless (puppeteer-core). Uso: NODE_PATH=<node_modules> node tests/browser_check.js <url-base> [capturas]
const puppeteer = require('puppeteer-core');
const base = process.argv[2] || 'file:///workspace/brujula/index.html', shots = process.argv[3] === 'capturas', SS = '/workspace/brujula/screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const inter = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const res = {}, errs = [];
  const page = async (w, h) => { const p = await b.newPage(); await p.setViewport({ width: w, height: h }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 60000 });
    await p.waitForFunction(() => document.querySelectorAll('#twList article.tweet').length > 0, { timeout: 30000 }); return p; };
  const rect = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
  // ----- escritorio
  const p = await page(1440, 1000);
  res.wide_overlap_toggle_title = inter(await rect(p, '#twToggle'), await p.$eval('#tw .twh h2', e => { const r = document.createRange(); r.selectNodeContents(e); const q = r.getBoundingClientRect(); return { left: q.left, right: q.right, top: q.top, bottom: q.bottom }; }));
  res.wide_overlap_dock_asof = inter(await rect(p, '#refreshDock'), await p.$eval('#asof', e => { const r = document.createRange(); r.selectNodeContents(e); const q = r.getBoundingClientRect(); return { left: q.left, right: q.right, top: q.top, bottom: q.bottom }; }));
  if (shots) await p.screenshot({ path: SS + '11-boton-sin-solape.png', clip: { x: 0, y: 0, width: 1440, height: 190 } });
  await p.select('#twRole', 'empresa');   // filtro que ocultaría el tweet del CEO
  await p.$eval('details.row[data-s="TSLA"] > summary', e => e.click());
  await p.waitForFunction(() => document.querySelectorAll('details.row[data-s="TSLA"] .twlinks button').length >= 2, { timeout: 30000 });
  res.tsla_links = await p.$$eval('details.row[data-s="TSLA"] .twlinks button', bs => bs.map(x => (x.disabled ? 'OFF ' : 'ON ') + x.textContent.trim() + (x.disabled ? ' [' + x.title + ']' : '')));
  await p.$eval('details.row[data-s="TSLA"]', e => e.scrollIntoView({ block: 'start' })); await sleep(300);
  if (shots) { const r = await rect(p, 'details.row[data-s="TSLA"]'); await p.screenshot({ path: SS + '09-detalle-links-tweets.png', clip: { x: 0, y: Math.max(0, r.top - 10), width: 1440, height: 520 } }); }
  const ceoBtn = await p.$('details.row[data-s="TSLA"] .twlinks button[data-id]:nth-of-type(2)');
  const target = await p.evaluate(e => e.dataset.id, ceoBtn); await ceoBtn.click(); await sleep(900);
  res.jump = await p.evaluate(id => { const a = [...document.querySelectorAll('#twList article.tweet')].find(x => x.dataset.id === id), c = document.querySelector('#tw').getBoundingClientRect(), r = a && a.getBoundingClientRect();
    return { found: !!a, highlighted: !!a && a.classList.contains('salto'), visible: !!r && r.top >= c.top && r.bottom <= c.bottom, roleFilter: document.querySelector('#twRole').value, handle: a && a.querySelector('.who .mute').textContent }; }, target);
  if (shots) await p.screenshot({ path: SS + '10-salto-tweet.png' });
  for (const s of ['BTC-USD', 'META']) { await p.$eval(`details.row[data-s="${s}"] > summary`, e => e.click()); }
  await sleep(1500);
  res.other_links = {}; for (const s of ['BTC-USD', 'META']) res.other_links[s] = await p.$$eval(`details.row[data-s="${s}"] .twlinks button`, bs => bs.map(x => (x.disabled ? 'OFF ' : 'ON ') + x.textContent.trim()));
  await p.evaluate(() => window.scrollTo(0, 4000)); await sleep(300);
  res.wide_dock_after_scroll = await p.evaluate(() => { const r = document.querySelector('#refresh').getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: Math.round(r.top), right: Math.round(innerWidth - r.right), topmost: el === document.querySelector('#refresh'), stamp: document.querySelector('#refreshStamp').textContent, scrollY }; });
  const main = await rect(p, '.wrap'); const dock = await rect(p, '#refreshDock'); res.wide_dock_inside_main = dock.right <= main.right + 1 && dock.left >= main.left;
  if (shots) await p.screenshot({ path: SS + '12-refrescar-fijo.png' });
  await p.click('#refresh'); await p.waitForFunction(() => document.body.dataset.refreshed, { timeout: 60000 });
  res.wide_stamp_after_refresh = await p.$eval('#refreshStamp', e => e.textContent + ' | ' + e.title);
  // ----- teléfono 400 px
  const m = await page(400, 860);
  res.m_hscroll = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await m.evaluate(() => window.scrollTo(0, 3000)); await sleep(300);
  res.m_dock_vs_toggle = inter(await rect(m, '#refreshDock'), await rect(m, '#twToggle'));
  res.m_dock_topmost = await m.evaluate(() => { const r = document.querySelector('#refresh').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === document.querySelector('#refresh'); });
  if (shots) await m.screenshot({ path: SS + '13-refrescar-fijo-movil.png' });
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.$eval('details.row[data-s="TSLA"] > summary', e => e.click());
  await m.waitForFunction(() => document.querySelector('details.row[data-s="TSLA"] .twlinks button[data-id]'), { timeout: 30000 });
  await m.$eval('details.row[data-s="TSLA"] .twlinks button[data-id]', e => e.click()); await sleep(900);
  res.m_jump = await m.evaluate(() => ({ drawerOpen: document.body.classList.contains('tw-on'), highlighted: !!document.querySelector('#twList article.salto') }));
  await m.click('#twToggle'); await sleep(400);
  res.m_dock_vs_toggle_drawer_closed = inter(await rect(m, '#refreshDock'), await rect(m, '#twToggle'));
  res.errors = errs;
  console.log(JSON.stringify(res, null, 1)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
