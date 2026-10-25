# Auditoría Técnica y Plan de Optimización
## Matias & Brus: Impostor Chase
**Fecha:** 2025  
**Auditor:** Kiro Planning Agent  
**Repo:** `04_Matias_Brus_impostor_chase`

---

## Resumen Ejecutivo

Auditoría completa del estado actual del código para identificar qué está roto, qué está pendiente, qué es redundante y un plan de optimización priorizado — sin romper el gameplay existente.

---

## Hallazgos de la Auditoría

### 🔴 Bugs Críticos (3)

| # | Archivo:Línea | Descripción |
|---|---|---|
| B1 | `server/server.py:~349` | **Closure-in-loop** en `game_tick_loop`: `_send_client` captura `room` por referencia en un `for`, así que con múltiples salas activas todos los jugadores reciben el snapshot de la **última** sala iterada. |
| B2 | `client/js/ui.js:~592` | `window.network.playerId` no existe en `NetworkClient` (la propiedad correcta es `myPlayerId`). El banner "jugador derribado" falla silenciosamente cuando `gameEngine.myPlayerId` es null. |
| B3 | `client/sw.js:2,7–14` | `CACHE_NAME='impostor-chase-v6'` + `ignoreSearch:true` rompe el cache-busting. Cambiar `?v=18` → `?v=19` en `index.html` **no** sirve archivos nuevos porque el SW ignora el querystring. |

### 🟠 Bugs Menores / Incompletos (3)

| # | Archivo | Descripción |
|---|---|---|
| B4 | `game_state.py — Player.__init__` | `self.connected` nunca se inicializa. El `getattr(p, "connected", True)` de fallback puede impedir limpieza de jugadores que desconectan antes del primer `joined_room`. |
| B5 | `server.py:268–280` | Rate limiter permite ~600 msg/s en el boundary del reset de 1 segundo (la cuenta se resetea antes del check de límite). |
| B6 | `game_state.py:~795` | `check_game_over()` se llama 2–3 veces por tick redundantemente. Es idempotente, no rompe nada, pero es CPU innecesario. |

### 🟡 Código Muerto / Redundancias (7)

| # | Archivo | Descripción |
|---|---|---|
| R1 | `client/js/game.js` | `drawSewerPipes()`, `drawFogOfWar()`, `drawLivingRoomSofa()`, `drawInteractiveTV()`, `drawDiningTable()` — definidas pero **nunca llamadas** desde `render()`. Dead code puro. |
| R2 | `game.js:1` + `ui.js:1` | `CHARACTER_THEMES` y `CHARACTER_METADATA` duplican colores/identidad de los 11 personajes. Mantenerlos sincronizados manualmente es frágil. |
| R3 | `network.js` + `ui.js:~390` | Listener `window.network.on("reconnected", ...)` en `ui.js` es código muerto — el servidor nunca envía `type: "reconnected"`. |
| R4 | `ui.js:~355 y ~520` | `window.network.on("joined_room", ...)` registrado **dos veces**. Ambos callbacks se ejecutan en cada join. |
| R5 | `client/js/qrcode.min.js` | Cargado en `index.html` y cacheado en `sw.js`, pero `QRCode` **jamás se usa** en ningún JS del proyecto. |
| R6 | `server/render_3d_icon.py` | Script de utilidad huérfano en el directorio del servidor. No es importado por nada en el servidor. |
| R7 | `scratch/` | Artefactos de desarrollo (`last_jules_session.json`, `send_to_jules.py`) no deberían desplegarse — verificar `.railwayignore`. |

### 🔵 Tests: Cobertura Faltante (gaps de riesgo alto)

Sin tests para:
- `try_vent()` — entrada, teletransporte, requisito de proximidad
- `try_shapeshift()` — disguise, timer 18s, visibilidad por rol
- `report_body_or_button()` + `cast_vote()` + resolución de meeting
- `boost_revive()` — descuento explícito de 1.5s
- Hot-join a partida en curso (`server.py:~195–215`)
- `return_to_lobby` — reset de estado y jugadores
- Rate limiter — boundary de 300 msg/s
- Closure-in-loop bug del tick loop (necesita test con 2 salas)
- `CloneImpostor.tick()` en aislamiento
- Single-player mode (1 jugador, sin impostor asignado)

### ✅ Lo que SÍ está bien implementado

- Broadcast concurrente ya usa `asyncio.gather` correctamente en `broadcast_to_room`.
- Memoización `_cached_tick_common` funciona correctamente: `tick()` resetea antes de gather.
- Cámara de muerto siguiendo al cuerpo: **ya implementada** en `game.js` (`update()`).
- Reanimación asistida (`revive_rate=0` sin helpers): **ya implementada** y con tests.
- SW estrategia cache-first para assets estáticos: **ya implementada** (el bug es solo el `ignoreSearch` + `CACHE_NAME`).
- Asset `Gemini_Generated_Imagen.jfif`: **ya eliminado** del repo.
- Reconnect con exponential backoff: **ya implementado** en `network.js`.
- Game Over no prematuro (espera cuerpos activos): **ya implementado** en `check_game_over()`.

---

## Diseño de la Solución

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PLAN DE OPTIMIZACIÓN                            │
├──────────────────────────────┬─────────────────────────────────────────┤
│  BLOQUE 1: LIMPIEZA (0 riesgo) │  BLOQUE 2: BUGS CRÍTICOS              │
│  • Eliminar dead code JS       │  • Fix closure-in-loop server.py      │
│  • Eliminar qrcode.min.js      │  • Fix window.network.playerId        │
│  • Eliminar render_3d_icon.py  │  • Fix SW cache-busting               │
├──────────────────────────────┼─────────────────────────────────────────┤
│  BLOQUE 3: BUGS MENORES        │  BLOQUE 4: TESTS FALTANTES            │
│  • Player.connected en __init__│  • try_vent, try_shapeshift           │
│  • Rate limiter tighten        │  • voting flow, boost_revive          │
│  • check_game_over redundancy  │  • hot-join, return_to_lobby          │
│  • Dead event listeners        │  • rate limiter, closure bug          │
│  • Double joined_room listener │                                        │
└──────────────────────────────┴─────────────────────────────────────────┘
```

---

## Plan de Tareas

### Task 1: Limpieza de assets y código muerto
**Riesgo:** Ninguno | **Esfuerzo:** ~15 min | **Desplegable sola:** ✅

**Objetivo:** Reducir peso muerto del repo sin tocar lógica de ejecución.

**Implementación:**
- Eliminar `client/js/qrcode.min.js` y su `<script>` tag en `index.html`
- Eliminar `server/render_3d_icon.py`
- Verificar que `scratch/` está en `.railwayignore` (no eliminar aún, solo confirmar)
- Remover de `sw.js` la entrada de `qrcode.min.js` en `ASSETS_TO_CACHE` si existe

**Test:** `node --check client/js/game.js && node --check client/js/ui.js` — sin errores. Abrir el juego en browser, confirmar que nada se rompe.

**Demo:** El juego carga sin cambios visuales. El repo es más liviano.

---

### Task 2: Fix crítico — Closure-in-loop en `game_tick_loop`
**Riesgo:** Bajo | **Esfuerzo:** ~20 min | **Desplegable sola:** ✅

**Objetivo:** Corregir el bug donde múltiples salas activas hacen que todos los jugadores reciban el snapshot de la sala incorrecta.

**Implementación:**

En `server.py`, dentro del `for room_id, room in list(ROOMS.items())`, la función `_send_client` debe recibir `room` como argumento por defecto, no capturarla del scope del `for`:

```python
# ANTES (buggy):
async def _send_client(writer, player_id):
    snapshot = room.get_snapshot_for_player(player_id)
    ...

# DESPUÉS (correcto):
async def _send_client(writer, player_id, _room=room):
    snapshot = _room.get_snapshot_for_player(player_id)
    ...
```

**Test:** Crear `server/test_tick_loop_multiroom.py` que instancie 2 salas, popule jugadores, simule `get_snapshot_for_player` y verifique que cada jugador recibe el snapshot de su sala.

**Demo:** Con 2 salas activas simultáneas, los jugadores de cada sala ven solo su propio estado de juego.

---

### Task 3: Fix crítico — SW cache-busting
**Riesgo:** Bajo | **Esfuerzo:** ~30 min | **Desplegable sola:** ✅

**Objetivo:** Que bumpar `?v=N` en `index.html` efectivamente entregue nuevos archivos JS/CSS.

**Implementación:**
- Cambiar `CACHE_NAME` de `'impostor-chase-v6'` a `'impostor-chase-v7'` para forzar reinstalación del SW
- En el fetch handler para `STATIC_ASSETS`, **remover** `{ ignoreSearch: true }` del `caches.match` — así `game.js?v=19` se trata como URL distinta a `game.js?v=18`
- Actualizar `ASSETS_TO_CACHE` para incluir assets con su versión actual (ej. `'./js/game.js?v=19'`) o eliminarlos del precacheo dejando solo stale-while-revalidate
- Bump de `index.html` a `?v=19` en todos los scripts

```javascript
// ANTES (buggy):
caches.match(event.request, { ignoreSearch: true })

// DESPUÉS (correcto para JS/CSS):
caches.match(event.request)  // respeta el ?v=N
```

**Test:** Manual con DevTools → Application → Service Workers: modo offline después de primera carga confirma PWA funcional; bump de versión trae JS nuevo sin recargar SW manualmente.

**Demo:** Cambiar un `console.log` en `game.js`, bumpar a `?v=20`, confirmar que el browser muestra el nuevo código.

---

### Task 4: Fix de bugs menores en servidor y cliente
**Riesgo:** Bajo | **Esfuerzo:** ~45 min | **Desplegable sola:** ✅

**Objetivo:** Resolver B4, B5, B6, R3, R4.

**Implementación:**

**B4 — `Player.__init__`:**
```python
# Agregar en Player.__init__:
self.connected = True
```

**B5 — Rate limiter:**
```python
# ANTES (permite ~600 msg/s en boundary):
if now - last_reset > 1.0:
    msg_count = 0
    last_reset = now
msg_count += 1
if msg_count > 300:
    break

# DESPUÉS (correcto):
msg_count += 1
if msg_count > 300:
    break
now = time.time()
if now - last_reset > 1.0:
    msg_count = 0
    last_reset = now
```

**B6 — `check_game_over()` redundante:**
```python
# En tick(), agregar flag y llamar solo una vez al final:
_needs_game_over_check = False
# ... (setear flag donde se llamaba antes)
if _needs_game_over_check:
    self.check_game_over()
```

**R3 — Dead listener en `ui.js`:**
```javascript
// Eliminar este bloque completo (el servidor nunca envía "reconnected"):
window.network.on("reconnected", (data) => { ... })
```

**R4 — Doble registro `joined_room` en `ui.js`:**
```javascript
// Fusionar los dos window.network.on("joined_room", ...) en un solo callback
```

**Test:** `python3 -m unittest discover -s server -p "test_*.py"` — todos los tests pasan. `node --check client/js/ui.js`.

**Demo:** Suite de tests completa en verde. Código de red en `ui.js` limpiado.

---

### Task 5: Fix crítico — Banner de derribado (`ui.js`)
**Riesgo:** Bajo | **Esfuerzo:** ~15 min | **Desplegable sola:** ✅

**Objetivo:** El banner "DERRIBADO: Esperando auxilio" debe mostrarse correctamente cuando un jugador es eliminado.

**Implementación:**

En `ui.js`, en el código del banner/`updateActionButtons`:
```javascript
// ANTES (buggy — .playerId no existe):
b.victim_id === (window.gameEngine.myPlayerId || (window.network && window.network.playerId))

// DESPUÉS (correcto):
b.victim_id === (window.gameEngine?.myPlayerId || window.network?.myPlayerId)
```

**Test:** Manual — ser eliminado en el juego y confirmar que el banner aparece. Verificar en DevTools Console que no hay `undefined` en la lookup.

**Demo:** Al ser derribado, el HUD muestra correctamente el banner "⚡ Esperando auxilio de un compañero".

---

### Task 6: Reducir redundancia — CHARACTER_THEMES vs CHARACTER_METADATA
**Riesgo:** Medio | **Esfuerzo:** ~1–2h | **Desplegable sola:** ✅ (con prueba visual)

**Objetivo:** Eliminar la duplicación de datos de los 11 personajes entre `game.js` y `ui.js`.

**Implementación:**

El servidor ya envía `catalogs.characters` en `joined_room`. Aprovechar eso como single source of truth:

1. En `ui.js`, reemplazar `CHARACTER_METADATA[key]` por lookups sobre `window.gameEngine.catalogs?.characters` (recibido en `joined_room`)
2. En `game.js`, mantener `CHARACTER_THEMES` solo con los datos de render (colores de suit, shade, light, pocket) que no están en el catálogo del servidor
3. Eliminar de `ui.js` la constante `CHARACTER_METADATA` hardcodeada

**Test:** `node --check client/js/game.js && node --check client/js/ui.js`. Verificar visualmente que todos los personajes muestran colores correctos en lobby y vestidor.

**Demo:** Un único source of truth para los 11 personajes. Cambiar el color de un personaje en el servidor se refleja automáticamente en el cliente.

---

### Task 7: Remover dead code JS y agregar tests faltantes de alto riesgo
**Riesgo:** Bajo–Medio | **Esfuerzo:** ~2–3h | **Desplegable sola:** ✅

**Objetivo:** Limpiar métodos huérfanos del renderer y cubrir los gaps de test más riesgosos.

**Implementación:**

**Dead code en `game.js`:**
- Eliminar o marcar como `// TODO (feature pendiente):` los métodos: `drawSewerPipes()`, `drawFogOfWar()`, `drawLivingRoomSofa()`, `drawInteractiveTV()`, `drawDiningTable()`
- Unificar nomenclatura: `drawMiniMap` → `drawMinimap` (consistente con la versión modal)

**Nuevo archivo `server/test_missing_flows.py`** con tests para:
```python
# Casos mínimos a cubrir:
- test_try_vent_entry_and_teleport()
- test_try_vent_proximity_requirement()
- test_report_body_starts_meeting()
- test_cast_vote_and_resolve_meeting()
- test_meeting_tie_results_in_skip()
- test_boost_revive_reduces_timer()
- test_hot_join_assigns_crewmate_role()
- test_return_to_lobby_resets_all_players()
```

**Test:** `python3 -m unittest discover -s server -p "test_*.py"` — todos pasan incluyendo los nuevos.

**Demo:** Cobertura de tests expandida a flujos críticos. El renderer no tiene métodos zombie.

---

## Tabla de Priorización

| Task | Severidad | Riesgo | Esfuerzo | Desplegable sola |
|------|-----------|--------|----------|-----------------|
| Task 1 — Limpieza assets | 🟡 Mejora | Ninguno | 15 min | ✅ Sí |
| Task 2 — Closure-in-loop | 🔴 Crítico | Bajo | 20 min | ✅ Sí |
| Task 3 — SW cache-busting | 🔴 Crítico | Bajo | 30 min | ✅ Sí |
| Task 4 — Bugs menores servidor/cliente | 🟠 Menor | Bajo | 45 min | ✅ Sí |
| Task 5 — Banner derribado fix | 🔴 Crítico | Bajo | 15 min | ✅ Sí |
| Task 6 — CHARACTER_THEMES unificación | 🟡 Mejora | Medio | 1–2 h | Sí, con prueba visual |
| Task 7 — Dead code + tests faltantes | 🟡 Mejora | Bajo–Medio | 2–3 h | ✅ Sí |

**Tiempo total estimado:** ~5–7 horas de implementación.

---

## Notas de Verificación Final

Después de cada task deployada en Railway:

```bash
# Tests Python
python3 -m unittest discover -s server -p "test_*.py"

# Syntax check JS
node --check client/js/game.js
node --check client/js/ui.js
node --check client/sw.js

# Health check
curl https://matias-brus-impostor-chase-production.up.railway.app/health
```

Para verificar el fix del SW: DevTools → Application → Service Workers → marcar "Offline" → recargar. La app debe cargar desde caché.
