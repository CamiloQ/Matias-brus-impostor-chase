---
inclusion: fileMatch
fileMatchPattern: "{client/js/game.js,server/game_state.py}"
---

# Kiro Steering & Parity Rules: Clone Impostor 3D Aesthetics

1. **Prohibición de Siluetas Primitivas**: `drawCloneImpostors(ctx)` NUNCA debe dibujar círculos planos (`ctx.arc(0, 0, 18)`) ni corbatas rectangulares sueltas. Debe invocar `this.drawCharacterSprite(ctx, clone, { isClone: true })`.
2. **Paridad Total con los 11 Personajes**: Todo clon debe renderizar el traje 3D con gradiente radial, insignia de pecho según `character`, cremallera metálica, `drawSkin()`, rostro 3D, ojos/visor/bigotes/orejas/tercer ojo, cabello por género (`boy`/`girl`), `drawHat()` y `drawWeapon()`.
3. **Interpolación y Caminata a 60 FPS**: `handleSync()` y `update(dt)` deben preservar e interpolar `renderX`, `renderY` y `walkAnim` para cada clon en `this.cloneImpostors`.
4. **Cuerpo Derribado al Eliminar**: Cuando `CloneImpostor.tick()` reduce el HP de un jugador a `0`, no debe forzar `closest_target.alive = False` antes de `GameRoom.tick()`, para que se genere el cuerpo derribado revivible con `create_dead_body()`.
