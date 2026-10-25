# Especificación de Requerimientos: Robustez de Combate, Sigilo en Radar y Estabilidad de Audio
**Spec ID**: `7194da54-c9fe-4814-b7c7-df787d5e94c8`  
**Tipo**: `bugfix`  
**Flujo**: `requirements-first`

---

## 1. Contexto y Objetivos
Durante la auditoría del motor del servidor (`server/game_state.py`, `server/server.py`) y del cliente (`client/js/game.js`, `client/js/audio.js`), se identificaron vulnerabilidades en el combate, explotación del sistema de reuniones de emergencia, fuga de posición en modo sigilo y excepciones de audio en navegadores con restricciones de WebAudio.
El objetivo de este spec es corregir dichas fallas mediante TDD con cobertura completa.

---

## 2. Requerimientos Funcionales y de Seguridad

### REQ-1: Bloqueo de Ataques y Eliminaciones desde Ventilación
- **1.1**: En `GameRoom.try_punch(attacker_id)`, si el atacante se encuentra dentro de un conducto (`getattr(attacker, "in_vent", None) is not None`), la acción debe ser rechazada con mensaje de error (`No puedes atacar desde dentro de la ventilación`) sin consumir cooldown ni causar daño.
- **1.2**: En `GameRoom.try_kill(impostor_id, target_id)`, si el impostor está dentro de un conducto (`impostor.in_vent is not None`), la acción debe ser rechazada con mensaje explicativo (`Debes salir de la ventilación para eliminar`) sin consumir el `kill_cooldown`.
- **1.3**: En `GameRoom.try_kill(impostor_id, target_id)`, si la víctima objetivo está protegida dentro de un conducto (`getattr(target, "in_vent", None) is not None`), la acción debe ser rechazada (`Objetivo protegido en ventilación`).

### REQ-2: Validación de Proximidad y Cuota de Reuniones de Emergencia
- **2.1**: Cada jugador debe contar con un límite de llamadas a botón de emergencia (`emergency_buttons_left`, por defecto 1 por partida). Al llamar a reunión de emergencia (`is_body=False`), si `emergency_buttons_left <= 0`, debe rechazarse la solicitud.
- **2.2**: Para botón de emergencia (`is_body=False`), el jugador debe encontrarse a una distancia máxima de 120 píxeles de la mesa central de Cafetería (`x: 1350, y: 520`).
- **2.3**: Para reporte de cadáver (`is_body=True`), el cliente debe proporcionar un `body_id` válido presente en `self.dead_bodies` que no esté siendo digerido por una planta carnívora (`not body.get("is_trapped_in_plant")`), y el jugador reportador debe estar a una distancia máxima de 140 píxeles del cadáver.

### REQ-3: Respeto al Modo Sigilo en Radar Minimap y Punteros Direccionales
- **3.1**: En `client/js/game.js:drawOffScreenPlayerPointers(ctx)`, si un jugador se encuentra en zona de sigilo (`p.in_stealth == true`), no se debe dibujar el puntero perimetral hacia él a menos que sea el propio jugador local o un fantasma/espectador.
- **3.2**: En `client/js/game.js:drawMiniMap(ctx)`, si un jugador tiene `p.in_stealth == true`, no debe dibujarse su indicador de radar para otros jugadores vivos.

### REQ-4: Blindaje Null-Safe en Web Audio API
- **4.1**: Todos los métodos sintéticos de sonido en `client/js/audio.js` (`playClick`, `playPanHit`, `playSwordHit`, `playCatSound`, `playCloneBeam`, `playTaskComplete`, `playAlarm`, `playMeetingCall`, `playFootstep`, etc.) deben verificar que `this.ctx` exista y esté inicializado (`if (!this.ctx) return;`) antes de invocar `this.ctx.createOscillator()`, `createGain()`, etc.
- **4.2**: Evitar cualquier `TypeError: Cannot read properties of null` en entornos donde WebAudio sea bloqueado o no soportado.

### REQ-5: Versionado de Caché y Verificación en Pipeline CI
- **5.1**: Incrementar la versión de scripts a `?v=22` en `client/index.html` y en `client/sw.js`.
- **5.2**: Actualizar la versión de almacenamiento del Service Worker a `impostor-chase-v10`.
- **5.3**: Todos los tests de regresión del servidor deben pasar (`58/58+` tests), y `npx eslint` y `node --check` deben ejecutarse sin errores ni warnings.
