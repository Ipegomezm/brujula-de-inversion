// Pruebas de las funciones de tweets del motor (node tests/test_tweets.js)
const E = require('../src/engine.js'), fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const H = t => E.tweetHighlight(t);
ok(H('La FDA aprueba el nuevo fármaco').reasons.includes('Regulador / FDA') && H('La FDA aprueba el nuevo fármaco').important, 'FDA/aprobación → importante');
ok(H('Anunciamos un DESCUBRIMIENTO en baterías').reasons.includes('Descubrimiento'), 'mayúsculas y acentos: descubrimiento');
ok(H('We announce the acquisition of Foo Inc. for $2 billion').reasons.join() === 'Adquisición / fusión,Cifras', 'inglés: adquisición + cifras');
ok(H('Q3 earnings: revenue up 12%; raising full-year guidance').score >= 5, 'resultados + guidance + cifras');
ok(!H('Buenos días, qué lindo día').important && H('Buenos días, qué lindo día').score === 0, 'texto sin noticias → 0');
ok(!H('fdabc unrelated').reasons.length && !H('the second quarterback').reasons.includes('Riesgo') && !H('una operacion opaca').reasons.length, 'no coincide dentro de otra palabra (fdabc, second, opaca)');
ok(H('Descubrimos un yacimiento').reasons.includes('Descubrimiento') && H('SEC investigation').reasons.includes('Riesgo'), 'prefijos (descubr*) y palabras (sec)');
ok(H('Nuevo contrato con el gobierno').reasons.includes('Contrato / alianza') && !H('Nuevo contrato con el gobierno').important, 'contrato solo (2 puntos) → no importante');
ok(E.tweetHighlight('nada', { score: 7, reasons: ['Del generador'] }).score === 7, 'respeta highlight del archivo (máximo)');
const x = '<img src=x onerror=alert(1)>"\'`&';
ok(E.escapeHtml(x) === '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&#96;&amp;' && !/[<>"'`]/.test(E.escapeHtml(x)), 'escapeHtml neutraliza HTML');
const now = Date.parse('2026-10-29T10:00:00Z'), mk = (id, h, txt, extra = {}) => Object.assign({ id, url: 'https://x.com/a/status/' + id, symbol: 'nvda', handle: '@a', author_name: 'A', role: 'empresa', account_status: 'confirmada', created_at: new Date(now - h * 36e5).toISOString(), text: txt }, extra);
const P = E.prepareTweets({ schema_version: 1, source: 'ejemplo', generated_at: '2026-10-29T21:00:00+11:00', tweets: [mk('1', 1, 'a'), mk('2', 30, 'b'), mk('1', 2, 'dup'), mk('3', 24 * 9, 'viejo'), mk('4', 0.5, 'x', { url: 'javascript:alert(1)', role: 'raro', account_status: 'x' }), { id: '5', text: 'sin fecha', handle: 'a' }] }, { now, days: 7 });
ok(P.tweets.map(t => t.id).join() === '4,1,2', 'dedupe por id, orden nuevo→viejo, quita >7 días e inválidos');
ok(P.tweets[0].url === 'https://x.com/a' && P.tweets[0].role === 'empresa' && P.tweets[0].status === 'dudosa', 'url no-X → perfil en x.com; rol/estado desconocidos → empresa/dudosa');
ok(P.tweets[1].symbol === 'NVDA' && P.tweets[1].handle === 'a', 'símbolo en mayúsculas, handle sin @');
ok(P.example === true, 'source "ejemplo" detectado');
ok(E.prepareTweets({ schema_version: 2, tweets: [] }).errors.length === 1, 'avisa de schema_version distinto');
ok(!E.prepareTweets({}).ok, 'documento sin "tweets" → no válido');
const L = P.tweets; ok(E.filterTweets(L, { symbol: ['NVDA'] }).length === 3 && E.filterTweets(L, { role: 'ceo' }).length === 0, 'filtros por activo y rol');
ok(E.newTweetIds(new Set(['1', '2']), L).join() === '4', 'detecta tweets nuevos');
// el archivo de ejemplo publicado es válido y está marcado como ejemplo
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tweets.json')));
const PD = E.prepareTweets(doc, { now: Date.parse(doc.generated_at) });
ok(PD.ok && PD.errors.length === 0 && PD.tweets.length === doc.tweets.length && (doc.source === 'ejemplo' || doc.source === 'x-public-reads'), `data/tweets.json válido (${PD.tweets.length} tweets, source=${doc.source}, importantes ${PD.tweets.filter(t => t.hl.important).length})`);
ok(doc.source === 'ejemplo' ? doc.tweets.every(t => /EJEMPLO FICTICIO/.test(t.text) && /^EJEMPLO_/.test(t.handle)) : doc.tweets.every(t => !/^ejemplo-/.test(t.id) && !/^EJEMPLO_/.test(t.handle) && !/EJEMPLO FICTICIO/.test(t.text)), doc.source === 'ejemplo' ? 'todos los tweets de ejemplo dicen EJEMPLO FICTICIO' : 'datos reales: ningún tweet de ejemplo mezclado');
const js = fs.readFileSync(path.join(__dirname, '..', 'data', 'tweets.js'), 'utf8'); let got; global.window = { __B: (k, o) => got = [k, o] }; eval(js);
ok(got && got[0] === 'tweets.json' && JSON.stringify(got[1]) === JSON.stringify(doc), 'tweets.js = window.__B("tweets.json", <mismo JSON>)');

// enlaces "último tweet" (E.tweetTargets)
{ const mkT = (id, h, sym, role, hrs) => ({ id, handle: h, symbol: sym, role, status: 'confirmada', ts: now - hrs * 36e5, text: 'x', hl: { important: false, reasons: [] } });
  const list = [mkT('9', 'Saylor', 'MSTR', 'ceo', 1), mkT('8', 'Strategy', 'MSTR', 'empresa', 2), mkT('7', 'strategy', 'MSTR', 'empresa', 5), mkT('6', 'elonmusk', 'TSLA', 'ceo', 3), mkT('5', 'otro_dir', 'MSTR', 'ceo', 4)];
  const acc = { symbol: 'MSTR', company_handle: 'Strategy', company_status: 'confirmada', ceo_name: 'Phong Q. Le', ceo_handle: 'phongle', ceo_status: 'confirmada', extra_handles: [{ handle: 'saylor', role: 'Executive Chairman / fundador', status: 'confirmada' }] };
  const T = E.tweetTargets('MSTR', acc, list), by = k => T.filter(t => t.kind === k);
  ok(by('empresa')[0].tweet.id === '8', 'empresa: el tweet más reciente del handle (sin distinguir mayúsculas)');
  ok(by('ceo')[0].tweet === null && by('ceo')[0].reason === 'sin tweets recientes' && by('ceo')[0].label === 'CEO · Phong Q. Le', 'CEO sin tweets → desactivado "sin tweets recientes"');
  ok(by('extra').map(t => t.handle + ':' + (t.tweet && t.tweet.id)).join() === 'saylor:9,otro_dir:5', 'extras de x_accounts (@saylor) y cuentas del feed con ese símbolo');
  const M = E.tweetTargets('MELI', { company_handle: 'MercadoLibre', ceo_handle: null, ceo_status: 'sin cuenta', extra_handles: [{ handle: 'marcos_galperin' }] }, []);
  ok(M.find(t => t.kind === 'ceo').reason === 'sin cuenta' && M.every(t => !t.tweet), 'CEO sin cuenta → motivo "sin cuenta"; sin datos → todo desactivado');
  const N = E.tweetTargets('TSLA', null, list);
  ok(N.find(t => t.kind === 'ceo').tweet.id === '6' && N.find(t => t.kind === 'empresa').reason === 'sin tweets recientes', 'sin x_accounts: usa las cuentas del feed por símbolo; si no hay, "sin tweets recientes"');
  ok(E.tweetTargets('BTC-USD', { company_handle: null, company_status: 'sin cuenta', ceo_handle: null, ceo_status: 'n/a' }, list).every(t => !t.tweet), 'activo sin cuentas: nada activo');
  // con los datos publicados: TSLA tiene empresa y CEO
  const real = E.tweetTargets('TSLA', null, PD.tweets); console.log('   TSLA en data/tweets.json:', real.map(t => `${t.kind}@${t.handle}=${t.tweet ? t.tweet.id : t.reason}`).join(' ')); }
console.log(fails ? fails + ' FALLOS' : 'TODAS LAS PRUEBAS DE TWEETS PASAN'); process.exit(fails ? 1 : 0);
