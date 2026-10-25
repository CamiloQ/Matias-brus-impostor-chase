# Plan de Tareas Kiro (`2bdc61a4-4e4d-4409-87a8-34e0cf73d1d5`)

- [x] 1. Crear especificación de bugfix Kiro (`requirements-first` / `bugfix`) y evaluación del incidente de seguridad de Railway.
- [x] 2. Escribir tests TDD en `server/test_missing_flows.py` para los 4 fallos de servidor (Origin bypass/preview, `vx`/`vy` `NaN` y speedhack, secuestro de sesión por nombre / hot-join reset, y control de `start_game`/`return_to_lobby` por host y estado).
- [x] 3. Implementar las correcciones en `server/game_state.py` y `server/server.py`.
- [x] 4. Corregir los 9 errores `no-empty` y las 25 advertencias `no-unused-vars` en `client/js/*.js` y `client/sw.js`, hacer `eslint.config.js` autónomo y añadir ESLint a `.github/workflows/ci.yml`.
- [x] 5. Verificar que todos los tests de Python y ESLint pasen con 0 errores y 0 advertencias.
