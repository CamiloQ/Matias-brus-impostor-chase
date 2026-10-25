# Plan de Tareas: Robustez de Combate, Sigilo en Radar y Estabilidad de Audio
**Spec ID**: `7194da54-c9fe-4814-b7c7-df787d5e94c8`

- [x] 1. TDD: Escribir pruebas unitarias en `server/test_missing_flows.py` que fallen inicialmente (RED):
  - `test_combat_attacks_blocked_while_in_vent_for_punch_and_kill`
  - `test_emergency_meeting_requires_proximity_and_enforces_quota`
  - `test_body_report_requires_valid_untrapped_body_and_proximity`
- [x] 2. Implementar correcciones en `server/game_state.py` y `server/server.py`:
  - Agregar campo `emergency_buttons_left` en `Player`.
  - Bloquear ataques y kills si el atacante o víctima están en `in_vent`.
  - Validar proximidad y cuota en `report_body_or_button`.
  - Actualizar el handler de `report` en `server/server.py`.
  - Verificar que las pruebas pasen (GREEN).
- [x] 3. Implementar corrección de radar y punteros en modo sigilo en `client/js/game.js`:
  - Ocultar jugadores con `p.in_stealth` en `drawOffScreenPlayerPointers`.
  - Ocultar jugadores con `p.in_stealth` en `drawMiniMap`.
- [x] 4. Blindar Web Audio API en `client/js/audio.js`:
  - Añadir guardas `if (!this.ctx) return;` en todos los métodos de reproducción sonora.
- [x] 5. Bump de versiones, verificación estática y suite de pruebas:
  - Actualizar `client/index.html` a `?v=22`.
  - Actualizar `client/sw.js` a `impostor-chase-v10`.
  - Ejecutar `python3 -m unittest discover -s server -p "test_*.py"`.
  - Ejecutar `npx eslint client/js/*.js client/sw.js` y `node --check client/js/*.js client/sw.js`.
