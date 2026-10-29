"""Pruebas de write_tweets.build (python3 tests/test_write_tweets.py)."""
import sys, os, datetime as dt
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from write_tweets import build
now = dt.datetime(2026, 10, 29, 21, 0, tzinfo=dt.timezone(dt.timedelta(hours=11)))
def mk(i, h, **k):
    t = dict(id=i, url=f"https://x.com/a/status/{i}", symbol="nvda", handle="@a", author_name="A", role="empresa",
             account_status="confirmada", created_at=(now - dt.timedelta(hours=h)).isoformat(), text="t" + str(i)); t.update(k); return t
items = [mk(1, 1), mk(2, 5), mk(1, 0.5, text="más nuevo"), mk(3, 24 * 8), mk(4, 2, url="http://evil"), mk(5, 3, role="x"), mk(6, 1, created_at="2026-10-29T10:00:00")]
doc, err = build(items, "prueba", 3, 7, 500, now=now)
ids = [t["id"] for t in doc["tweets"]]
fails = 0
def ok(c, m):
    global fails; print(("PASS " if c else "FAIL ") + m); fails += (not c)
ok(ids == ["1", "2"], f"dedupe (gana el último), orden, ventana de 7 días: {ids}")
ok(doc["tweets"][0]["text"] == "más nuevo" and doc["tweets"][0]["handle"] == "a" and doc["tweets"][0]["symbol"] == "NVDA", "normaliza handle/símbolo")
ok(len(err) == 3, f"rechaza url no-X, rol inválido y fecha sin zona: {err}")
ok(doc["schema_version"] == 1 and doc["generated_at"].endswith("+11:00") and doc["source"] == "prueba" and doc["accounts_checked"] == 3, "cabecera del documento")
doc2, _ = build([mk(i, i / 100) for i in range(20)], "p", 0, 7, 5, now=now); ok(len(doc2["tweets"]) == 5, "tope --cap")
print("TODAS PASAN" if not fails else f"{fails} FALLOS"); sys.exit(1 if fails else 0)
