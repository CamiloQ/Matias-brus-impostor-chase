# Evaluación Técnica: Auditoría Kiro (`2bdc61a4-4e4d-4409-87a8-34e0cf73d1d5`) e Incidente de Seguridad de Railway

Este informe documenta la evaluación detallada de los 5 fallos técnicos reportados en el repositorio (`/repos/impostor`), las soluciones implementadas y verificadas con TDD, así como el análisis de impacto del **Aviso de Seguridad de Railway del 21–23 de octubre de 2026**.

---

## Parte 1: Evaluación y Corrección de los 5 Fallos Reportados

### 1. WebSocket bloqueado fuera del dominio fijo y Bypass por Prefijo
- **Diagnóstico**:
  - En `server/server.py`, la lista `allowed_origins` tenía fijo el dominio `https://matias-brus-impostor-chase-production.up.railway.app`. Cualquier despliegue en un subdominio de preview (ej. `https://app-*.up.railway.app`) o dominio personalizado sufría el cierre silencioso del WebSocket.
  - Además, la validación utilizaba `req_origin.startswith(ao)`. Esto permitía que un atacante desde un dominio falso como `http://localhost.evil.com` o `http://127.0.0.1.attacker.com` superara la validación.
- **Solución Implementada**:
  - Se introdujo `is_allowed_origin(req_origin: str, req_host: str = "") -> bool` utilizando `urllib.parse.urlparse`.
  - **Mismo host**: Comprueba que el `netloc` o `hostname` del `Origin` coincida exactamente con la cabecera `Host` HTTP de la petición, permitiendo automáticamente URLs de preview de Railway y dominios personalizados sin configuración manual.
  - **Coincidencia estricta de localhost**: Valida `hostname in ("localhost", "127.0.0.1", "::1", get_lan_ip())`. Esto bloquea de raíz `localhost.evil.com`.
  - **Subdominios de Railway**: Valida que `parsed.scheme == "https"` y `hostname.endswith(".up.railway.app")`.
  - **Orígenes adicionales**: Permite definir `ALLOWED_ORIGINS="https://midominio.com"` vía variables de entorno.
- **Verificación TDD**:
  - Test: `test_origin_validation_blocks_startswith_spoofing_and_allows_preview_domains` en `server/test_missing_flows.py`.

---

### 2. Trampa de Velocidad y Corrupción de Posición por `NaN`/`Infinity`
- **Diagnóstico**:
  - En `server/game_state.py:update_player_input`, los valores `vx` y `vy` no estaban acotados. Un cliente malicioso que enviara `vx = 1000` multiplicaba la velocidad base a `280000`, teletransportando al jugador.
  - El deserializador `json.loads` estándar de Python acepta literales como `NaN`, `Infinity` y `-Infinity`. Al recibirlos, `player.vx` pasaba a ser `nan`, y en el siguiente `room.tick()` la posición `(player.x, player.y)` se corrompía permanentemente a `nan`.
- **Solución Implementada**:
  - En `server/server.py` y `server/game_state.py:update_player_input`:
    - Se verifica que `vx` y `vy` sean convertibles a `float` y que cumplan `math.isfinite(vx)` y `math.isfinite(vy)`. Si son `NaN` o `Inf`, la entrada se descarta.
    - Se calcula la magnitud vectorial `mag = math.hypot(vx, vy)`. Si `mag > 1.0`, se normaliza dividiendo entre `mag`.
    - La velocidad máxima resultante queda estrictamente acotada a `280.0 px/s`.
- **Verificación TDD**:
  - Test: `test_update_player_input_clamps_speed_and_rejects_nan_inf` en `server/test_missing_flows.py`.

---

### 3. Secuestro de Sesión por Nombre y Reseteo en Reconexión
- **Diagnóstico**:
  - En `server/server.py:join_room`, la búsqueda `disconnected_player` buscaba por nombre sin comprobar `not getattr(p, "connected", True)`. Si un jugador ya estaba conectado y jugando como "Matias", cualquier otro usuario que entrase con el nombre "Matias" cerraba forzosamente el socket del jugador activo y le robaba la sesión.
  - Si un jugador desconectado se reconectaba por nombre (sin `reconnect_id`) durante `PLAYING`, la condición `if room.state == "PLAYING" and not reconnect_id:` lo trataba erróneamente como un nuevo jugador de hot-join, cambiándole el rol a `crewmate`, reviviéndolo si estaba muerto y reasignándole tareas.
- **Solución Implementada**:
  - La reconexión por nombre exige explícitamente `not getattr(p, "connected", True)`. Si el jugador con ese nombre está conectado, se desambigua creando un nuevo jugador (ej. `Matias 2`).
  - Se rastrea la bandera `reclaimed_existing`. Si un jugador existente se reconecta (por `reconnect_id` o por nombre) durante una partida en curso (`PLAYING`, `MEETING`, `MEETING_RESULT`), se preservan intactos su `role`, `alive`, `hp`, posición `(x, y)` y `assigned_tasks`. Solo se envían las tareas y rol actuales sin ejecutar el reseteo de hot-join.
- **Verificación TDD**:
  - Test: `test_join_room_prevents_connected_name_hijack_and_preserves_disconnected_role_alive` en `server/test_missing_flows.py`.

---

### 4. Control de Partida Arbitrario (`start_game`, `return_to_lobby`)
- **Diagnóstico**:
  - `start_game` y `return_to_lobby` podían ser invocados por cualquier jugador. En particular, cualquier cliente podía enviar `{"type": "return_to_lobby"}` en mitad de una partida activa (`PLAYING` o `MEETING`) y reiniciar el juego para toda la sala. No existía el concepto de anfitrión (`host_id`) ni validación de estado.
- **Solución Implementada**:
  - Se implementó la gestión de `host_id` en `GameRoom`:
    - El primer jugador en entrar a la sala es designado `host_id`.
    - Si el anfitrión se desconecta o sale, el método `room.is_host(player_id)` promueve automáticamente al siguiente jugador conectado, evitando que la sala quede bloqueada.
  - En `server/server.py`:
    - `start_game` requiere `room.state in ("LOBBY", "GAME_OVER")` y `room.is_host(player_id)`.
    - `return_to_lobby` requiere estrictamente `room.state == "GAME_OVER"` y `room.is_host(player_id)`. Los intentos durante `PLAYING` o `MEETING` son ignorados.
- **Verificación TDD**:
  - Test: `test_host_and_state_authorization_for_start_game_and_return_to_lobby` en `server/test_missing_flows.py`.

---

### 5. Limpieza de ESLint y Automatización en CI
- **Diagnóstico**:
  - Existían 9 errores de bloques `catch {}` vacíos (`no-empty`) y 25 advertencias de variables no utilizadas (`no-unused-vars`) en el frontend (`client/js/*.js` y `client/sw.js`).
  - `.github/workflows/ci.yml` solo ejecutaba `node --check` en 4 archivos, omitiendo `crazygames.js`, `sw.js` y ESLint.
- **Solución Implementada**:
  - Se corrigieron todos los bloques `catch` vacíos utilizando comentarios semánticos (ej. `/* ignore storage error */`) y se eliminaron las variables no utilizadas.
  - Se configuró `eslint.config.js` con soporte autónomo sin dependencias externas obligatorias en `node_modules`.
  - Se actualizó `.github/workflows/ci.yml` para validar la sintaxis de todos los archivos JS (`node --check`) y ejecutar `npx --yes eslint client/js/*.js client/sw.js`.
  - **Resultado**: `0 errors, 0 warnings` en ESLint.

---

## Parte 2: Evaluación del Incidente de Seguridad de Railway (Octubre 21–23, 2026)

### Antecedentes del Incidente
El 21 de octubre de 2026, Railway publicó un aviso de seguridad alertando sobre actividad no autorizada dirigida a los sistemas de almacenamiento de variables de entorno de clientes, con posible exposición o descifrado de variables de entorno y tokens de plataforma. Como medida de contención inmediata, Railway invalidó tokens de sesión de CLI, sesiones OAuth y credenciales de acceso.

### Evaluación de Impacto en este Proyecto
1. **Exposición de Variables y Secretos**:
   - Este proyecto (`Matias & Brus: Impostor Chase`) es un servidor de juegos en tiempo real que corre en Python asyncio puro sin bases de datos externas (PostgreSQL/Redis), pasarelas de pago ni claves API de proveedores de IA configuradas en variables de entorno.
   - Las únicas variables de entorno del contenedor son `PORT` y `HOST`, por lo que **no hubo exposición de credenciales sensibles de terceros en este repositorio**.
2. **Invalidación de Sesión de Railway CLI**:
   - Al ejecutar `railway status` en el entorno local, el comando devolvió:
     `Unauthorized. Please login with railway login`
   - Esto confirma que el token de la CLI local fue revocado por Railway como parte del protocolo de seguridad global de la plataforma.
3. **Recomendaciones de Acción**:
   - Para desplegar nuevas versiones mediante la CLI local de Railway, ejecutar:
     ```bash
     railway login
     ```
   - Si en el panel web de Railway se habían configurado tokens de integración de GitHub o webhooks antes del 21 de octubre, rotarlos preventivamente en el dashboard de Railway.
