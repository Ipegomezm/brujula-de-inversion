# Formato de `data/tweets.json` (schema_version 1)

Lo lee la columna de tweets de `index.html` (función pura `Engine.prepareTweets` en `src/engine.js`).
Lo escribe `write_tweets.py` (valida, deduplica, ordena y escribe los dos archivos de forma atómica).

## Documento
| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `schema_version` | entero | sí | `1`. Si cambia el formato, subir el número; la página avisa si no coincide. |
| `generated_at` | texto ISO 8601 **con zona** | sí | p. ej. `2026-10-29T21:17:58+11:00`. La página lo muestra en hora de Sídney y lo usa como "ahora" para la ventana de días. |
| `source` | texto | sí | `"ejemplo"` = datos inventados (la página muestra un aviso grande **DATOS DE EJEMPLO**). Para datos reales, p. ej. `"x-public-reads"`. |
| `accounts_checked` | entero | sí | Cuántas cuentas se revisaron en esta pasada. |
| `window_days` | entero | no (7) | Se descartan tweets más viejos que `generated_at − window_days`. |
| `tweets` | lista | sí | Del más nuevo al más viejo, sin ids repetidos, máximo 500. |

## Cada tweet
| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | texto | sí | Id del post en X (texto, no número: los ids de X no caben en un double de JS). |
| `url` | texto | sí | Debe empezar por `https://x.com/` o `https://twitter.com/`. Si no, la página enlaza al perfil. |
| `symbol` | texto | sí | Símbolo del universo, como en `core.json` (`NVDA`, `BHP.AX`, `BTC-USD`). |
| `handle` | texto | sí | Sin `@`. |
| `author_name` | texto | sí | Nombre visible. |
| `role` | `"empresa"` \| `"ceo"` | sí | |
| `account_status` | `"confirmada"` \| `"dudosa"` | sí | `dudosa` se muestra con una marca visible "cuenta dudosa". |
| `created_at` | texto ISO 8601 con zona | sí | |
| `text` | texto | sí | Texto plano. La página lo **escapa siempre** (nunca se interpreta como HTML). Máx. 5000 caracteres. |
| `metrics` | objeto | no | `{likes, reposts, replies, views}` enteros. |
| `highlight` | objeto | no | `{score 0–10, reasons[]}`. La página calcula su propio destacado por palabras clave y combina: score = máximo, motivos = unión. |

Destacado en la página (`Engine.tweetHighlight`): palabras clave en español e inglés, sin acentos ni mayúsculas, por palabra entera
(o prefijo): descubrimiento / FDA, aprobación / adquisición, fusión / resultados, earnings / guidance, previsión / contrato, acuerdo /
dividendo, recompra / lanzamiento / riesgo (recall, demanda, SEC, despidos, dimite…) / cifras (%, $, millones). "Importante" si score ≥ 3.

## Gemelo `data/tweets.js` (para abrir la página con `file://`)
Una sola línea, exactamente:
```js
window.__B&&window.__B("tweets.json",<el mismo JSON, sin cambios>);
```
La página pide `data/tweets.json?v=<hora>` con `cache: "no-store"` (https/http) y, si falla o es `file://`, carga `data/tweets.js?v=<hora>`.
Revisa cada 5 minutos y al tocar **Refrescar**; los tweets nuevos entran arriba con una animación.

`data/x_accounts.json` (lo escribe otro proceso; aquí solo se lee si existe) se usa para mostrar cuántas cuentas hay en la lista y
cuántas tienen alguna marcada como dudosa. No tiene gemelo `.js`, así que con `file://` no se lee.

## Escribir
```
python3 write_tweets.py lista.json --source x-public-reads --accounts-checked 120 --merge --days 7 --cap 500 --per-handle 40 --handle-cap elonmusk=5
```
`lista.json` = lista de tweets con los campos de arriba (o un documento con `"tweets"`). `--merge` combina con el `tweets.json`
actual (si se repite un id, gana la entrada nueva). Los tweets inválidos se descartan y se listan.

Nota: `fetch_data.py` reemplaza `data/` al publicar, pero copia los archivos que no genera (tweets.*, x_accounts.json).

## Ejemplo (recortado del `data/tweets.json` de ejemplo; todo es ficticio)
```json
{
 "schema_version": 1,
 "generated_at": "2026-10-29T21:17:58+11:00",
 "source": "ejemplo",
 "accounts_checked": 0,
 "window_days": 7,
 "tweets": [
  {
   "id": "ejemplo-1",
   "url": "https://x.com/search?q=%24NVDA",
   "symbol": "NVDA",
   "handle": "EJEMPLO_NVDA",
   "author_name": "Empresa de ejemplo (NVDA)",
   "role": "empresa",
   "account_status": "confirmada",
   "created_at": "2026-10-29T21:09:58+11:00",
   "text": "[EJEMPLO FICTICIO] Texto de prueba: \"anunciamos un descubrimiento imaginario en chips de chocolate\". Esto no es un tweet real.",
   "metrics": {
    "likes": 0,
    "reposts": 0,
    "replies": 0,
    "views": 0
   },
   "highlight": {
    "score": 3,
    "reasons": [
     "Descubrimiento"
    ]
   }
  },
  {
   "id": "ejemplo-2",
   "url": "https://x.com/search?q=%24LLY",
   "symbol": "LLY",
   "handle": "EJEMPLO_LLY",
   "author_name": "Empresa de ejemplo (LLY)",
   "role": "empresa",
   "account_status": "confirmada",
   "created_at": "2026-10-29T20:52:58+11:00",
   "text": "[EJEMPLO FICTICIO] Texto de prueba: la FDA aprueba un medicamento inventado para la prueba de la columna. No es real.",
   "metrics": {
    "likes": 0,
    "reposts": 0,
    "replies": 0,
    "views": 0
   }
  }
 ]
}
```

`--per-handle N` (por defecto 40): máximo de tweets por cuenta dentro de la ventana; se quedan los más recientes. Evita que una cuenta muy activa (p. ej. @elonmusk) llene el tope de 500. `0` lo desactiva.

`--handle-cap HANDLE=N` (repetible): tope propio para una cuenta, que pisa a `--per-handle`. Se aplica sobre todo el conjunto (lo nuevo + lo ya guardado con `--merge`), así que no se acumulan entre cargas. Ej.: `--handle-cap elonmusk=5` (decisión de Felipe). El handle no distingue mayúsculas y acepta `@`.

## Enlaces "Último tweet en X" en el detalle de cada activo
`Engine.tweetTargets(símbolo, fila_de_x_accounts|null, tweets)` devuelve empresa, CEO y cuentas extra (`extra_handles`, p. ej.
@saylor en MSTR, @marcos_galperin en MELI) más cualquier otra cuenta del feed con ese símbolo; para cada una, el tweet más reciente
de ese handle (sin distinguir mayúsculas). Sin tweet → botón desactivado con el motivo ("sin tweets recientes", "sin cuenta",
"no tiene CEO"). Al tocar uno: se quitan los filtros, se abre la columna (cajón en el teléfono), se baja al tweet y se resalta ~3 s.
Con `file://` no se lee `x_accounts.json` (no tiene gemelo `.js`): se usan solo las cuentas que aparecen en el feed.

## Orden de la columna
`Engine.sortTweets(lista, modo)`: `recent` (Más recientes, por defecto), `likes-desc` (Hi corazones), `likes-asc` (Low corazones), según `metrics.likes`; sin métricas = 0; empates: más nuevo primero. La elección se guarda en localStorage. Los tweets nuevos entran en su posición según el orden elegido (marcados como nuevos y sumados al contador si la columna está cerrada); los saltos desde el detalle quitan los filtros pero no cambian el orden.
