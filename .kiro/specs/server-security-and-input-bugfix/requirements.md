# Requisitos EARS — Bugfix de Seguridad, Sesiones, Input y Lint (`2bdc61a4-4e4d-4409-87a8-34e0cf73d1d5`)

## REQ-1: Validación de Origen WebSocket/HTTP (`server/server.py`)
- **WHEN** `handle_connection` evalúa la cabecera `Origin`, **THE SYSTEM SHALL** usar `is_allowed_origin(req_origin, req_host)` basado en `urllib.parse.urlparse`.
- **WHEN** `req_origin` tiene un `hostname` que coincide con el `Host` HTTP de la petición, o es exactamente `localhost`, `127.0.0.1`, `::1`, la IP LAN local, o un subdominio HTTPS `*.up.railway.app` (o está en `ALLOWED_ORIGINS`), **THE SYSTEM SHALL** permitir la conexión.
- **IF** `req_origin` intenta evadir el prefijo mediante un dominio malicioso como `http://localhost.evil.com` o `https://evil.com`, **THEN THE SYSTEM SHALL** rechazar el handshake WebSocket y devolver `Access-Control-Allow-Origin: null`.

## REQ-2: Saneamiento de Velocidad y Prevención de `NaN`/`Inf` (`server/game_state.py`, `server/server.py`)
- **WHEN** se procesa `update_player_input(player_id, vx, vy)` o el mensaje WebSocket `input`, **THE SYSTEM SHALL** rechazar cualquier valor no numérico o no finito (`math.isnan`, `math.isinf`) sin alterar ni corromper `player.x`, `player.y`, `player.vx` o `player.vy`.
- **WHEN** la magnitud del vector `(vx, vy)` supera `1.0`, **THE SYSTEM SHALL** normalizar `(vx, vy)` a longitud unitaria (`hypot(vx, vy) == 1.0`), limitando estrictamente la velocidad máxima resultante a `280.0` px/s.

## REQ-3: Protección contra Secuestro de Sesión por Nombre y Hot-Join Seguro (`server/server.py`)
- **WHEN** un cliente envía `join_room` sin un `reconnect_id` válido en la sala, **THE SYSTEM SHALL** reclamar un jugador existente por coincidencia de nombre **únicamente si dicho jugador está desconectado** (`not getattr(p, "connected", True)`).
- **IF** ya existe un jugador **conectado** (`p.connected == True`) con el mismo nombre, **THEN THE SYSTEM SHALL** preservar intacta la conexión del jugador original y crear un nuevo jugador con nombre desambiguado (`f"{player_name} {len(room.players) + 1}"`).
- **WHEN** un jugador existente es reclamado (por `reconnect_id` o por nombre estando desconectado) durante una partida en curso (`PLAYING`, `MEETING`, `MEETING_RESULT`), **THE SYSTEM SHALL** conservar su `role`, `alive`, `hp`, posición `(x, y)` y `assigned_tasks`, enviándole `game_started` con su estado real sin ejecutar el reseteo de hot-join.

## REQ-4: Control de Partida Restringido al Anfitrión y al Estado de Sala (`server/game_state.py`, `server/server.py`)
- **THE SYSTEM SHALL** mantener `room.host_id` apuntando al primer jugador conectado de la sala y reasignarlo automáticamente al siguiente jugador conectado si el anfitrión se desconecta o abandona la sala.
- **WHEN** un cliente envía `start_game`, **THE SYSTEM SHALL** ejecutar `room.start_game()` únicamente si `room.state in ("LOBBY", "GAME_OVER")` y `room.is_host(player_id)` es `True`.
- **WHEN** un cliente envía `return_to_lobby`, **THE SYSTEM SHALL** ejecutar `room.return_to_lobby()` únicamente si `room.state == "GAME_OVER"` y `room.is_host(player_id)` es `True`, impidiendo que cualquier jugador reinicie una partida en mitad de `PLAYING` o `MEETING`.

## REQ-5: Limpieza de ESLint y Ejecución en CI (`client/`, `eslint.config.js`, `.github/workflows/ci.yml`)
- **THE SYSTEM SHALL** eliminar los 9 errores de bloques `catch {}` vacíos y las 25 advertencias de variables sin usar en `client/js/*.js` y `client/sw.js`.
- **THE SYSTEM SHALL** ejecutar ESLint en `.github/workflows/ci.yml` para impedir futuras regresiones de lint en CI.
