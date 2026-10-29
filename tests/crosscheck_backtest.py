"""Verificación independiente (Python) de la prueba de la regla EMA50 semanal en SPY.
Reimplementa desde cero: semanas, EMA, señal al cierre semanal, ejecución a la apertura siguiente, 0,15%."""
import json, itertools, math, sys
sym = sys.argv[1] if len(sys.argv) > 1 else "SPY"
t = json.load(open(f"data/t/{sym}.json")); d = list(itertools.accumulate(t["t"])); o, c = t["o"], t["c"]
weeks = {}
for i, day in enumerate(d): weeks.setdefault((day + 3) // 7, []).append(i)
wl = [v[-1] for k, v in sorted(weeks.items())]
k2 = 2 / 51; e = None; sig = [None] * len(d)
for n, i in enumerate(wl):
    e = c[i] if e is None else c[i] * k2 + e * (1 - k2)
    if n >= 49: sig[i] = 1 if c[i] > e else 0
cur = None
for i in range(len(d)):
    if sig[i] is None: sig[i] = cur
    else: cur = sig[i]
start = wl[min(52, len(wl) - 1)]
eq = [1.0]; prev = 0; peak = 1; dd = 0; trades = 0
for i in range(start + 1, len(d)):
    a = sig[i - 1] or 0
    f = 1 + prev * (o[i] / c[i - 1] - 1)
    if a != prev:
        f *= 1 - 0.0015 * abs(a - prev); trades += (prev == 0 and a > 0)
    f *= 1 + a * (c[i] / o[i] - 1); eq.append(eq[-1] * f); prev = a
    peak = max(peak, eq[-1]); dd = min(dd, eq[-1] / peak - 1)
yrs = (d[-1] - d[start]) / 365.25
print(f"{sym} EMA50 (Python independiente): CAGR {((eq[-1])**(1/yrs)-1)*100:.2f}%  peor caída {dd*100:.2f}%  operaciones {trades}  desde día {d[start]}")
