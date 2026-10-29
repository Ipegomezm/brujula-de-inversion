// Orden de tweets en Chrome headless. Uso: NODE_PATH=<node_modules> node tests/browser_sort_check.js <url> [capturas]
// En http(s) también simula un tweet nuevo (interceptando data/tweets.json) para ver que entra en su sitio.
const puppeteer = require('puppeteer-core');
const base = process.argv[2], shots = process.argv[3] === 'capturas', SS = '/workspace/brujula/screenshots/', http = /^http/.test(base);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const res = {}, errs = [];
  const likes = p => p.$$eval('#twList article.tweet', as => as.map(a => { const m = a.querySelector('.ft span:nth-child(2)'); return m ? +(m.textContent.match(/♥\s*(\d+)/) || [0, 0])[1] : 0; }));
  const mono = (a, dir) => a.every((x, i) => !i || (dir > 0 ? a[i - 1] <= x : a[i - 1] >= x));
  const open = async (w, h, p0) => { const p = p0 || await b.newPage(); await p.setViewport({ width: w, height: h }); if (!p0) p.on('pageerror', e => errs.push(e.message));
    await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 60000 });
    await p.waitForFunction(() => document.querySelectorAll('#twList article.tweet').length > 0, { timeout: 30000 }); return p; };
  const p = await b.newPage(); let extra = null;
  if (http) { await p.setRequestInterception(true); p.on('request', async r => {
    if (extra && /\/data\/tweets\.json/.test(r.url())) { const real = await (await fetch(base.replace('index.html', 'data/tweets.json'))).json();
      real.tweets.unshift(extra); r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(real) }); } else r.continue(); }); }
  await open(1440, 1000, p); p.on('pageerror', e => errs.push(e.message));
  res.default = await p.$eval('#twSort', e => e.value);
  await p.select('#twSort', 'likes-desc'); await sleep(200);
  const hi = await likes(p); res.hi_sorted = mono(hi, -1); res.hi_first5 = hi.slice(0, 5); res.count = hi.length;
  if (shots) await p.screenshot({ path: SS + '14-ordenar-hi.png' });
  await p.select('#twSort', 'likes-asc'); await sleep(200); const lo = await likes(p); res.lo_sorted = mono(lo, 1); res.lo_first5 = lo.slice(0, 5);
  await p.select('#twSort', 'likes-desc'); await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => document.body.dataset.ready === '1');
  await p.waitForFunction(() => document.querySelectorAll('#twList article.tweet').length > 0);
  res.persisted_after_reload = await p.$eval('#twSort', e => e.value);
  // salto desde el detalle con orden Hi y un filtro que lo ocultaría
  await p.select('#twRole', 'empresa');
  await p.$eval('details.row[data-s="TSLA"] > summary', e => e.click());
  await p.waitForFunction(() => document.querySelectorAll('details.row[data-s="TSLA"] .twlinks button[data-id]').length >= 2, { timeout: 30000 });
  const btn = (await p.$$('details.row[data-s="TSLA"] .twlinks button[data-id]'))[1], id = await p.evaluate(e => e.dataset.id, btn); await btn.click(); await sleep(900);
  res.jump = await p.evaluate(id => { const a = [...document.querySelectorAll('#twList article.tweet')].find(x => x.dataset.id === id), c = document.querySelector('#tw').getBoundingClientRect(), r = a && a.getBoundingClientRect();
    return { found: !!a, highlighted: !!a && a.classList.contains('salto'), visible: !!r && r.top >= c.top && r.bottom <= c.bottom, sort: document.querySelector('#twSort').value, role: document.querySelector('#twRole').value }; }, id);
  if (http) {   // tweet nuevo con muchos likes: debe entrar en su sitio (no arriba del todo si no corresponde), marcado como nuevo
    const L = await likes(p); const mid = L[Math.floor(L.length / 3)] + 1;
    extra = { id: '9999999999999999999', url: 'https://x.com/prueba/status/9999999999999999999', symbol: 'TSLA', handle: 'prueba_orden', author_name: 'Prueba de orden (simulada)', role: 'empresa', account_status: 'confirmada', created_at: new Date().toISOString(), text: 'Tweet simulado solo en esta prueba', metrics: { likes: mid } };
    await p.click('#twToggle'); await sleep(200);   // columna cerrada → debe sumar al contador
    await p.click('#refresh'); await p.waitForFunction(() => document.body.dataset.refreshed, { timeout: 60000 }); await sleep(500);
    res.new_tweet = await p.evaluate(() => { const as = [...document.querySelectorAll('#twList article.tweet')], i = as.findIndex(a => a.dataset.id === '9999999999999999999');
      return { index: i, total: as.length, nuevo: i >= 0 && as[i].classList.contains('nuevo'), badge: document.querySelector('#twN').textContent, badgeShown: document.querySelector('#twN').style.display !== 'none' }; });
    res.new_tweet.still_sorted = mono(await likes(p), -1);
    await p.click('#twToggle'); await sleep(200); res.badge_after_open = await p.$eval('#twN', e => e.style.display);
  }
  // teléfono 400 px, cajón abierto
  const m = await open(400, 860); res.m_sort = await m.$eval('#twSort', e => e.value);
  await m.click('#twToggle'); await sleep(500);
  res.m_drawer = await m.evaluate(() => ({ open: document.body.classList.contains('tw-on'), sortVisible: (() => { const r = document.querySelector('#twSort').getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; })(), hscroll: document.documentElement.scrollWidth > innerWidth }));
  res.m_sorted = mono(await likes(m), -1);
  if (shots) await m.screenshot({ path: SS + '15-ordenar-movil.png' });
  res.errors = errs; console.log(JSON.stringify(res, null, 1)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
