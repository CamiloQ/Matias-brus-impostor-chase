# Auditoría Kiro + Generación de Código y Agent Hook
## Rediseño Estético de Clones Impostores (`clone-aesthetics-overhaul`)

**Agente Kiro:** `clone-auditor-worker` (`.kiro/agents/clone-auditor-worker.json`)  
**Hook Activo:** `Clone & Player 3D Sprite Parity Guard` (`.kiro/hooks/clone-sprite-parity.kiro.hook` y `.kiro/hooks/clone-sprite-parity.json`)  
**Especificación EARS:** `.kiro/specs/clone-aesthetics-overhaul/requirements.md`  
**Plan Auditado:** `docs/superpowers/plans/2026-10-20-clone-aesthetics-overhaul.md`

---

## 1. Auditoría Kiro del Plan (`clone-auditor-worker`)

| Criterio Evaluado | Estado | Observación Técnica de Kiro |
| :--- | :---: | :--- |
| **Causa raíz identificada** | ✅ Aprobado | `drawCloneImpostors(ctx)` en `client/js/game.js:2884` dibujaba un círculo plano (`arc(0,0,18)`), un rectángulo gris (`fillRect(-3,0,6,14)`) y un óvalo rojo sin usar el pipeline 3D de personajes. |
| **Fidelidad de atributos en servidor** | ✅ Aprobado | `CloneImpostor` en `server/game_state.py:1050` debe preservar `character_num` y `original_id` en `to_dict()`, y no marcar `closest_target.alive = False` prematuramente dentro de `CloneImpostor.tick()` para que `GameRoom.tick()` genere el cuerpo derribado revivible con `create_dead_body()`. |
| **Interpolación a 60 FPS (`renderX`/`renderY`/`walkAnim`)** | ⚠️ Mejora añadida en auditoría | Además de interpolar `renderX` y `renderY` en `handleSync()` y `update(dt)`, el método `drawLighting()` (`client/js/game.js:2375`) y la detección de amenazas de Brus (`client/js/game.js:624`) deben usar `clone.renderX ?? clone.x` y `clone.renderY ?? clone.y` para evitar desfase visual entre la luz dinámica y el sprite 3D del clon. |
| **Paridad con los 11 personajes, 18 sombreros, 5 trajes y 13 armas** | ✅ Aprobado | Extraer `drawCharacterSprite(ctx, entity, options)` garantiza que cualquier cambio futuro en personajes, trajes (`drawSkin`), sombreros (`drawHat`) o armas (`drawWeapon`) se refleje automáticamente tanto en jugadores como en clones. |
| **Identidad visual de Clon ("Uncanny / Holographic Clone")** | ✅ Aprobado | El clon luce como una figura 3D idéntica al jugador clonado (mismo traje, insignia, cremallera, peinado, sombrero y arma), diferenciándose sutilmente por: 1) Anillo de energía clonada pulsante bajo los pies, 2) Pupilas con destello neón carmesí y sonrisa traviesa de impostor, 3) Líneas de escaneo holográficas sutiles sobre el traje. |

---

## 2. Definición del Kiro Agent Hook Creado

Archivos generados por Kiro en el repositorio:
- **Agente Kiro:** [`.kiro/agents/clone-auditor-worker.json`](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/.kiro/agents/clone-auditor-worker.json)
- **Hook v1 (`.kiro.hook`):** [`.kiro/hooks/clone-sprite-parity.kiro.hook`](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/.kiro/hooks/clone-sprite-parity.kiro.hook)
- **Hook v2 (`.json`):** [`.kiro/hooks/clone-sprite-parity.json`](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/.kiro/hooks/clone-sprite-parity.json)
- **Steering Rule:** [`.kiro/steering/clone-sprite-parity.md`](file:///run/media/camilo-q/DATA/USER/1.CQ_PC/0.Antigravity/1.Asesorias/04_Matias_Brus_impostor_chase/.kiro/steering/clone-sprite-parity.md)

---

## 3. Código Generado por Kiro (`clone-auditor-worker`)

### 3.1 Servidor (`server/game_state.py`)
```python
class CloneImpostor:
    """Evil impostor clone generated when a player touches the light orb"""

    def __init__(self, clone_id, creator_player):
        """Docstring for __init__."""
        self.id = clone_id
        self.name = f"{creator_player.name} (CLON)"
        self.gender = getattr(creator_player, "gender", "boy")
        self.character = getattr(creator_player, "character", "matias")
        self.character_num = getattr(creator_player, "character_num", 1)
        self.color = creator_player.color
        self.hat = creator_player.hat
        self.skin = creator_player.skin
        self.weapon = creator_player.weapon
```
Y en `CloneImpostor.tick()` + `to_dict()`:
- Dejar que `GameRoom.tick()` detecte `p.alive and p.hp <= 0` para invocar `self.create_dead_body(p)`.
- Exportar `"original_id": self.original_id` y `"character_num": self.character_num` en `to_dict()`.

### 3.2 Cliente (`client/js/game.js`)
- Sincronización con persistencia de `renderX`, `renderY`, `targetX`, `targetY`, `walkAnim` en `handleSync(snapshot)` y `update(dt)`.
- Método compartido `drawCharacterSprite(ctx, p, options = { isClone: false })` invocado desde `drawCloneImpostors(ctx)` y `drawPlayers(ctx)`.
