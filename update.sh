#!/usr/bin/env bash
# Actualización diaria (§18). NO está programada: para hacerlo, añade a crontab (hora de Sídney):
#   30 7 * * 2-6  /workspace/brujula/update.sh >> /workspace/brujula/update.log 2>&1
# fetch_data.py descarga en data_new/, valida (≥150 activos, ≥100 con datos del negocio, última fecha ≥ la publicada)
# y solo entonces reemplaza data/ (la anterior queda en data_prev/). Si falla, data/ no se toca y la página sigue igual.
# Solo cambian los archivos de datos; index.html (el diseño) nunca se reescribe aquí. No publica nada en internet.
set -euo pipefail; cd "$(dirname "$0")"
python3 fetch_data.py && python3 validate_report.py && node tests/test_engine.js > /dev/null && echo "OK $(date)"
