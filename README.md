# Brújula de Inversión

Página familiar y educativa (español) según `prompt-brujula.txt`. Uso local, sin servidor: abrir `index.html` con doble clic.

## Archivos
| Archivo | Qué es |
|---|---|
| `fetch_data.py` | Descarga (Yahoo Finance) + limpieza + validación; escribe `data/` |
| `validate_report.py` | Informe de validación de `data/` (no descarga) |
| `src/engine.js` | Motor de cálculo puro (sin DOM): velas semanales, 8 miradas, conclusión, backtests, plan, niveles, clima, laboratorio, proyección |
| `src/app.js`, `src/content.js`, `src/style.css`, `src/template.html` | Interfaz, textos, estilos |
| `build.py` | Une todo en `index.html` (un solo archivo; el motor va en su propio `<script>`) |
| `tests/test_engine.js` | Pruebas del motor con datos reales (`node tests/test_engine.js`) |
| `tests/crosscheck_backtest.py` | Reimplementación independiente en Python de la prueba EMA50 |
| `write_tweets.py` | Escribe `data/tweets.json` + `.js` validados |
| `tests/test_tweets.js`, `tests/test_write_tweets.py` | Pruebas de tweets |
| `update.sh` | Actualización diaria (no programada; ver comentario) |

## Uso
```
python3 fetch_data.py          # ~25 s; exit 0 = validado y publicado en data/
python3 validate_report.py
node tests/test_engine.js
python3 tests/crosscheck_backtest.py SPY
python3 build.py               # regenera index.html
```

## Datos
* Precios: `https://query2.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&period1=2004-01-01&period2=now&events=div,split`.
  o,h,l,c × (adjclose ÷ close). Volumen sin tocar.
* Negocio: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}?modules=summaryDetail,defaultKeyStatistics,financialData,netSharePurchaseActivity,majorHoldersBreakdown,calendarEvents,recommendationTrend&crumb=…`
  con la cookie de `https://fc.yahoo.com` y el crumb de `https://query1.finance.yahoo.com/v1/test/getcrumb`. Sin cuenta.
  Nota: con `User-Agent` largo de Chrome Yahoo responde 429; con `Accept: application/json` getcrumb responde 406.
* Nasdaq-100: lista actual de `https://api.nasdaq.com/api/quote/list-type/nasdaq100` (copia en `data/nasdaq100_cache.json` si falla).
* Salida: `data/core.json` (activos, negocio, auxiliares, validación), `data/t/{sym}.json` (t en diferencias de días desde 1970,
  o,h,l,c con 5 cifras significativas, v ÷ 100). Cada `.json` tiene un `.js` gemelo (`window.__B(...)`) porque los navegadores
  bloquean `fetch` en `file://`; en http(s) se usa el `.json`.
* Limpieza: o/h/l en cero → cierre; ETF: saltos > 2,2× o < 0,45× (pico de un día → se borra; cambio de nivel → se reescala lo anterior);
  < 300 días → descartado. Extras (documentados): se quita la barra de hoy si la sesión sigue abierta; si Yahoo deja vacío el cierre de
  la última sesión ya cerrada se usa `meta.regularMarketPrice`; en cripto un cierre vacío = apertura del día siguiente; si la historia
  inicial es irregular (huecos > 14 días, p. ej. PMGOLD.AX mensual hasta 2020) se empieza tras el último hueco.

## TradingView (solo verificación cruzada)
* Endpoint: `POST https://scanner.tradingview.com/{america|australia|crypto}/scan` con JSON `{filter|symbols, columns, range}`.
* **No es una API oficial** ni documentada; sin clave, sin cuenta, sin cookies. Puede cambiar, limitarse o bloquearse sin aviso, y los
  términos de uso de TradingView restringen la extracción automatizada. Se hacen 3 peticiones por ejecución y no se usa para calcular nada.
* Campos: name, exchange, type, currency, close, `EMA50|1W`, `SMA30|1W`, RSI, MACD.macd, MACD.signal, Recommend.All, update_mode.
* Retraso: `delayed_streaming_900` (15 min, EE.UU.), `delayed_streaming_1200` (20 min, ASX), cripto `streaming`.
* TradingView no ajusta por dividendos: su EMA50 semanal difiere de la nuestra (mediana 0,4%; hasta ~6% en ETF de altos dividendos
  como QQQI, QYLD, SPYI, JEPI). Durante la sesión del ASX su "close" es el precio intradía de hoy.

## Botón "Refrescar" (arriba a la derecha)
Al tocarlo: (1) vuelve a leer `data/core.json`, `data/tv.json` y cada `data/t/*.json` con `?v=<hora>` y `cache: no-store`
(se salta la caché del navegador y de GitHub Pages); (2) pide a TradingView (scanner público, sin clave) el precio de hoy de los
166 activos y el AUDUSD; (3) recalcula todo y muestra "Refrescado: dd/mm/aaaa hh:mm (hora de Sídney, AEDT/AEST)".
* Un precio de TradingView solo se usa si es de una sesión **posterior** al último cierre oficial; se marca **hoy** (provisional).
  Se recalculan las lecturas (miradas, conclusión, plan, niveles, ranking); las **pruebas históricas y la confianza siguen con cierres
  oficiales**. El clima, el laboratorio y los campeones usan solo cierres oficiales. El AUDUSD de hoy se usa en el plan.
* El navegador **no puede** ejecutar `fetch_data.py`: los cierres oficiales solo cambian si alguien ejecuta el script
  (en el ordenador, con `update.sh`, o con la Action de abajo).
* CORS comprobado (29-10-2026, Chrome headless desde `file://` y `http://127.0.0.1`; curl con `Origin: https://ipegomezm.github.io`):
  Yahoo chart v8/spark devuelven 200 **sin** `Access-Control-Allow-Origin` → el navegador los bloquea; Yahoo v7 quote → 401.
  TradingView scanner refleja el origen (`Access-Control-Allow-Origin: <origen>` o `null`) y funciona con POST "simple"
  (cuerpo text/plain); con `Content-Type: application/json` falla el preflight (solo permite `Referer,Accept`).
  Coinbase, Binance y CoinGecko envían `Access-Control-Allow-Origin: *` (solo cripto; no se usan).

## Opción: GitHub Action (borrador, NO activado)
`.github/workflows/update-data.yml` ejecutaría `fetch_data.py` de martes a sábado a las 07:30 AEDT, pasaría las pruebas y haría
commit solo de `data/`. Está solo en local: **no se ha subido ni activado**; necesita el visto bueno de Felipe. Ojo: `data/` pesa
~60 MB (cada archivo va en .json y .js) y cambia a diario; Yahoo podría limitar (429) las IP de GitHub; no está probado allí.

## Columna de tweets (izquierda en pantallas ≥ 1300 px; cajón inferior en el teléfono)
Lee `data/tweets.json` (formato: `docs/tweets-format.md`; escribir con `write_tweets.py`). Revisa cada 5 min y al refrescar; filtros
por activo / "Mi tablero" / rol / solo importantes; marca las cuentas dudosas; enlaza a x.com; destaca por palabras clave
(`Engine.tweetHighlight`, probado en `tests/test_tweets.js`). **Ahora solo hay datos de EJEMPLO** (`source: "ejemplo"`, aviso grande).

## Límites
No es en vivo; sesgo de supervivencia; la conclusión es una regla, no una garantía. Uso educativo, no asesoría financiera.
