# Lista de Tareas Kiro (`clone-aesthetics-overhaul`)

- [x] 1. **Auditor**: Auditar el plan en `docs/superpowers/plans/2026-10-20-clone-aesthetics-overhaul.md` y verificar que no rompa `drawPlayers`, `drawHat`, `drawSkin` ni `drawWeapon`.
- [x] 2. **Worker**: Generar el código de `drawCharacterSprite`, `drawCloneImpostors`, interpolación en `handleSync`/`update` y ajustes de `CloneImpostor` en `server/game_state.py`.
- [x] 3. **Hook**: Configurar el Agent Hook en `.kiro/hooks/clone-sprite-parity.kiro.hook` y `.kiro/hooks/clone-sprite-parity.json` junto con el agente `.kiro/agents/clone-auditor-worker.json`.
- [x] 4. **Verificación**: Ejecutar `python3 -m unittest discover -s server -p "test_*.py"` y `node --check client/js/game.js`.
