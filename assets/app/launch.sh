#!/usr/bin/env bash
# Start the interview-coach server if it isn't running, then open the browser (macOS / Linux).
cd "$(dirname "$0")" || exit 1
PORT=$(python3 -c "import json;print(json.load(open('app_config.json',encoding='utf-8'))['port'])")
PY=$(python3 -c "import json;print(json.load(open('app_config.json',encoding='utf-8')).get('python') or '')")
[ -x "$PY" ] || PY=python3
URL="http://127.0.0.1:${PORT}/"
if ! curl -s -m 1 "${URL}api/health" >/dev/null 2>&1; then
  nohup "$PY" server.py >/dev/null 2>&1 &
  for _ in $(seq 1 50); do
    sleep 0.2
    curl -s -m 1 "${URL}api/health" >/dev/null 2>&1 && break
  done
fi
if command -v open >/dev/null; then open "$URL"; else xdg-open "$URL" >/dev/null 2>&1 & fi
