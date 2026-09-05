#!/usr/bin/env bash
# ==========================================
# Impostor Chase - Local Server Launcher
# ==========================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PORT=${PORT:-3000}
export HOST=${HOST:-0.0.0.0}

echo "======================================================="
echo "🎮 Iniciando Impostor Chase (Servidor Multijugador Web)"
echo "======================================================="
echo "👉 Local:   http://localhost:$PORT"
echo "👉 Red LAN: http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
echo "======================================================="
echo "Presiona Ctrl+C para detener el servidor."
echo ""

python3 "$DIR/server/server.py"
