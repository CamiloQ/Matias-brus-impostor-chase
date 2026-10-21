# Clone Aesthetics Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primitive circle-and-oval placeholder rendering of `CloneImpostor` entities with true-to-life 3D cloned character figures that replicate every visual detail of their source player (3D suit, chest badge, zipper, custom skin outfit, 3D face, character-specific eyes/visor/whiskers/ears, gender hair/pigtails, hat, weapon, and walking animation) enhanced with subtle holographic clone FX.

**Architecture:** Extract the core 3D character sprite drawing logic from `GameEngine.drawPlayers()` into a shared, reusable method `GameEngine.drawCharacterSprite(ctx, entity, options)` in `client/js/game.js`. Add client-side position interpolation (`renderX`, `renderY`) and velocity-driven walk cycle animation (`walkAnim`) for clones in `handleSync()` and `update(dt)`. On the server (`server/game_state.py`), ensure `CloneImpostor` preserves full character metadata (`character_num`, `original_id`, `skin`, `hat`, `weapon`, `gender`) and leaves a revivable downed body when its melee attack reduces a player's HP to 0.

**Tech Stack:** Python 3 (`unittest`, `asyncio` WebSocket server), Vanilla HTML5 Canvas 2D (`client/js/game.js`), Service Worker PWA (`client/sw.js`), Kiro Specs & Agent Hooks (`.kiro/`).

**Spec:** `.kiro/specs/clone-aesthetics-overhaul/requirements.md` and `.kiro/specs/clone-aesthetics-overhaul/design.md`

## Global Constraints

- Zero external JS dependencies; 100% procedural HTML5 2D Canvas rendering.
- Preserve all 11 official characters (`CHARACTERS_CATALOG`), 18 hats (`HATS_CATALOG`), 5 skins (`SKINS_CATALOG`), and 13 weapons (`WEAPONS_CATALOG`).
- Maintain 60 FPS rendering performance on mobile and desktop browsers.
- Keep `drawMiniMap(ctx)` (HUD) and `drawMinimap(canvas)` (Modal) separate.

---

### Task 1: Server-Side Clone Metadata Fidelity & Downed Body Creation

**Files:**
- Modify: `server/game_state.py:1050-1140`
- Test: `server/test_missing_flows.py`

**Interfaces:**
- Consumes: `Player` attributes (`id`, `name`, `gender`, `character`, `character_num`, `color`, `hat`, `skin`, `weapon`)
- Produces: `CloneImpostor.to_dict()` including `original_id`, `character_num`, `gender`, `character`, `color`, `hat`, `skin`, `weapon`, `vx`, `vy`, `hp`, `max_hp`, `is_clone`; and `GameRoom.tick()` creating a revivable dead body when a clone reduces a player's HP to 0.

- [ ] **Step 1: Write the failing test in `server/test_missing_flows.py`**

```python
    def test_clone_preserves_full_appearance_and_creates_downed_body_on_kill(self):
        """CloneImpostor copies all cosmetic fields and leaves a revivable body when downing a player."""
        room = GameRoom("ROOM-CLONE-AESTHETIC")
        p1 = room.add_player("p1", "Reina", gender="girl", character="reina_flor")
        p2 = room.add_player("p2", "Victim", gender="boy", character="gato_azul")
        room.start_game()
        p1.role = "crewmate"
        p2.role = "crewmate"
        room.update_customization("p1", "crown_flower", "cyber_suit", "magic_flower", gender="girl", character="reina_flor")

        from game_state import CloneImpostor
        clone = CloneImpostor("clone_test", p1)
        room.clone_impostors.append(clone)

        d = clone.to_dict()
        self.assertEqual(d["character"], "reina_flor")
        self.assertEqual(d["gender"], "girl")
        self.assertEqual(d["hat"], "crown_flower")
        self.assertEqual(d["skin"], "cyber_suit")
        self.assertEqual(d["weapon"], "magic_flower")
        self.assertEqual(d["original_id"], "p1")
        self.assertIn("character_num", d)

        # Position clone next to p2 with 20 HP and trigger tick so clone downs p2
        p2.hp = 20
        clone.x, clone.y = p2.x + 10, p2.y
        clone.attack_cd = 0.0
        room.tick(0.05)

        self.assertFalse(p2.alive)
        self.assertEqual(len(room.dead_bodies), 1)
        self.assertEqual(room.dead_bodies[0]["victim_id"], "p2")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest discover -s server -p "test_missing_flows.py" -v`
Expected: FAIL (`original_id` / `character_num` missing in `CloneImpostor.to_dict()` and `len(room.dead_bodies) == 0` because `CloneImpostor.tick()` set `closest_target.alive = False` before `GameRoom.tick()` checked `if p.alive and p.hp <= 0`).

- [ ] **Step 3: Implement minimal server changes in `server/game_state.py`**

In `CloneImpostor.__init__`, store `self.character_num = getattr(creator_player, "character_num", 1)`.
In `CloneImpostor.tick`, when `closest_target.hp = max(0, closest_target.hp - 25)`, do NOT set `closest_target.alive = False` directly so `GameRoom.tick()` lines 1649-1652 handles `if p.alive and p.hp <= 0: p.alive = False; self.create_dead_body(p)`.
In `CloneImpostor.to_dict()`, include `"original_id": self.original_id` and `"character_num": self.character_num`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest discover -s server -p "test_*.py"`
Expected: PASS (50/50 tests).

---

### Task 2: Client-Side Clone Interpolation & Shared 3D Character Sprite Renderer

**Files:**
- Modify: `client/js/game.js`
- Modify: `client/index.html`
- Modify: `client/sw.js`

**Interfaces:**
- Consumes: `snapshot.clones` array from WebSocket `sync` packet
- Produces: `this.cloneEntities` Map (or stateful `this.cloneImpostors` array preserving `renderX`, `renderY`, `targetX`, `targetY`, `walkAnim`), `drawCharacterSprite(ctx, entity, options)`, and updated `drawCloneImpostors(ctx)` + `drawPlayers(ctx)`.

- [ ] **Step 1: Preserve clone interpolation state in `handleSync` and `update(dt)`**

In `client/js/game.js`:
- In `handleSync(snapshot)`, merge incoming `snapshot.clones` with existing clone state by `id` so `renderX`, `renderY`, and `walkAnim` persist across ticks instead of resetting 30 times per second.
- In `update(dt)`, smoothly interpolate `clone.renderX += (clone.targetX - clone.renderX) * 0.3` and `clone.renderY += (clone.targetY - clone.renderY) * 0.3`, and increment `clone.walkAnim = (clone.walkAnim || 0) + dt * 12` when `Math.hypot(clone.vx, clone.vy) > 10`.

- [ ] **Step 2: Extract `drawCharacterSprite(ctx, entity, options)` and upgrade `drawCloneImpostors(ctx)`**

In `client/js/game.js`:
- Create `drawCharacterSprite(ctx, p, options = { isClone: false })` containing the complete 3D character rendering pipeline:
  1. 3D drop shadow + `isClone` pulsing holographic ring under feet
  2. `gato_azul` animated tail
  3. 3D backpack / oxygen tank
  4. Animated 3D legs (`walkOffset`)
  5. White 3D sneakers with soles and laces
  6. 3D spherical shaded torso + character-specific chest badge + metallic zipper + kangaroo pocket + custom `drawSkin()`
  7. 3D face + rosy cheeks + character eyes/visor (with subtle crimson/magenta clone eye glint or holographic scanline when `options.isClone` is true) + whiskers/elf ears/third eye + gender hair/pigtails/bows
  8. Signature `drawHat(ctx, effectiveHat, 0, -22 + walkOffset * 0.5)`
  9. Signature `drawWeapon(ctx, effectiveWeapon, 16, 6 + walkOffset * 0.5)`
- Call `this.drawCharacterSprite(ctx, clone, { isClone: true })` inside `drawCloneImpostors(ctx)` and `this.drawCharacterSprite(ctx, p, { isClone: false })` inside `drawPlayers(ctx)`.

- [ ] **Step 3: Verify syntax and bump Service Worker cache to v8 (`?v=20`)**

Run: `node --check client/js/game.js client/js/ui.js client/sw.js`
Expected: 0 syntax errors.
