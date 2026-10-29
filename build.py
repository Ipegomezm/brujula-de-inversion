#!/usr/bin/env python3
"""Arma index.html (un solo archivo) a partir de src/: el motor (engine.js) va en su propio
<script>, separado de la interfaz (app.js) y de los textos (content.js)."""
import os
R = os.path.dirname(os.path.abspath(__file__)); S = lambda f: open(os.path.join(R, "src", f), encoding="utf-8").read()
h = S("template.html")
for k, f in (("/*CSS*/", "style.css"), ("/*CONTENT*/", "content.js"), ("/*ENGINE*/", "engine.js"), ("/*APP*/", "app.js")):
    h = h.replace(k, S(f).replace("</script", "<\\/script"), 1)
open(os.path.join(R, "index.html"), "w", encoding="utf-8").write(h); print("index.html", len(h), "bytes")
