# Venus Flytrap, Zombie Cat Swarm Hauling & Revive Mechanic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement high-fidelity Venus Flytrap (*Dionaea muscipula*) potted plants, Skeleton Cat tail/ear animations and plant metamorphosis, Zombie Cat corpse hauling swarm, and a 20-second team-accelerated revive mechanic vs 25-second Venus digestion.

**Architecture:** Authoritative server handles entity states (`CarnivorousPlant` in macetas with idle/digesting 25s states, `ZombieCat` hauling dead bodies towards nearest plant, and `dead_bodies` with 20s revive timers accelerated by nearby alive crewmates). Client Canvas renders procedural Venus flytrap geometry based on the reference photo, animated skeleton cat vertebrae tails and ear twitches, dragging tethers, and revive circular progress rings.

**Tech Stack:** Python 3 (asyncio low-level WebSocket server), Vanilla JavaScript (HTML5 Canvas 2D), unittest, Railway CLI.

**Spec:** `docs/superpowers/specs/2026-09-20-venus-flytrap-zombie-swarm-design.md`

## Global Constraints
- Python backend must pass all existing and new unit tests (`python3 -m unittest discover -s server`).
- Client JavaScript must pass Node syntax checking (`node --check client/js/*.js`).
- Preserves 100% multiplayer visibility and real-time synchronization.
- Assets cache-busting bump to `?v=12` in `client/index.html`.

---

### Task 1: Server - Potted Venus Flytrap (`CarnivorousPlant`) Architecture
**Files:**
- Modify: `server/game_state.py`
- Test: `server/test_venus_and_zombie_swarm.py`

**Interfaces:**
- `CarnivorousPlant.__init__(plant_id, x, y, is_pot=True)`: `state="idle"`, `digestion_timer=0.0`, `trapped_victim_id=None`, `fed_count=0`
- `CarnivorousPlant.tick(dt, dead_bodies)`: handles 25.0s digestion cycle, devours body on timer expiry.
- `GameRoom.init_world_entities()`: spawns 4 initial strategic Venus macetas.

- [ ] **Step 1: Write failing unit test for CarnivorousPlant states and digestion**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement CarnivorousPlant idle/digesting states and static maceta spawns**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 2: Server - Skeleton Cat Metamorphosis & Zombie Cat Swarm Hauling
**Files:**
- Modify: `server/game_state.py`
- Test: `server/test_venus_and_zombie_swarm.py`

**Interfaces:**
- `SkeletonCat`: When `hp <= 0`, spawns a new `CarnivorousPlant` at `(skel.x, skel.y)`.
- `ZombieCat.tick(dt, dead_bodies, carnivorous_plants)`: claims free dead bodies, drags them at 115 px/s to nearest idle plant, drops body on punch/damage.

- [ ] **Step 1: Write failing unit test for skeleton metamorphosis and zombie cat body hauling**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement SkeletonCat plant spawn on death and ZombieCat hauling logic**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 3: Server - Downed Player Revive Mechanic (20s) & Team Acceleration
**Files:**
- Modify: `server/game_state.py`
- Modify: `server/server.py`
- Test: `server/test_venus_and_zombie_swarm.py`

**Interfaces:**
- `dead_bodies`: `revive_timer=20.0`, `carrier_cat_id=None`, `is_trapped_in_plant=False`.
- `GameRoom.accelerate_revive(helper_id, body_id)` / automatic nearby alive teammate proximity acceleration (3x).
- Player revival when `revive_timer <= 0`: restores `player.alive=True`, `hp=60`, clears body.

- [ ] **Step 1: Write failing unit test for player revive after 20s and teammate speedup**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement revive countdown, teammate acceleration, and revival event**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 4: Client - Venus Flytrap (*Dionaea muscipula*) Procedural Canvas Graphics
**Files:**
- Modify: `client/js/game.js`

**Interfaces:**
- `drawCarnivorousPlants(ctx)`: renders terracotta planter pot, basal leaf rosette, paired scarlet/crimson bivalve lobes with lime-green edges, interlocking marginal cilia teeth, trigger hairs, idle breathing animation, and 25s closed digestion pulsing.

- [ ] **Step 1: Implement terracotta maceta base and leafy rosette in `drawCarnivorousPlants`**
- [ ] **Step 2: Implement bivalve clam-shell lobes with scarlet interior and lime margins**
- [ ] **Step 3: Implement marginal cilia teeth and open vs closed digestion animation (25s timer HUD)**
- [ ] **Step 4: Test in browser/node syntax check**
- [ ] **Step 5: Commit changes**

---

### Task 5: Client - Skeleton Cat Tail/Ear Animations & Zombie Hauling Tether & Revive HUD
**Files:**
- Modify: `client/js/game.js`
- Modify: `client/js/ui.js`

**Interfaces:**
- `drawSkeletonCats(ctx)`: sinusoidal tail vertebral wave and ear twitches.
- `drawDeadBodies(ctx)`: circular 20s revive progress ring and hauling rope/tether when attached to a Zombie Cat.
- Revive interaction button for nearby teammates.

- [ ] **Step 1: Add tail sway and ear twitching in `drawSkeletonCats`**
- [ ] **Step 2: Add revive timer circular HUD and dragging tether in `drawDeadBodies`**
- [ ] **Step 3: Add interactive revive button in `client/js/ui.js`**
- [ ] **Step 4: Check JS syntax with node**
- [ ] **Step 5: Commit changes**

---

### Task 6: Deployment & Production Verification on Railway
**Files:**
- Modify: `client/index.html` (bump `?v=12`)
- Test: Full backend test suite + Railway deploy

- [ ] **Step 1: Bump script version to `?v=12` in `client/index.html`**
- [ ] **Step 2: Run full unit test suite `python3 -m unittest discover -s server`**
- [ ] **Step 3: Commit and push to `origin main`**
- [ ] **Step 4: Deploy to Railway via `railway up --detach`**
- [ ] **Step 5: Verify production status HTTP 200 with `v=12`**
