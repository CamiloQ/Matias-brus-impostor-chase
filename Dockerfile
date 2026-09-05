# Imagen base ligera de Python
FROM python:3.11-slim

# Evita escritura de archivos .pyc y fuerza salida sin buffer
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# Copia dependencias
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt || true

# Copia código de la aplicación y recursos web
COPY server/ /app/server/
COPY client/ /app/client/

# Exponer el puerto configurado por defecto
EXPOSE 3000

# Ejecutar el servidor del juego
CMD ["python3", "server/server.py"]
