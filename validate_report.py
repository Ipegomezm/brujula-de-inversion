#!/usr/bin/env python3
"""Informe de validación de data/ (lee lo que escribió fetch_data.py; no descarga nada)."""
import json, os, datetime as dt, statistics as st, collections
R = os.path.dirname(os.path.abspath(__file__)); D = lambda d: (dt.date(1970,1,1)+dt.timedelta(days=d)).isoformat()
c = json.load(open(f"{R}/data/core.json"))
A = c["assets"]
print("generado:", c["generated"], "| última fecha:", D(c["lastDay"]), "| Nasdaq-100 desde:", c["nasdaq100Source"])
print("activos:", len(A), "| por tipo:", dict(collections.Counter(a["k"] for a in A)), "| con datos del negocio:", len(c["fund"]))
for ch, ok in c["validation"]["checks"]: print("  ", "OK " if ok else "FALLA", ch)
print("descartados:", c["validation"]["dropped"], "| errores:", c["validation"]["errors"], "| quoteSummary fallos:", c["validation"]["qsErrors"])
days = [a["days"] for a in A]
print(f"días por activo: mín {min(days)} mediana {st.median(days):.0f} máx {max(days)}; total barras {sum(days)}")
print("primer día más antiguo:", D(min(a['first'] for a in A)), "| desde 2004-01-02:", sum(a['first'] <= 12419 for a in A))
print("los 5 más jóvenes:", [(a['s'], D(a['first']), a['days']) for a in sorted(A, key=lambda a: -a['first'])[:5]])
print("última fecha por activo:", dict(collections.Counter(D(a['last']) for a in A)))
tot = collections.Counter()
for a in A: tot.update(a["chk"])
print("comprobaciones sumadas:", dict(tot))
print("activos con >10% sin volumen (250 días):", [a['s'] for a in A if a['novol250'] > 25])
print("activos con saltos >2× o <0,5× tras limpieza:", [a['s'] for a in A if a['chk']['bigJumps']])
# consistencia de un archivo t/ y decodificación
for s in ("SPY", "BTC-USD", "PMGOLD.AX"):
    t = json.load(open(f"{R}/data/t/{s}.json")); acc = 0; ds = []
    for x in t["t"]: acc += x; ds.append(acc)
    n = len(ds); assert all(len(t[k]) == n for k in "ohlcv")
    nul = sum(v is None for k in "ohlc" for v in t[k])
    print(f"{s}: {n} barras {D(ds[0])}→{D(ds[-1])}, nulos {nul}, último cierre {t['c'][-1]}, max hueco {max(b-a for a,b in zip(ds,ds[1:]))} días")
f = c["fund"]; need = ["trailingPE","forwardPE","earningsGrowth","returnOnEquity","targetMeanPrice"]
st_ = [a["s"] for a in A if a["k"] == "stock"]
print("acciones con cada campo de la lente 8:", {k: sum(1 for s in st_ if k in f.get(s, {})) for k in need}, "de", len(st_))
if os.path.exists(f"{R}/data/tv.json"):
    tv = json.load(open(f"{R}/data/tv.json")); rows = tv["rows"]
    dc = [abs(r["dClosePct"]) for r in rows]; de = [abs(r["dEmaPct"]) for r in rows if r["dEmaPct"] is not None]
    print(f"TradingView: {tv['notes']} emparejados {tv['matched']}; |Δcierre| mediana {st.median(dc):.2f}% máx {max(dc):.2f}%; |ΔEMA50 semanal| mediana {st.median(de):.2f}% máx {max(de):.2f}%")
    print("  mayores diferencias de EMA:", [(r['s'], r['dEmaPct']) for r in sorted(rows, key=lambda r: -abs(r['dEmaPct'] or 0))[:6]])
    print("  mayores diferencias de cierre:", [(r['s'], r['dClosePct']) for r in sorted(rows, key=lambda r: -abs(r['dClosePct']))[:6]])
