@echo off
REM ==========================================
REM Impostor Chase - Windows Server Launcher
REM ==========================================

echo =======================================================
echo Iniciando Impostor Chase (Servidor Multijugador Web)
echo =======================================================
echo Local: http://localhost:3000
echo =======================================================
echo Presiona Ctrl+C para detener el servidor.
echo.

python server\server.py
pause
