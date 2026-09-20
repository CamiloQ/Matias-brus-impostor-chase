# Plan Maestro Integrado: Corrección de Fallos Críticos y Optimización Móvil

Este documento consolida la **resolución sistemática de los 4 fallos de gameplay y red multijugador** con el **plan de optimización móvil y rendimiento en cliente** (`0_Sugerencias/plan-optimizacion-movil-impostor-chase.md`).

---

## 1. Resumen de Diagnósticos y Causas Raíz

| Área | Causa Raíz Técnica | Impacto |
| :--- | :--- | :--- |
| **Delay / Lag Multijugador** | `server/server.py:826-834`: `await send_json(w, snapshot)` secuencial en bucle de 30Hz con `await writer.drain()`. Si 1 móvil sufre latencia, congela a toda la sala.<br>`server/game_state.py:1813`: re-serialización completa de 10 gatos, 5 esqueletos, 4 plantas, orbes y tareas por cada jugador en cada tick. | Caída del tickrate del servidor de 30 FPS a <10 FPS, jitter y desincronización severa. |
| **Reanimación Automática** | `server/game_state.py:1282`: `revive_rate = 1.0` incondicional, incluso con `helpers_nearby == []`. | Los cuerpos reaniman solos a los 20s sin que nadie los rescate. |
| **Gatos Zombi No Arrastran** | `server/game_state.py:563-591`: si `target_plant is None` o están ocupadas, suelta el cuerpo de inmediato.<br>Navegación lineal sin deslizamiento en obstáculos (se atascan en paredes/mesas).<br>`check_game_over` mata la partida en tick 1 si mueren los tripulantes. | Los gatos zombi nunca completan el arrastre ni alimentan a la Venus. |
| **Game Over Prematuro y Pantalla Bloqueada** | `server/game_state.py:1785`: si `alive_crewmates == 0`, activa `GAME_OVER` inmediatamente.<br>`client/js/ui.js:906`: muestra `#game-over-modal` que cubre la pantalla completa.<br>`client/js/game.js:521`: cámara fija en coordenadas de muerte (`me.renderX`). | El fallecido no puede ver cómo el gato arrastra su cuerpo ni cómo la Venus lo digiere; queda bloqueado en "Volver a la sala". |
| **Peso Muerto en Repo** | `client/icons/Gemini_Generated_Imagen.jfif` (2.46 MB) sin ninguna referencia en el código. | Descarga innecesaria y clonado pesado. |
| **Sobrecarga de Render en Móvil** | `client/js/game.js:4136, 4148, 4181`: `shadowBlur` activo permanentemente (procesado por software en varios navegadores móviles).<br>Recálculo de gradientes radiales 30 veces por segundo por personaje. | Consumo elevado de CPU/GPU y caída de FPS en dispositivos gama media/baja. |
| **Service Worker Ineficiente** | `client/sw.js`: precachea `./js/game.js` pero el HTML pide `js/game.js?v=N` (fallo de caché por querystring). Estrategia puramente *network-first* retrasa la apertura de la PWA. | Carga lenta en móvil y soporte offline defectuoso. |

---

## 2. User Review Required

> [!IMPORTANT]
> **Dinámica de Fin de Partida (*Game Over*):**
> La partida ya **no terminará de inmediato** al caer el último tripulante. El estado `PLAYING` continuará mientras existan cuerpos activos en el mapa que puedan ser arrastrados y consumidos por las plantas carnívoras Venus. La victoria del Impostor solo se declarará cuando todos los tripulantes hayan sido digeridos o sus opciones de salvación hayan expirado.

> [!WARNING]
> **Reanimación Asistida Estricta:**
> El contador de reanimación quedará en pausa (`revive_rate = 0.0`) a menos que un compañero vivo esté a menos de 70px o ejecute la acción **REANIMAR**. Un cuerpo abandonado no revivirá por sí solo.

---

## 3. Open Questions

> [!NOTE]
> 1. **Forcejeo del Jugador Derribado (*Struggle*):**
>    - **Opción A (Recomendada):** El derribado depende 100% del rescate de sus compañeros (quienes deben golpear al gato zombi y presionar "REANIMAR"), mientras la cámara del derribado sigue automáticamente a su cuerpo con un banner dinámico de advertencia.
>    - **Opción B:** Permitir que el derribado presione repetidamente espacio / toque la pantalla para forcejear y reducir la velocidad del gato a la mitad.
> 2. **Despliegue del Cacheo de Sprites (Fase 3 Móvil):**
>    - ¿Deseas aplicar el cacheo de sprites en este mismo ciclo de entrega, o prefieres estabilizar primero las correcciones de juego (Fases 0, 1 y 2) en Railway antes de introducir el `SpriteCache` offscreen? *(Recomendado: ejecutar Fases 0 a 2 + Gameplay primero, luego Fase 3 como optimización de render)*.

---

## 4. Plan de Cambios Propuestos por Componente

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PLAN MAESTRO INTEGRADO                          │
├───────────────────────────────────┬────────────────────────────────────┤
│ PARTE 1: GAMEPLAY & SERVIDOR      │ PARTE 2: RENDIMIENTO MÓVIL (PWA)   │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Broadcast paralelo concurrente  │ • Fase 0: Eliminar asset 2.46MB    │
│ • Memoización de snapshots        │ • Fase 1: shadowBlur condicional   │
│ • Reanimación asistida (<70px)    │ • Fase 1: SW ignoreSearch: true    │
│ • Arrastre robusto + deslizamiento│ • Fase 2: SW Cache-First estático  │
│ • Game Over no prematuro          │ • Fase 3: Offscreen Sprite Cache   │
│ • Cámara de seguimiento al cuerpo │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

### Componente 1: Servidor — Concurrencia de Red y Memoización

#### [MODIFY] [server.py](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/server/server.py)
- **Broadcast Concurrente:** Sustituir el bucle secuencial `for w, info in list(CONNECTIONS.items()): await send_json(w, snapshot)` por un envío paralelo utilizando `asyncio.gather(*tasks, return_exceptions=True)` con timeout individual defensivo (`asyncio.wait_for(..., timeout=0.035)`). Si un cliente móvil experimenta lag o pérdida de paquetes, ya no detendrá el bucle principal de la sala.

#### [MODIFY] [game_state.py](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/server/game_state.py)
- **Memoización de Snapshot Común:** En `get_snapshot_for_player` / `tick`:
  - Pre-calcular una sola vez por tick la serialización de entidades comunes de la sala (`cats`, `skeleton_cats`, `carnivorous_plants`, `orbs`, `invis_buttons`, `clones`, `collectibles`, `bodies`, `task_bar`, `timestamp`).
  - Reducir el consumo de CPU del servidor en ~70% al evitar serializaciones N veces repetidas por cada tick.

---

### Componente 2: Servidor — Reanimación Asistida y Lógica de Partida

#### [MODIFY] [game_state.py](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/server/game_state.py)
- **Reanimación Asistida en `tick_dead_bodies`:**
  - `revive_rate = 0.0` si no hay compañeros vivos cerca (`helpers_nearby == []`).
  - Si hay compañeros vivos a <70px: `revive_rate = 1.0 + (len(helpers_nearby) - 1) * 1.5`.
  - En `boost_revive`: descuento directo de 1.5s y liberación obligatoria del cuerpo si un gato lo estaba arrastrando (`cat.take_hit_and_drop_body`).
- **Game Over No Prematuro en `check_game_over`:**
  - Si `alive_crewmates == 0`, comprobar si aún existen cuerpos en `self.dead_bodies` pendientes de resolución (`not b.get("is_trapped_in_plant")` o plantas en digestión).
  - Mantener la sala en estado `PLAYING` para que la cinemática de arrastre, persecución y digestión continúe en vivo.
  - Declarar victoria del Impostor únicamente cuando todos los cuerpos hayan sido digeridos o no queden tripulantes rescatables.

---

### Componente 3: Servidor — Arrastre y Navegación Robusta de Gatos Zombi

#### [MODIFY] [game_state.py](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/server/game_state.py)
- **Retención Persistente del Cuerpo:** Si todas las plantas están temporalmente ocupadas (`idle_plants` vacío), el gato **no soltará el cuerpo**; navegará hacia la planta más cercana y esperará a que termine su ciclo.
- **Evasión Tangencial de Obstáculos:** En `tick_swarm`, si el desplazamiento del gato es bloqueado por una pared o mesa (`hypot(new_pos - old_pos) < threshold`), evaluar vectores tangenciales en $\pm 45^\circ / \pm 90^\circ$ para deslizarse alrededor de los obstáculos suavemente.
- **Ampliación de Radio de Recogida:** Incrementar distancia de agarre de 28px a 38px para evitar fallos de interacción en esquinas.

---

### Componente 4: Cliente — Cámara de Espectador, HUD Post-Muerte y Limpieza

#### [DELETE] [Gemini_Generated_Imagen.jfif](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/icons/Gemini_Generated_Imagen.jfif)
- Eliminar el asset huérfano de 2.46 MB del repositorio (`git rm`).

#### [MODIFY] [game.js](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/js/game.js)
- **Cámara Dinámica de Derribado:** Si `!me.alive`, la cámara (`this.camera.x`, `this.camera.y`) transiciona fluidamente hacia las coordenadas de su cuerpo en `this.deadBodies` (`myBody.x`, `myBody.y`). El jugador ve exactamente cómo el gato zombi lo transporta, la cuerda tensa y el destino hacia la maceta carnívora.
- **Gatear `shadowBlur` por Calidad Gráfica:** En las líneas 4136, 4148 y 4181, aplicar sombras difusas solo cuando `this.graphicsQuality !== "low"` y resetear a 0 inmediatamente tras el trazo.

#### [MODIFY] [ui.js](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/js/ui.js)
- **Supresión de Game Over Bloqueante:** No mostrar `#game-over-modal` mientras el jugador esté derribado y haya cuerpos en juego.
- **Banner de Espectador / Estado de Derribado:**
  - 🟡 *"DERRIBADO: Esperando auxilio de un compañero"*
  - 🔴 *"¡GATO ZOMBI ARRASTRANDO TU CUERPO A LA MACETA DE VENUS!"*
  - 🌺 *"¡ATRAPADO EN LA PLANTA VENUS! Siendo digerido..."*

---

### Componente 5: Cliente — Service Worker y Cacheo de Sprites

#### [MODIFY] [sw.js](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/sw.js)
- **Soporte `ignoreSearch: true`:** Corregir el fallback de caché para que las consultas con `?v=13` coincidan con los recursos precacheados.
- **Estrategia Híbrida Cache-First / Stale-While-Revalidate:**
  - `STATIC_ASSETS` (`.js`, `.css`, `.png`, `.svg`, `.json`): Cache-first con actualización en segundo plano.
  - `index.html`: Network-first para refrescar versiones de scripts de inmediato.

#### [NEW] [sprite_cache.js](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/js/sprite_cache.js) (o integrado en [game.js](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/js/game.js))
- Sistema de `SpriteCache` con canvas offscreen para pre-renderizar los avatares según combinación `character + hat + skin + color`.
- Invalidación de caché en evento de red `update_customization`.
- En calidad `"ultra"`, permitir dibujo vectorial en tiempo real; en `"low"` y `"medium"`, usar sprites cacheados con `drawImage`.

#### [MODIFY] [index.html](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/client/index.html)
- Actualización del cache-busting a `?v=13` en todos los scripts y hojas de estilo.

---

## 5. Plan de Verificación

### Pruebas Automatizadas
1. **Suite de Pruebas Existente:**
   ```bash
   python3 -m unittest discover -s server -p "test_*.py"
   ```
   *Criterio de éxito:* 24/24 pruebas pasando sin regresiones.
2. **Nuevas Pruebas de Reanimación y Estado:**
   Crear `server/test_assisted_revive_and_gameover.py` para validar:
   - Cuerpo sin compañeros: `revive_timer` permanece inalterado a los 20s.
   - Compañero cercano: `revive_timer` disminuye proporcionalmente.
   - 0 tripulantes vivos con cuerpo activo: `check_game_over()` retorna `False`.
   - Gato zombi retiene el cuerpo si las plantas están ocupadas.
3. **Verificación de Sintaxis JavaScript:**
   ```bash
   node --check client/js/game.js
   node --check client/js/ui.js
   node --check client/sw.js
   ```

### Verificación Manual y Producción
1. **Prueba de Red y Multijugador Concurrente:**
   - Conectar simultáneamente 2 a 4 dispositivos (escritorio y móviles).
   - Verificar movimiento fluido a 30 FPS sin pausas ni micro-tirones al enviar los snapshots.
2. **Ciclo Completo de Arrastre y Rescate:**
   - Derribar a un tripulante y comprobar que la cámara sigue su cuerpo arrastrado por el gato zombi.
   - Confirmar que no aparece la ventana de "VOLVER A LA SALA" interrumpiendo la experiencia.
   - Interceptar al gato con un puñetazo, verificar que suelta el cuerpo y reanimarlo con el botón "REANIMAR".
3. **Verificación PWA y Rendimiento:**
   - Inspeccionar con Chrome DevTools (pestaña Performance y Application).
   - Confirmar que en calidad gráfica `"low"` no hay llamadas costosas a `shadowBlur`.
   - Probar modo avión / desconexión para verificar carga instantánea de la PWA desde caché.
4. **Despliegue en Producción:**
   - Push a rama `main` en GitHub y verificación del despliegue en Railway (`https://matias-brus-impostor-chase-production.up.railway.app`).
