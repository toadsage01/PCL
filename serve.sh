#!/usr/bin/env bash
# Local hosting for the PCL form. Usage: ./serve.sh [port]
set -e
PORT="${1:-8080}"
echo "Serving Praper Contest League form → http://localhost:${PORT}"
echo "(Ctrl+C to stop)"
python3 -m http.server "$PORT"
