/* Brújula de Inversión — MOTOR DE CÁLCULO (sin interfaz, sin DOM).
   Funciona en el navegador (window.Engine) y en Node (module.exports) para poder probarlo.
   Todas las fórmulas siguen el prompt; los comentarios dicen la sección. */
(function (root) {
'use strict';
const E = {};
const DAY0 = Date.UTC(1970, 0, 1);
E.dayStr = d => new Date(DAY0 + d * 864e5).toISOString().slice(0, 10);
E.SPLIT_DAY = Math.round(Date.UTC(2017, 1, 1) / 864e5);   // "hasta enero de 2017 y desde entonces"
E.COST = 0.0015;                                           // 0,15% por cambio de posición

/* ---------- datos ---------- */
E.decode = function (j) {           // t en diferencias -> días; v ÷100 -> ×100
  const n = j.t.length, d = new Array(n); let acc = 0;
  for (let i = 0; i < n; i++) { acc += j.t[i]; d[i] = acc; }
  return { d, o: j.o, h: j.h, l: j.l, c: j.c, v: j.v.map(x => x * 100) };
};
E.lastIdxOnOrBefore = function (d, day) {   // búsqueda binaria
  let lo = 0, hi = d.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (d[m] <= day) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
};
E.valueAt = (S, day) => { const i = E.lastIdxOnOrBefore(S.d, day); return i < 0 ? null : S.c[i]; };

/* §3 velas semanales: semana = floor((día+3)/7) */
E.weekly = function (D) {
  const W = { wk: [], d: [], o: [], h: [], l: [], c: [], v: [], first: [], last: [] };
  for (let i = 0; i < D.d.length; i++) {
    const w = Math.floor((D.d[i] + 3) / 7), n = W.wk.length;
    if (n && W.wk[n - 1] === w) {
      const k = n - 1; W.h[k] = Math.max(W.h[k], D.h[i]); W.l[k] = Math.min(W.l[k], D.l[i]);
      W.c[k] = D.c[i]; W.v[k] += D.v[i]; W.d[k] = D.d[i]; W.last[k] = i;
    } else {
      W.wk.push(w); W.d.push(D.d[i]); W.o.push(D.o[i]); W.h.push(D.h[i]); W.l.push(D.l[i]);
      W.c.push(D.c[i]); W.v.push(D.v[i]); W.first.push(i); W.last.push(i);
    }
  }
  return W;
};

/* ---------- indicadores ---------- */
E.ema = function (a, n) {           // EMA_t = x_t·k + EMA_(t−1)·(1−k), k = 2/(n+1); arranca en el primer valor
  const k = 2 / (n + 1), out = new Array(a.length); let e = null;
  for (let i = 0; i < a.length; i++) { const x = a[i]; if (x == null) { out[i] = e; continue; } e = e == null ? x : x * k + e * (1 - k); out[i] = e; }
  return out;
};
E.sma = function (a, n) {
  const out = new Array(a.length).fill(null); let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
};
E.rsi = function (c, n) {           // RSI con medias de Wilder
  const out = new Array(c.length).fill(null); let ag = 0, al = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i] - c[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= n) { ag += g / n; al += l / n; if (i === n) out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
    else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
  }
  return out;
};
E.atr = function (h, l, c, n) {     // ATR de Wilder
  const out = new Array(c.length).fill(null); let a = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i];
    if (i < n) { a += tr / n; if (i === n - 1) out[i] = a; } else { a = (a * (n - 1) + tr) / n; out[i] = a; }
  }
  return out;
};
E.macdFull = function (c) {
  const e12 = E.ema(c, 12), e26 = E.ema(c, 26), m = e12.map((x, i) => x - e26[i]), s = E.ema(m, 9);
  return { m, s, h: m.map((x, i) => x - s[i]) };
};
E.obv = function (c, v) { const o = [0]; for (let i = 1; i < c.length; i++) o.push(o[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0)); return o; };
E.chaikin = function (h, l, c, v, n) {   // Σ[((C−L)−(H−C))/(H−L)×V] ÷ ΣV
  const out = new Array(c.length).fill(null); const mf = c.map((x, i) => h[i] > l[i] ? ((x - l[i]) - (h[i] - x)) / (h[i] - l[i]) * v[i] : 0);
  let a = 0, b = 0;
  for (let i = 0; i < c.length; i++) { a += mf[i]; b += v[i]; if (i >= n) { a -= mf[i - n]; b -= v[i - n]; } if (i >= n - 1) out[i] = b > 0 ? a / b : null; }
  return out;
};
E.rollMax = (a, n, i) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, a[j]); return m; };
E.rollMin = (a, n, i) => { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, a[j]); return m; };

/* ---------- prueba histórica (§6) ----------
   sig[i] = exposición (0..1) decidida al cierre del día i; se ejecuta en la apertura de i+1.
   a[i] = exposición durante el día i = sig[i−1]. Noche (c[i−1]→o[i]) con a[i−1]; día (o[i]→c[i]) con a[i].
   Costo 0,15% × |cambio de exposición|. */
E.backtest = function (D, sig, start) {
  const n = D.d.length, eq = new Array(n).fill(null), pos = new Array(n).fill(0), bh = new Array(n).fill(null);
  eq[start] = 1; bh[start] = 1; let prevA = 0, trades = [], cur = null;
  for (let i = start + 1; i < n; i++) {
    const a = sig[i - 1] == null ? 0 : sig[i - 1];
    let f = (1 + prevA * (D.o[i] / D.c[i - 1] - 1));
    if (a !== prevA) {
      f *= 1 - E.COST * Math.abs(a - prevA);
      if (prevA === 0 && a > 0) cur = { in: i, eqIn: eq[i - 1] * f };
      if (prevA > 0 && a === 0 && cur) { const eqOut = eq[i - 1] * f; trades.push({ in: cur.in, out: i, r: eqOut / cur.eqIn - 1 }); cur = null; }
    }
    f *= (1 + a * (D.c[i] / D.o[i] - 1));
    eq[i] = eq[i - 1] * f; pos[i] = a; prevA = a;
    bh[i] = D.c[i] / D.c[start];
  }
  if (cur) trades.push({ in: cur.in, out: n - 1, r: eq[n - 1] / cur.eqIn - 1, open: true });
  return { eq, bh, pos, trades, start };
};
E.stats = function (D, eq, s, e) {
  if (s == null || e - s < 20) return null;
  let peak = eq[s], dd = 0;
  for (let i = s; i <= e; i++) { peak = Math.max(peak, eq[i]); dd = Math.min(dd, eq[i] / peak - 1); }
  const yrs = (D.d[e] - D.d[s]) / 365.25, cagr = Math.pow(eq[e] / eq[s], 1 / yrs) - 1;
  return { cagr, dd, ratio: dd < 0 ? cagr / -dd : null, yrs, from: D.d[s], to: D.d[e] };
};
E.periods = function (D, start) {   // dos periodos: hasta ene-2017 y desde; si es joven, por la mitad
  const n = D.d.length - 1, si = E.lastIdxOnOrBefore(D.d, E.SPLIT_DAY - 1);
  if (D.d[start] < E.SPLIT_DAY - 5 * 365) return [[start, si], [si, n]];
  const mid = Math.floor((start + n) / 2); return [[start, mid], [mid, n]];
};
E.beats = function (r, b) {          // gana en un periodo
  if (!r || !b) return false;
  if (r.cagr > b.cagr) return true;
  return r.ratio != null && b.ratio != null && r.ratio >= 0.9 * b.ratio && (r.dd - b.dd) >= 0.05;
};
E.evaluate = function (D, sig, start) {
  const bt = E.backtest(D, sig, start), n = D.d.length - 1;
  const all = E.stats(D, bt.eq, start, n), allB = E.stats(D, bt.bh, start, n);
  const per = E.periods(D, start).map(([s, e]) => {
    const bhSeg = bt.bh, r = E.stats(D, bt.eq, s, e), b = E.stats(D, bhSeg, s, e);
    return { s, e, rule: r, hold: b, win: E.beats(r, b) };
  });
  const wins = per.filter(p => p.win).length, nt = bt.trades.length;
  const verdict = nt < 4 ? 'Pocos datos' : wins === 2 ? 'Probada' : wins === 1 ? 'Funcionó a medias' : 'No ganó a mantener';
  const winPct = nt ? bt.trades.filter(t => t.r > 0).length / nt : null;
  const inTime = bt.pos.slice(start).filter(x => x > 0).length / (n - start + 1);
  return { verdict, all, hold: allB, per, trades: nt, winPct, inTime, bt };
};

/* ---------- las ocho miradas (§4) ---------- */
function weeklyToDaily(W, wsig, n) {  // señal semanal decidida al cierre del último día de la semana
  const s = new Array(n).fill(null);
  for (let k = 0; k < W.wk.length; k++) s[W.last[k]] = wsig[k];
  let cur = null; for (let i = 0; i < n; i++) { if (s[i] != null) cur = s[i]; else s[i] = cur; }
  return s;
}
E.weeklyToDaily = weeklyToDaily;
function hysteresis(a) { let cur = null; return a.map(x => { if (x === 1 || x === 0) cur = x; return cur; }); }

E.prepare = function (D) {
  const W = E.weekly(D), n = D.d.length;
  const X = { D, W };
  X.ema50 = E.ema(W.c, 50); X.ma30 = E.sma(W.c, 30);
  X.atrW = E.atr(W.h, W.l, W.c, 14); X.atrD = E.atr(D.h, D.l, D.c, 22);
  X.mac = E.macdFull(D.c); X.rsi2 = E.rsi(D.c, 2); X.sma200 = E.sma(D.c, 200); X.sma5 = E.sma(D.c, 5);
  X.obv = E.obv(D.c, D.v); X.obvE = E.ema(X.obv, 50); X.chk = E.chaikin(D.h, D.l, D.c, D.v, 20);
  // señales semanales (1 = dentro, 0 = fuera)
  const nw = W.c.length;
  X.wEma = W.c.map((c, k) => k < 49 ? null : (c > X.ema50[k] ? 1 : 0));
  X.wWein = W.c.map((c, k) => (k < 33 || X.ma30[k - 4] == null) ? null : (c > X.ma30[k] && X.ma30[k] > X.ma30[k - 4] ? 1 : 0));
  X.wMom = W.c.map((c, k) => k < 52 ? null : (W.c[k - 4] / W.c[k - 52] - 1 > 0 ? 1 : 0));
  const turt = new Array(nw).fill(null); let st = 0;
  for (let k = 20; k < nw; k++) {
    const hi = E.rollMax(W.h, 20, k - 1), lo = E.rollMin(W.l, 10, k - 1);
    if (W.c[k] > hi) st = 1; else if (W.c[k] < lo) st = 0; turt[k] = st;
  }
  X.wTurt = turt;
  // señales diarias para la prueba
  X.sEma = weeklyToDaily(W, X.wEma, n); X.sWein = weeklyToDaily(W, X.wWein, n);
  X.sMom = weeklyToDaily(W, X.wMom, n); X.sTurt = weeklyToDaily(W, X.wTurt, n);
  X.sMacd = D.c.map((_, i) => i < 35 ? null : (X.mac.m[i] > X.mac.s[i] ? 1 : 0));
  const rs = new Array(n).fill(null); let inn = 0;          // Connors: entra RSI2<10 sobre SMA200; sale cierre > SMA5 o bajo SMA200
  for (let i = 200; i < n; i++) {
    if (!inn && D.c[i] > X.sma200[i] && X.rsi2[i] < 10) inn = 1;
    else if (inn && (D.c[i] > X.sma5[i] || D.c[i] < X.sma200[i])) inn = 0;
    rs[i] = inn;
  }
  X.sRsi = rs;
  X.sVol = hysteresis(D.c.map((_, i) => i < 50 || X.chk[i] == null ? null :
    (X.obv[i] > X.obvE[i] && X.chk[i] > 0 ? 1 : X.obv[i] < X.obvE[i] && X.chk[i] < 0 ? 0 : null)));
  // inicio común de las pruebas: primer día con la EMA de 50 semanas definida (y al menos 52 semanas)
  const k0 = Math.min(52, nw - 1); X.start = Math.min(W.last[k0], n - 2);
  return X;
};

const sgnTxt = s => s === 1 ? 'A favor' : s === -1 ? 'En contra' : s === 0 ? 'Duda' : 'No aplica';
E.sgnTxt = sgnTxt;
const pct = (x, d = 1) => x == null || !isFinite(x) ? '—' : (x * 100).toFixed(d).replace('.', ',') + '%';
const num = (x, d = 2) => x == null || !isFinite(x) ? '—' : x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
E.pct = pct; E.num = num;

E.lenses = function (X, ctx) {
  const { D, W } = X, k = W.c.length - 1, i = D.d.length - 1, out = [];
  const meta = ctx.meta || {}, f = ctx.fund || {};
  // 1. EMA 50 semanas
  { const c = W.c[k], e = X.ema50[k], dist = c / e - 1;
    out.push({ id: 'ema', fam: 'Tendencia', L: 'T', name: 'Media de 50 semanas', s: c > e ? 1 : -1, ema: e, dist,
      near: Math.abs(dist) < 0.03, ev: E.evaluate(D, X.sEma, X.start), sig: X.sEma,
      txt: (c > e ? `El precio (${num(c)}) está ${pct(dist)} sobre su media de 50 semanas (${num(e)}). La tendencia larga sube.`
                  : `El precio (${num(c)}) está ${pct(-dist)} bajo su media de 50 semanas (${num(e)}). La tendencia larga baja.`) +
        (Math.abs(dist) < 0.03 ? ' Muy cerca: puede cambiar esta semana.' : '') }); }
  // 2. Weinstein
  { const c = W.c[k], m = X.ma30[k], m4 = X.ma30[k - 4];
    let st, s; if (m == null || m4 == null) { st = 'sin datos'; s = null; }
    else if (c > m && m > m4) { st = 2; s = 1; } else if (c < m && m < m4) { st = 4; s = -1; } else { st = c > m ? 3 : 1; s = 0; }
    const map = { 1: 'Etapa 1 (base): el precio duerme, todavía no sube.', 2: 'Etapa 2 (subida): sobre la media de 30 semanas y la media sube.',
      3: 'Etapa 3 (techo): sobre la media, pero la media ya no sube.', 4: 'Etapa 4 (bajada): bajo la media de 30 semanas y la media baja.' };
    out.push({ id: 'wein', fam: 'Tendencia', L: 'T', name: 'Etapas de Weinstein', s, stage: st, ma30: m,
      ev: E.evaluate(D, X.sWein, X.start), sig: X.sWein, txt: map[st] || 'Faltan semanas.' }); }
  // 3. Impulso 12 meses (salta el último mes)
  { const m = k >= 52 ? W.c[k - 4] / W.c[k - 52] - 1 : null, spy = ctx.spyMom;
    out.push({ id: 'mom', fam: 'Impulso', L: 'I', name: 'Impulso de 12 meses', s: m == null ? null : m > 0 ? 1 : -1, mom: m, spyMom: spy,
      ev: E.evaluate(D, X.sMom, X.start), sig: X.sMom,
      txt: m == null ? 'Faltan semanas.' : `En 12 meses (sin el último) ${m > 0 ? 'subió' : 'bajó'} ${pct(Math.abs(m))}. El S&P 500: ${pct(spy)}.` }); }
  // 4. Tortugas 20 semanas
  { const inn = X.wTurt[k] === 1, hi = E.rollMax(W.h, 20, k - 1), lo = E.rollMin(W.l, 10, k - 1);
    out.push({ id: 'turt', fam: 'Impulso', L: 'I', name: 'Ruptura de 20 semanas (Tortugas)', s: inn ? 1 : -1, entry: hi, exit: lo,
      ev: E.evaluate(D, X.sTurt, X.start), sig: X.sTurt,
      txt: inn ? `Dentro. Sale si una semana cierra bajo ${num(lo)} (mínimo de 10 semanas).` : `Fuera. Entra si una semana cierra sobre ${num(hi)} (máximo de 20 semanas).` }); }
  // 5. MACD diario
  { const m = X.mac.m[i], s = X.mac.s[i], h = X.mac.h[i], hy = X.mac.h[i - 1];
    out.push({ id: 'macd', fam: 'Corto plazo', L: 'C', name: 'MACD diario', s: m > s ? 1 : -1, slowing: Math.abs(h) < Math.abs(hy),
      ev: E.evaluate(D, X.sMacd, X.start), sig: X.sMacd,
      txt: (m > s ? 'El impulso corto empuja hacia arriba.' : 'El impulso corto empuja hacia abajo.') + (h < hy && m > s ? ' Se está frenando.' : h > hy && m < s ? ' La caída se está frenando.' : '') }); }
  // 6. RSI(2) Connors
  { const r = X.rsi2[i], below = D.c[i] < X.sma200[i]; let s, t;
    if (X.sma200[i] == null) { s = null; t = 'Faltan 200 días.'; }
    else if (below) { s = -1; t = 'Bajo la media de 200 días: este trader no opera bajo la media de 200.'; }
    else if (r < 10) { s = 1; t = `RSI(2) = ${num(r, 0)}: retroceso dentro de una subida. Ocasión de compra corta.`; }
    else if (r > 90) { s = 0; t = `RSI(2) = ${num(r, 0)}: muy estirado.`; } else { s = 0; t = `RSI(2) = ${num(r, 0)}: nada que hacer.`; }
    out.push({ id: 'rsi', fam: 'Corto plazo', L: 'C', name: 'Retroceso RSI(2) (Connors)', s, rsi2: r, ev: E.evaluate(D, X.sRsi, X.start), sig: X.sRsi, txt: t }); }
  // 7. Volumen
  { const last = D.v.slice(-250), zero = last.filter(x => !x).length;
    if (zero > 0.1 * last.length) out.push({ id: 'vol', fam: 'Volumen', L: 'V', name: 'Volumen', s: null, na: true, txt: 'No aplica: faltan datos de volumen.' });
    else {
      const a = X.obv[i] > X.obvE[i], b = X.chk[i] > 0, s = a && b ? 1 : !a && !b ? -1 : 0;
      const m1 = D.v.slice(-21).reduce((x, y) => x + y, 0) / 21, y1 = last.reduce((x, y) => x + y, 0) / last.length;
      out.push({ id: 'vol', fam: 'Volumen', L: 'V', name: 'Volumen', s, obvUp: a, chaikin: X.chk[i], volRatio: m1 / y1,
        ev: E.evaluate(D, X.sVol, X.start), sig: X.sVol,
        txt: `OBV ${a ? 'sobre' : 'bajo'} su media; flujo de Chaikin ${num(X.chk[i], 2)}. ${s === 1 ? 'Entra dinero.' : s === -1 ? 'Sale dinero.' : 'Señales mezcladas.'} Volumen del último mes: ${pct(m1 / y1 - 1, 0)} frente a su media anual.` });
    } }
  // 8. Fundamentos
  { const sym = ctx.sym, kind = ctx.kind; let s = null, t, pts = null, parts = [];
    if (kind === 'metal' || kind === 'crypto') t = 'No aplica, no produce beneficios.';
    else if (sym === 'SPY' || sym === 'QQQ' || sym === 'IVV.AX' || sym === 'NDQ.AX') {
      const lim = (sym === 'SPY' || sym === 'IVV.AX') ? 20 : 25, pe = f.trailingPE != null ? f.trailingPE : (ctx.twinFund || {}).trailingPE;
      if (pe == null) t = 'No aplica: sin P/E publicado.';
      else { s = pe < lim ? 1 : pe > lim + 5 ? -1 : 0; t = `P/E histórico ${num(pe, 1)} frente a ${lim} (sobre ${lim + 5} = caro). ${s === 1 ? 'Barato.' : s === -1 ? 'Caro.' : 'Precio justo o algo alto.'}`; }
    } else if (kind === 'etf') t = 'No aplica.';
    else {
      pts = 0; const pe = f.forwardPE != null && f.forwardPE > 0 ? f.forwardPE : f.trailingPE;
      if (pe != null) { const p = pe < 20 ? 1 : pe > 35 ? -1 : 0; pts += p; parts.push(`P/E ${num(pe, 1)} (${p > 0 ? '+1' : p < 0 ? '−1' : '0'})`); }
      if (f.earningsGrowth != null) { const g = f.earningsGrowth, p = g > 0.1 ? 1 : g < 0 ? -1 : 0; pts += p; parts.push(`beneficios ${pct(g, 0)} (${p > 0 ? '+1' : p < 0 ? '−1' : '0'})`); }
      if (f.returnOnEquity != null) { const r = f.returnOnEquity, p = r > 0.15 ? 1 : r < 0.08 ? -1 : 0; pts += p; parts.push(`ROE ${pct(r, 0)} (${p > 0 ? '+1' : p < 0 ? '−1' : '0'})`); }
      const px = ctx.lastClose;
      if (f.targetMeanPrice != null && px) { const u = f.targetMeanPrice / (f.currentPrice || px) - 1, p = u > 0.1 ? 1 : u < -0.03 ? -1 : 0; pts += p; parts.push(`objetivo analistas ${pct(u, 0)} (${p > 0 ? '+1' : p < 0 ? '−1' : '0'})`); }
      if (!parts.length) t = 'No aplica: sin datos del negocio.';
      else { s = pts >= 2 ? 1 : pts <= -1 ? -1 : 0; t = `${pts > 0 ? '+' : ''}${pts} puntos: ${parts.join('; ')}.`; }
    }
    out.push({ id: 'fund', fam: 'Fundamentos', L: 'F', name: 'Fundamentos', s, pts, na: s === null, txt: t });
  }
  return out;
};

/* §5 conclusión */
E.conclude = function (L, X) {
  const ema = L[0], others = L.slice(1).filter(x => x.s !== null && !x.na);
  const n = others.length, need = Math.ceil(n * 0.6), fav = others.filter(x => x.s === 1).length, con = others.filter(x => x.s === -1).length;
  const above = ema.s === 1; let label, warn = null;
  if (above) { label = fav >= need ? 'Comprar o mantener' : con >= need ? 'Mantener con cuidado' : 'Mantener';
    if (ema.dist > 0.15) warn = 'Muy estirado: entra por partes o espera un retroceso.'; }
  else label = con >= need ? 'Vender o no comprar' : 'Esperar';
  const trigger = above ? `Pasa a VENDER si una semana cierra bajo ${num(ema.ema)}.` : `Pasa a COMPRAR si una semana cierra sobre ${num(ema.ema)}.`;
  const v = ema.ev.verdict, agree = above ? fav >= need : con >= need, years = (X.D.d[X.D.d.length - 1] - X.D.d[0]) / 365.25;
  let conf, why;
  if (v === 'No ganó a mantener' || v === 'Pocos datos' || years < 3) { conf = 'Baja';
    why = years < 3 ? 'Hay menos de tres años de historia.' : v === 'Pocos datos' ? 'La regla de la media tiene pocas operaciones en este activo.' : 'La regla de la media no le ganó a no tocar en este activo.'; }
  else if (v === 'Probada' && agree) { conf = 'Alta'; why = `La regla de la media está probada aquí y ${above ? fav : con} de ${n} miradas coinciden.`; }
  else { conf = 'Media'; why = v === 'Probada' ? `La regla está probada aquí, pero solo ${above ? fav : con} de ${n} miradas coinciden (hacen falta ${need}).` : 'La regla de la media funcionó solo en uno de los dos periodos.'; }
  return { label, warn, trigger, conf, why, need, n, fav, con, above };
};

/* §7 plan */
E.plan = function (X, L, opt) {   // opt: {capital (A$), risk, fx (AUDUSD), usd}
  const { D, W } = X, k = W.c.length - 1, i = D.d.length - 1, c = D.c[i], ema = X.ema50[k], atrW = X.atrW[k];
  const toA = x => opt.usd ? x / opt.fx : x, above = L[0].s === 1;
  let entry, exit, zoneLo = null, zoneHi = null, trail = null;
  if (above) { zoneHi = c; zoneLo = Math.max(c - 0.5 * atrW, ema); entry = c; exit = ema;
    trail = E.rollMax(D.c, 22, i) - 3 * X.atrD[i]; }
  else { entry = ema; exit = ema - 2 * atrW; }
  const dist = Math.max(entry - exit, 0.02 * entry), riskA = opt.capital * opt.risk;
  let units = riskA / toA(dist); const capUnits = opt.capital / toA(entry); let capped = false;
  if (units > capUnits) { units = capUnits; capped = true; }
  const costA = units * toA(entry), lossA = units * toA(dist), target = entry + 3 * dist;
  return { above, entry, exit, zoneLo, zoneHi, trail, dist, units, costA, lossA, target, capped, riskA, atrW };
};

/* §8 niveles */
function touches(series, level, tol) { let t = 0, inRun = false; for (const x of series) { const hit = Math.abs(x / level - 1) <= tol; if (hit && !inRun) t++; inRun = hit; } return t; }
E.touches = touches;
E.levels = function (X) {
  const { D, W } = X, k = W.c.length - 1, c = W.c[k];
  const hi20 = E.rollMax(W.h, 20, k), lo20 = E.rollMin(W.l, 20, k), hs = W.h.slice(-20), ls = W.l.slice(-20);
  const tH = touches(hs, hi20, 0.015), tL = touches(ls, lo20, 0.015);
  const hi52 = E.rollMax(W.h, 52, k), lo52 = E.rollMin(W.l, 52, k);
  // Cava: nivel al que el precio volvió más veces en el último año
  function best(hiA, loA, tol) {
    let bl = null, bt = -1; const cand = hiA.concat(loA);
    for (const lv of cand) { let t = 0, inRun = false;
      for (let j = 0; j < hiA.length; j++) { const hit = Math.abs(hiA[j] / lv - 1) <= tol || Math.abs(loA[j] / lv - 1) <= tol; if (hit && !inRun) t++; inRun = hit; }
      if (t > bt) { bt = t; bl = lv; } }
    return { level: bl, touches: bt };
  }
  const nd = Math.min(252, D.c.length), dly = best(D.h.slice(-nd), D.l.slice(-nd), 0.01), wky = best(W.h.slice(-52), W.l.slice(-52), 0.015);
  const gap = Math.abs(dly.level / wky.level - 1), price = D.c[D.c.length - 1];
  let zone, other = null;
  if (gap <= 0.04) zone = [Math.min(dly.level, wky.level), Math.max(dly.level, wky.level)];
  else { const [a, b] = Math.abs(dly.level - price) < Math.abs(wky.level - price) ? [dly, wky] : [wky, dly];
    zone = [a.level, a.level]; other = { level: b.level, kind: b.level < price ? 'siguiente piso' : 'siguiente techo' }; }
  const mid = (zone[0] + zone[1]) / 2, isSupport = mid < price, total = dly.touches + wky.touches;
  return { hi20, lo20, tH, tL, posRange: (c - lo20) / (hi20 - lo20 || 1), hi52, lo52, gh: price / hi52,
    cava: { daily: dly, weekly: wky, zone, other, isSupport, total, weak: isSupport && total >= 6 } };
};

/* utilidades de series */
E.align = function (S, days) { return days.map(d => E.valueAt(S, d)); };
E.retOver = function (S, years) { const i = S.d.length - 1, j = E.lastIdxOnOrBefore(S.d, S.d[i] - Math.round(years * 365.25)); return j < 0 || S.d[j] > S.d[i] - years * 365.25 + 10 ? null : S.c[i] / S.c[j] - 1; };
E.toAUD = function (S, FX) {        // serie en US$ -> A$ (÷ AUDUSD del mismo día)
  const c = S.c.map((x, i) => { const fx = E.valueAt(FX, S.d[i]); return fx ? x / fx : null; });
  const keep = c.map((x, i) => x != null ? i : -1).filter(i => i >= 0);
  return { d: keep.map(i => S.d[i]), c: keep.map(i => c[i]) };
};
E.cagrOf = (S, years) => { const r = E.retOver(S, years); return r == null ? null : Math.pow(1 + r, 1 / years) - 1; };
E.maxDD = function (c, from = 0) { let p = c[from], dd = 0; for (let i = from; i < c.length; i++) { p = Math.max(p, c[i]); dd = Math.min(dd, c[i] / p - 1); } return dd; };

/* §10 frente al S&P 500 en A$ (IVV.AX) */
E.versus = function (A, B) {        // A, B: {d,c} en la misma moneda
  const days = A.d.filter(d => d >= B.d[0]); const a = days.map(d => E.valueAt(A, d)), b = days.map(d => E.valueAt(B, d));
  const S = { d: days, c: a }, T = { d: days, c: b }, res = {};
  for (const y of [1, 3, 5]) { const i0 = E.lastIdxOnOrBefore(days, days[days.length - 1] - Math.round(y * 365.25));
    res[y] = i0 < 0 || days[i0] < days[days.length-1] - y*365.25 - 10 ? null : { a: a[a.length - 1] / a[i0] - 1, b: b[b.length - 1] / b[i0] - 1, ddA: E.maxDD(a, i0), ddB: E.maxDD(b, i0) }; }
  res.all = { a: a[a.length - 1] / a[0] - 1, b: b[b.length - 1] / b[0] - 1, ddA: E.maxDD(a), ddB: E.maxDD(b), from: days[0] };
  // años calendario
  const yrs = {}; days.forEach((d, i) => { const y = E.dayStr(d).slice(0, 4); (yrs[y] = yrs[y] || { s: i, e: i }).e = i; });
  const ys = Object.keys(yrs).sort(); let won = 0, tot = 0, list = [];
  ys.forEach((y, j) => { const s = j ? yrs[ys[j - 1]].e : yrs[y].s, e = yrs[y].e; if (j === 0 && E.dayStr(days[s]).slice(5) > '01-15') return;
    const ra = a[e] / a[s] - 1, rb = b[e] / b[s] - 1; tot++; if (ra > rb) won++; list.push({ y, ra, rb }); });
  res.years = { won, tot, list };
  // volatilidad anual y correlación (5 años, semanal)
  const wk = []; for (let i = days.length - 1; i >= 0 && days[i] >= days[days.length - 1] - 5 * 365.25; i -= 5) wk.unshift(i);
  const ra = [], rb = []; for (let j = 1; j < wk.length; j++) { ra.push(a[wk[j]] / a[wk[j - 1]] - 1); rb.push(b[wk[j]] / b[wk[j - 1]] - 1); }
  const mean = x => x.reduce((s, y) => s + y, 0) / x.length, sd = x => { const m = mean(x); return Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / (x.length - 1)); };
  const ma = mean(ra), mb = mean(rb), cov = ra.reduce((s, x, j) => s + (x - ma) * (rb[j] - mb), 0) / (ra.length - 1);
  res.volA = sd(ra) * Math.sqrt(52); res.volB = sd(rb) * Math.sqrt(52); res.corr = cov / (sd(ra) * sd(rb));
  return res;
};

/* §12 clima: miedo y codicia */
E.climate = function (spy, sectors, hyg, ief, vix, tlt) {
  const days = spy.d, n = days.length, al = S => E.align(S, days);
  const sp = spy.c, sma125 = E.sma(sp, 125), Hy = al(hyg), If = al(ief), Vx = al(vix), Tl = al(tlt);
  const vs50 = E.sma(Vx.map(x => x == null ? NaN : x), 50);
  const secA = sectors.map(al);
  const comp = { mom: [], str: [], brd: [], risk: [], vol: [], safe: [] };
  const sec50 = secA.map(s => E.sma(s.map(x => x == null ? NaN : x), 50));
  for (let i = 0; i < n; i++) {
    comp.mom.push(sma125[i] ? sp[i] / sma125[i] - 1 : null);
    if (i >= 252 && secA.every(s => s[i - 252] != null)) {
      let hi = 0, lo = 0, ab = 0;
      secA.forEach((s, j) => { let mx = -Infinity, mn = Infinity; for (let q = i - 251; q <= i; q++) { mx = Math.max(mx, s[q]); mn = Math.min(mn, s[q]); }
        if (s[i] >= mx * 0.97) hi++; if (s[i] <= mn * 1.03) lo++; if (s[i] > sec50[j][i]) ab++; });
      comp.str.push((hi - lo) / 9); comp.brd.push(ab / 9);
    } else { comp.str.push(null); comp.brd.push(null); }
    const r20 = (x, j) => x[j] != null && x[j - 20] != null ? x[j] / x[j - 20] - 1 : null;
    comp.risk.push(i >= 20 && r20(Hy, i) != null && r20(If, i) != null ? r20(Hy, i) - r20(If, i) : null);
    comp.vol.push(Vx[i] != null && isFinite(vs50[i]) ? -(Vx[i] / vs50[i] - 1) : null);
    comp.safe.push(i >= 20 && r20(Tl, i) != null ? (sp[i] / sp[i - 20] - 1) - r20(Tl, i) : null);
  }
  const pctl = {}; const keys = Object.keys(comp);
  for (const key of keys) { const a = comp[key], p = new Array(n).fill(null);
    for (let i = 0; i < n; i++) { if (a[i] == null) continue; let cnt = 0, le = 0;
      for (let q = Math.max(0, i - 755); q <= i; q++) if (a[q] != null) { cnt++; if (a[q] <= a[i]) le++; }
      if (cnt >= 252) p[i] = le / cnt * 100; }
    pctl[key] = p; }
  const fg = days.map((_, i) => keys.every(k => pctl[k][i] != null) ? keys.reduce((s, k) => s + pctl[k][i], 0) / keys.length : null);
  const zone = v => v == null ? null : v < 25 ? 'Miedo extremo' : v < 45 ? 'Miedo' : v <= 55 ? 'Neutral' : v <= 75 ? 'Codicia' : 'Codicia extrema';
  // tabla: qué hizo el S&P a 3 meses y 1 año después de cada nivel
  const Z = ['Miedo extremo', 'Miedo', 'Neutral', 'Codicia', 'Codicia extrema'], tbl = {};
  Z.forEach(z => tbl[z] = { r3: [], r12: [] });
  for (let i = 0; i < n; i++) { const z = zone(fg[i]); if (!z) continue;
    if (i + 63 < n) tbl[z].r3.push(sp[i + 63] / sp[i] - 1); if (i + 252 < n) tbl[z].r12.push(sp[i + 252] / sp[i] - 1); }
  const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const table = Z.map(z => ({ z, n3: tbl[z].r3.length, m3: med(tbl[z].r3), p3: tbl[z].r3.length ? tbl[z].r3.filter(x => x > 0).length / tbl[z].r3.length : null,
    n12: tbl[z].r12.length, m12: med(tbl[z].r12), p12: tbl[z].r12.length ? tbl[z].r12.filter(x => x > 0).length / tbl[z].r12.length : null }));
  const last = n - 1, now = {}; keys.forEach(k => now[k] = { raw: comp[k][last], p: pctl[k][last] });
  const firstFg = fg.findIndex(x => x != null);
  return { value: fg[last], zone: zone(fg[last]), now, table, fg, days, from: days[firstFg], zoneOf: zone };
};
E.distributionDays = function (D, n = 25) {   // O'Neil: caída > 0,2% con más volumen que el día anterior
  const out = []; for (let i = D.c.length - n; i < D.c.length; i++) if (D.c[i] / D.c[i - 1] - 1 < -0.002 && D.v[i] > D.v[i - 1]) out.push(D.d[i]); return out;
};

/* §13 laboratorio: siete señales semanales y cinco reglas */
E.labSignals = function (X) {
  const W = X.W, n = W.c.length, m = E.macdFull(W.c), obv = E.obv(W.c, W.v), oe = E.ema(obv, 20), ch = E.chaikin(W.h, W.l, W.c, W.v, 4);
  const macd = W.c.map((_, k) => k < 35 ? null : (m.m[k] > m.s[k] ? 1 : 0));
  const ob = W.c.map((_, k) => k < 20 ? null : (obv[k] > oe[k] ? 1 : 0));
  const ck = W.c.map((_, k) => ch[k] == null ? null : (ch[k] > 0 ? 1 : 0));
  return [X.wEma, X.wWein, X.wMom, X.wTurt, macd, ob, ck];
};
E.lab = function (X) {
  const sigs = E.labSignals(X), W = X.W, n = W.c.length, nd = X.D.d.length;
  const vote = W.c.map((_, k) => sigs.every(s => s[k] != null) ? sigs.reduce((a, s) => a + s[k], 0) : null);
  const novol = X.D.v.slice(-250).filter(x => !x).length > 25;
  const rules = {
    'No tocar': W.c.map(() => 1),
    'Solo EMA50': sigs[0],
    'Votación 4 de 7': vote.map(v => v == null ? null : v >= 4 ? 1 : 0),
    'EMA50 + confirmación': W.c.map((_, k) => sigs[0][k] == null || vote[k] == null ? null : sigs[0][k] === 1 ? ((vote[k] - 1) >= 3 ? 1 : 0.5) : 0),
    'Todas de acuerdo': vote.map(v => v == null ? null : v === 7 ? 1 : 0)
  };
  const res = {};
  for (const [name, w] of Object.entries(rules)) { const ev = E.evaluate(X.D, weeklyToDaily(W, w, nd), X.start); res[name] = { cagr: ev.all.cagr, dd: ev.all.dd, ratio: ev.all.ratio, trades: ev.trades }; }
  return { res, novol };
};

/* §14 proyección: V = V × (1 + r_m) + C, r_m = (1+tasa)^(1/12) − 1 */
E.project = function (V0, C, years, rate) { const rm = Math.pow(1 + rate, 1 / 12) - 1, out = [V0]; let V = V0; for (let m = 1; m <= years * 12; m++) { V = V * (1 + rm) + C; out.push(V); } return out; };

/* conveniencia: analizar un activo completo */
E.analyze = function (D, ctx) {
  const X = E.prepare(D), L = E.lenses(X, Object.assign({ lastClose: D.c[D.c.length - 1] }, ctx));
  return { X, L, C: E.conclude(L, X) };
};
E.momentum12 = function (D) { const W = E.weekly(D), k = W.c.length - 1; return k >= 52 ? W.c[k - 4] / W.c[k - 52] - 1 : null; };

if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.Engine = E;
})(typeof window !== 'undefined' ? window : globalThis);
