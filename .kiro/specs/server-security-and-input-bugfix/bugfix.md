# Especificación de Bugfix Kiro (`2bdc61a4-4e4d-4409-87a8-34e0cf73d1d5`)
- **Workflow Type**: `requirements-first`
- **Spec Type**: `bugfix`
- **Spec ID**: `2bdc61a4-4e4d-4409-87a8-34e0cf73d1d5`

## 1. Descripción del Problema y Evaluación del Reporte

Se evaluaron los 5 hallazgos reportados sobre `server/server.py`, `server/game_state.py` y el cliente JS, así como el aviso de seguridad de Railway del 21–23 de octubre de 2026:

### Comportamiento Actual (Defectuoso)
1. **Validación de `Origin` en WebSocket (`server/server.py`, `handle_connection`)**:
   - **WHEN** un cliente se conecta desde un dominio legítimo distinto al fijo `matias-brus-impostor-chase-production.up.railway.app` (por ejemplo, una URL de preview `https://app-*.up.railway.app` o un dominio propio que coincide con la cabecera `Host`), **THEN** el servidor rechaza y cierra el WebSocket en silencio.
   - **WHEN** un atacante envía una cabecera `Origin: http://localhost.evil.com` o `http://127.0.0.1.evil.com`, **THEN** la validación `req_origin.startswith(ao)` la acepta erróneamente como válida.
2. **Trampa de velocidad y corrupción por `NaN`/`Infinity` (`server/game_state.py`, `update_player_input`)**:
   - **WHEN** un cliente envía `vx` o `vy` con magnitud mayor a `1.0` (ej. `vx=1000`), **THEN** `player.vx` alcanza `280000` permitiendo teletransportación/speedhack.
   - **WHEN** un cliente envía `vx: NaN` o `Infinity` en JSON (aceptado por `json.loads` de Python), **THEN** `player.vx` y luego `player.x`/`player.y` se vuelven `nan`, corrompiendo la posición del jugador y rompiendo cálculos posteriores.
3. **Secuestro de sesión por nombre y reseteo en `join_room` (`server/server.py`)**:
   - **WHEN** un jugador nuevo entra con el mismo `name` que un jugador **actualmente conectado** (`p.connected == True`), **THEN** la búsqueda `disconnected_player` no comprueba `not p.connected`, cierra el socket del jugador legítimo y secuestra su sesión.
   - **WHEN** un jugador desconectado se reconecta por nombre (sin `reconnect_id`) durante `PLAYING`, **THEN** el bloque `if room.state == "PLAYING" and not reconnect_id:` lo trata como hot-joiner nuevo, reasignándole `role = "crewmate"`, `alive = True` y nuevas tareas (reseteando a un impostor o reviviendo gratis a un muerto).
4. **Control arbitrario de la partida (`start_game`, `return_to_lobby` en `server/server.py`)**:
   - **WHEN** cualquier jugador envía `return_to_lobby` en mitad de una partida activa (`PLAYING` o `MEETING`), **THEN** el servidor reinicia inmediatamente la sala a `LOBBY` para todos sin comprobar `room.state == "GAME_OVER"` ni si el emisor es el anfitrión (`host_id`).
5. **Calidad de código y CI (`eslint`)**:
   - **WHEN** se ejecuta ESLint sobre `client/`, **THEN** se reportan bloques `catch {}` vacíos y variables sin usar, y `.github/workflows/ci.yml` no ejecuta el chequeo de lint.

---

## 2. Comportamiento Esperado (Requisitos EARS)

1. **REQ-BUG-1 (Validación estricta y flexible de `Origin`)**:
   - **WHEN** se recibe una conexión HTTP/WebSocket con cabecera `Origin`, **THE SYSTEM SHALL** parsear la URL con `urllib.parse.urlparse` y permitir el origen únicamente si:
     - `Origin` está vacío (clientes no navegador / tests locales), o
     - El `netloc` o `hostname` del `Origin` coincide exactamente con la cabecera `Host` de la petición (mismo origen en cualquier dominio propio o preview), o
     - El `hostname` exacto es `"localhost"`, `"127.0.0.1"`, `"::1"` o la IP LAN local, o
     - El esquema es `https` y el `hostname` termina en `.up.railway.app`, o
     - Está explícitamente incluido en la variable de entorno `ALLOWED_ORIGINS`.
   - **IF** el `hostname` es un falso prefijo como `localhost.evil.com`, **THEN THE SYSTEM SHALL** rechazar la conexión WebSocket.
2. **REQ-BUG-2 (Saneamiento y límite vectorial en `update_player_input`)**:
   - **WHEN** `update_player_input(player_id, vx, vy)` recibe valores de entrada, **THE SYSTEM SHALL** verificar que `vx` y `vy` sean números finitos (`math.isfinite`) y normalizar el vector `(vx, vy)` si `math.hypot(vx, vy) > 1.0`, garantizando que la velocidad máxima nunca supere `280.0` px/s y que ningún `NaN` o `Inf` corrompa `player.x` o `player.y`.
3. **REQ-BUG-3 (Protección contra secuestro de sesión y preservación de estado al reconectar)**:
   - **WHEN** un cliente ejecuta `join_room` sin `reconnect_id`, **THE SYSTEM SHALL** reclamar un jugador por nombre únicamente si dicho jugador está desconectado (`not getattr(p, "connected", True)`). Si el jugador con ese nombre está conectado (`p.connected == True`), **THE SYSTEM SHALL** crear un nuevo jugador desambiguando el nombre (`Nombre 2`).
   - **WHEN** un jugador existente es reclamado (por `reconnect_id` o por nombre estando desconectado) mientras `room.state in ("PLAYING", "MEETING", "MEETING_RESULT")`, **THE SYSTEM SHALL** preservar intactos su `role`, `alive`, `hp`, posición `(x, y)` y `assigned_tasks`, sin ejecutar el bloque de hot-join.
4. **REQ-BUG-4 (Autorización de Host y validación de estado en `start_game` y `return_to_lobby`)**:
   - **THE SYSTEM SHALL** asignar y mantener un `host_id` en `GameRoom` (promoviendo automáticamente al siguiente jugador conectado si el host se desconecta o sale).
   - **WHEN** se recibe `start_game`, **THE SYSTEM SHALL** requerir `room.state in ("LOBBY", "GAME_OVER")` y `room.is_host(player_id)`.
   - **WHEN** se recibe `return_to_lobby`, **THE SYSTEM SHALL** requerir `room.state == "GAME_OVER"` y `room.is_host(player_id)` (bloqueando cualquier intento de abortar una partida en curso `PLAYING` o `MEETING`).
5. **REQ-BUG-5 (Limpieza de Lint y CI)**:
   - **THE SYSTEM SHALL** eliminar todos los `catch {}` vacíos y variables no utilizadas en `client/js/*.js` y `client/sw.js` para lograr 0 errores y 0 advertencias en ESLint.

---

## 3. Comportamiento Invariante (Prevención de Regresiones)
- Los 50 tests existentes en `server/test_*.py` deben seguir pasando sin regresiones.
- El hot-join de jugadores verdaderamente nuevos durante `PLAYING` debe seguir asignándolos como `crewmate` activos.
- El reclamo legítimo de sesión cuando el jugador sí perdió conexión (`p.connected == False`) o presenta su `reconnect_id` válido debe seguir funcionando.
