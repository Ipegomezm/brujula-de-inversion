// Pruebas del motor con datos reales de data/ (node tests/test_engine.js)
const fs = require('fs'), path = require('path'), E = require('../src/engine.js');
const R = path.join(__dirname, '..', 'data'), core = JSON.parse(fs.readFileSync(R + '/core.json'));
const load = s => E.decode(JSON.parse(fs.readFileSync(`${R}/t/${s}.json`)));
const auxS = s => E.decode(core.aux[s]);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const p = x => x == null ? '—' : (x * 100).toFixed(2) + '%';
const spyD = load('SPY'), spyMom = E.momentum12(spyD);
function show(sym) {
  const D = load(sym), a = core.assets.find(x => x.s === sym);
  const A = E.analyze(D, { sym, kind: a.k, fund: core.fund[sym], spyMom });
  console.log(`\n== ${sym} (${a.k}) ${E.dayStr(D.d[0])}→${E.dayStr(D.d.at(-1))}, cierre ${D.c.at(-1)}`);
  for (const l of A.L) {
    const ev = l.ev;
    console.log(` ${l.name.padEnd(34)} ${E.sgnTxt(l.s).padEnd(9)} | ${l.txt}`);
    if (ev) console.log(`   prueba: ${ev.verdict}; CAGR ${p(ev.all.cagr)} vs no tocar ${p(ev.hold.cagr)}; peor caída ${p(ev.all.dd)} vs ${p(ev.hold.dd)}; ops ${ev.trades}; ganadoras ${p(ev.winPct)}; ` +
      ev.per.map(q => `[${E.dayStr(q.rule.from)}→${E.dayStr(q.rule.to)} regla ${p(q.rule.cagr)}/${p(q.rule.dd)} vs ${p(q.hold.cagr)}/${p(q.hold.dd)} ${q.win ? 'gana' : 'no'}]`).join(' '));
  }
  console.log(' CONCLUSIÓN:', A.C.label, '|', A.C.warn || '', '|', A.C.trigger, '| confianza', A.C.conf, '-', A.C.why);
  return A;
}
const S = show('SPY');
// 1) EMA de 50 semanas: comparar con cálculo independiente (Python del script) y TradingView
const tv = JSON.parse(fs.readFileSync(R + '/tv.json')).rows.find(r => r.s === 'SPY');
const emaNow = S.L[0].ema;
ok(Math.abs(emaNow / tv.yEma50w - 1) < 1e-4, `EMA50 semanal SPY motor ${emaNow.toFixed(3)} = Python ${tv.yEma50w}`);
console.log(`   TradingView EMA50|1W ${tv.tvEma50w.toFixed(3)} (precio sin ajustar por dividendos): diferencia ${((emaNow / tv.tvEma50w - 1) * 100).toFixed(2)}%`);
// 2) semana = floor((día+3)/7): el 2026-10-26 (lunes) abre semana
const W = S.X.W; ok(new Date(Date.UTC(2026, 9, 26)).getUTCDay() === 1 && Math.floor((Math.round(Date.UTC(2026, 9, 26) / 864e5) + 3) / 7) !== Math.floor((Math.round(Date.UTC(2026, 9, 25) / 864e5) + 3) / 7), 'las semanas empiezan en lunes');
// 3) backtest: no tocar en el motor = cierre final / cierre inicial
const ev = S.L[0].ev, bt = ev.bt; ok(Math.abs(bt.bh.at(-1) - spyD.c.at(-1) / spyD.c[bt.start]) < 1e-9, 'no tocar = C_final / C_inicio');
// 4) exposición siempre 0 o 1 en la regla EMA; costo aplicado: con costo 0 el resultado es mayor
const c0 = E.COST; E.COST = 0; const ev0 = E.evaluate(spyD, S.X.sEma, S.X.start); E.COST = c0;
ok(ev0.all.cagr > ev.all.cagr, `el costo de 0,15% reduce el CAGR (${p(ev0.all.cagr)} sin costo → ${p(ev.all.cagr)} con costo)`);
// 5) señal sin mirar el futuro: cambiar el último día no cambia posiciones pasadas
ok(bt.pos.every((x, i) => i <= bt.start || x === (S.X.sEma[i - 1] || 0)), 'exposición del día i = señal del cierre i−1');
// 6) RSI de Wilder y ATR razonables
ok(S.X.rsi2.slice(300).every(x => x >= 0 && x <= 100), 'RSI(2) en [0,100]');
// 7) otros activos
for (const s of ['QQQ', 'AAPL', 'PMGOLD.AX', 'BTC-USD', 'IVV.AX']) show(s);
// 8) plan, niveles, comparación, clima, laboratorio
const fx = auxS('AUDUSD=X'); const plan = E.plan(S.X, S.L, { capital: 10000, risk: 0.01, fx: fx.c.at(-1), usd: true });
console.log('\nPLAN SPY (A$10.000, 1%):', JSON.stringify(plan, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
ok(plan.lossA <= 100.0001 + 1e-9 && plan.costA <= 10000.0001, 'pérdida ≤ riesgo y costo ≤ capital');
const lv = E.levels(S.X); console.log('NIVELES SPY:', JSON.stringify(lv, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
const spyA = E.toAUD(spyD, fx), ivv = load('IVV.AX'), vs = E.versus(load('QQQ').d.length ? E.toAUD(load('QQQ'), fx) : null, ivv);
console.log('QQQ en A$ frente a IVV.AX:', JSON.stringify({ y1: vs[1], y5: vs[5], all: vs.all, years: [vs.years.won, vs.years.tot], vol: [vs.volA, vs.volB], corr: vs.corr }, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));
for (const y of [1, 5, 10]) console.log(` gemelo ${y}a: SPY US$ ${p(E.retOver(spyD, y))}  SPY→A$ ${p(E.retOver(spyA, y))}  IVV.AX ${p(E.retOver(ivv, y))}`);
const secs = 'XLK XLF XLE XLV XLY XLP XLI XLB XLU'.split(' ').map(auxS);
const cl = E.climate(spyD, secs, auxS('HYG'), auxS('IEF'), auxS('^VIX'), auxS('TLT'));
console.log(`CLIMA hoy: ${cl.value.toFixed(1)} (${cl.zone}); serie desde ${E.dayStr(cl.from)}; componentes:`, Object.entries(cl.now).map(([k, v]) => `${k}=${v.p.toFixed(0)}`).join(' '));
console.table(cl.table.map(r => ({ nivel: r.z, n3: r.n3, med3m: p(r.m3), pos3m: p(r.p3), n12: r.n12, med1a: p(r.m12), pos1a: p(r.p12) })));
ok(cl.value >= 0 && cl.value <= 100, 'termómetro en [0,100]');
console.log('Días de distribución SPY:', E.distributionDays(spyD).map(E.dayStr), 'QQQ:', E.distributionDays(load('QQQ')).map(E.dayStr));
const labRows = {};
for (const s of core.board) { const X = E.prepare(load(s)); labRows[s] = E.lab(X).res; }
const names = Object.keys(labRows.SPY), med = a => { a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
console.log('\nLABORATORIO (activos del tablero):');
const best = {}; for (const s of core.board) { const b = names.reduce((x, y) => labRows[s][y].ratio > labRows[s][x].ratio ? y : x); best[b] = (best[b] || 0) + 1; }
console.table(names.map(n => ({ regla: n, CAGRmed: p(med(core.board.map(s => labRows[s][n].cagr))), caidaMed: p(med(core.board.map(s => labRows[s][n].dd))), ratioMed: med(core.board.map(s => labRows[s][n].ratio)).toFixed(2), mejorEn: best[n] || 0 })));
for (const s of ['SPY', 'QQQ']) console.log(` ${s}: no tocar ${p(labRows[s]['No tocar'].cagr)} / ${p(labRows[s]['No tocar'].dd)}  EMA50 ${p(labRows[s]['Solo EMA50'].cagr)} / ${p(labRows[s]['Solo EMA50'].dd)}`);
const pr = E.project(1000, 100, 10, 0.08); ok(Math.abs(pr.at(-1) - (1000 * 1.08 ** 10 + 100 * ((1.08 ** 10 - 1) / (1.08 ** (1 / 12) - 1)))) < 1e-6, `proyección mensual = fórmula cerrada (${pr.at(-1).toFixed(2)})`);
// 9) capa de precio de hoy: solo sesiones posteriores; pruebas con cierres oficiales
{ const D = load('IVV.AX'), a = core.assets.find(x => x.s === 'IVV.AX'), ctx = { sym: 'IVV.AX', kind: a.k, fund: core.fund['IVV.AX'], spyMom };
  const lastTs = (D.d.at(-1) * 86400) - 3600;  // 23:00 UTC del día anterior = 10:00 AEDT del último día oficial
  const same = E.analyzeLive(D, { time: lastTs, open: 1, high: 1, low: 1, close: 1, volume: 1 }, ctx);
  ok(same.live === null, 'barra del mismo día que el último cierre oficial: se ignora');
  const nextTs = lastTs + 86400, bar = { time: nextTs, open: D.c.at(-1), high: D.c.at(-1) * 1.01, low: D.c.at(-1) * 0.99, close: D.c.at(-1) * 1.005, volume: 1000 };
  const L = E.analyzeLive(D, bar, ctx), O = E.analyze(D, ctx);
  ok(L.live && L.X.D.d.length === D.d.length + 1 && L.X.D.c.at(-1) === bar.close, `barra nueva añadida (${E.dayStr(L.live.day)})`);
  ok(L.L[0].ev.all.cagr === O.L[0].ev.all.cagr && L.L[0].ev.trades === O.L[0].ev.trades, 'la prueba histórica sigue con cierres oficiales');
  ok(D.d.length === load('IVV.AX').d.length, 'la serie oficial no se modifica'); }
console.log(`\n${fails ? fails + ' FALLOS' : 'TODAS LAS PRUEBAS PASAN'}`); process.exit(fails ? 1 : 0);
