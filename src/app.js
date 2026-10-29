/* Brújula de Inversión — INTERFAZ. Usa window.Engine (cálculo) y window.TXT (textos). */
(function () {
'use strict';
const E = window.Engine, T = window.TXT, $ = s => document.querySelector(s);
const num = E.num, pct = E.pct, esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'brujula-v1';
const st = Object.assign({ region: 'AU', capital: 10000, risk: 0.01, extra: [], theme: null, journal: [], plan: {}, feeASX: 5, feeUS: 0, fxFee: 0.7 }, JSON.parse(localStorage.getItem(KEY) || '{}'));
const save = () => localStorage.setItem(KEY, JSON.stringify(st));
const g = (term, shown) => `<span class="g" data-g="${esc(term)}">${esc(shown || term)}</span>`;
let CORE, FX, SPY, QQQ, CLIM, TV = {}, LIVE = {}, LIVEFX = null, LIVEINFO = null, REFRESHED = null; const DS = {}, AN = {};

/* ---------- carga: fetch y, si se abre con file://, <script> ---------- */
const pend = {}; window.__B = (k, o) => { if (pend[k]) { pend[k](o); delete pend[k]; } };
let BUST = '';   // al refrescar: ?v=<hora> para saltarse la caché del navegador y de GitHub Pages
function load(key) {
  const f = location.protocol === 'file:' ? Promise.reject(0) : fetch('data/' + key + BUST, { cache: 'no-store' }).then(r => { if (!r.ok) throw 0; return r.json(); });
  return f.catch(() => new Promise((res, rej) => {
    pend[key] = res; const s = document.createElement('script'); s.src = 'data/' + key.replace(/\.json$/, '.js') + BUST;
    s.onerror = () => { delete pend[key]; rej(new Error('No se pudo cargar ' + key)); }; document.head.appendChild(s); }));
}
const asset = s => CORE.assets.find(a => a.s === s);
async function getD(s) { if (!DS[s]) DS[s] = E.decode(await load(`t/${s}.json`)); return DS[s]; }
async function analyze(s) {
  if (AN[s]) return AN[s];
  const a = asset(s), D = await getD(s);
  const twin = { 'IVV.AX': 'SPY', 'NDQ.AX': 'QQQ' }[s];
  const ctx = { sym: s, kind: a.k, fund: CORE.fund[s] || {}, spyMom: E.momentum12(SPY), twinFund: twin ? CORE.fund[twin] : null };
  const R = LIVE[s] ? E.analyzeLive(D, LIVE[s], ctx) : E.analyze(D, ctx);
  if (R.live) R.D = R.X.D;
  R.a = a; R.D = R.D || D; R.usd = a.cur === 'USD'; R.mchg = D.c.at(-1) / D.c[Math.max(0, D.c.length - 22)] - 1;
  return AN[s] = R;
}
const swapSym = s => { const m = CORE.swap, inv = Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
  return st.region === 'AU' ? (m[s] || s) : (inv[s] || s); };
const board = () => [...new Set(CORE.board.map(swapSym).concat(st.extra))].filter(asset);
const cls = s => s === 1 ? 'p' : s === -1 ? 'm' : s === 0 ? 'z' : 'n';
const ccls = l => l === 'Comprar o mantener' ? 'c-buy' : l === 'Vender o no comprar' ? 'c-sell' : 'c-mid';
const cur = R => R.usd ? 'US$' : R.a.cur === 'AUD' ? 'A$' : R.a.cur;
const fxNow = () => LIVEFX || FX.c.at(-1);

/* ---------- gráficas (canvas, sin librerías) ---------- */
function cv(el, h) { const dpr = window.devicePixelRatio || 1, w = el.clientWidth || 600; el.width = w * dpr; el.height = h * dpr; el.style.height = h + 'px'; const x = el.getContext('2d'); x.scale(dpr, dpr); return { x, w, h }; }
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function priceChart(el, R) {
  const W = R.X.W, n = W.c.length, s0 = Math.max(0, n - 156), { x, w, h } = cv(el, 260), ph = 190, vh = 50;
  const ema = R.X.ema50, idx = []; for (let k = s0; k < n; k++) idx.push(k);
  let lo = Infinity, hi = -Infinity, vm = 0; idx.forEach(k => { lo = Math.min(lo, W.l[k], ema[k]); hi = Math.max(hi, W.h[k], ema[k]); vm = Math.max(vm, W.v[k]); });
  const X = j => 40 + j * (w - 48) / idx.length, Y = p => 8 + (hi - p) / (hi - lo) * (ph - 16), bw = Math.max(1, (w - 48) / idx.length - 1);
  x.font = '10px IBM Plex Mono, monospace'; x.fillStyle = css('--mute'); x.strokeStyle = css('--line');
  for (let q = 0; q <= 4; q++) { const p = lo + (hi - lo) * q / 4; x.beginPath(); x.moveTo(40, Y(p)); x.lineTo(w, Y(p)); x.stroke(); x.fillText(p >= 1000 ? p.toFixed(0) : p.toPrecision(4), 0, Y(p) + 3); }
  idx.forEach((k, j) => { const up = W.c[k] >= W.o[k]; x.fillStyle = up ? css('--greenS') : css('--redS'); const vH = W.v[k] / (vm || 1) * vh; x.fillRect(X(j), h - vH, bw, vH);
    x.strokeStyle = up ? css('--green') : css('--red'); x.beginPath(); x.moveTo(X(j) + bw / 2, Y(W.h[k])); x.lineTo(X(j) + bw / 2, Y(W.l[k])); x.stroke();
    x.fillStyle = x.strokeStyle; x.fillRect(X(j), Y(Math.max(W.o[k], W.c[k])), bw, Math.max(1, Math.abs(Y(W.o[k]) - Y(W.c[k])))); });
  x.strokeStyle = css('--ocre'); x.lineWidth = 2; x.beginPath(); idx.forEach((k, j) => j ? x.lineTo(X(j) + bw / 2, Y(ema[k])) : x.moveTo(X(j), Y(ema[k]))); x.stroke(); x.lineWidth = 1;
  x.fillStyle = css('--mute'); x.fillText(E.dayStr(W.d[s0]), 40, ph + 12); x.fillText(E.dayStr(W.d[n - 1]), w - 70, ph + 12);
  x.fillStyle = css('--ocre'); x.fillText('— media de 50 semanas', 46, 18);
}
function equityChart(el, D, ev) {
  const bt = ev.bt, { x, w, h } = cv(el, 180), pts = []; for (let i = bt.start; i < D.d.length; i += 5) pts.push(i); pts.push(D.d.length - 1);
  let lo = Infinity, hi = -Infinity; pts.forEach(i => { lo = Math.min(lo, bt.eq[i], bt.bh[i]); hi = Math.max(hi, bt.eq[i], bt.bh[i]); });
  const L = Math.log, X = j => 34 + j * (w - 38) / (pts.length - 1), Y = v => 6 + (L(hi) - L(v)) / (L(hi) - L(lo) || 1) * (h - 22);
  x.fillStyle = css('--greenS'); pts.forEach((i, j) => { if (bt.pos[i] > 0) x.fillRect(X(j), 6, (w - 38) / (pts.length - 1) + 0.5, h - 22); });
  const line = (arr, col, wd) => { x.strokeStyle = col; x.lineWidth = wd; x.beginPath(); pts.forEach((i, j) => j ? x.lineTo(X(j), Y(arr[i])) : x.moveTo(X(j), Y(arr[i]))); x.stroke(); };
  line(bt.bh, css('--mute'), 1.2); line(bt.eq, css('--green'), 2); x.lineWidth = 1;
  x.font = '10px IBM Plex Mono, monospace'; x.fillStyle = css('--mute');
  [lo, Math.sqrt(lo * hi), hi].forEach(v => x.fillText('×' + v.toFixed(v < 10 ? 1 : 0), 0, Y(v) + 3));
  x.fillText(E.dayStr(D.d[bt.start]).slice(0, 4), 34, h - 4); x.fillText(E.dayStr(D.d.at(-1)).slice(0, 4), w - 30, h - 4);
  x.fillStyle = css('--green'); x.fillText('— regla', 40, 16); x.fillStyle = css('--mute'); x.fillText('— no tocar   (verde suave: semanas dentro · escala logarítmica)', 92, 16);
}
function lineChart(el, series, labels, colors) {
  const { x, w, h } = cv(el, 200), n = series[0].length; let hi = 0; series.forEach(s => s.forEach(v => hi = Math.max(hi, v)));
  const X = i => 50 + i * (w - 56) / (n - 1), Y = v => 8 + (1 - v / hi) * (h - 26);
  x.font = '10px IBM Plex Mono, monospace'; x.fillStyle = css('--mute'); x.strokeStyle = css('--line');
  for (let q = 0; q <= 4; q++) { const v = hi * q / 4; x.beginPath(); x.moveTo(50, Y(v)); x.lineTo(w, Y(v)); x.stroke(); x.fillText(Math.round(v).toLocaleString('es-ES'), 0, Y(v) + 3); }
  series.forEach((s, k) => { x.strokeStyle = colors[k]; x.lineWidth = 2; x.beginPath(); s.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); x.stroke(); });
  x.lineWidth = 1; let lx = 54; labels.forEach((l, k) => { x.fillStyle = colors[k]; x.fillText('— ' + l, lx, 18); lx += x.measureText('— ' + l).width + 14; });
  x.fillStyle = css('--mute'); x.fillText('años →', w - 46, h - 4);
}

/* ---------- tablero ---------- */
function lights(L) { return '<span class="lights">' + L.map(l => `<span class="lt ${cls(l.s)}" title="${esc(l.name)}: ${E.sgnTxt(l.s)}">${l.L}</span>`).join('') + '</span>'; }
function rowHTML(R) {
  const s = R.a.s;
  return `<details class="row" data-s="${esc(s)}"><summary><span class="nm">${esc(s)}<small>${esc(R.a.n)}</small></span>
  <span class="num">${cur(R)} ${num(R.D.c.at(-1))}${R.live ? ' <span class="tag z" title="Precio de hoy con retraso (TradingView, no oficial)">hoy</span>' : ''}<br><small class="${R.mchg >= 0 ? 'up' : 'dn'}">${R.mchg >= 0 ? '+' : ''}${pct(R.mchg)} mes</small></span>
  ${lights(R.L)}<span class="concl ${ccls(R.C.label)}">${R.C.label}${R.live && R.live.changed ? '*' : ''}</span></summary><div class="det"></div></details>`;
}
async function renderBoard() {
  const el = $('#board'); el.innerHTML = '<p class="progress">Calculando…</p>';
  const syms = board(), rs = [];
  for (const s of syms) { try { rs.push(await analyze(s)); } catch (e) { console.warn(e); } }
  el.innerHTML = rs.map(rowHTML).join('');
  el.querySelectorAll('details.row').forEach(d => d.addEventListener('toggle', () => { if (d.open && !d.dataset.done) { d.dataset.done = 1; detail(d); } }));
}
function evTable(ev) {
  const r = q => `<td>${pct(q.rule.cagr)}</td><td>${pct(q.hold.cagr)}</td><td>${pct(q.rule.dd)}</td><td>${pct(q.hold.dd)}</td><td>${q.win ? 'gana' : 'no'}</td>`;
  return `<div class="tbl"><table><tr><th>Periodo</th><th>${g('CAGR')} regla</th><th>no tocar</th><th>${g('peor caída')} regla</th><th>no tocar</th><th></th></tr>
  ${ev.per.map(q => `<tr><td>${E.dayStr(q.rule.from)} → ${E.dayStr(q.rule.to)}</td>${r(q)}</tr>`).join('')}
  <tr><td><b>Total</b></td><td>${pct(ev.all.cagr)}</td><td>${pct(ev.hold.cagr)}</td><td>${pct(ev.all.dd)}</td><td>${pct(ev.hold.dd)}</td><td></td></tr></table></div>
  <p class="small">Resultado: <b>${ev.verdict}</b>. Operaciones: ${ev.trades}; ganadoras: ${pct(ev.winPct, 0)}; tiempo dentro: ${pct(ev.inTime, 0)}. Señal al cierre, compra a la apertura siguiente, 0,15% por cambio.</p>`;
}
async function detail(d) {
  const s = d.dataset.s, R = await analyze(s), box = d.querySelector('.det'), C = R.C, L = R.L, ema = L[0];
  const vcls = C.label === 'Comprar o mantener' ? '' : C.label === 'Vender o no comprar' ? 's' : 'w';
  let h = R.live ? `<p class="small box interp"><span class="lab">Provisional</span><br>Lectura con el precio de hoy (${E.dayStr(R.live.day)}: ${num(R.live.close)}, TradingView con retraso, fuente no oficial). Cierre oficial anterior: ${num(R.live.officialClose)}; con él la conclusión era <b>${R.live.official}</b>. Las pruebas históricas y la confianza usan solo cierres oficiales.</p>` : '';
  h += `<div class="box verdict ${vcls}"><div class="mute small">Conclusión</div><div class="big ${ccls(C.label)}">${C.label}</div>
   ${C.warn ? `<p class="warn">${C.warn}</p>` : ''}<p><b>${C.trigger}</b></p>
   <p>Confianza: <b>${C.conf}</b>. ${C.why}</p>
   <p class="small mute">Decide la ${g('media de 50 semanas')}. Votan ${C.n} miradas (sin las que no aplican); hacen falta ${C.need}. A favor: ${C.fav}. En contra: ${C.con}.</p></div>`;
  h += '<h3>Las ocho miradas</h3>';
  L.forEach((l, j) => { const t = T.lens[l.id];
    h += `<div class="lens"><div class="hd"><span class="fam">${l.fam}</span><b>${l.name}</b><span class="tag ${cls(l.s)}">${E.sgnTxt(l.s)}</span>${l.ev ? `<span class="small mute">· prueba: ${l.ev.verdict}</span>` : ''}</div>
    <div>${esc(l.txt)}</div><details class="how"><summary>Cómo funciona</summary>
    <p><b>Qué mira.</b> ${t.what}</p><p><b>Por qué podría funcionar.</b> ${t.why}</p><p><b>Cuándo falla.</b> ${t.fails}</p><p class="small"><b>Fuente.</b> ${t.src}</p>
    <p class="mono small">${t.f}</p>${l.ev ? evTable(l.ev) + `<canvas data-eq="${j}"></canvas>` : ''}</details></div>`; });
  // plan
  const P = E.plan(R.X, L, { capital: st.capital, risk: st.risk, fx: fxNow(), usd: R.usd }), c = cur(R);
  h += `<h3>El plan</h3><div class="box"><p class="small mute">Capital A$ ${num(st.capital, 0)} · riesgo ${pct(st.risk, 1)} por operación (A$ ${num(P.riskA, 0)}). ${R.usd ? `Convertido con AUDUSD ${fxNow().toFixed(4)}.` : ''}</p>`;
  if (P.above) h += `<p><b>Dentro.</b> Zona de compra: ${c} ${num(P.zoneLo)} – ${num(P.zoneHi)} (cierre − 0,5 × ${g('ATR')} semanal, nunca bajo la media). Salida: la media de 50 semanas, ${c} ${num(P.exit)}. ${g('stop', 'Stop')} que sube: ${c} ${num(P.trail)} (mejor cierre de 22 días − 3 × ATR diario).</p>`;
  else h += `<p><b>Fuera.</b> Activación: una semana cierra sobre ${c} ${num(P.entry)} (la media). Stop inicial: ${c} ${num(P.exit)} (media − 2 × ATR semanal).</p>`;
  h += `<p>Tamaño: <b class="num">${num(P.units, P.units < 10 ? 3 : 0)}</b> unidades · costo total <b class="num">A$ ${num(P.costA, 0)}</b> · pérdida si sale mal <b class="num">A$ ${num(P.lossA, 0)}</b>${P.capped ? ' (limitado por el capital)' : ''}.</p>
   <p>"Paga 3 veces el riesgo": ${c} ${num(P.target)}. No es un objetivo de venta (la regla sale por la media): es la vara para saber si la operación vale la pena. Con 3 a 1 basta acertar una de cada tres: ${g('esperanza matemática')} = 1/3 × 3 − 2/3 × 1 = +0,33 por operación.</p></div>`;
  // niveles
  const V = E.levels(R.X), K = V.cava;
  h += `<h3>Niveles</h3><div class="tbl"><table><tr><th></th><th>Máximo</th><th>toques</th><th>Mínimo</th><th>toques</th><th>posición</th></tr>
   <tr><td>20 semanas</td><td>${num(V.hi20)}</td><td>${V.tH}</td><td>${num(V.lo20)}</td><td>${V.tL}</td><td>${pct(V.posRange, 0)}</td></tr>
   <tr><td>52 semanas</td><td>${num(V.hi52)}</td><td></td><td>${num(V.lo52)}</td><td></td><td>${pct(V.gh, 0)} del máx.</td></tr></table></div>
   <p class="small">George y Hwang (2004): estar cerca del máximo anual juega a favor. Hoy el precio está al ${pct(V.gh, 0)} de su máximo de 52 semanas${V.gh > 0.95 ? ' — muy cerca, a favor.' : '.'}</p>
   <div class="box interp"><div class="lab">Interpretación, no regla · José Luis Cava</div>
   <p>Nivel al que el precio volvió más veces en el último año: diario ${num(K.daily.level)} (${K.daily.touches} toques, 1%) y semanal ${num(K.weekly.level)} (${K.weekly.touches} toques, 1,5%).
   Zona: <b>${num(K.zone[0])}${K.zone[1] !== K.zone[0] ? ' – ' + num(K.zone[1]) : ''}</b>, ${K.isSupport ? g('soporte') : g('resistencia')}. ${K.other ? `${K.other.kind[0].toUpperCase() + K.other.kind.slice(1)}: ${num(K.other.level)}.` : ''}</p>
   <p class="small">${K.isSupport ? (K.weak ? `Con ${K.total} toques el soporte se debilita: debajo están los stops; si cierra por debajo, la caída puede ser rápida. Una mano fuerte que quiera vender necesita primero un rebote.` : `Soporte con ${K.total} toques.`) : 'Si supera la resistencia, los que apostaban a la baja tienen que comprar. Pero no se compra la ruptura: se compra el retroceso a la zona rota.'}</p></div>`;
  h += `<h3>Gráfica: 156 semanas</h3><canvas data-price></canvas>`;
  h += await compare(R);
  const tv = TV[s]; if (tv) h += `<p class="small mute">Comparación con TradingView (fuente no oficial, con retraso): cierre ${num(tv.tvClose)}, media 50 semanas ${num(tv.tvEma50w)} (TradingView no ajusta por dividendos; aquí sí), diferencia ${pct(tv.dEmaPct / 100, 2)}.</p>`;
  h += `<h3>Bitácora</h3><div class="box"><p class="small">Antes de actuar, escribe qué harías y por qué. Se guarda en este navegador con la conclusión y el clima de hoy.</p>
   <div class="search"><select class="jc"><option>Compro</option><option>Mantengo</option><option>Espero</option><option>Vendo</option></select><input class="jw" placeholder="¿Por qué?"><button class="pri jb">Guardar</button></div></div>`;
  box.innerHTML = h;
  box.querySelector('[data-price]') && priceChart(box.querySelector('[data-price]'), R);
  box.querySelectorAll('details.how').forEach(dd => dd.addEventListener('toggle', () => { const c = dd.querySelector('canvas[data-eq]'); if (dd.open && c && !c.dataset.done) { c.dataset.done = 1; equityChart(c, R.D, L[+c.dataset.eq].ev); } }));
  box.querySelector('.jb').onclick = () => { const why = box.querySelector('.jw').value.trim(); if (!why) return;
    st.journal.unshift({ t: new Date().toISOString().slice(0, 10), s, c: box.querySelector('.jc').value, why, concl: C.label, conf: C.conf, fg: CLIM ? Math.round(CLIM.value) : null }); save(); box.querySelector('.jw').value = ''; renderJournal(); };
}
async function compare(R) {
  const s = R.a.s; let h = '';
  const tw = CORE.twins.find(p => p.includes(s));
  if (tw) { const [us, ax] = tw, U = await getD(us), A = await getD(ax), Ua = E.toAUD(U, FX);
    h += `<h3>Gemelo: ${us} ↔ ${ax}</h3><div class="tbl"><table><tr><th>Plazo</th><th>${us} en US$</th><th>${us} pasado a A$</th><th>${ax} en A$</th></tr>
    ${[1, 5, 10].map(y => `<tr><td>${y} año${y > 1 ? 's' : ''}</td><td>${pct(E.retOver(U, y))}</td><td>${pct(E.retOver(Ua, y))}</td><td>${pct(E.retOver(A, y))}</td></tr>`).join('')}</table></div>
    <p class="small">Son casi lo mismo: la diferencia entre la columna 1 y las otras dos es la moneda (cuando el A$ baja, lo de EE.UU. vale más en A$). "—" = no hay historia suficiente. Comisiones de ejemplo (cámbialas en Ajustes por las de tu bróker): ASX A$ ${num(st.feeASX, 2)} por operación; EE.UU. US$ ${num(st.feeUS, 2)} más ${num(st.fxFee, 2)}% por cambiar moneda.</p>`; }
  if (s !== 'IVV.AX') {
    const ivv = await getD('IVV.AX'), mine = R.usd ? E.toAUD(R.D, FX) : { d: R.D.d, c: R.D.c }, v = E.versus(mine, ivv);
    const row = (lab, q) => q ? `<tr><td>${lab}</td><td>${pct(q.a)}</td><td>${pct(q.b)}</td><td>${pct(q.ddA)}</td><td>${pct(q.ddB)}</td></tr>` : `<tr><td>${lab}</td><td colspan=4>—</td></tr>`;
    const ref = v[5] || v.all, win = ref.a > ref.b, risk = v.volA > v.volB;
    h += `<h3>Frente al S&P 500 en A$ (IVV.AX)</h3><div class="tbl"><table><tr><th>Plazo</th><th>${esc(s)}</th><th>IVV.AX</th><th>peor caída</th><th>IVV.AX</th></tr>
    ${row('1 año', v[1])}${row('3 años', v[3])}${row('5 años', v[5])}${row('Desde ' + E.dayStr(v.all.from).slice(0, 4), v.all)}</table></div>
    <p class="small">Años calendario en que le ganó: ${v.years.won} de ${v.years.tot}. ${g('volatilidad', 'Volatilidad')} anual (5 años, semanal): ${pct(v.volA, 0)} frente a ${pct(v.volB, 0)}. ${g('correlación', 'Correlación')}: ${num(v.corr, 2)}.</p>
    <p><b>${win ? 'Le ganó' : 'Perdió frente'} al S&P 500${v[5] ? ' en 5 años' : ''}, con ${risk ? 'más' : 'menos'} riesgo.</b> ${win && risk ? 'Ganar más con más sustos es normal; la pregunta es si aguantarías las caídas.' : win ? 'Mejor rendimiento con menos sustos: poco común.' : risk ? 'Más riesgo y menos rendimiento: el índice fue mejor elección.' : 'Menos rendimiento, pero también menos sustos.'}</p>`; }
  return h;
}

/* ---------- ranking ---------- */
async function renderRanking(loadAll) {
  const el = $('#rank');
  if (!loadAll) { el.innerHTML = `<p>Para ordenar todo el universo (${CORE.assets.length} activos) hay que cargar cada uno. <button class="pri" id="rankGo">Calcular ranking</button></p>`; $('#rankGo').onclick = () => renderRanking(true); return; }
  let i = 0; for (const a of CORE.assets) { el.innerHTML = `<p class="progress">Cargando ${++i} de ${CORE.assets.length}: ${esc(a.s)}…</p>`; try { await analyze(a.s); } catch (e) { console.warn(a.s, e); } }
  const all = CORE.assets.map(a => AN[a.s]).filter(Boolean), up = all.filter(R => R.L[0].s === 1).sort((a, b) => b.L[2].mom - a.L[2].mom);
  const fam = up.filter(R => CORE.famous.includes(R.a.s)).slice(0, 10), strong = up.slice(0, 10);
  const how = R => { const P = E.plan(R.X, R.L, { capital: st.capital, risk: st.risk, fx: fxNow(), usd: R.usd });
    return R.L[0].dist > 0.15 ? `Por partes (${pct(R.L[0].dist, 0)} sobre la media)` : R.C.label === 'Comprar o mantener' ? `Zona ${num(P.zoneLo)}–${num(P.zoneHi)}` : 'Esperar un retroceso'; };
  const tbl = rs => `<div class="tbl"><table><tr><th>Activo</th><th>Conclusión</th><th>Confianza</th><th>12 meses</th><th>Cómo comprar</th></tr>${rs.map(R => `<tr><td><b>${esc(R.a.s)}</b> <span class="small mute">${esc(R.a.n.slice(0, 28))}</span></td><td class="${ccls(R.C.label)}">${R.C.label}</td><td>${R.C.conf}</td><td>${pct(R.L[2].mom, 0)}</td><td>${how(R)}</td></tr>`).join('')}</table></div>`;
  const solid = fam.find(R => R.C.label === 'Comprar o mantener');
  const core2 = [swapSym('SPY'), swapSym('QQQ')].map(s => AN[s]);
  el.innerHTML = `<p>Solo entran las que están sobre su media de 50 semanas (${up.length} de ${all.length} hoy). Se ordenan por ${g('impulso')} de 12 meses.</p>
   ${solid ? `<div class="box verdict"><div class="mute small">La más sólida hoy entre las famosas</div><div class="big">${esc(solid.a.s)} · ${esc(solid.a.n)}</div><p>${solid.C.label}, confianza ${solid.C.conf.toLowerCase()}, 12 meses ${pct(solid.L[2].mom, 0)}.</p></div>` : '<p>Hoy ninguna famosa tiene "Comprar o mantener".</p>'}
   <h3>Las 10 más famosas</h3>${tbl(fam)}<h3>Las 10 más fuertes del universo</h3>${tbl(strong)}
   <h3>Núcleo</h3><p>${core2.map(R => `<b>${R.a.s}</b>: ${R.C.label} (${R.L[0].s === 1 ? 'sobre' : 'bajo'} la media, ${pct(R.L[0].dist)})`).join(' · ')}</p>
   <p class="small"><b>Cuidado:</b> el ranking tiene ${g('sesgo de supervivencia')}: la lista de hoy no incluye las empresas que cayeron y salieron. La cartera sensata es <b>núcleo</b> (70–80% en el índice, con la regla de la media) y <b>satélite</b> (20–30% en el ranking).</p>`;
  renderFlows();
}

/* ---------- clima ---------- */
function renderClimate() {
  const c = CLIM, el = $('#clima'), names = { mom: ['Impulso', 'S&P ÷ media de 125 días − 1'], str: ['Fuerza', 'sectores cerca de su máximo de 252 días − cerca del mínimo, ÷ 9'], brd: ['Amplitud', 'sectores sobre su media de 50 días ÷ 9'], risk: ['Apetito por riesgo', 'bonos basura (HYG) 20 días − bonos del Tesoro (IEF) 20 días'], vol: ['Volatilidad', '−(VIX ÷ media 50 del VIX − 1)'], safe: ['Refugio', 'S&P 20 días − bonos largos (TLT) 20 días'] };
  const dS = E.distributionDays(SPY), dQ = E.distributionDays(QQQ);
  el.innerHTML = `<div class="box"><div class="mute small">Termómetro de hoy (réplica del índice de CNN, 6 de 7 componentes)</div>
   <div class="big serif" style="font-size:2rem">${c.value.toFixed(0)} · ${c.zone}</div><div class="therm"><span class="pin" style="left:calc(${c.value}% - 2px)"></span></div>
   <div class="small mute" style="display:flex;justify-content:space-between"><span>Miedo extremo</span><span>Miedo</span><span>Neutral</span><span>Codicia</span><span>Codicia extrema</span></div></div>
   <div class="grid2">${Object.entries(c.now).map(([k, v]) => `<div class="card"><b>${names[k][0]}</b> <span class="num">${v.p.toFixed(0)}</span><div class="meter"><i style="width:${v.p}%"></i></div><div class="small mute">${names[k][1]}. Percentil de los últimos 756 días.</div></div>`).join('')}</div>
   <h3>Qué hizo el S&P 500 después de cada nivel</h3><p class="small mute">Desde ${E.dayStr(c.from)} (SPY con dividendos). Cada día cuenta una vez.</p>
   <div class="tbl"><table><tr><th>Nivel</th><th>días</th><th>3 meses: mediana</th><th>% positivo</th><th>1 año: mediana</th><th>% positivo</th></tr>
   ${c.table.map(r => `<tr><td>${r.z}</td><td>${r.n3}</td><td>${pct(r.m3)}</td><td>${pct(r.p3, 0)}</td><td>${pct(r.m12)}</td><td>${pct(r.p12, 0)}</td></tr>`).join('')}</table></div>
   <h3>Días de distribución (O'Neil)</h3><p>Caídas de más de 0,2% con más volumen que el día anterior, últimas 25 sesiones: <b>S&P 500 (SPY): ${dS.length}</b> · <b>Nasdaq-100 (QQQ): ${dQ.length}</b>. ${Math.max(dS.length, dQ.length) >= 5 ? 'Cinco o más: los grandes están vendiendo, cuidado.' : 'Pocos: sin presión vendedora fuerte.'}</p>
   <div id="flows"></div>`;
  renderFlows();
}
function renderFlows() {
  const el = $('#flows'); if (!el) return; const rows = [];
  'XLK XLF XLE XLV XLY XLP XLI XLB XLU'.split(' ').forEach(s => { const a = CORE.aux[s]; if (a) { const D = E.decode(a); rows.push([s + ' (sector)', D.c.at(-1) / D.c[D.c.length - 64] - 1]); } });
  Object.keys(DS).forEach(s => { const D = DS[s]; if (D.c.length > 64) rows.push([s, D.c.at(-1) / D.c[D.c.length - 64] - 1]); });
  rows.sort((a, b) => b[1] - a[1]);
  const t = rs => rs.map(r => `<tr><td>${esc(r[0])}</td><td class="${r[1] >= 0 ? 'up' : 'dn'}">${pct(r[1])}</td></tr>`).join('');
  el.innerHTML = `<h3>Flujos: rendimiento a 3 meses</h3><p class="small mute">${rows.length} activos y sectores cargados${Object.keys(DS).length < CORE.assets.length ? ' (calcula el ranking para incluir todo el universo)' : ''}.</p><div class="grid2"><div><b>Los 6 mejores</b><table>${t(rows.slice(0, 6))}</table></div><div><b>Los 5 peores</b><table>${t(rows.slice(-5).reverse())}</table></div></div>`;
}

/* ---------- laboratorio ---------- */
async function renderLab() {
  const el = $('#lab'), syms = board(), res = {};
  for (const s of syms) res[s] = E.lab(E.prepare(await getD(s))).res;
  const names = Object.keys(res[syms[0]]), med = a => { a = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const best = {}; syms.forEach(s => { const b = names.reduce((x, y) => (res[s][y].ratio || -9) > (res[s][x].ratio || -9) ? y : x); best[b] = (best[b] || 0) + 1; });
  const M = n => ({ c: med(syms.map(s => res[s][n].cagr)), d: med(syms.map(s => res[s][n].dd)), r: med(syms.map(s => res[s][n].ratio)) });
  const fair = {}; for (const s of ['SPY', 'QQQ']) fair[s] = E.lab(E.prepare(await getD(s))).res;
  const simple = M('Solo EMA50').r, vote = M('Votación 4 de 7').r;
  el.innerHTML = `<p>Siete señales semanales (media de 50, Weinstein, impulso, Tortugas, MACD semanal, OBV sobre su media de 20, Chaikin de 4 semanas) y cinco maneras de combinarlas, probadas en los ${syms.length} activos del tablero.</p>
   <div class="tbl"><table><tr><th>Regla</th><th>CAGR (mediana)</th><th>Peor caída (mediana)</th><th>Ganancia ÷ caída</th><th>Mejor en</th></tr>
   ${names.map(n => { const m = M(n); return `<tr><td>${n}</td><td>${pct(m.c)}</td><td>${pct(m.d)}</td><td>${num(m.r, 2)}</td><td>${best[n] || 0} de ${syms.length}</td></tr>`; }).join('')}</table></div>
   <p class="small mute">"Mejor en" = activos donde esa regla tuvo la mejor relación ganancia ÷ caída. "EMA50 + confirmación": todo dentro si además ≥ 3 señales a favor; mitad si solo la media.</p>
   <p><b>${simple >= vote ? 'Una regla simple gana a la votación' : 'Hoy la votación gana a la regla simple'}</b> (ganancia ÷ caída ${num(simple, 2)} frente a ${num(vote, 2)}). ${simple >= vote ? 'La razón: cuatro de las siete lentes miden la misma idea (la tendencia). Votar no suma opiniones distintas; repite la misma con ruido y llega más tarde.' : `Con estos activos la votación quedó por delante (${num(vote - simple, 2)} de diferencia). Lo esperado es lo contrario, porque cuatro de las siete lentes miden la misma idea (la tendencia): votar repite la misma opinión con ruido. Probar antes de creer: aquí la historia no lo confirmó del todo.`}</p>
   <h3>La prueba justa: los índices</h3><div class="tbl"><table><tr><th></th><th>No tocar: CAGR</th><th>peor caída</th><th>Media 50: CAGR</th><th>peor caída</th></tr>
   ${['SPY', 'QQQ'].map(s => `<tr><td>${s}</td><td>${pct(fair[s]['No tocar'].cagr)}</td><td>${pct(fair[s]['No tocar'].dd)}</td><td>${pct(fair[s]['Solo EMA50'].cagr)}</td><td>${pct(fair[s]['Solo EMA50'].dd)}</td></tr>`).join('')}</table></div>
   <p>En los índices la media ${fair.SPY['Solo EMA50'].cagr < fair.SPY['No tocar'].cagr ? 'gana menos que no tocar' : 'gana más que no tocar'}, pero la peor caída pasa de ${pct(fair.SPY['No tocar'].dd, 0)} a ${pct(fair.SPY['Solo EMA50'].dd, 0)} en el S&P 500 y de ${pct(fair.QQQ['No tocar'].dd, 0)} a ${pct(fair.QQQ['Solo EMA50'].dd, 0)} en el Nasdaq-100: casi a la mitad. Se paga rendimiento a cambio de poder dormir.</p>`;
}

/* ---------- empieza aquí ---------- */
function renderStart() {
  const p = Object.assign({ inc: 6000, fix: 2500, varr: 1500, debt: 0, months: 6, goals: '', pres: 80, monthly: 500, sym: swapSym('SPY'), init: 1000, mon: 200, yrs: 20, rate: null, infl: 3, show: false }, st.plan);
  const el = $('#start'), inp = (k, lab, extra = '') => `<label>${lab}<input type="number" data-k="${k}" value="${p[k] ?? ''}" ${extra}></label>`;
  const sav = p.inc - p.fix - p.varr, rate = sav / (p.inc || 1), need = (p.fix + p.varr) * p.months;
  el.innerHTML = `<div class="steps">
   <div class="box"><h3>1. Lo que entra y lo que sale</h3>${inp('inc', 'Ingresos al mes (A$)')}${inp('fix', 'Gastos fijos')}${inp('varr', 'Gastos variables')}
    <p>Ahorro: <b class="num">A$ ${num(sav, 0)}</b> al mes (${pct(rate, 0)}). ${rate < 0 ? 'Gastas más de lo que entra: primero hay que arreglar esto.' : rate < 0.1 ? 'Menos del 10%: busca qué gasto recortar.' : rate < 0.2 ? 'Bien: entre 10% y 20%.' : 'Muy bien: más del 20%.'}</p>
    ${inp('debt', 'Deudas de consumo (tarjeta, auto, plazos; la hipoteca no cuenta)')}
    ${p.debt > 0 ? `<p class="warn">Primero esto: con tu ahorro se liquidan en ${sav > 0 ? Math.ceil(p.debt / sav) + ' meses' : '— (no hay ahorro)'}. Una tarjeta cobra más de lo que suele dar la bolsa.</p>` : ''}</div>
   <div class="box"><h3>2. El ${g('colchón')}</h3><label>Meses de gastos<select data-k="months">${[3, 6, 12].map(m => `<option ${m == p.months ? 'selected' : ''}>${m}</option>`).join('')}</select></label>${inp('have', 'Ya tengo ahorrado (A$)')}
    <p>Necesitas <b class="num">A$ ${num(need, 0)}</b>. Falta: A$ ${num(Math.max(0, need - (p.have || 0)), 0)}${sav > 0 ? `, unos ${Math.ceil(Math.max(0, need - (p.have || 0)) / sav)} meses` : ''}.</p></div>
   <div class="box"><h3>3. Nombre y plazo a cada peso</h3><p>Corto (1–2 años): no va a bolsa. Medio (5–7 años): con cuidado. Largo (10+ años): es para esto.</p><label>Mis metas<input data-k="goals" value="${esc(p.goals || '')}" placeholder="p. ej. auto 2 años; casa 7; jubilación 30" style="flex:1"></label></div>
   <div class="box"><h3>4. Un sistema que te deje dormir</h3>${inp('pres', 'Capital de preservación (% en índice, sin tocar)')}
    <p>De A$ ${num(st.capital, 0)}: <b>A$ ${num(st.capital * p.pres / 100, 0)}</b> de preservación (índice, regla de la media) y <b>A$ ${num(st.capital * (100 - p.pres) / 100, 0)}</b> operativo (ranking, con la regla del 1%). ${g('diversificar', 'Diversifica')} y mira las comisiones.</p>${inp('monthly', 'Cuánto invertir al mes (A$)')}${p.monthly > sav && sav > 0 ? '<p class="warn">Es más que tu ahorro mensual.</p>' : ''}</div>
   <div class="box"><h3>5. Automatizar y no mirar</h3><p>Programa una compra automática cada mes, el día después de cobrar. Revisa la página una vez a la semana, el fin de semana: la regla decide con el cierre del viernes.</p></div>
   <div class="box" id="proj"></div></div>`;
  el.querySelectorAll('[data-k]').forEach(i => i.onchange = () => { st.plan = Object.assign(p, { [i.dataset.k]: i.type === 'number' || i.tagName === 'SELECT' ? +i.value : i.value }); save(); renderStart(); });
  renderProjection(p);
}
async function renderProjection(p) {
  const el = $('#proj'); if (!asset(p.sym)) p.sym = swapSym('SPY');
  const R = await analyze(p.sym), hist = Math.pow(R.D.c.at(-1) / R.D.c[0], 365.25 / (R.D.d.at(-1) - R.D.d[0])) - 1, ruleC = R.L[0].ev.all.cagr;
  const rate = p.rate == null || p.rateSym !== p.sym ? hist : p.rate, dd = E.maxDD(R.D.c);
  const paths = [['Solo ahorrar (0%)', 0], [`Sin tocar (${pct(rate)})`, rate], [`Con la regla de la media (${pct(ruleC)})`, ruleC], [`A mitad de ritmo (${pct(rate / 2)})`, rate / 2]];
  const blocked = p.debt > 0 && !p.show;
  let h = `<h3>Proyección</h3><datalist id="dl">${CORE.assets.map(a => `<option value="${esc(a.s)}">${esc(a.n)}</option>`).join('')}</datalist>
   <label>Activo <input list="dl" id="pSym" value="${esc(p.sym)}"></label>
   <label>Aporte inicial (A$)<input type="number" id="pI" value="${p.init}"></label><label>Aporte mensual<input type="number" id="pM" value="${p.mon}"></label>
   <label>Años<select id="pY">${[10, 20, 30].map(y => `<option ${y == p.yrs ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
   <label>Tasa anual (prefijada con el ${g('CAGR')} histórico real de ${esc(p.sym)} desde ${E.dayStr(R.D.d[0]).slice(0, 4)})<input type="number" step="0.1" id="pR" value="${(rate * 100).toFixed(1)}"></label>
   <label>${g('inflación', 'Inflación')} anual (%)<input type="number" step="0.1" id="pF" value="${p.infl}"></label>`;
  if (blocked) h += `<p class="warn">Primero las deudas de consumo. La proyección queda bloqueada hasta que estén en cero.</p><button id="pShow">Ver de todos modos</button>`;
  else {
    const S = paths.map(([, r]) => E.project(p.init, p.mon, p.yrs, r)), yrs = [5, 10, 15, 20, 30].filter(y => y <= p.yrs);
    const ann = S.map(s => s.filter((_, i) => i % 12 === 0));
    h += `<canvas id="pC"></canvas><div class="tbl"><table><tr><th>Camino</th>${yrs.map(y => `<th>${y} años</th>`).join('')}<th>en dinero de hoy</th></tr>
     ${paths.map(([n], k) => `<tr><td>${n}</td>${yrs.map(y => `<td>${num(S[k][y * 12], 0)}</td>`).join('')}<td>${num(S[k].at(-1) / Math.pow(1 + p.infl / 100, p.yrs), 0)}</td></tr>`).join('')}</table></div>
     <p class="small">Fórmula mensual: V = V × (1 + r_m) + C, r_m = (1 + tasa)^(1/12) − 1. Aportado en total: A$ ${num(p.init + p.mon * 12 * p.yrs, 0)}.</p>
     <p class="warn">Aviso: la peor caída histórica de ${esc(p.sym)} fue ${pct(dd, 0)}. Sobre la cifra final "sin tocar" serían A$ ${num(S[1].at(-1) * -dd, 0)} menos en el peor momento.</p>`;
    setTimeout(() => lineChart($('#pC'), ann, paths.map(x => x[0].split(' (')[0]), [css('--mute'), css('--green'), css('--ocre'), css('--red')]), 0);
  }
  el.innerHTML = h;
  const upd = () => { st.plan = Object.assign(p, { sym: $('#pSym').value.trim().toUpperCase(), init: +$('#pI').value, mon: +$('#pM').value, yrs: +$('#pY').value, infl: +$('#pF').value }); save(); renderProjection(p); };
  ['#pSym', '#pI', '#pM', '#pY', '#pF'].forEach(s => $(s).onchange = upd);
  $('#pR').onchange = () => { p.rate = +$('#pR').value / 100; p.rateSym = p.sym; st.plan = p; save(); renderProjection(p); };
  if ($('#pShow')) $('#pShow').onclick = () => { p.show = true; renderProjection(p); };
}

/* ---------- campeones ---------- */
async function renderChamps() {
  const S = await analyze('SPY'), X = S.X, k = X.W.c.length - 1, up = X.wEma[k] === 1; let wks = 0; for (let j = k; j >= 0 && X.wEma[j] === X.wEma[k]; j--) wks++;
  const i = SPY.c.length - 1, d200 = SPY.c[i] / X.sma200[i] - 1;
  const gold = swapSym('GLD'), GD = await getD(gold), rsiW = E.rsi(E.weekly(GD).c, 14).at(-1);
  const idx = swapSym('SPY'), IR = await analyze(idx), IP = E.plan(IR.X, IR.L, { capital: st.capital, risk: st.risk, fx: fxNow(), usd: IR.usd });
  const r = S.L[0].ev.hold.cagr, C0 = st.capital, bog = C0 * (Math.pow(1 + r, 20) - Math.pow(1 + r - 0.01, 20));
  let peak = 0, pi = 0, worst = 0, wi = 0, wpi = 0; SPY.c.forEach((c, j) => { if (c > peak) { peak = c; pi = j; } if (c / peak - 1 < worst) { worst = c / peak - 1; wi = j; wpi = pi; } });
  let rec = SPY.c.findIndex((c, j) => j > wi && c >= SPY.c[wpi]); const recY = rec > 0 ? (SPY.d[rec] - SPY.d[wpi]) / 365.25 : null;
  const pres = (st.plan.pres ?? 80), dS = E.distributionDays(SPY).length;
  const cards = [
    ['Warren Buffett', 'Ten miedo cuando otros son codiciosos, y sé codicioso cuando otros tienen miedo.', 'Compra negocios, no papeles. El ánimo del mercado le da ofertas en las crisis.', `Termómetro de hoy: ${CLIM.value.toFixed(0)} (${CLIM.zone}).`],
    ['Paul Tudor Jones', 'Nada bueno pasa bajo la media de 200 días.', 'Usa una sola regla para defenderse: si el precio está bajo su media de 200 días, se sale.', `S&P 500 (SPY) a ${pct(d200)} de su media de 200 días.`],
    ['Jesse Livermore', 'El dinero se gana esperando, no operando.', 'Esperaba a que la tendencia estuviera clara y luego se quedaba sentado.', `El S&P 500 lleva ${wks} semana${wks > 1 ? 's' : ''} seguidas ${up ? 'sobre' : 'bajo'} su media de 50 semanas.`],
    ['Ed Seykota', 'Corta las pérdidas, deja correr las ganancias.', 'Pionero de los sistemas de tendencia. Decide la pérdida máxima antes de entrar.', `Pérdida máxima por operación con tu capital: A$ ${num(st.capital * st.risk, 0)} (${pct(st.risk, 1)} de A$ ${num(st.capital, 0)}).`],
    ['Richard Dennis y las Tortugas', 'Cualquiera puede aprender a operar con reglas.', 'Enseñó a novatos un sistema de rupturas con tamaño por riesgo. Muchos ganaron millones.', `Tamaño sugerido para ${idx}: ${num(IP.units, IP.units < 10 ? 2 : 0)} unidades (A$ ${num(IP.costA, 0)}).`],
    ['José Luis Cava', 'Compra el oro cuando nadie lo quiere.', 'Primera condición de compra fuerte: RSI semanal de 14 del oro bajo 40. La segunda, el pánico en la prensa, la juzgas tú.', `RSI semanal (14) de ${gold}: ${num(rsiW, 0)} ${rsiW < 40 ? '— bajo 40: se cumple la primera condición.' : '— sobre 40: todavía no.'}`],
    ['Juan Pa Mujica (y Hyenuk Chu)', 'Separa el capital que cuidas del capital con que operas.', 'Chu añade: varias cuentas, la más agresiva la más pequeña, y cero deudas de consumo antes de cualquiera.', `Con tu plan: A$ ${num(st.capital * pres / 100, 0)} de preservación y A$ ${num(st.capital * (100 - pres) / 100, 0)} operativo.${st.plan.debt > 0 ? ' Tienes deudas de consumo: primero eso.' : ''}`],
    ['Jack Bogle', 'No busques la aguja: compra el pajar.', 'Creó el fondo índice. Las comisiones son lo único seguro del rendimiento.', `1% extra de comisión durante 20 años sobre A$ ${num(C0, 0)} (al ${pct(r)} anual): A$ ${num(bog, 0)} menos.`],
    ['Morgan Housel', 'Lo más importante es quedarse en el juego.', 'El interés compuesto solo funciona si no te sales en la peor caída.', `La peor caída del S&P 500 (SPY) desde 2004: ${pct(worst, 0)} (${E.dayStr(SPY.d[wi])}). Tardó ${recY ? num(recY, 1) + ' años' : '—'} en recuperarse.`],
    ["William O'Neil", 'Tres de cada cuatro acciones siguen al mercado.', 'Contaba los días de distribución: caídas con más volumen. Cinco o más en un mes avisan de techo.', `Días de distribución del S&P 500 hoy: ${dS} en 25 sesiones.`]
  ];
  $('#champs').innerHTML = `<div class="grid2">${cards.map(c => `<div class="card"><h3>${c[0]}</h3><p><i>${c[1]}</i></p><p class="small">${c[2]}</p><div class="live">${c[3]}</div></div>`).join('')}</div>`;
}

/* ---------- enseñanza, bitácora ---------- */
function renderTeach() {
  $('#schools').innerHTML = T.schools.map(s => `<div class="lens"><b>${s[0]}</b><p>${s[1]}</p><p class="small mute">En la app: ${s[2]}</p></div>`).join('');
  $('#lessons').innerHTML = T.lessons.map((l, j) => `<details class="lens"><summary><b>${j + 1}. ${l[0]}</b></summary><p>${l[1]}</p></details>`).join('');
  $('#okbad').innerHTML = `<div class="card"><h3 class="up">Está bien</h3><ul>${T.ok.map(x => `<li>${x}</li>`).join('')}</ul></div><div class="card"><h3 class="dn">Está mal</h3><ul>${T.bad.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
}
function renderJournal() {
  $('#journal').innerHTML = st.journal.length ? `<div class="tbl"><table><tr><th>Fecha</th><th>Activo</th><th>Decisión</th><th>Por qué</th><th>Conclusión</th><th>Clima</th></tr>${st.journal.map(j => `<tr><td>${j.t}</td><td>${esc(j.s)}</td><td>${esc(j.c)}</td><td style="text-align:left;font-family:var(--sans)">${esc(j.why)}</td><td>${esc(j.concl)} (${esc(j.conf)})</td><td>${j.fg ?? '—'}</td></tr>`).join('')}</table></div>` : '<p class="mute">Todavía no hay entradas. Abre un activo del tablero y escribe tu decisión.</p>';
}

/* ---------- glosario: ventanita ---------- */
function tips() {
  const tip = $('#tip');
  document.addEventListener('click', e => { const t = e.target.closest('.g'); if (!t) { tip.style.display = 'none'; return; }
    const k = t.dataset.g, def = T.gloss[k] || T.gloss[Object.keys(T.gloss).find(x => x.toLowerCase() === k.toLowerCase())]; if (!def) return;
    tip.innerHTML = `<b>${esc(k)}</b><br>${esc(def)}`; tip.style.display = 'block'; const r = t.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - 310, Math.max(6, r.left)) + 'px'; tip.style.top = (r.bottom + 6) + 'px'; e.stopPropagation(); });
  window.addEventListener('scroll', () => tip.style.display = 'none', { passive: true });
}

/* ---------- refrescar ---------- */
const sydney = d => { const f = o => new Intl.DateTimeFormat('es-ES', Object.assign({ timeZone: 'Australia/Sydney' }, o)).format(d);
  const z = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName').value;
  return `${f({ day: '2-digit', month: '2-digit', year: 'numeric' })} ${f({ hour: '2-digit', minute: '2-digit', hour12: false })} (hora de Sídney, ${z})`; };
async function tvScan(market, tickers) {   // POST "simple" (text/plain): TradingView responde con Access-Control-Allow-Origin
  const r = await fetch(`https://scanner.tradingview.com/${market}/scan`, { method: 'POST', body: JSON.stringify({ symbols: { tickers }, columns: ['open', 'high', 'low', 'close', 'volume', 'time', 'update_time', 'update_mode'] }) });
  if (!r.ok) throw new Error(market + ' HTTP ' + r.status); return (await r.json()).data || [];
}
async function fetchLive() {
  LIVE = {}; LIVEFX = null; const by = { america: [], australia: [], crypto: [] }, back = {};
  CORE.assets.forEach(a => { const t = TV[a.s] && TV[a.s].tv; if (!t) return; back[t] = a.s; by[t.startsWith('ASX:') ? 'australia' : /^(BITSTAMP|COINBASE|BINANCE):/.test(t) ? 'crypto' : 'america'].push(t); });
  const info = { ok: [], fail: [], n: 0, newer: 0, latest: 0 };
  await Promise.all(Object.entries(by).map(async ([m, ts]) => { if (!ts.length) return; try {
    (await tvScan(m, ts)).forEach(row => { const [open, high, low, close, volume, time, upd, mode] = row.d, s = back[row.s]; if (!s || close == null || !time) return;
      LIVE[s] = { open, high, low, close, volume, time, upd, mode }; info.n++; info.latest = Math.max(info.latest, upd || 0); }); info.ok.push(m);
  } catch (e) { info.fail.push(m + ': ' + e.message); } }));
  try { const fx = await tvScan('forex', ['FX_IDC:AUDUSD']); if (fx[0] && fx[0].d[3]) LIVEFX = fx[0].d[3]; info.ok.push('forex'); } catch (e) { info.fail.push('forex: ' + e.message); }
  CORE.assets.forEach(a => { const b = LIVE[a.s]; if (b && E.dayInTz(b.time, E.tzOf(a.s)) > a.last) info.newer++; });
  return info;
}
async function loadBase() {
  CORE = await load('core.json'); TV = {};
  try { const tv = await load('tv.json'); tv.rows.forEach(r => TV[r.s] = r); } catch (e) { /* opcional */ }
  FX = E.decode(CORE.aux['AUDUSD=X']); SPY = await getD('SPY'); QQQ = await getD('QQQ');
  const ax = s => E.decode(CORE.aux[s]);
  CLIM = E.climate(SPY, 'XLK XLF XLE XLV XLY XLP XLI XLB XLU'.split(' ').map(ax), ax('HYG'), ax('IEF'), ax('^VIX'), ax('TLT'));
}
function status() {
  const gen = new Date(CORE.generated);
  $('#asof').textContent = `Cierres oficiales al ${E.dayStr(CORE.lastDay)} · ${CORE.assets.length} activos · datos publicados ${sydney(gen)}`;
  let h = REFRESHED ? `<b>Refrescado: ${sydney(REFRESHED)}</b>. ` : '';
  if (LIVEINFO) h += LIVEINFO.n ? `Precios de hoy: ${LIVEINFO.n} activos desde TradingView (fuente no oficial, con retraso: 15 min EE.UU., 20 min ASX)${LIVEINFO.latest ? `, último dato ${sydney(new Date(LIVEINFO.latest * 1000))}` : ''}. ${LIVEINFO.newer} tienen una sesión más nueva que el cierre oficial y se muestran como <span class="tag z">hoy</span> (provisional).${LIVEINFO.fail.length ? ' Fallos: ' + esc(LIVEINFO.fail.join('; ')) + '.' : ''}`
    : `No se pudo leer TradingView (${esc(LIVEINFO.fail.join('; ') || 'sin datos')}): se muestran los cierres oficiales publicados.`;
  $('#refreshInfo').innerHTML = h; $('#refreshInfo').style.display = h ? 'block' : 'none';
}
async function refresh() {
  const b = $('#refresh'); b.disabled = true; b.textContent = '⟳ Refrescando…';
  try {
    BUST = '?v=' + Date.now();
    for (const k of Object.keys(DS)) delete DS[k]; for (const k of Object.keys(AN)) delete AN[k];
    await loadBase(); LIVEINFO = await fetchLive(); REFRESHED = new Date();
    for (const k of Object.keys(AN)) delete AN[k];
    status(); renderClimate(); renderRanking(false); await renderAll(); await loadTweets(true);
  } catch (e) { $('#refreshInfo').innerHTML = `<span class="warn">No se pudo refrescar: ${esc(e.message || e)}. Siguen los datos anteriores.</span>`; $('#refreshInfo').style.display = 'block'; }
  b.disabled = false; b.textContent = '⟳ Refrescar'; document.body.dataset.refreshed = String(Date.now());
}

/* ---------- columna de tweets ---------- */
const TW = { list: [], seen: null, meta: null, accounts: null, unread: 0, timer: null };
const TW_POLL_MS = 5 * 60 * 1000;   // cada 5 minutos
const xUrl = u => /^https:\/\/(x|twitter)\.com\//.test(u) ? u : 'https://x.com/';
function ago(ts) { const m = Math.round((Date.now() - ts) / 6e4); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; }
async function loadTweets(bust) {
  const old = BUST; BUST = bust ? '?v=' + Date.now() : BUST; let doc;
  try { doc = await load('tweets.json'); } catch (e) { doc = null; } finally { BUST = old; }
  if (!TW.accounts) { try { TW.accounts = await load('x_accounts.json'); } catch (e) { TW.accounts = false; } }
  if (!doc) { $('#twMeta').textContent = 'Todavía no hay tweets publicados (data/tweets.json).'; return; }
  const P = E.prepareTweets(doc, { now: Date.parse(doc.generated_at) || Date.now(), days: doc.window_days || 7, cap: 500 });
  if (!P.ok) { $('#twMeta').textContent = 'Archivo de tweets no válido: ' + P.errors.join('; '); return; }
  const fresh = TW.seen ? new Set(E.newTweetIds(TW.seen, P.tweets)) : new Set();
  TW.seen = new Set(P.tweets.map(t => t.id)); TW.list = P.tweets; TW.meta = P; TW.fresh = fresh;
  if (fresh.size && !document.body.classList.contains('tw-on')) TW.unread += fresh.size;
  renderTweets();
}
function renderTweets() {
  const P = TW.meta; if (!P) return;
  $('#twEx').innerHTML = P.example ? '<div class="ex">⚠ DATOS DE EJEMPLO<br><span style="font-weight:400;font-size:.8rem">Tweets inventados para probar la columna. No son reales.</span></div>' : '';
  const acc = TW.accounts && Array.isArray(TW.accounts.accounts || TW.accounts) ? (TW.accounts.accounts || TW.accounts) : null;
  const nd = acc ? acc.filter(a => a.company_status === 'dudosa' || a.ceo_status === 'dudosa').length : null;
  $('#twMeta').innerHTML = `Actualizado: ${P.generated && isFinite(Date.parse(P.generated)) ? sydney(new Date(P.generated)) : '—'} · fuente: ${esc(P.source || '—')} · ${P.tweets.length} tweets${P.accounts ? ` de ${P.accounts} cuentas revisadas` : ''}${acc ? ` · cuentas en lista: ${acc.length}${nd ? ` (${nd} con alguna dudosa)` : ''}` : ''}. Se revisa cada 5 min.`;
  const sel = $('#twSym'), cur = sel.value || '*', syms = [...new Set(P.tweets.map(t => t.symbol))].sort();
  sel.innerHTML = `<option value="*">Todos los activos</option><option value="@board">Mi tablero</option>` + syms.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '*';
  const f = { symbol: sel.value === '@board' ? board() : sel.value, role: $('#twRole').value, important: $('#twImp').checked };
  const L = E.filterTweets(TW.list, f);
  $('#twList').innerHTML = L.length ? L.map(t => `<article class="tweet${t.hl.important ? ' imp' : ''}${TW.fresh && TW.fresh.has(t.id) ? ' nuevo' : ''}">
    <div class="who"><b>${E.escapeHtml(t.author)}</b><span class="mute">@${E.escapeHtml(t.handle)}</span><span class="tag ${t.role === 'ceo' ? 'z' : 'n'}">${t.role === 'ceo' ? 'CEO' : 'Empresa'}</span><span class="tag p">${E.escapeHtml(t.symbol)}</span>${t.status === 'dudosa' ? '<span class="dud" title="No está confirmado que esta cuenta sea oficial">cuenta dudosa</span>' : ''}</div>
    ${t.hl.important ? `<div class="hl">★ Importante: ${t.hl.reasons.map(E.escapeHtml).join(' · ')}</div>` : t.hl.reasons.length ? `<div class="hl" style="color:var(--mute);font-weight:400">${t.hl.reasons.map(E.escapeHtml).join(' · ')}</div>` : ''}
    <div class="txt">${E.escapeHtml(t.text)}</div>
    <div class="ft"><span title="${E.escapeHtml(sydney(new Date(t.ts)))}">${ago(t.ts)}</span>${t.metrics ? `<span>♥ ${+t.metrics.likes || 0} · ↻ ${+t.metrics.reposts || 0}</span>` : ''}<a href="${E.escapeHtml(xUrl(t.url))}" target="_blank" rel="noopener noreferrer nofollow">Ver en X ↗</a></div></article>`).join('')
    : '<p class="mute">Ningún tweet con estos filtros.</p>';
  $('#twN').textContent = TW.unread; $('#twN').style.display = TW.unread ? 'inline' : 'none';
}
function tweetsInit() {
  const wide = matchMedia('(min-width:1300px)').matches;
  if (wide && st.twOpen !== false) document.body.classList.add('tw-on');
  $('#twToggle').onclick = () => { const on = document.body.classList.toggle('tw-on'); if (on) TW.unread = 0; if (matchMedia('(min-width:1300px)').matches) { st.twOpen = on; save(); } renderTweets(); };
  ['#twSym', '#twRole', '#twImp'].forEach(s => $(s).onchange = () => { TW.fresh = null; renderTweets(); });
  loadTweets(true); TW.timer = setInterval(() => loadTweets(true), TW_POLL_MS);
}

/* ---------- arranque ---------- */
function settings() {
  const th = st.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.dataset.theme = th;
  $('#region').value = st.region; $('#capital').value = st.capital; $('#risk').value = st.risk; $('#feeASX').value = st.feeASX; $('#feeUS').value = st.feeUS; $('#fxFee').value = st.fxFee;
  $('#theme').onclick = () => { st.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = st.theme; save(); renderBoard(); };
  const re = () => { st.region = $('#region').value; st.capital = +$('#capital').value || 10000; st.risk = +$('#risk').value; st.feeASX = +$('#feeASX').value; st.feeUS = +$('#feeUS').value; st.fxFee = +$('#fxFee').value; save(); renderAll(); };
  ['#region', '#capital', '#risk', '#feeASX', '#feeUS', '#fxFee'].forEach(s => $(s).onchange = re);
  $('#addList').innerHTML = CORE.assets.map(a => `<option value="${esc(a.s)}">${esc(a.n)}</option>`).join('');
  $('#addBtn').onclick = () => { const s = $('#addIn').value.trim().toUpperCase(); if (asset(s) && !board().includes(s)) { st.extra.push(s); save(); renderBoard(); } $('#addIn').value = ''; };
  $('#clearBtn').onclick = () => { st.extra = []; save(); renderBoard(); };
}
async function renderAll() { await renderBoard(); renderStart(); await renderChamps(); renderJournal(); await renderLab(); renderFlows(); }
async function main() {
  try { await loadBase(); } catch (e) { $('#board').innerHTML = '<p class="warn">No se encontraron los datos (data/core.json). Ejecuta primero fetch_data.py.</p>'; return; }
  status(); settings(); tips(); renderTeach(); $('#refresh').onclick = refresh; tweetsInit();
  renderClimate(); renderRanking(false); await renderAll();
  // enlaces directos: #open=SPY abre un activo; #rank calcula el ranking; #s-... baja a la sección
  const hs = decodeURIComponent(location.hash.slice(1)), mo = hs.match(/open=([^&]+)/);
  if (/tweets/.test(hs)) { document.body.classList.add('tw-on'); TW.unread = 0; renderTweets(); }
  if (/refresh/.test(hs)) { $('#refresh').click(); await new Promise(r => { const t = setInterval(() => { if (document.body.dataset.refreshed) { clearInterval(t); r(); } }, 100); }); }
  if (/rank/.test(hs)) await renderRanking(true);
  if (mo && asset(mo[1]) && !document.querySelector(`details.row[data-s="${mo[1]}"]`)) { const R = await analyze(mo[1]); $('#board').insertAdjacentHTML('afterbegin', rowHTML(R)); const d0 = $('#board details.row'); d0.addEventListener('toggle', () => { if (d0.open && !d0.dataset.done) { d0.dataset.done = 1; detail(d0); } }); }
  if (mo) { const d = document.querySelector(`details.row[data-s="${mo[1]}"]`); if (d) { d.open = true; await detail(d); d.dataset.done = 1; const how = d.querySelector('details.how'); if (how) how.open = true; d.scrollIntoView(); } }
  const sec = hs.match(/(s-[a-z]+)/); if (sec && $('#' + sec[1])) $('#' + sec[1]).scrollIntoView();
  document.body.dataset.ready = '1';
}
window.Brujula = { st, AN, analyze, renderRanking };
main();
})();
