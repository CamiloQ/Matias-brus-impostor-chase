#!/usr/bin/env bash
# ==========================================================
# Impostor Chase - Túneles para Pruebas Públicas Online
# ==========================================================

PORT=${1:-3000}

echo "======================================================="
echo "🌐 SELECCIONA EL SERVICIO DE TÚNEL PARA PRUEBAS ONLINE"
echo "======================================================="
echo "1) Cloudflare Quick Tunnel (cloudflared) [Recomendado - 100% Gratis y Rápido]"
echo "2) Localtunnel (npx localtunnel) [Sin registro ni instalación previa]"
echo "3) Ngrok (ngrok http $PORT)"
echo "4) Salir"
echo "======================================================="
read -p "Elige una opción (1-4): " OPTION

case $OPTION in
    1)
        echo "🚀 Iniciando Cloudflare Tunnel en el puerto $PORT..."
        if command -v cloudflared &> /dev/null; then
            cloudflared tunnel --url http://localhost:$PORT
        else
            echo "⚠️ cloudflared no está instalado globalmente."
            echo "Descárgalo con: curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb"
        fi
        ;;
    2)
        echo "🚀 Iniciando Localtunnel en el puerto $PORT..."
        npx localtunnel --port $PORT
        ;;
    3)
        echo "🚀 Iniciando Ngrok en el puerto $PORT..."
        ngrok http $PORT
        ;;
    *)
        echo "Cancelado."
        ;;
esac
