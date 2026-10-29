#!/usr/bin/env python3
"""Escribe data/tweets.json y su gemelo data/tweets.js (formato: docs/tweets-format.md, schema_version 1).

Uso:
  python3 write_tweets.py entrada.json --source x-public-reads --accounts-checked 120 [--merge] [--days 7] [--cap 500] [--per-handle 40] [--handle-cap elonmusk=5]
  cat lista.json | python3 write_tweets.py - --source x-public-reads

La entrada es una LISTA JSON de tweets (o un documento con "tweets"). Valida cada tweet, descarta los inválidos
(y lo dice), deduplica por id (gana el más reciente en la entrada), ordena del más nuevo al más viejo, quita los
de más de N días y recorta a --cap. Escribe de forma atómica (archivo temporal + rename). Código 0 = escrito.
"""
import argparse, json, os, sys, tempfile, datetime as dt
ROOT = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(ROOT, "data")
SCHEMA = 1
REQ = ("id", "url", "symbol", "handle", "author_name", "role", "account_status", "created_at", "text")

def parse_ts(s):
    t = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    if t.tzinfo is None: raise ValueError("created_at sin zona horaria")
    return t

def clean(t):
    miss = [k for k in REQ if t.get(k) in (None, "")]
    if miss: raise ValueError(f"faltan {miss}")
    if t["role"] not in ("empresa", "ceo"): raise ValueError("role debe ser 'empresa' o 'ceo'")
    if t["account_status"] not in ("confirmada", "dudosa"): raise ValueError("account_status debe ser 'confirmada' o 'dudosa'")
    if not str(t["url"]).startswith(("https://x.com/", "https://twitter.com/")): raise ValueError("url debe empezar por https://x.com/")
    if not isinstance(t["text"], str) or len(t["text"]) > 5000: raise ValueError("text inválido")
    parse_ts(t["created_at"])
    out = {k: t[k] for k in REQ}
    out["id"] = str(out["id"]); out["symbol"] = str(out["symbol"]).upper(); out["handle"] = str(out["handle"]).lstrip("@")
    if isinstance(t.get("metrics"), dict):
        out["metrics"] = {k: int(v) for k, v in t["metrics"].items() if k in ("likes", "reposts", "replies", "views") and isinstance(v, (int, float))}
    h = t.get("highlight")
    if isinstance(h, dict) and isinstance(h.get("score"), (int, float)):
        out["highlight"] = {"score": max(0, min(10, h["score"])), "reasons": [str(r) for r in h.get("reasons", [])][:8]}
    return out

def atomic(path, text):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-"); os.write(fd, text.encode("utf-8")); os.close(fd); os.replace(tmp, path)

def build(items, source, accounts, days, cap, now=None, existing=None, per_handle=0, handle_caps=None):
    now = now or dt.datetime.now(dt.timezone.utc).astimezone()
    pool, errors = {}, []
    for t in (existing or []) + items:          # lo de la entrada pisa a lo existente con el mismo id
        try: c = clean(t); pool[c["id"]] = c
        except Exception as e: errors.append(f"{t.get('id', '?') if isinstance(t, dict) else '?'}: {e}")
    cutoff = now - dt.timedelta(days=days)
    keep = sorted((t for t in pool.values() if parse_ts(t["created_at"]) >= cutoff), key=lambda t: (parse_ts(t["created_at"]), t["id"]), reverse=True)
    hc = {k.lower().lstrip("@"): v for k, v in (handle_caps or {}).items()}
    if (per_handle and per_handle > 0) or hc:        # límite por cuenta (los más recientes de cada handle)
        seen, capped = {}, []
        for t in keep:
            h = t["handle"].lower(); seen[h] = seen.get(h, 0) + 1
            lim = hc.get(h, per_handle)
            if not lim or lim <= 0 or seen[h] <= lim: capped.append(t)
        keep = capped
    keep = keep[:cap]
    doc = {"schema_version": SCHEMA, "generated_at": now.isoformat(timespec="seconds"), "source": source,
           "accounts_checked": accounts, "window_days": days, "tweets": keep}
    return doc, errors

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("input"); ap.add_argument("--source", required=True)
    ap.add_argument("--accounts-checked", type=int, default=0); ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--cap", type=int, default=500); ap.add_argument("--per-handle", type=int, default=40); ap.add_argument("--handle-cap", action="append", default=[], metavar="HANDLE=N"); ap.add_argument("--merge", action="store_true"); ap.add_argument("--out", default=DATA)
    a = ap.parse_args()
    caps = {}
    for x in a.handle_cap:
        try: h, n = x.split("=", 1); caps[h.strip().lstrip("@").lower()] = int(n)
        except ValueError: sys.exit(f"--handle-cap inválido: {x} (usa HANDLE=N, p. ej. elonmusk=5)")
    raw = json.load(sys.stdin if a.input == "-" else open(a.input, encoding="utf-8"))
    items = raw["tweets"] if isinstance(raw, dict) else raw
    if not isinstance(items, list): sys.exit("La entrada debe ser una lista de tweets")
    existing = []
    p = os.path.join(a.out, "tweets.json")
    if a.merge and os.path.exists(p): existing = json.load(open(p, encoding="utf-8")).get("tweets", [])
    doc, errors = build(items, a.source, a.accounts_checked, a.days, a.cap, existing=existing, per_handle=a.per_handle, handle_caps=caps)
    s = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    os.makedirs(a.out, exist_ok=True)
    atomic(p, s); atomic(os.path.join(a.out, "tweets.js"), f'window.__B&&window.__B("tweets.json",{s});')
    print(f"tweets.json: {len(doc['tweets'])} tweets (de {len(items)} recibidos{', + existentes' if existing else ''}); descartados: {len(errors)}")
    for e in errors: print("  ", e)
    return 0

if __name__ == "__main__":
    sys.exit(main())
