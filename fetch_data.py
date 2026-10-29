#!/usr/bin/env python3
"""
Brújula de Inversión — script de descarga de datos (Fase 1 del prompt).

Fuente principal: Yahoo Finance (endpoints públicos, sin cuenta):
  * Precios diarios: https://query2.finance.yahoo.com/v8/finance/chart/{símbolo}
        ?interval=1d&period1=<2004-01-01>&period2=<ahora>&events=div,split
    Se ajustan o,h,l,c por dividendos y splits con el factor adjclose ÷ close.
  * Datos del negocio: https://query2.finance.yahoo.com/v10/finance/quoteSummary/{símbolo}
        ?modules=summaryDetail,defaultKeyStatistics,financialData,netSharePurchaseActivity,
                 majorHoldersBreakdown,calendarEvents,recommendationTrend&crumb=<crumb>
    Requiere la cookie pública de https://fc.yahoo.com y el crumb de
    https://query1.finance.yahoo.com/v1/test/getcrumb (sin iniciar sesión).

Fuente secundaria (solo verificación cruzada, opcional): TradingView "scanner"
  POST https://scanner.tradingview.com/{america|australia|crypto|forex}/scan
  * NO es una API oficial ni documentada. Sin clave, sin cuenta, sin cookies.
  * Puede cambiar o desaparecer sin aviso; puede limitar o bloquear peticiones
    automatizadas; los términos de uso de TradingView restringen la extracción
    automatizada. Por eso se usa una sola petición por mercado y por día, y solo
    como comparación (nunca para calcular las señales de la página).
  * Datos con retraso (update_mode "delayed_streaming_900" = 15 min en EE.UU.,
    "delayed_streaming_1200" = 20 min en ASX; cripto "streaming").
  * Campos usados: name, exchange, type, currency, close, EMA50|1W (EMA 50 semanal),
    SMA30|1W, RSI (14 diario), MACD.macd, MACD.signal, Recommend.All, update_mode.

Salidas (escribe en data_new/, valida, y solo si pasa la validación reemplaza data/):
  data/core.json         lista de activos, datos del negocio, series auxiliares
  data/t/{símbolo}.json  t (días desde 1970, en diferencias), o,h,l,c (5 cifras
                         significativas), v (volumen ÷ 100)
  data/tv.json           verificación cruzada con TradingView (opcional)
  data/*.js              copia de lo mismo como `window.__B(...)`, para abrir la
                         página con file:// (los navegadores bloquean fetch en file://)

Uso:  python3 fetch_data.py [--no-tv] [--only SYM1,SYM2] [--workers 4]
Código de salida 0 = descargado y validado; 1 = validación fallida (data/ intacta).
"""
import argparse, json, math, os, shutil, sys, time, datetime as dt
from concurrent.futures import ThreadPoolExecutor
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0"   # el UA largo de Chrome recibe 429 desde algunos servidores; este no
START = int(dt.datetime(2004, 1, 1, tzinfo=dt.timezone.utc).timestamp())
QS_MODULES = ("summaryDetail,defaultKeyStatistics,financialData,netSharePurchaseActivity,"
              "majorHoldersBreakdown,calendarEvents,recommendationTrend")

SP_BIG = "BRK-B JPM V MA UNH LLY XOM JNJ PG HD KO MRK ABBV CVX BAC ORCL CRM MCD DIS NKE IBM GE CAT GS MS T VZ PFE BA UBER VST TSM".split()
US_ETF = "SPY QQQ VT IWM RSP SCHD JEPI QYLD QQQI SPYI SMH SOXX GLD SLV TLT".split()
ASX = "PMGOLD.AX HACK.AX FANG.AX SEMI.AX ETHI.AX QAU.AX IOZ.AX VAS.AX VGS.AX NDQ.AX A200.AX IVV.AX BHP.AX CBA.AX CSL.AX WES.AX MQG.AX FMG.AX".split()
CRYPTO = ["BTC-USD", "ETH-USD"]
AUX = "AUDUSD=X ^VIX TLT IEF HYG RSP XLK XLF XLE XLV XLY XLP XLI XLB XLU".split()
EXTRA_AUX = ["^GSPC"]   # S&P 500 sin dividendos: no se usa; el S&P se mide con SPY
BOARD = "SPY QQQ PMGOLD.AX AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO BTC-USD".split()
SWAP = {"SPY": "IVV.AX", "QQQ": "NDQ.AX", "GLD": "PMGOLD.AX"}
TWINS = [["SPY", "IVV.AX"], ["QQQ", "NDQ.AX"], ["GLD", "PMGOLD.AX"], ["VT", "VGS.AX"]]
GOLD_SILVER = {"GLD", "SLV", "PMGOLD.AX", "QAU.AX"}
MIN_DAYS = 300

S = requests.Session(); S.headers.update({"User-Agent": UA})  # sin "Accept: application/json": getcrumb responde 406
LOG = []
def log(*a):
    m = " ".join(str(x) for x in a); LOG.append(m); print(m, flush=True)

def get(url, params=None, tries=5):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=30)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** i + 1); continue
            return r
        except requests.RequestException:
            time.sleep(2 ** i + 1)
    return None

# ---------- universo ----------
def nasdaq100():
    """Miembros actuales del Nasdaq-100 desde la API pública de nasdaq.com.
    Si falla, usa la última lista guardada (data/nasdaq100_cache.json)."""
    cache = os.path.join(ROOT, "data", "nasdaq100_cache.json")
    try:
        r = S.get("https://api.nasdaq.com/api/quote/list-type/nasdaq100", timeout=30)
        rows = r.json()["data"]["data"]["rows"]
        syms = sorted({x["symbol"].strip().replace(".", "-").replace("/", "-") for x in rows})
        if len(syms) >= 95:
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            json.dump({"date": dt.date.today().isoformat(), "symbols": syms}, open(cache, "w"))
            return syms, "api.nasdaq.com"
    except Exception as e:
        log("AVISO nasdaq100:", e)
    if os.path.exists(cache):
        c = json.load(open(cache)); return c["symbols"], "cache " + c["date"]
    raise SystemExit("No se pudo obtener la lista del Nasdaq-100")

# ---------- precios ----------
def sig5(x):
    return float(f"{x:.5g}")

def fetch_chart(sym):
    r = get(f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}",
            {"interval": "1d", "period1": START, "period2": int(time.time()) + 86400,
             "events": "div,split", "includeAdjustedClose": "true"})
    if r is None or r.status_code != 200:
        return {"sym": sym, "error": f"HTTP {getattr(r, 'status_code', 'sin respuesta')}"}
    try:
        res = r.json()["chart"]["result"][0]
    except Exception:
        return {"sym": sym, "error": "respuesta sin datos"}
    meta = res.get("meta", {}); ts = res.get("timestamp") or []
    q = (res.get("indicators", {}).get("quote") or [{}])[0]
    adj = ((res.get("indicators", {}).get("adjclose") or [{}])[0]).get("adjclose")
    off = meta.get("gmtoffset", 0) or 0
    now = time.time()
    reg = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
    bars, stats = {}, {"null": 0, "zero_fixed": 0, "dup": 0, "partial_dropped": 0, "close_from_meta": 0}
    for i, t in enumerate(ts):
        o, h, l, c, v = (q.get(k, [None] * len(ts))[i] for k in ("open", "high", "low", "close", "volume"))
        if c is None and i == len(ts) - 1 and meta.get("regularMarketPrice") and \
                meta.get("instrumentType") != "CRYPTOCURRENCY" and reg.get("end") and now >= reg["end"] and \
                int((meta.get("regularMarketTime", 0) + off) // 86400) == int((t + off) // 86400):
            # Yahoo deja a veces el cierre de la última sesión vacío durante horas tras el cierre:
            # se toma el precio oficial de cierre de meta.regularMarketPrice (sesión ya terminada).
            c = meta["regularMarketPrice"]; adj = None if adj is None else adj[:i] + [c]
            h = h or meta.get("regularMarketDayHigh"); l = l or meta.get("regularMarketDayLow")
            stats["close_from_meta"] = 1
        if c is None and meta.get("instrumentType") == "CRYPTOCURRENCY" and i + 1 < len(ts):
            # Cripto opera 24 h: el cierre de un día = la apertura del día siguiente
            nxt = q.get("open", [None] * len(ts))[i + 1]
            if nxt: c = nxt; stats["close_from_next_open"] = stats.get("close_from_next_open", 0) + 1
        if c is None or c <= 0:
            stats["null"] += 1; continue
        f = 1.0
        if adj and adj[i] is not None and c:
            f = adj[i] / c
        # Limpieza: apertura, máximo o mínimo en cero (o vacíos) -> cierre
        fixed = False
        if not o: o, fixed = c, True
        if not h: h, fixed = c, True
        if not l: l, fixed = c, True
        stats["zero_fixed"] += fixed
        h = max(h, o, c); l = min(l, o, c)
        day = int((t + off) // 86400)
        if day in bars: stats["dup"] += 1
        bars[day] = [o * f, h * f, l * f, c * f, (v or 0)]
    days = sorted(bars)
    # Quitar la barra de hoy si la sesión sigue abierta (no es un cierre)
    if days:
        last = days[-1]
        if meta.get("instrumentType") == "CRYPTOCURRENCY":
            if (now + off) // 86400 == last:
                del bars[last]; days.pop(); stats["partial_dropped"] = 1
        elif reg.get("start") and reg.get("end") and reg["start"] <= now < reg["end"] and \
                int((reg["start"] + off) // 86400) == last:
            del bars[last]; days.pop(); stats["partial_dropped"] = 1
    rows = [[d] + bars[d] for d in days]
    # Historia irregular al principio (p. ej. PMGOLD.AX trae solo un precio al mes hasta 2020):
    # se empieza después del último hueco de más de 14 días naturales (no cripto).
    if meta.get("instrumentType") != "CRYPTOCURRENCY":
        cut = 0
        for i in range(1, len(rows)):
            if rows[i][0] - rows[i - 1][0] > 14: cut = i
        if cut: stats["trimmed_before"] = rows[cut][0]; stats["trimmed_rows"] = cut; rows = rows[cut:]
    return {"sym": sym, "meta": meta, "rows": rows, "stats": stats}

def fix_etf_scale(rows, sym):
    """ETF: corregir cambios de escala de Yahoo. Salto > 2,2× o < 0,45× de un día al
    otro: si es un pico de un día (el día siguiente vuelve) se borra la barra; si es
    un cambio de nivel permanente, se reescala todo lo anterior."""
    fixes = []; i = 1
    while i < len(rows):
        r = rows[i][4] / rows[i - 1][4]
        if r > 2.2 or r < 0.45:
            if i + 1 < len(rows):
                back = rows[i + 1][4] / rows[i - 1][4]
                if 0.45 <= back <= 2.2:
                    fixes.append(("pico borrado", rows[i][0])); del rows[i]; continue
            for j in range(i):
                rows[j] = [rows[j][0]] + [x * r for x in rows[j][1:5]] + [rows[j][5]]
            fixes.append((f"reescalado ×{r:.4g}", rows[i][0]))
        i += 1
    for f in fixes: log(f"  {sym}: {f[0]} en {dt.date(1970,1,1)+dt.timedelta(days=f[1])}")
    return fixes

def encode(rows):
    t, o, h, l, c, v = [], [], [], [], [], []
    prev = 0
    for d, oo, hh, ll, cc, vv in rows:
        t.append(d - prev); prev = d
        o.append(sig5(oo)); h.append(sig5(hh)); l.append(sig5(ll)); c.append(sig5(cc))
        v.append(int(round((vv or 0) / 100)))
    return {"t": t, "o": o, "h": h, "l": l, "c": c, "v": v}

# ---------- datos del negocio ----------
import threading
CRUMB = None; _CL = threading.Lock()
def crumb():
    global CRUMB
    with _CL:
        return _crumb()
def _crumb():
    global CRUMB
    if CRUMB: return CRUMB
    try: S.get("https://fc.yahoo.com", timeout=30)   # deja la cookie A3/A1 (responde 404, es normal)
    except requests.RequestException: pass
    for i in range(5):
        r = S.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=30)
        if r.status_code == 200 and r.text and "<" not in r.text:
            CRUMB = r.text.strip(); return CRUMB
        time.sleep(2 ** i + 1)
    raise RuntimeError("sin crumb")

def raw(d, k):
    x = (d or {}).get(k)
    if isinstance(x, dict): return x.get("raw", None) if "raw" in x else None
    return x

def fetch_qs(sym):
    try: cr = crumb()
    except RuntimeError as e: return sym, None, str(e)
    r = get(f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}",
            {"modules": QS_MODULES, "crumb": cr})
    if r is None: return sym, None, "sin respuesta"
    if r.status_code != 200: return sym, None, f"HTTP {r.status_code}"
    try: res = r.json()["quoteSummary"]["result"][0]
    except Exception: return sym, None, "sin resultado"
    sd, ks, fd = res.get("summaryDetail", {}), res.get("defaultKeyStatistics", {}), res.get("financialData", {})
    ns, mh, ce = res.get("netSharePurchaseActivity", {}), res.get("majorHoldersBreakdown", {}), res.get("calendarEvents", {})
    rt = (res.get("recommendationTrend", {}) or {}).get("trend") or []
    earn = (ce.get("earnings") or {}).get("earningsDate") or []
    out = {
        "trailingPE": raw(sd, "trailingPE"), "forwardPE": raw(sd, "forwardPE") or raw(ks, "forwardPE"),
        "dividendYield": raw(sd, "dividendYield") or raw(sd, "yield"), "marketCap": raw(sd, "marketCap"),
        "beta": raw(sd, "beta") or raw(ks, "beta3Year"), "hi52": raw(sd, "fiftyTwoWeekHigh"), "lo52": raw(sd, "fiftyTwoWeekLow"),
        "totalAssets": raw(sd, "totalAssets") or raw(ks, "totalAssets"), "expenseRatio": raw(ks, "annualReportExpenseRatio"),
        "priceToBook": raw(ks, "priceToBook"), "pegRatio": raw(ks, "pegRatio"),
        "earningsQuarterlyGrowth": raw(ks, "earningsQuarterlyGrowth"),
        "category": ks.get("category"), "fundFamily": ks.get("fundFamily"),
        "currentPrice": raw(fd, "currentPrice"), "targetMeanPrice": raw(fd, "targetMeanPrice"),
        "numberOfAnalystOpinions": raw(fd, "numberOfAnalystOpinions"), "recommendationKey": fd.get("recommendationKey"),
        "returnOnEquity": raw(fd, "returnOnEquity"), "earningsGrowth": raw(fd, "earningsGrowth"),
        "revenueGrowth": raw(fd, "revenueGrowth"), "profitMargins": raw(fd, "profitMargins"),
        "debtToEquity": raw(fd, "debtToEquity"), "financialCurrency": fd.get("financialCurrency"),
        "insiderNetPct": raw(ns, "netPercentInsiderShares"), "insiderBuys": raw(ns, "buyInfoCount"), "insiderSells": raw(ns, "sellInfoCount"),
        "insidersPct": raw(mh, "insidersPercentHeld"), "institutionsPct": raw(mh, "institutionsPercentHeld"),
        "nextEarnings": raw(earn[0], "raw") if earn and isinstance(earn[0], dict) else None,
        "exDividendDate": raw(ce, "exDividendDate"),
        "reco": ({k: rt[0].get(k) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")} if rt else None),
    }
    if earn and isinstance(earn[0], dict): out["nextEarnings"] = earn[0].get("raw")
    out = {k: v for k, v in out.items() if v not in (None, {}, "")}
    return sym, out, None

# ---------- TradingView (opcional, no oficial) ----------
def tv_scan(market, payload):
    r = requests.post(f"https://scanner.tradingview.com/{market}/scan", json=payload,
                      headers={"User-Agent": UA, "Content-Type": "application/json"}, timeout=30)
    r.raise_for_status(); return r.json()

TV_COLS = ["name", "exchange", "type", "currency", "close", "EMA50|1W", "SMA30|1W", "RSI",
           "MACD.macd", "MACD.signal", "Recommend.All", "update_mode"]
def fetch_tv(us_syms, asx_syms):
    out, notes = {}, []
    def put(market, js, mapper):
        for row in js.get("data", []):
            d = dict(zip(TV_COLS, row["d"]))
            ysym = mapper(d, row["s"])
            if ysym: d["tv"] = row["s"]; out[ysym] = d
    try:
        names = [s.replace("-", ".") for s in us_syms]
        js = tv_scan("america", {"filter": [{"left": "name", "operation": "in_range", "right": names},
                                            {"left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX", "NYSE ARCA", "CBOE"]}],
                                 "columns": TV_COLS, "range": [0, 1000]})
        put("america", js, lambda d, s: d["name"].replace(".", "-") if d["name"].replace(".", "-") in us_syms else None)
        notes.append(f"america: {js.get('totalCount')} filas")
    except Exception as e: notes.append(f"america: ERROR {e}")
    try:
        names = [s[:-3] for s in asx_syms]
        js = tv_scan("australia", {"filter": [{"left": "name", "operation": "in_range", "right": names},
                                              {"left": "exchange", "operation": "equal", "right": "ASX"}],
                                   "columns": TV_COLS, "range": [0, 200]})
        put("australia", js, lambda d, s: d["name"] + ".AX")
        notes.append(f"australia: {js.get('totalCount')} filas")
    except Exception as e: notes.append(f"australia: ERROR {e}")
    try:
        js = tv_scan("crypto", {"symbols": {"tickers": ["BITSTAMP:BTCUSD", "BITSTAMP:ETHUSD"]}, "columns": TV_COLS})
        put("crypto", js, lambda d, s: {"BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD"}.get(d["name"]))
        notes.append(f"crypto: {js.get('totalCount')} filas")
    except Exception as e: notes.append(f"crypto: ERROR {e}")
    return out, notes

# ---------- utilidades de validación ----------
def weekly_ema50(rows):
    wk = {}
    for d, o, h, l, c, v in rows: wk[(d + 3) // 7] = c   # semana = floor((día+3)/7); cierre del último día
    cs = [wk[k] for k in sorted(wk)]
    k = 2 / 51; e = cs[0]
    for c in cs[1:]: e = c * k + e * (1 - k)
    return e, len(cs)

def jsdump(obj, path):
    s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    open(path, "w").write(s)
    key = os.path.relpath(path, os.path.dirname(path) if "/t/" not in path else os.path.dirname(os.path.dirname(path)))
    open(path[:-5] + ".js", "w").write(f"window.__B&&window.__B({json.dumps(key)},{s});")
    return len(s)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--no-tv", action="store_true")
    ap.add_argument("--only"); ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    t0 = time.time()
    nq, nq_src = nasdaq100()
    log(f"Nasdaq-100: {len(nq)} símbolos ({nq_src})")
    universe = list(dict.fromkeys(nq + SP_BIG + US_ETF + ASX + CRYPTO))
    if a.only: universe = [s for s in universe if s in a.only.split(",")]
    aux = [s for s in AUX if s not in universe or True]
    to_get = list(dict.fromkeys(universe + aux))
    log(f"Universo pedido: {len(universe)} activos; auxiliares: {len(aux)}; descargas de precios: {len(to_get)}")

    with ThreadPoolExecutor(a.workers) as ex: charts = {r["sym"]: r for r in ex.map(fetch_chart, to_get)}
    log(f"Precios descargados en {time.time()-t0:.0f}s")

    new = os.path.join(ROOT, "data_new"); shutil.rmtree(new, ignore_errors=True); os.makedirs(os.path.join(new, "t"))
    assets, problems, dropped, series = [], [], [], {}
    for sym in to_get:
        ch = charts[sym]
        if "error" in ch: problems.append(f"{sym}: {ch['error']}"); continue
        rows, meta = ch["rows"], ch["meta"]
        itype = meta.get("instrumentType")
        fixes = fix_etf_scale(rows, sym) if itype == "ETF" else []
        # comprobaciones de cordura por fila
        bad = sum(1 for r in rows if not (r[3] <= min(r[1], r[4]) + 1e-9 and r[2] >= max(r[1], r[4]) - 1e-9))
        nonmono = sum(1 for i in range(1, len(rows)) if rows[i][0] <= rows[i - 1][0])
        jumps = sum(1 for i in range(1, len(rows)) if not 0.5 < rows[i][4] / rows[i - 1][4] < 2)
        series[sym] = rows
        if sym in universe:
            if len(rows) < MIN_DAYS: dropped.append(f"{sym} ({len(rows)} días)"); continue
            kind = ("crypto" if itype == "CRYPTOCURRENCY" else "metal" if sym in GOLD_SILVER
                    else "etf" if itype == "ETF" else "stock")
            novol = sum(1 for r in rows[-250:] if not r[5])
            assets.append({"s": sym, "n": meta.get("longName") or meta.get("shortName") or sym,
                           "k": kind, "cur": meta.get("currency") or ("AUD" if sym.endswith(".AX") else "USD" if sym.endswith("-USD") else None), "ex": meta.get("fullExchangeName") or meta.get("exchangeName"),
                           "first": rows[0][0], "last": rows[-1][0], "days": len(rows),
                           "novol250": novol, "fixes": len(fixes),
                           "chk": {"nulls": ch["stats"]["null"], "zeroFixed": ch["stats"]["zero_fixed"], "hlBad": bad,
                                   "nonMono": nonmono, "bigJumps": jumps, "partialDropped": ch["stats"]["partial_dropped"], "closeFromMeta": ch["stats"]["close_from_meta"], "closeFromNextOpen": ch["stats"].get("close_from_next_open", 0), "trimmedRows": ch["stats"].get("trimmed_rows", 0)}})
            jsdump(encode(rows), os.path.join(new, "t", f"{sym}.json"))
    log(f"Activos válidos: {len(assets)}; descartados (<{MIN_DAYS} días): {dropped}; errores: {problems}")

    # datos del negocio (acciones y ETF; cripto no tiene)
    qs_syms = [x["s"] for x in assets if x["k"] != "crypto"]
    t1 = time.time()
    with ThreadPoolExecutor(min(a.workers, 4)) as ex: qs = list(ex.map(fetch_qs, qs_syms))
    fund, qs_err = {}, []
    for sym, d, err in qs:
        if d: fund[sym] = d
        else: qs_err.append(f"{sym}: {err}")
    log(f"quoteSummary: {len(fund)}/{len(qs_syms)} con datos en {time.time()-t1:.0f}s; fallos: {qs_err}")

    aux_out = {s: encode(series[s]) for s in aux if s in series}
    core = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": "Yahoo Finance (chart v8 + quoteSummary v10)", "nasdaq100Source": nq_src,
            "lastDay": max(x["last"] for x in assets) if assets else None,
            "assets": assets, "fund": fund, "aux": aux_out,
            "board": BOARD, "swap": SWAP, "twins": TWINS,
            "famous": "AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO BRK-B JPM V MA LLY NFLX COST WMT XOM KO DIS MCD".split()}

    tv_ok = None
    if not a.no_tv:
        try:
            us = [x["s"] for x in assets if not x["s"].endswith(".AX") and x["k"] != "crypto"]
            asx = [x["s"] for x in assets if x["s"].endswith(".AX")]
            tv, notes = fetch_tv(us, asx)
            cmp = []
            for x in assets:
                d = tv.get(x["s"])
                if not d or d.get("close") is None: continue
                yc = series[x["s"]][-1][4]; ye, _ = weekly_ema50(series[x["s"]])
                cmp.append({"s": x["s"], "tv": d["tv"], "tvClose": d["close"], "yClose": sig5(yc),
                            "dClosePct": round((d["close"] / yc - 1) * 100, 2),
                            "tvEma50w": d.get("EMA50|1W"), "yEma50w": sig5(ye),
                            "dEmaPct": round((d["EMA50|1W"] / ye - 1) * 100, 2) if d.get("EMA50|1W") else None,
                            "tvRSI": d.get("RSI"), "tvRecommend": d.get("Recommend.All"), "mode": d.get("update_mode")})
            tv_ok = {"generated": core["generated"], "notes": notes, "matched": len(cmp),
                     "disclaimer": "TradingView scanner: endpoint público NO oficial; puede cambiar o limitarse; solo comparación.",
                     "rows": cmp}
            jsdump(tv_ok, os.path.join(new, "tv.json"))
            log(f"TradingView: {notes}; emparejados {len(cmp)}/{len(assets)}")
        except Exception as e:
            log("TradingView falló (no bloquea):", e)

    # ---------- validación del spec (sección 18) ----------
    prev_last = None
    pc = os.path.join(ROOT, "data", "core.json")
    if os.path.exists(pc):
        try: prev_last = json.load(open(pc)).get("lastDay")
        except Exception: pass
    checks = [(f"al menos 150 activos (hay {len(assets)})", len(assets) >= 150 or bool(a.only)),
              (f"al menos 100 con datos del negocio (hay {len(fund)})", len(fund) >= 100 or bool(a.only)),
              (f"última fecha {core['lastDay']} ≥ publicada {prev_last}", prev_last is None or (core["lastDay"] or 0) >= prev_last),
              ("auxiliares completos", all(s in aux_out for s in aux)),
              ("sin filas con máximo/mínimo incoherente", all(x["chk"]["hlBad"] == 0 for x in assets)),
              ("fechas estrictamente crecientes", all(x["chk"]["nonMono"] == 0 for x in assets))]
    checks.append((f"todos con moneda ({[x['s'] for x in assets if not x['cur']]})", all(x["cur"] for x in assets)))
    stale = [x["s"] for x in assets if core["lastDay"] - x["last"] > 5]
    checks.append((f"ningún activo con >5 días de retraso ({stale})", not stale))
    core["validation"] = {"checks": [[c, bool(ok)] for c, ok in checks], "dropped": dropped, "errors": problems, "qsErrors": qs_err}
    size = jsdump(core, os.path.join(new, "core.json"))
    log(f"core.json: {size/1e6:.2f} MB")
    ok = all(c[1] for c in checks)
    for c, v in checks: log(("OK   " if v else "FALLA"), c)
    open(os.path.join(new, "fetch_log.txt"), "w").write("\n".join(LOG))
    if not ok:
        log("VALIDACIÓN FALLIDA: data/ no se toca."); return 1
    # conservar archivos de data/ que este script no genera (p. ej. tweets.json/.js, x_accounts.json de otros procesos)
    olddir = os.path.join(ROOT, "data")
    if os.path.isdir(olddir):
        for f in os.listdir(olddir):
            src = os.path.join(olddir, f)
            if os.path.isfile(src) and not os.path.exists(os.path.join(new, f)): shutil.copy2(src, new)
    old = os.path.join(ROOT, "data_prev"); shutil.rmtree(old, ignore_errors=True)
    if os.path.exists(os.path.join(ROOT, "data")): os.rename(os.path.join(ROOT, "data"), old)
    os.rename(new, os.path.join(ROOT, "data"))
    log(f"Publicado en data/ ({time.time()-t0:.0f}s en total)"); return 0

if __name__ == "__main__":
    sys.exit(main())
