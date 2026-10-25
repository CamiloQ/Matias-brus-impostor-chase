# Diseño Técnico — Bugfix (`2bdc61a4-4e4d-4409-87a8-34e0cf73d1d5`)

## 1. Validación Segura de Origen (`is_allowed_origin` en `server/server.py`)
```python
def is_allowed_origin(req_origin: str, req_host: str = "") -> bool:
    if not req_origin:
        return True
    try:
        parsed = urllib.parse.urlparse(req_origin.strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname or not parsed.netloc:
        return False

    hostname = parsed.hostname.lower()
    netloc = parsed.netloc.lower()

    # 1. Same-origin check against HTTP Host header (supports Railway preview URLs and custom domains)
    if req_host:
        clean_host = req_host.strip().lower()
        host_only = clean_host.split(":")[0]
        if netloc == clean_host or hostname == host_only:
            return True

    # 2. Exact localhost / loopback / LAN IP match (blocks localhost.evil.com)
    if hostname in ("localhost", "127.0.0.1", "::1", get_lan_ip().lower()):
        return True

    # 3. Railway HTTPS domains (*.up.railway.app)
    if parsed.scheme == "https" and hostname.endswith(".up.railway.app"):
        return True

    # 4. Extra origins from ALLOWED_ORIGINS env var
    extra_origins = [o.strip().lower() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if req_origin.strip().lower().rstrip("/") in [o.rstrip("/") for o in extra_origins]:
        return True

    return False
```

## 2. Saneamiento y Normalización en `update_player_input` (`server/game_state.py`)
```python
def update_player_input(self, player_id, vx, vy):
    player = self.players.get(player_id)
    if not player or not player.alive:
        return
    try:
        vx = float(vx)
        vy = float(vy)
    except (TypeError, ValueError):
        return
    if not (math.isfinite(vx) and math.isfinite(vy)):
        return
    mag = math.hypot(vx, vy)
    if mag > 1.0:
        vx /= mag
        vy /= mag
    speed = 280
    player.vx = vx * speed
    player.vy = vy * speed
```

## 3. Prevención de Secuestro de Sesión y Reclaim Seguro (`server/server.py`)
- En `join_room`:
  - `reclaimed_existing = False`
  - Si `reconnect_id` coincide con `room.players`, `reclaimed_existing = True`.
  - Si no, buscar `disconnected_player` filtrando explícitamente `not getattr(p, "connected", True) and p.name.strip().lower() == player_name.strip().lower()`. Si se encuentra, `reclaimed_existing = True`.
  - Sólo actualizar `set_character` y `name` de un jugador reclamado cuando `room.state in ("waiting", "LOBBY", "GAME_OVER")`.
  - Si `room.state == "PLAYING" and not reclaimed_existing`: ejecutar hot-join para nuevo tripulante.
  - Si `room.state in ("PLAYING", "MEETING", "MEETING_RESULT") and reclaimed_existing`: reenviar `game_started` con su `player.role` y `player.assigned_tasks` existentes sin tocar `player.alive`, `player.role` ni `player.x`/`player.y`.

## 4. Gestión de `host_id` y Autorización de Partida (`server/game_state.py`, `server/server.py`)
- `GameRoom.host_id` se inicializa en `None` y se asigna en `add_player` si no hay host activo conectado.
- `GameRoom.is_host(player_id)` verifica si el host actual sigue en la sala y conectado; si no, promueve automáticamente al primer jugador conectado en `self.players`.
- En `server/server.py`:
  - `start_game`: requiere `room and room.state in ("LOBBY", "GAME_OVER") and room.is_host(player_id)`.
  - `return_to_lobby`: requiere `room and room.state == "GAME_OVER" and room.is_host(player_id)`.
