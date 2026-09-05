#!/usr/bin/env bash
# ================================================================
# Conectar Usuarios Remotos - Matias & Brus: Impostor Chase
# ================================================================

PORT=3000

echo "================================================================"
echo "🌐 ¿CÓMO QUIERES CONECTAR A TU AMIGO REMOTO?"
echo "================================================================"
echo "1) Túnel Instantáneo SSH (0 instalaciones, 100% Gratis y Rápido)"
echo "   -> Usa localhost.run para darte una URL HTTPS al instante."
echo ""
echo "2) Descargar Cloudflare Tunnel (cloudflared)"
echo "   -> La mejor conexión global de baja latencia."
echo ""
echo "3) Ver mi IP Local (Si tu amigo está en la misma red Wi-Fi/Casa)"
echo "================================================================"
read -p "Selecciona una opción (1, 2 o 3): " OPCION

case $OPCION in
    1)
        echo ""
        echo "🚀 Abriendo túnel público seguro... (Copia el enlace https que saldrá abajo)"
        echo "================================================================"
        ssh -o StrictHostKeyChecking=no -R 80:localhost:$PORT nokey@localhost.run
        ;;
    2)
        echo ""
        echo "📦 Verificando cloudflared..."
        if [ ! -f "./cloudflared" ]; then
            echo "Descargando cloudflared..."
            curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ./cloudflared
            chmod +x ./cloudflared
        fi
        echo "🚀 Iniciando Cloudflare Tunnel..."
        ./cloudflared tunnel --url http://localhost:$PORT
        ;;
    3)
        echo ""
        echo "📶 Tus direcciones IP en la red local:"
        hostname -I
        echo ""
        echo "Dile a tu amigo que entre desde su navegador a:"
        echo "👉 http://$(hostname -I | awk '{print $1}'):$PORT"
        ;;
    *)
        echo "Opción no válida."
        ;;
esac
