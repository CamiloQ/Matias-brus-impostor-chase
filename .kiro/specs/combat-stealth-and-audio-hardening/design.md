# Documento de Diseño: Robustez de Combate, Sigilo en Radar y Estabilidad de Audio
**Spec ID**: `7194da54-c9fe-4814-b7c7-df787d5e94c8`

---

## 1. Arquitectura y Componentes Afectados

```mermaid
graph TD
    subgraph Servidor Python (Asyncio)
        GS[GameRoom en server/game_state.py]
        SRV[WebSocket Handler en server/server.py]
        TESTS[server/test_missing_flows.py]
    end

    subgraph Cliente Web (Canvas & Audio)
        GE[GameEngine en client/js/game.js]
        SE[SoundEngine en client/js/audio.js]
        SW[Service Worker en client/sw.js]
        IDX[client/index.html]
    end

    SRV -->|Verifica distancia y cuota de botón| GS
    GS -->|Bloquea try_kill y try_punch en vent| GS
    GE -->|Oculta in_stealth en radar y punteros| GE
    SE -->|Null-check this.ctx en osciladores| SE
    SW -->|impostor-chase-v10 & ?v=22| IDX
    TESTS -->|TDD Unit Tests| GS
```

---

## 2. Cambios Específicos por Componente

### 2.1 Servidor: `server/game_state.py`

#### A. Inicialización de Jugador (`Player.__init__`)
Añadir:
```python
self.emergency_buttons_left = 1
```
Y al resetear o iniciar partida en `start_game()` / `return_to_lobby()`, asegurar `p.emergency_buttons_left = 1`.

#### B. `GameRoom.try_punch(self, attacker_id)`
```python
if getattr(attacker, "in_vent", None):
    return False, "No puedes atacar desde dentro de la ventilación", None
```

#### C. `GameRoom.try_kill(self, impostor_id, target_id)`
```python
if getattr(impostor, "in_vent", None):
    return False, "Debes salir de la ventilación para eliminar"
if getattr(target, "in_vent", None):
    return False, "Objetivo protegido en ventilación"
```

#### D. `GameRoom.report_body_or_button(self, reporter_id, is_body=False, body_id=None)`
- Coordenadas de la mesa de emergencia: `EMERGENCY_BUTTON_X = 1350`, `EMERGENCY_BUTTON_Y = 520`. Radio de activación: `120.0`.
- Si `is_body is False`:
  - Verificar `if getattr(reporter, "emergency_buttons_left", 1) <= 0: return False, "Ya utilizaste tu botón de emergencia"`
  - Verificar distancia `math.hypot(reporter.x - EMERGENCY_BUTTON_X, reporter.y - EMERGENCY_BUTTON_Y) <= 120.0`. Si no, `return False, "Demasiado lejos de la mesa de emergencia"`.
  - Decrementar `reporter.emergency_buttons_left -= 1`.
- Si `is_body is True`:
  - Buscar `body = next((b for b in self.dead_bodies if isinstance(b, dict) and b.get("id") == body_id), None)`.
  - Si `not body` o `body.get("is_trapped_in_plant")`: `return False, "Cuerpo no disponible para reportar"`.
  - Verificar `math.hypot(reporter.x - body["x"], reporter.y - body["y"]) <= 140.0`. Si no, `return False, "Demasiado lejos del cuerpo"`.

### 2.2 Servidor: `server/server.py`
En el bloque `msg_type == "report"`:
Recibir el resultado booleano y mensaje de error de `room.report_body_or_button(player_id, is_body, body_id)`. Si falla, responder al cliente con `{"type": "error", "message": msg}` o aviso contextual, y si tiene éxito, emitir el broadcast `meeting_started`.

### 2.3 Cliente: `client/js/game.js`
- En `drawOffScreenPlayerPointers(ctx)`:
  ```javascript
  if (p.in_stealth && p.id !== this.myPlayerId && me && me.alive) return;
  ```
- En `drawMiniMap(ctx)`:
  ```javascript
  if (p.in_stealth && p.id !== this.myPlayerId && me && me.alive) return;
  ```

### 2.4 Cliente: `client/js/audio.js`
En cada método de audio que interactúe con `this.ctx`:
```javascript
if (!this.enabled) return;
this.init();
if (!this.ctx) return;
```

### 2.5 Versiones y Service Worker
- `client/index.html`: `crazygames.js?v=22`, `audio.js?v=22`, `network.js?v=22`, `game.js?v=22`, `ui.js?v=22`.
- `client/sw.js`: `CACHE_NAME = 'impostor-chase-v10'`.
