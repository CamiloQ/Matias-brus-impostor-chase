# Diseño Técnico: Rediseño Estético de Clones (`clone-aesthetics-overhaul`)

## 1. Diagnóstico de la Falla Actual
En `client/js/game.js`, el método `drawCloneImpostors(ctx)` dibujaba una figura primitiva (`ctx.arc(0, 0, 18)` plano + rectángulo de corbata + óvalo rojo) e invocaba `this.drawHat(ctx, clone.hat, 0, -18)` sin pasar por el pipeline 3D de personajes. Además, `this.cloneImpostors = snapshot.clones || []` sobrescribía las instancias en cada paquete `sync` (30 Hz), impidiendo interpolación `renderX`/`renderY` y animación de pasos `walkAnim`.

## 2. Arquitectura de la Solución

### 2.1 Servidor (`server/game_state.py`)
- `CloneImpostor.__init__` preserva `character_num`, `original_id`, `gender`, `character`, `color`, `hat`, `skin` y `weapon`.
- En `CloneImpostor.tick`, al reducir `closest_target.hp` a `0`, no se marca `closest_target.alive = False` prematuramente, permitiendo que el bucle posterior en `GameRoom.tick` invoque `self.create_dead_body(p)`.

### 2.2 Cliente (`client/js/game.js`)
- **Estado Interpolado de Clones:** En `handleSync(snapshot)`, conservar `renderX`, `renderY` y `walkAnim` para cada clon activo por `id`. En `update(dt)`, interpolar `renderX`/`renderY` hacia `targetX`/`targetY` y avanzar `walkAnim` cuando `Math.hypot(clone.vx, clone.vy) > 10`.
- **Renderizador Unificado `drawCharacterSprite(ctx, entity, options)`:**
  - Extraer el cuerpo 3D completo de `drawPlayers` a `drawCharacterSprite(ctx, entity, { isClone })`.
  - Cuando `isClone === true`:
    - Dibujar anillo de energía clonada bajo los pies y ligeras partículas/glitch holográfico alrededor del torso.
    - Mantener el traje 3D, insignia del personaje, cremallera, `drawSkin`, rostro 3D, cabello por género, `drawHat` y `drawWeapon` idénticos al jugador clonado.
    - Añadir reflejo carmesí/neón en las pupilas y sonrisa maliciosa para que al acercarse se note que es un clon hostil.
