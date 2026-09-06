const CHARACTER_THEMES = {
    matias: { suitColor: "#f1c40f", suitShade: "#b45309", light: "#fef08a", pocket: "#d97706" },
    fantasma: { suitColor: "#94a3b8", suitShade: "#475569", light: "#e2e8f0", pocket: "#334155" },
    gato_azul: { suitColor: "#3b82f6", suitShade: "#1d4ed8", light: "#93c5fd", pocket: "#1e40af" },
    reina_flor: { suitColor: "#f472b6", suitShade: "#db2777", light: "#fbcfe8", pocket: "#be185d" },
    duende_verde: { suitColor: "#22c55e", suitShade: "#15803d", light: "#86efac", pocket: "#166534" },
    granjero_rojo: { suitColor: "#ef4444", suitShade: "#b91c1c", light: "#fca5a5", pocket: "#991b1b" },
    sanador_naranja: { suitColor: "#f97316", suitShade: "#c2410c", light: "#fdba74", pocket: "#9a3412" },
    nina_blanca: { suitColor: "#f8fafc", suitShade: "#94a3b8", light: "#ffffff", pocket: "#cbd5e1" },
    mistico_uva: { suitColor: "#9333ea", suitShade: "#6b21a8", light: "#d8b4fe", pocket: "#581c87" },
    mago_negro: { suitColor: "#27272a", suitShade: "#09090b", light: "#52525b", pocket: "#18181b" },
    ciclope_astral: { suitColor: "#475569", suitShade: "#1e293b", light: "#94a3b8", pocket: "#0f172a" }
};

class GameEngine {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");

        this.graphicsQuality = localStorage.getItem("chase_gfx_quality") || "low";
        this.dpr = window.devicePixelRatio || 1;
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;

        // Offscreen lighting canvas for zero-GC 60fps dynamic lighting
        this.lightingCanvas = document.createElement("canvas");
        this.lightingCtx = this.lightingCanvas.getContext("2d");

        this.map = null;
        this.myPlayerId = null;
        this.myRole = "crewmate";
        this.assignedTasks = [];

        this.players = new Map();
        this.zombieCats = [];
        this.lightOrbs = [];
        this.cloneImpostors = [];
        this.collectibles = [];
        this.deadBodies = [];
        this.punchEffects = []; // [{x, y, text, time, color}]
        this.ambientParticles = [];
        this.sparks = [];
        this.footstepDust = [];
        this.screenShake = 0;
        this.gameState = "LOBBY";

        // Koira-inspired companion: Brus the faithful puppy
        this.brusCompanion = {
            x: 1350,
            y: 720,
            targetX: 1350,
            targetY: 720,
            facingRight: true,
            state: "sitting",
            sitTimer: 0,
            celebrateTimer: 0,
            walkAnim: 0,
            hasAlerted: false
        };

        this.camera = { x: 1350, y: 700, zoom: 1.0 };
        this.inputVector = { x: 0, y: 0 };
        this.keys = {};

        // Proximity detection
        this.nearbyTask = null;
        this.nearbyVent = null;
        this.nearbyVictim = null;
        this.nearbyBody = null;
        this.nearbyCat = null;
        this.nearbyClone = null;
        this.nearWardrobe = false;
        this.nearEmergencyButton = false;

        this.lastFrameTime = performance.now();
        this.initEventListeners();
    }

    init(mapData, playerId) {
        this.map = mapData;
        this.myPlayerId = playerId;
        this.resize();
        window.addEventListener("resize", () => this.resize());
        window.addEventListener("orientationchange", () => {
            setTimeout(() => this.resize(), 150);
        });
        requestAnimationFrame((t) => this.renderLoop(t));
    }

    setQuality(q) {
        this.graphicsQuality = q;
        localStorage.setItem("chase_gfx_quality", q);
        this.resize();
    }

    initAmbientParticles() {
        this.ambientParticles = [];
        const count = this.graphicsQuality === "ultra" ? 65 : (this.graphicsQuality === "medium" ? 40 : 22);
        for (let i = 0; i < count; i++) {
            this.ambientParticles.push({
                x: Math.random() * 2800,
                y: Math.random() * 1900,
                vx: (Math.random() - 0.5) * 10,
                vy: -8 - Math.random() * 14, // Gentle upward drift
                size: 1.2 + Math.random() * 2.5,
                alpha: 0.25 + Math.random() * 0.45,
                pulse: Math.random() * Math.PI * 2,
                swaySeed: Math.random() * 100
            });
        }
    }

    triggerScreenShake(intensity = 5) {
        if (this.graphicsQuality !== "low") {
            this.screenShake = Math.min(15, this.screenShake + intensity);
        }
    }

    spawnSparks(x, y, count = 8, color = "#ffd600") {
        if (this.graphicsQuality === "low") return;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 140;
            this.sparks.push({
                x,
                y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                color,
                life: 0.35 + Math.random() * 0.25,
                maxLife: 0.6,
                size: 1.5 + Math.random() * 2
            });
        }
    }

    resize() {
        this.dpr = (this.graphicsQuality === "low") ? 1 : Math.min(2.5, window.devicePixelRatio || 1);
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.screenWidth = w;
        this.screenHeight = h;

        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;

        this.ctx.resetTransform();
        this.ctx.scale(this.dpr, this.dpr);

        if (this.lightingCanvas) {
            const lightScale = (this.graphicsQuality === "ultra") ? 0.75 : 0.5;
            this.lightingCanvas.width = Math.max(10, Math.round(w * lightScale));
            this.lightingCanvas.height = Math.max(10, Math.round(h * lightScale));
        }

        this.initAmbientParticles();
    }

    initEventListeners() {
        window.addEventListener("keydown", (e) => {
            this.keys[e.code] = true;
            this.handleKeyShortcuts(e);
            this.updateInputVector();
        });

        window.addEventListener("keyup", (e) => {
            this.keys[e.code] = false;
            this.updateInputVector();
        });

        // Direct touch / click on world entities like Emergency Pedestal
        this.canvas.addEventListener("pointerdown", (e) => {
            if (this.gameState !== "PLAYING") return;
            const rect = this.canvas.getBoundingClientRect();
            const clickScreenX = (e.clientX - rect.left);
            const clickScreenY = (e.clientY - rect.top);
            const worldX = (clickScreenX - this.screenWidth / 2) / this.camera.zoom + this.camera.x;
            const worldY = (clickScreenY - this.screenHeight / 2) / this.camera.zoom + this.camera.y;

            const eb = this.map && this.map.emergency_button;
            if (eb) {
                const distToEb = Math.hypot(worldX - eb.x, worldY - eb.y);
                if (distToEb <= 65 && this.nearEmergencyButton) {
                    if (window.soundEngine) window.soundEngine.playAlarm();
                    if (window.uiManager) window.uiManager.vibrate([100, 50, 100]);
                    window.network.sendReport(false);
                }
            }
        });
    }

    handleKeyShortcuts(e) {
        if (e.code === "Space" || e.code === "KeyE") {
            if (this.nearWardrobe) {
                window.uiManager.openWardrobeModal();
            } else if (this.nearbyTask) {
                if (this.nearbyTask.id === "task_8") {
                    window.uiManager.openSongBattleModal();
                } else {
                    window.uiManager.openTaskModal(this.nearbyTask);
                }
            } else if (this.nearEmergencyButton) {
                window.soundEngine.playAlarm();
                window.network.sendReport(false);
            }
        } else if (e.code === "KeyF" || e.code === "KeyJ") {
            // Melee Brawl Attack
            this.triggerPunch();
        } else if (e.code === "KeyQ" && this.myRole === "impostor") {
            if (this.nearbyVictim) {
                window.network.sendKill(this.nearbyVictim.id);
            }
        } else if (e.code === "KeyV" && this.myRole === "impostor") {
            if (this.nearbyVent) {
                window.network.sendVent(this.nearbyVent.id);
            }
        } else if (e.code === "KeyR") {
            if (this.nearbyBody) {
                window.network.sendReport(true, this.nearbyBody.id);
            }
        } else if (e.code === "KeyM") {
            if (window.uiManager && window.uiManager.btnToggleMap) {
                window.uiManager.btnToggleMap.click();
            }
        }
    }

    triggerPunch() {
        const me = this.players.get(this.myPlayerId);
        if (me && me.alive) {
            if (me.weapon === "pan") {
                window.soundEngine.playPanHit();
            } else if (me.weapon === "energy_sword") {
                window.soundEngine.playSwordHit();
            } else {
                window.soundEngine.playPanHit();
            }
            if (this.brusCompanion) {
                this.brusCompanion.celebrateTimer = 1.0;
                this.brusCompanion.state = "celebrating";
            }
            window.network.send({ type: "punch" });
        }
    }

    updateInputVector() {
        let vx = 0;
        let vy = 0;
        if (this.keys["KeyW"] || this.keys["ArrowUp"]) vy -= 1;
        if (this.keys["KeyS"] || this.keys["ArrowDown"]) vy += 1;
        if (this.keys["KeyA"] || this.keys["ArrowLeft"]) vx -= 1;
        if (this.keys["KeyD"] || this.keys["ArrowRight"]) vx += 1;

        if (window.uiManager && window.uiManager.joystickVector) {
            const jv = window.uiManager.joystickVector;
            if (Math.hypot(jv.x, jv.y) > 0.1) {
                vx = jv.x;
                vy = jv.y;
            }
        }

        const len = Math.hypot(vx, vy);
        if (len > 0) {
            vx /= len;
            vy /= len;
        }

        if (this.inputVector.x !== vx || this.inputVector.y !== vy) {
            this.inputVector = { x: vx, y: vy };
            window.network.sendInput(vx, vy);
        }
    }

    handleSync(snapshot) {
        this.gameState = snapshot.state;
        this.deadBodies = snapshot.bodies || [];
        this.zombieCats = snapshot.cats || [];
        this.lightOrbs = snapshot.orbs || [];
        this.invisButtons = snapshot.invis_buttons || [];
        this.cloneImpostors = snapshot.clones || [];
        this.collectibles = snapshot.collectibles || [];

        const activeIds = new Set();
        snapshot.players.forEach(pData => {
            activeIds.add(pData.id);
            let p = this.players.get(pData.id);
            if (!p) {
                p = { ...pData, targetX: pData.x, targetY: pData.y, renderX: pData.x, renderY: pData.y, walkAnim: 0, in_stealth: Boolean(pData.in_stealth) };
                this.players.set(pData.id, p);
            } else {
                p.name = pData.name;
                p.targetX = pData.x;
                p.targetY = pData.y;
                p.vx = pData.vx;
                p.vy = pData.vy;
                p.hp = pData.hp;
                p.alive = pData.alive;
                p.role = pData.role;
                p.hat = pData.hat;
                p.skin = pData.skin;
                p.weapon = pData.weapon;
                p.gender = pData.gender || "boy";
                p.character = pData.character || "matias";
                p.color = pData.color || p.color;
                p.score = pData.score;
                p.kill_cd = pData.kill_cd;
                p.in_vent = pData.in_vent;
                p.vent_id = pData.vent_id;
                p.is_invisible = pData.is_invisible;
                p.invis_time_left = pData.invis_time_left;
                p.is_disguised = pData.is_disguised;
                p.disguise_timer = pData.disguise_timer;
                p.ghost_button_cd = pData.ghost_button_cd;
                p.completed_tasks_count = pData.completed_tasks_count;
                p.in_stealth = Boolean(pData.in_stealth);
            }

            if (pData.id === this.myPlayerId) {
                this.myRole = pData.role;
                this.myGender = pData.gender;
                this.myCharacter = pData.character;
                if (Array.isArray(pData.completed_tasks)) {
                    this.completedTasks = new Set(pData.completed_tasks);
                }
            }
        });

        // Trigger sound on collectible pickup
        if (this.lastCollectiblesCount !== undefined && snapshot.collectibles) {
            if (snapshot.collectibles.length < this.lastCollectiblesCount) {
                if (window.soundEngine) window.soundEngine.playItemPickup();
            }
        }
        this.lastCollectiblesCount = (snapshot.collectibles || []).length;

        // Trigger sound on clone spawning
        if (this.lastCloneCount !== undefined && snapshot.clones) {
            if (snapshot.clones.length > this.lastCloneCount) {
                if (window.soundEngine) window.soundEngine.playCloneBeam();
            }
        }
        this.lastCloneCount = (snapshot.clones || []).length;

        for (let id of this.players.keys()) {
            if (!activeIds.has(id)) {
                this.players.delete(id);
            }
        }

        this.checkProximities();
    }

    checkProximities() {
        const me = this.players.get(this.myPlayerId);
        if (!me || !this.map || !me.alive) {
            this.nearbyTask = null;
            this.nearbyVent = null;
            this.nearbyVictim = null;
            this.nearbyBody = null;
            this.nearbyCat = null;
            this.nearbyClone = null;
            this.nearWardrobe = false;
            this.nearEmergencyButton = false;
            return;
        }

        // 1. Tasks (only uncompleted ones)
        this.nearbyTask = null;
        if (this.myRole === "crewmate" && this.assignedTasks) {
            for (let t of this.map.tasks) {
                if (this.assignedTasks.includes(t.id)) {
                    if (this.completedTasks && this.completedTasks.has(t.id)) {
                        continue;
                    }
                    const dist = Math.hypot(me.renderX - t.x, me.renderY - t.y);
                    if (dist <= t.radius + 20) {
                        this.nearbyTask = t;
                        break;
                    }
                }
            }
        }

        // 2. Wardrobe Station (In Bedroom)
        const wb = this.map.wardrobe;
        if (wb) {
            const dist = Math.hypot(me.renderX - wb.x, me.renderY - wb.y);
            this.nearWardrobe = (dist <= wb.radius + 20);
        }

        // 3. Vents
        this.nearbyVent = null;
        if (this.myRole === "impostor") {
            for (let v of this.map.vents) {
                const dist = Math.hypot(me.renderX - v.x, me.renderY - v.y);
                if (dist <= 70) {
                    this.nearbyVent = v;
                    break;
                }
            }
        }

        // 4. Nearby Victim (Impostor kill)
        this.nearbyVictim = null;
        if (this.myRole === "impostor" && me.kill_cd <= 0) {
            let closestDist = 75;
            for (let [id, p] of this.players.entries()) {
                if (id !== this.myPlayerId && p.alive && p.role !== "impostor") {
                    const dist = Math.hypot(me.renderX - p.renderX, me.renderY - p.renderY);
                    if (dist < closestDist) {
                        closestDist = dist;
                        this.nearbyVictim = p;
                    }
                }
            }
        }

        // 5. Dead body
        this.nearbyBody = null;
        for (let b of this.deadBodies) {
            const dist = Math.hypot(me.renderX - b.x, me.renderY - b.y);
            if (dist <= 90) {
                this.nearbyBody = b;
                break;
            }
        }

        // 6. Emergency Button
        const eb = this.map.emergency_button;
        if (eb) {
            const dist = Math.hypot(me.renderX - eb.x, me.renderY - eb.y);
            this.nearEmergencyButton = (dist <= eb.radius + 30);
        }

        if (window.uiManager) {
            window.uiManager.updateActionButtons({
                task: this.nearbyTask,
                wardrobe: this.nearWardrobe,
                vent: this.nearbyVent,
                victim: this.nearbyVictim,
                body: this.nearbyBody,
                emergency: this.nearEmergencyButton,
                killCd: me.kill_cd,
                role: this.myRole,
                alive: me.alive,
                hp: me.hp,
                score: me.score,
                is_disguised: me.is_disguised,
                disguise_timer: me.disguise_timer,
                ghost_button_cd: me.ghost_button_cd
            });
        }
    }

    renderLoop(currentTime) {
        const dt = Math.min(0.1, (currentTime - this.lastFrameTime) / 1000);
        this.lastFrameTime = currentTime;

        try {
            this.update(dt);
            this.render();
        } catch (err) {
            console.error("Game loop render error:", err);
        } finally {
            requestAnimationFrame((t) => this.renderLoop(t));
        }
    }

    update(dt) {
        const me = this.players.get(this.myPlayerId);
        if (me) {
            this.camera.x += (me.renderX - this.camera.x) * 0.12;
            this.camera.y += (me.renderY - this.camera.y) * 0.12;

            // Update current room name pill on HUD
            const rx = me.renderX;
            const ry = me.renderY;
            let currentRoom = "PASILLO CONECTOR";
            if (rx < 600 && ry < 600) {
                currentRoom = "REACTOR DE ENERGÍA";
            } else if (rx < 700 && ry >= 950) {
                currentRoom = "ELECTRICIDAD & FUSIBLES";
            } else if (rx >= 800 && rx <= 1900 && ry >= 300 && ry <= 1100) {
                currentRoom = "CAFETERÍA MATIAS & BRUS";
            } else if (rx >= 950 && rx <= 1800 && ry >= 1300) {
                currentRoom = "SALA DE MÚSICA & BAILE";
            } else if (rx >= 2000 && ry <= 650) {
                currentRoom = "DORMITORIOS & VESTIDOR";
            } else if (rx >= 2000 && ry >= 750) {
                currentRoom = "NAVEGACIÓN & RADAR";
            }
            const roomEl = document.getElementById("current-room-name");
            if (roomEl && roomEl.textContent !== currentRoom) {
                roomEl.textContent = currentRoom;
            }
        }

        this.players.forEach(p => {
            if (p.targetX !== undefined) {
                p.renderX += (p.targetX - p.renderX) * 0.3;
                p.renderY += (p.targetY - p.renderY) * 0.3;
            }
            if (Math.hypot(p.vx, p.vy) > 10) {
                p.walkAnim = (p.walkAnim || 0) + dt * 12;
            } else {
                p.walkAnim = 0;
            }
        });

        // Update Brus Companion (Koira-inspired reactive companion dynamics)
        if (this.brusCompanion && this.gameState === "PLAYING") {
            const brus = this.brusCompanion;
            let owner = null;
            this.players.forEach(p => {
                if (p.character === "matias" && p.alive) owner = p;
            });
            if (!owner) owner = me;

            if (owner && owner.alive && !owner.in_vent) {
                const ownerVx = owner.vx || 0;
                const ownerVy = owner.vy || 0;
                const ownerFacingRight = (ownerVx > 5) ? true : ((ownerVx < -5) ? false : brus.facingRight);

                brus.targetX = owner.renderX - (ownerFacingRight ? 32 : -32);
                brus.targetY = owner.renderY + 12;

                const dx = brus.targetX - brus.x;
                const dy = brus.targetY - brus.y;
                const dist = Math.hypot(dx, dy);

                if (brus.celebrateTimer > 0) {
                    brus.celebrateTimer -= dt;
                    brus.state = "celebrating";
                } else if (dist > 18) {
                    brus.state = "trotting";
                    brus.sitTimer = 0;
                    const spd = Math.min(280, Math.max(120, dist * 5.2));
                    brus.x += (dx / dist) * spd * dt;
                    brus.y += (dy / dist) * spd * dt;
                    brus.facingRight = (dx >= 0);
                    brus.walkAnim += dt * 14;
                } else {
                    brus.sitTimer += dt;
                    if (brus.sitTimer > 0.3) {
                        brus.state = "sitting";
                        brus.facingRight = ownerFacingRight;
                    }
                }

                // Threat detection: Zombie Cat or Clone within 220px
                let threatFound = false;
                let threatAngle = 0;
                for (let cat of this.zombieCats) {
                    if (cat.alive) {
                        const cDist = Math.hypot(cat.x - brus.x, cat.y - brus.y);
                        if (cDist < 220) {
                            threatFound = true;
                            threatAngle = Math.atan2(cat.y - brus.y, cat.x - brus.x);
                            break;
                        }
                    }
                }
                if (!threatFound) {
                    for (let cl of this.cloneImpostors) {
                        if (cl.alive) {
                            const clDist = Math.hypot(cl.x - brus.x, cl.y - brus.y);
                            if (clDist < 230) {
                                threatFound = true;
                                threatAngle = Math.atan2(cl.y - brus.y, cl.x - brus.x);
                                break;
                            }
                        }
                    }
                }

                if (threatFound) {
                    brus.state = "alert";
                    brus.facingRight = Math.cos(threatAngle) >= 0;
                    if (!brus.hasAlerted) {
                        brus.hasAlerted = true;
                        if (window.soundEngine) window.soundEngine.playDogBark(true);
                    }
                } else {
                    brus.hasAlerted = false;
                }
            }
        }

        // Screen shake decay
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - dt * 20);
        }

        // Sparks decay
        this.sparks = this.sparks.filter(s => {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt;
            return s.life > 0;
        });

        // Ambient dust particles motion
        this.ambientParticles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.pulse += dt * 2;
            if (p.x < 0) p.x = 2800;
            if (p.x > 2800) p.x = 0;
            if (p.y < 0) p.y = 1900;
            if (p.y > 1900) p.y = 0;
        });

        // Punch impact floating texts
        this.punchEffects = this.punchEffects.filter(e => {
            e.y -= dt * 30;
            e.time -= dt;
            return e.time > 0;
        });
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);
        if (!this.map) return;

        ctx.save();

        let camX = this.camera.x;
        let camY = this.camera.y;
        if (this.screenShake > 0) {
            camX += (Math.random() - 0.5) * this.screenShake;
            camY += (Math.random() - 0.5) * this.screenShake;
        }

        ctx.translate(w / (2 * this.dpr) - camX, h / (2 * this.dpr) - camY);

        // 1. Space Floor
        this.drawFloor(ctx);

        // 3. Room Special Decor (Nevera, platos de comida humeantes, lavadora, muebles/sofá, TV)
        this.drawRoomDecor(ctx);

        // 4. Stations & Emergency Button
        this.drawStations(ctx);

        // 5. Vents Grates
        this.drawVents(ctx);

        // 6. Ghost Invisibility Buttons (Dropped by dead players)
        this.drawInvisButtons(ctx);

        // 7. Collectibles (Stars, Coins, Crystals from Design 4)
        this.drawCollectibles(ctx);

        // 8. Dead bodies
        this.drawDeadBodies(ctx);

        // 9. Light Orbs (Floating magic clone lights)
        this.drawLightOrbs(ctx);

        // 10. Zombie Cats
        this.drawZombieCats(ctx);

        // 11. Obstacles and Walls
        this.drawObstacles(ctx);

        // 12. Clones
        this.drawCloneImpostors(ctx);

        // 13. Players (With 3D spherical lighting, all-yellow suit, white sneakers, inside sewer crawl, disguise, invisibility)
        this.drawPlayers(ctx);

        // 13.1 Koira-inspired Companion: Brus the faithful puppy
        this.drawBrusCompanion(ctx);

        // 13.2 Koira-inspired Stealth shadow zone aura
        this.drawStealthVignette(ctx, w, h);

        // 14. Floating Punch Particles & Sparks
        this.drawPunchEffects(ctx);
        this.drawSparks(ctx);

        // 15. Ambient Dust Particles
        this.drawAmbientDust(ctx);

        // 16. Dynamic Realistic Lighting (Sol y Bombillas colgantes con balanceo y bloom, haz de linterna)
        this.drawLighting(ctx, w, h);

        ctx.restore();

        // 17. HUD: Off-screen player directional pointers (Flechas de radar hacia otros jugadores a distancia)
        this.drawOffScreenPlayerPointers(ctx);

        // 18. HUD: Holographic Mini-Map Radar (Mapa táctico en tiempo real)
        this.drawMiniMap(ctx);
    }

    drawOffScreenPlayerPointers(ctx) {
        if (!this.map || this.gameState !== "PLAYING") return;
        const me = this.players.get(this.myPlayerId);
        if (!me) return;

        const sw = this.screenWidth;
        const sh = this.screenHeight;
        const centerX = sw / 2;
        const centerY = sh / 2;

        this.players.forEach(p => {
            if (p.id === this.myPlayerId) return;
            if (!p.alive) return;
            // If in vent, only impostors can see
            if (p.in_vent && this.myRole !== "impostor") return;
            // If invisible, opponents cannot see
            if (p.is_invisible && me.alive) return;

            // Screen position of player in CSS pixels
            const sx = (p.renderX - this.camera.x) + centerX;
            const sy = (p.renderY - this.camera.y) + centerY;

            // Check if player is on screen (with comfortable padding)
            const padX = 55;
            const padY = 55;
            const isOnScreen = (sx >= padX && sx <= sw - padX && sy >= padY && sy <= sh - padY);

            // If player is far away / off screen, draw directional indicator!
            if (!isOnScreen) {
                const dx = p.renderX - me.renderX;
                const dy = p.renderY - me.renderY;
                const distPx = Math.hypot(dx, dy);
                const distM = Math.max(1, Math.round(distPx / 25)); // Meters

                const angle = Math.atan2(sy - centerY, sx - centerX);

                // Clamp to screen perimeter
                const borderMarginX = 60;
                const borderMarginY = 70;
                const edgeX = Math.max(borderMarginX, Math.min(sw - borderMarginX, centerX + Math.cos(angle) * (centerX - borderMarginX)));
                const edgeY = Math.max(borderMarginY, Math.min(sh - borderMarginY, centerY + Math.sin(angle) * (centerY - borderMarginY)));

                ctx.save();
                ctx.translate(edgeX, edgeY);

                const charKey = (p.character || "matias").toLowerCase();
                const theme = CHARACTER_THEMES[charKey] || (p.color ? { suitColor: p.color.hex } : CHARACTER_THEMES.matias);
                const mainColor = theme.suitColor;

                // Pulsing outer aura
                const pulse = (Math.sin(Date.now() / 250) + 1) * 0.5;
                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.5 + pulse * 0.4;
                ctx.beginPath();
                ctx.arc(0, 0, 20 + pulse * 4, 0, Math.PI * 2);
                ctx.stroke();

                // Directional Pointer Arrow (pointing toward the player)
                ctx.save();
                ctx.rotate(angle);
                ctx.fillStyle = mainColor;
                ctx.beginPath();
                ctx.moveTo(26, 0);
                ctx.lineTo(15, -8);
                ctx.lineTo(17, 0);
                ctx.lineTo(15, 8);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                // Central Avatar Bubble
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = "#0f172a";
                ctx.beginPath();
                ctx.arc(0, 0, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Character Icon inside bubble
                ctx.font = "13px 'Noto Color Emoji', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const icon = p.gender === "girl" ? "👧" : (p.character === "matias" ? "👦" : "🧑");
                ctx.fillText(icon, 0, 1);

                // Name & Distance Tag pill below badge
                const label = `${p.name} • ${distM}m`;
                ctx.font = "bold 10px 'Rajdhani', sans-serif";
                const textW = ctx.measureText(label).width;

                ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(-textW / 2 - 5, 18, textW + 10, 15, 7);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "#ffffff";
                ctx.fillText(label, 0, 26);

                ctx.restore();
            }
        });
    }

    drawMiniMap(ctx) {
        if (!this.map || this.gameState !== "PLAYING") return;
        const me = this.players.get(this.myPlayerId);
        if (!me) return;

        const sw = this.screenWidth;
        const sh = this.screenHeight;
        const isMobile = sw < 769;
        // On mobile, position bottom-left; on desktop, top-right under topBar
        const mw = isMobile ? 100 : 120;
        const mh = isMobile ? 62 : 75;
        const mx = isMobile ? 10 : (sw - mw - 12);
        const my = isMobile ? (sh - mh - 80) : 58;

        ctx.save();

        // Minimap background box
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.strokeStyle = "rgba(0, 242, 254, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 8);
        ctx.fill();
        ctx.stroke();

        // Minimap header
        ctx.font = "bold 8px 'Orbitron', sans-serif";
        ctx.fillStyle = "#00f2fe";
        ctx.textAlign = "left";
        ctx.fillText("📡 RADAR", mx + 7, my + 11);

        // Map scale
        const scaleX = (mw - 14) / this.map.width;
        const scaleY = (mh - 18) / this.map.height;
        const offX = mx + 7;
        const offY = my + 14;

        // Draw walls and doorways on radar
        ctx.fillStyle = "rgba(0, 242, 254, 0.25)";
        if (this.map.obstacles) {
            this.map.obstacles.forEach(obs => {
                if (obs.type === "wall") {
                    ctx.fillRect(offX + obs.x * scaleX, offY + obs.y * scaleY, Math.max(1, obs.w * scaleX), Math.max(1, obs.h * scaleY));
                }
            });
        }

        // Draw emergency button reference at (1350, 520)
        const ebX = offX + 1350 * scaleX;
        const ebY = offY + 520 * scaleY;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(ebX, ebY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw zombie cats on radar as subtle red markers
        ctx.fillStyle = "rgba(239, 68, 68, 0.75)";
        this.zombieCats.forEach(cat => {
            if (!cat.alive) return;
            const cx = offX + cat.x * scaleX;
            const cy = offY + cat.y * scaleY;
            ctx.beginPath();
            ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw other players
        this.players.forEach(p => {
            if (p.id === this.myPlayerId) return;
            if (!p.alive || p.in_vent || (p.is_invisible && me.alive)) return;

            const px = offX + p.renderX * scaleX;
            const py = offY + p.renderY * scaleY;

            const charKey = (p.character || "matias").toLowerCase();
            const theme = CHARACTER_THEMES[charKey] || (p.color ? { suitColor: p.color.hex } : CHARACTER_THEMES.matias);
            const pColor = theme.suitColor;

            ctx.fillStyle = pColor;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw local player (me) with pulsing ring
        const myX = offX + me.renderX * scaleX;
        const myY = offY + me.renderY * scaleY;
        const pulse = (Math.sin(Date.now() / 200) + 1) * 1.5;

        ctx.strokeStyle = "#00f2fe";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(myX, myY, 3.5 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(myX, myY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawFloor(ctx) {
        ctx.fillStyle = "#0b1120";
        ctx.fillRect(0, 0, this.map.width, this.map.height);

        // General metallic floor tiles
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 1;
        const gridSize = 70;
        for (let x = 0; x <= this.map.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.map.height);
            ctx.stroke();
        }
        for (let y = 0; y <= this.map.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.map.width, y);
            ctx.stroke();
        }

        // CAFETERIA CHECKERED TILE PATTERN (Central Hall 850, 350 to 1850, 1050)
        const cafeTile = 50;
        ctx.save();
        ctx.beginPath();
        ctx.rect(850, 350, 1000, 700);
        ctx.clip();

        for (let cx = 850; cx < 1850; cx += cafeTile) {
            for (let cy = 350; cy < 1050; cy += cafeTile) {
                const isCheck = ((cx - 850) / cafeTile + (cy - 350) / cafeTile) % 2 === 0;
                ctx.fillStyle = isCheck ? "#1e293b" : "#0f172a";
                ctx.fillRect(cx, cy, cafeTile, cafeTile);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
                ctx.strokeRect(cx, cy, cafeTile, cafeTile);
            }
        }

        // Central Meeting Table Circular Decal
        ctx.strokeStyle = "rgba(241, 196, 15, 0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(1350, 700, 135, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(0, 242, 254, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(1350, 700, 150, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // Sector Markings on Floor
        ctx.font = "bold 24px 'Orbitron', sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.textAlign = "center";
        ctx.fillText("REACTOR NUCLEAR", 320, 310);
        ctx.fillText("CAFETERÍA DE MATIAS & BRUS", 1350, 480);
        ctx.fillText("SALA DE DORMITORIOS", 2380, 320);
        ctx.fillText("ELECTRICIDAD", 400, 1200);
        ctx.fillText("NAVEGACIÓN ESTELAR", 2380, 1100);
        ctx.fillText("SALA DE BAILE Y MÚSICA", 1370, 1490);
    }

    drawSewerPipes(ctx) {
        if (!this.map || !this.map.vents) return;
        const time = Date.now() / 1000;

        // Subterranean sewer conduits connecting vent pairs
        const pipePairs = [
            { from: { x: 480, y: 160 }, to: { x: 580, y: 1060 }, name: "Tubo Reactor-Electricidad" },
            { from: { x: 920, y: 420 }, to: { x: 2120, y: 880 }, name: "Tubo Cafetería-Navegación" },
            { from: { x: 2120, y: 160 }, to: { x: 1080, y: 1420 }, name: "Tubo Habitación-Música" }
        ];

        pipePairs.forEach(pipe => {
            const dx = pipe.to.x - pipe.from.x;
            const dy = pipe.to.y - pipe.from.y;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);

            ctx.save();
            ctx.translate(pipe.from.x, pipe.from.y);
            ctx.rotate(angle);

            // 1. Shadow beneath pipe
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(0, -22, length, 44);

            // 2. Heavy Steel Outer Sewer Pipe Body
            const pipeGrad = ctx.createLinearGradient(0, -18, 0, 18);
            pipeGrad.addColorStop(0, "#0b1120");
            pipeGrad.addColorStop(0.3, "#334155");
            pipeGrad.addColorStop(0.5, "#64748b");
            pipeGrad.addColorStop(0.7, "#334155");
            pipeGrad.addColorStop(1, "#0b1120");

            ctx.fillStyle = pipeGrad;
            ctx.fillRect(0, -16, length, 32);

            ctx.strokeStyle = "#1e293b";
            ctx.lineWidth = 2;
            ctx.strokeRect(0, -16, length, 32);

            // 3. Central Glass/Grating Inspection Slit (Sewage fluid with flowing current)
            ctx.fillStyle = "rgba(16, 185, 129, 0.22)";
            ctx.fillRect(8, -6, length - 16, 12);

            // Animated sewage fluid flow ripples
            const flowOffset = (time * 90) % 36;
            ctx.strokeStyle = "rgba(52, 211, 153, 0.45)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 10]);
            ctx.beginPath();
            ctx.moveTo(8 + flowOffset, 0);
            ctx.lineTo(length - 8, 0);
            ctx.stroke();
            ctx.setLineDash([]);

            // Bubbles drifting in sewer pipe
            for (let b = 0; b < 6; b++) {
                const bPos = ((time * 70 + b * (length / 6)) % (length - 24)) + 12;
                const bY = Math.sin(time * 3 + b) * 3;
                ctx.fillStyle = "rgba(167, 243, 208, 0.8)";
                ctx.beginPath();
                ctx.arc(bPos, bY, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // 4. Pipe Flanges / Steel Joint Couplers every 90px
            const jointCount = Math.floor(length / 90);
            for (let j = 1; j <= jointCount; j++) {
                const jx = j * 90;
                ctx.fillStyle = "#1e293b";
                ctx.fillRect(jx - 4, -19, 8, 38);
                ctx.fillStyle = "#94a3b8";
                ctx.fillRect(jx - 2, -18, 4, 36);

                // Rivet bolts on flange
                ctx.fillStyle = "#cbd5e1";
                ctx.beginPath();
                ctx.arc(jx, -15, 1.5, 0, Math.PI * 2);
                ctx.arc(jx, 15, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Hazard warning yellow/black diagonal markings near pipe entrances
            this.drawHazardStripes(ctx, 4, -14, 26, 28);
            this.drawHazardStripes(ctx, length - 30, -14, 26, 28);

            ctx.restore();
        });
    }

    drawHazardStripes(ctx, x, y, w, h) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = "#eab308";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#0f172a";
        for (let i = -h; i < w + h; i += 10) {
            ctx.beginPath();
            ctx.moveTo(x + i, y);
            ctx.lineTo(x + i + 5, y);
            ctx.lineTo(x + i + 5 - h, y + h);
            ctx.lineTo(x + i - h, y + h);
            ctx.fill();
        }
        ctx.restore();
    }

    drawRoomDecor(ctx) {
        const time = Date.now() / 1000;

        // 1. MESA CENTRAL REDONDA DE REUNIONES CON BOTÓN DE EMERGENCIA at (1350, 700, r: 75)
        this.drawCafeteriaMeetingTable(ctx, 1350, 700, 75, time);

        // 2. NEVERA 3D (REFRIGERATOR) at (1180, 380, w: 70, h: 65)
        this.drawFridge(ctx, 1180, 380, 70, 65, time);

        // 3. ALACENA CON MICROONDAS Y PLATOS at (1730, 380, w: 70, h: 55)
        this.drawMicrowave(ctx, 1730, 380, 70, 55, time);

        // 4. MESAS DE COMENSALES DE CAFETERÍA at (1000, 880) y (1570, 880)
        this.drawDiningTable(ctx, 1000, 880, 130, 65, time);
        this.drawDiningTable(ctx, 1570, 880, 130, 65, time);

        // 5. LAVADORA AUTOMÁTICA CON TAMBOR GIRATORIO at (1930, 180, w: 60, h: 60)
        this.drawWashingMachine(ctx, 1930, 180, 60, 60, time);

        // 7. BARRAS BUFFET DE COMIDA at (980, 460) y (1580, 460)
        this.drawBuffetCounters(ctx, time);

        // 8. DORMITORIO / CAMAS DE MATIAS, BRUS Y EXTRA
        this.drawBeds(ctx);

        // 9. ARMARIO VESTIDOR DE MATIAS & BRUS
        this.drawWardrobeStation(ctx);

        // 10. ESCENARIO DE MÚSICA Y BAILE
        this.drawMusicStage(ctx, time);
    }

    drawCafeteriaMeetingTable(ctx, cx, cy, r, time) {
        ctx.save();

        // 1. Stools around table perimeter
        const stoolCount = 8;
        for (let i = 0; i < stoolCount; i++) {
            const sAngle = (i * Math.PI * 2) / stoolCount;
            const sx = cx + Math.cos(sAngle) * (r + 18);
            const sy = cy + Math.sin(sAngle) * (r + 18);

            // Stool shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.arc(sx + 2, sy + 3, 11, 0, Math.PI * 2);
            ctx.fill();

            // Stool seat
            ctx.fillStyle = "#334155";
            ctx.beginPath();
            ctx.arc(sx, sy, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f1c40f";
            ctx.beginPath();
            ctx.arc(sx, sy, 7, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. Drop shadow under table
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.beginPath();
        ctx.arc(cx + 4, cy + 6, r + 4, 0, Math.PI * 2);
        ctx.fill();

        // 3. Heavy steel rim
        const rimGrad = ctx.createRadialGradient(cx, cy, r - 15, cx, cy, r);
        rimGrad.addColorStop(0, "#475569");
        rimGrad.addColorStop(0.7, "#64748b");
        rimGrad.addColorStop(1, "#334155");
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 4. Inner table surface (Warm beige futuristic tabletop)
        const innerGrad = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, r - 12);
        innerGrad.addColorStop(0, "#f8fafc");
        innerGrad.addColorStop(0.7, "#e2e8f0");
        innerGrad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
        ctx.fill();

        // Table segments / meeting divider lines
        ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
            const rad = (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(rad) * 35, cy + Math.sin(rad) * 35);
            ctx.lineTo(cx + Math.cos(rad) * (r - 14), cy + Math.sin(rad) * (r - 14));
            ctx.stroke();
        }

        // 5. Central Console Housing for Emergency Button
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Hazard stripes border
        ctx.strokeStyle = "rgba(234, 179, 8, 0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 6. RED EMERGENCY BUTTON (Large, 3D and Pulsing)
        const pulse = Math.sin(time * 3) * 0.15 + 0.85;
        const btnGrad = ctx.createRadialGradient(cx - 3, cy - 4, 3, cx, cy, 18);
        btnGrad.addColorStop(0, "#fca5a5");
        btnGrad.addColorStop(0.35, "#ef4444");
        btnGrad.addColorStop(1, "#991b1b");

        ctx.fillStyle = btnGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Glass protective dome ring
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.stroke();

        // Glass reflection highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.beginPath();
        ctx.ellipse(cx - 7, cy - 8, 6, 3, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText("BOTÓN DE EMERGENCIA", cx, cy + 46);

        ctx.restore();
    }

    drawFridge(ctx, x, y, w, h, time) {
        ctx.save();

        // Drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(x + 4, y + 6, w, h);

        // Stainless steel fridge body
        const fridgeGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        fridgeGrad.addColorStop(0, "#cbd5e1");
        fridgeGrad.addColorStop(0.4, "#f8fafc");
        fridgeGrad.addColorStop(0.8, "#94a3b8");
        fridgeGrad.addColorStop(1, "#64748b");

        ctx.fillStyle = fridgeGrad;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Freezer horizontal split seam
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.38);
        ctx.lineTo(x + w, y + h * 0.38);
        ctx.stroke();

        // Chrome door handles
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(x + w - 10, y + 6, 4, 12); // Freezer handle
        ctx.fillRect(x + w - 10, y + h * 0.42, 4, 22); // Fridge handle

        // Digital LED display on freezer door
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(x + 8, y + 6, 26, 11);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 8px 'Orbitron', monospace";
        ctx.fillText("3°C", x + 12, y + 15);

        // Fridge door colorful magnetic child drawings & notes
        // Note 1: Yellow sticky note
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(x + 8, y + h * 0.46, 14, 14);
        ctx.fillStyle = "#ca8a04";
        ctx.fillRect(x + 10, y + h * 0.50, 10, 1.5);
        ctx.fillRect(x + 10, y + h * 0.56, 7, 1.5);

        // Note 2: Red magnetic heart ❤️
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(x + 30, y + h * 0.52, 3, 0, Math.PI * 2);
        ctx.fill();

        // Soft cool blue LED bleed at bottom
        ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
        ctx.fillRect(x + 4, y + h - 3, w - 8, 3);

        // Label
        ctx.font = "bold 10px 'Rajdhani', sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.textAlign = "center";
        ctx.fillText("❄️ NEVERA", x + w / 2, y - 8);

        ctx.restore();
    }

    drawMicrowave(ctx, x, y, w, h, time) {
        ctx.save();

        // Countertop shelf
        ctx.fillStyle = "#475569";
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
        ctx.strokeStyle = "#64748b";
        ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);

        // Microwave oven body
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(x, y, w, h);

        // Dark glass door with amber interior light
        ctx.fillStyle = "rgba(245, 158, 11, 0.3)";
        ctx.fillRect(x + 4, y + 6, w * 0.65, h - 12);
        ctx.strokeStyle = "#334155";
        ctx.strokeRect(x + 4, y + 6, w * 0.65, h - 12);

        // Digital countdown timer
        ctx.fillStyle = "#000";
        ctx.fillRect(x + w * 0.72, y + 6, 14, 8);
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 6px monospace";
        ctx.fillText("0:45", x + w * 0.73, y + 12);

        // Keypad buttons
        ctx.fillStyle = "#64748b";
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 2; c++) {
                ctx.fillRect(x + w * 0.73 + c * 6, y + 18 + r * 5, 4, 3);
            }
        }

        ctx.font = "bold 10px 'Rajdhani', sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.textAlign = "center";
        ctx.fillText("🍽️ ALACENA", x + w / 2, y - 8);

        ctx.restore();
    }

    drawDiningTable(ctx, x, y, w, h, time) {
        ctx.save();

        // Table drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(x + 6, y + 8, w, h);

        // Rich Mahogany Wood Table
        const tableGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        tableGrad.addColorStop(0, "#78350f");
        tableGrad.addColorStop(0.5, "#92400e");
        tableGrad.addColorStop(1, "#451a03");

        ctx.fillStyle = tableGrad;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = "#b45309";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        // Crisp White Tablecloth Runner down middle
        ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
        ctx.fillRect(x + 20, y + 10, w - 40, h - 20);
        ctx.strokeStyle = "rgba(203, 213, 225, 0.5)";
        ctx.strokeRect(x + 20, y + 10, w - 40, h - 20);

        // 4 Ceramic Food Plates with realistic food items!
        const plates = [
            { px: x + 40, py: y + 30, type: "egg_bacon", label: "Huevos y Tocineta" },
            { px: x + 120, py: y + 30, type: "pizza", label: "Pizza con Queso" },
            { px: x + 40, py: y + 70, type: "ramen", label: "Ramen Caliente" },
            { px: x + 120, py: y + 70, type: "pancakes", label: "Panqueques con Miel" }
        ];

        plates.forEach((p, idx) => {
            // White ceramic plate
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath();
            ctx.arc(p.px + 2, p.py + 2, 16, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.px, p.py, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Plate inner rim
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.px, p.py, 12, 0, Math.PI * 2);
            ctx.stroke();

            if (p.type === "egg_bacon") {
                // Fried egg with golden yolk
                ctx.fillStyle = "#fef08a";
                ctx.beginPath();
                ctx.ellipse(p.px - 2, p.py, 7, 5, 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#f59e0b";
                ctx.beginPath();
                ctx.arc(p.px - 2, p.py, 3.5, 0, Math.PI * 2);
                ctx.fill();
                // Crispy bacon strips
                ctx.fillStyle = "#991b1b";
                ctx.fillRect(p.px + 4, p.py - 6, 3, 12);
                ctx.fillStyle = "#f87171";
                ctx.fillRect(p.px + 5, p.py - 5, 1.5, 10);
            } else if (p.type === "pizza") {
                // Pizza slice
                ctx.fillStyle = "#ea580c";
                ctx.beginPath();
                ctx.moveTo(p.px, p.py - 8);
                ctx.lineTo(p.px + 9, p.py + 7);
                ctx.lineTo(p.px - 9, p.py + 7);
                ctx.closePath();
                ctx.fill();
                // Cheese
                ctx.fillStyle = "#fef08a";
                ctx.beginPath();
                ctx.moveTo(p.px, p.py - 6);
                ctx.lineTo(p.px + 7, p.py + 5);
                ctx.lineTo(p.px - 7, p.py + 5);
                ctx.closePath();
                ctx.fill();
                // Pepperoni dots
                ctx.fillStyle = "#b91c1c";
                ctx.beginPath();
                ctx.arc(p.px - 2, p.py, 2, 0, Math.PI * 2);
                ctx.arc(p.px + 3, p.py + 2, 1.8, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === "ramen") {
                // Ramen bowl
                ctx.fillStyle = "#b45309";
                ctx.beginPath();
                ctx.arc(p.px, p.py, 9, 0, Math.PI * 2);
                ctx.fill();
                // Noodles
                ctx.fillStyle = "#fef08a";
                ctx.beginPath();
                ctx.arc(p.px, p.py, 7, 0, Math.PI * 2);
                ctx.fill();
                // Scallions
                ctx.fillStyle = "#22c55e";
                ctx.fillRect(p.px - 3, p.py - 2, 2, 2);
                ctx.fillRect(p.px + 2, p.py + 1, 2, 2);
            } else if (p.type === "pancakes") {
                // Stack of 3 golden pancakes
                ctx.fillStyle = "#d97706";
                ctx.beginPath();
                ctx.arc(p.px, p.py + 2, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#f59e0b";
                ctx.beginPath();
                ctx.arc(p.px, p.py, 8, 0, Math.PI * 2);
                ctx.fill();
                // Butter square
                ctx.fillStyle = "#fef08a";
                ctx.fillRect(p.px - 2.5, p.py - 2.5, 5, 5);
            }

            // Animated hot steam rising from plates
            const steamOffset = Math.sin(time * 3 + idx) * 3;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p.px - 2 + steamOffset, p.py - 12);
            ctx.quadraticCurveTo(p.px + 3, p.py - 18, p.px - 1 + steamOffset, p.py - 24);
            ctx.stroke();

            // Silver cutlery beside plate
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(p.px - 18, p.py - 8, 1.5, 16); // Fork
            ctx.fillRect(p.px + 17, p.py - 8, 1.5, 16); // Knife
        });

        // Drinks: Juice glass & mug in center
        ctx.fillStyle = "#f97316"; // Orange juice
        ctx.beginPath();
        ctx.arc(x + 75, y + 50, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#38bdf8"; // Water glass
        ctx.beginPath();
        ctx.arc(x + 88, y + 50, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawLivingRoomSofa(ctx, x, y, w, h, time) {
        ctx.save();

        // Floor shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(x + 4, y + 6, w, h);

        // Modern L-Shaped Sectional Sofa (Deep Teal / Navy Plush)
        const sofaGrad = ctx.createLinearGradient(x, y, x, y + h);
        sofaGrad.addColorStop(0, "#0e7490");
        sofaGrad.addColorStop(0.4, "#155e75");
        sofaGrad.addColorStop(1, "#164e63");

        ctx.fillStyle = sofaGrad;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = "#0891b2";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Backrest cushions
        ctx.fillStyle = "#0c4a6e";
        ctx.fillRect(x + 4, y + 3, w - 8, 16);

        // Cushion crease divisions (3 seats)
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = 1.5;
        const seatW = (w - 8) / 3;
        for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(x + 4 + i * seatW, y + 3);
            ctx.lineTo(x + 4 + i * seatW, y + h - 3);
            ctx.stroke();
        }

        // L-Extension on left side
        ctx.fillStyle = "#155e75";
        ctx.fillRect(x, y + h - 15, 38, 15);

        // Throw pillows
        // Yellow Matias pillow
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.ellipse(x + 18, y + 16, 7, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Blue Brus pillow
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.ellipse(x + w - 18, y + 16, 7, 5, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Low Coffee Table in front of Sofa
        ctx.fillStyle = "#78350f";
        ctx.fillRect(x + 35, y + h - 22, w - 70, 16);
        ctx.strokeStyle = "#b45309";
        ctx.strokeRect(x + 35, y + h - 22, w - 70, 16);

        // TV remote control & magazine on table
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(x + 55, y + h - 18, 10, 4); // Remote
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(x + 72, y + h - 19, 14, 10); // Comic book

        ctx.font = "bold 10px 'Rajdhani', sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.textAlign = "center";
        ctx.fillText("🛋️ SALA DE ESTAR", x + w / 2, y - 8);

        ctx.restore();
    }

    drawInteractiveTV(ctx, x, y, w, h, time) {
        ctx.save();

        // TV Stand / Console
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(x - 5, y + h - 4, w + 10, 8);

        // Ultra-thin Bezel
        ctx.fillStyle = "#020617";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);

        // Animated Screen Content (Retro Sci-Fi Cartoon Broadcast)
        const tvScreenGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        const shift = Math.sin(time * 2);
        tvScreenGrad.addColorStop(0, "#0284c7");
        tvScreenGrad.addColorStop(0.5, "#38bdf8");
        tvScreenGrad.addColorStop(1, "#0369a1");

        ctx.fillStyle = tvScreenGrad;
        ctx.fillRect(x + 3, y + 3, w - 6, h - 6);

        // Pixel Stars and Spaceship on TV screen
        const shipX = x + 20 + ((time * 30) % (w - 40));
        ctx.fillStyle = "#ffd600";
        ctx.fillRect(shipX, y + h / 2 - 2, 8, 4);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(shipX + 10, y + h / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // TV Scanlines
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        for (let sl = y + 3; sl < y + h - 3; sl += 3) {
            ctx.fillRect(x + 3, sl, w - 6, 1);
        }

        ctx.font = "bold 10px 'Rajdhani', sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.textAlign = "center";
        ctx.fillText("📺 TELEVISOR", x + w / 2, y - 6);

        ctx.restore();
    }

    drawWashingMachine(ctx, x, y, w, h, time) {
        ctx.save();

        // Shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(x + 4, y + 6, w, h);

        // White enamel appliance cabinet
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Top Control Panel
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(x + 2, y + 2, w - 4, 14);

        // Detergent tray drawer
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(x + 5, y + 5, 14, 8);

        // Rotary cycle knob
        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.arc(x + 27, y + 9, 4, 0, Math.PI * 2);
        ctx.fill();

        // Digital LED cycle status display
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(x + 36, y + 4, 18, 9);
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 6px monospace";
        ctx.fillText("28m", x + 38, y + 11);

        // Circular front-loading porthole door
        const doorCX = x + w / 2;
        const doorCY = y + h * 0.62;
        const doorRadius = 18;

        // Chrome door outer ring
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.arc(doorCX, doorCY, doorRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Door Glass
        ctx.fillStyle = "rgba(14, 165, 233, 0.4)";
        ctx.beginPath();
        ctx.arc(doorCX, doorCY, doorRadius - 3, 0, Math.PI * 2);
        ctx.fill();

        // Rotating wash drum with tumbling clothes & suds
        ctx.save();
        ctx.beginPath();
        ctx.arc(doorCX, doorCY, doorRadius - 3, 0, Math.PI * 2);
        ctx.clip();

        ctx.translate(doorCX, doorCY);
        ctx.rotate(time * 7); // Fast spin cycle!

        // Tumbling Matias yellow shirt
        ctx.fillStyle = "#facc15";
        ctx.fillRect(-8, -8, 7, 6);

        // Tumbling Brus blue shirt
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(3, -5, 6, 7);

        // Tumbling red towel
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-4, 4, 8, 5);

        // Frothy soap bubbles
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(-2, -3, 3, 0, Math.PI * 2);
        ctx.arc(4, 2, 2.5, 0, Math.PI * 2);
        ctx.arc(-5, 4, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Glass glare reflection
        ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(doorCX, doorCY, doorRadius - 5, -0.8 * Math.PI, -0.4 * Math.PI);
        ctx.stroke();

        ctx.font = "bold 10px 'Rajdhani', sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.textAlign = "center";
        ctx.fillText("🧺 LAVADORA", doorCX, y - 8);

        ctx.restore();
    }

    drawBuffetCounters(ctx, time) {
        // Cafeteria Buffet tables with Fried Eggs & Food
        for (let bx of [980, 1580]) {
            ctx.fillStyle = "#d35400";
            ctx.fillRect(bx, 460, 140, 65);
            ctx.strokeStyle = "#e67e22";
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, 460, 140, 65);
        }

        // Draw Fried Eggs on buffet
        for (let fx of [1010, 1050, 1090, 1610, 1650, 1690]) {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.ellipse(fx, 492, 12, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f39c12";
            ctx.beginPath();
            ctx.arc(fx + 2, 492, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawBeds(ctx) {
        const beds = [
            { x: 2150, y: 180, name: "Cama Matias", color: "#f1c40f" },
            { x: 2350, y: 180, name: "Cama Brus", color: "#3498db" },
            { x: 2540, y: 180, name: "Cama Extra", color: "#2ecc71" }
        ];
        beds.forEach(b => {
            // Wood Frame
            ctx.fillStyle = "#5c3d2e";
            ctx.fillRect(b.x, b.y, 110, 70);
            // Blanket
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x + 10, b.y + 15, 90, 50);
            // Pillow
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(b.x + 12, b.y + 4, 86, 12);

            ctx.font = "bold 9px 'Rajdhani', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(b.name, b.x + 55, b.y + 45);
        });
    }

    drawWardrobeStation(ctx) {
        const wb = this.map.wardrobe;
        if (wb) {
            ctx.fillStyle = "#8e44ad";
            ctx.fillRect(wb.x - 70, wb.y - 25, 140, 50);
            ctx.strokeStyle = "#9b59b6";
            ctx.lineWidth = 3;
            ctx.strokeRect(wb.x - 70, wb.y - 25, 140, 50);

            ctx.font = "bold 13px 'Orbitron', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText("👗 ARMARIO VESTIDOR", wb.x, wb.y + 40);
        }
    }

    drawMusicStage(ctx, time) {
        ctx.fillStyle = "#1e1b4b";
        ctx.fillRect(1280, 1550, 180, 100);
        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 4;
        ctx.strokeRect(1280, 1550, 180, 100);

        // Flashing Disco Floor Lights on Stage
        const colors = ["#ff007f", "#00f0ff", "#ffe600", "#7000ff"];
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = colors[(Math.floor(time * 3) + i) % colors.length];
            ctx.beginPath();
            ctx.arc(1300 + i * 45, 1600, 10, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawObstacles(ctx) {
        const time = Date.now() / 1000;

        // 1. Draw Doorway Entry Thresholds for Bedroom (Top Right)
        this.drawBedroomDoorways(ctx, time);

        // 2. Draw all Map Obstacles with 3D Depth Shading
        this.map.obstacles.forEach(obs => {
            if (obs.type === "wall") {
                this.draw3DWall(ctx, obs);
            } else if (obs.type === "table") {
                this.draw3DTable(ctx, obs, time);
            } else if (obs.type === "buffet") {
                this.draw3DBuffet(ctx, obs, time);
            } else if (obs.type === "fridge") {
                this.draw3DFridge(ctx, obs);
            } else if (obs.type === "microwave") {
                this.draw3DMicrowave(ctx, obs, time);
            } else if (obs.type === "sofa") {
                this.draw3DSofa(ctx, obs);
            } else if (obs.type === "tv") {
                this.draw3DTV(ctx, obs, time);
            } else if (obs.type === "bed") {
                this.draw3DBed(ctx, obs);
            } else if (obs.type === "wardrobe") {
                this.draw3DWardrobe(ctx, obs);
            } else if (obs.type === "washer") {
                this.draw3DWasher(ctx, obs, time);
            } else if (obs.type === "stage") {
                this.draw3DStage(ctx, obs, time);
            } else if (obs.type === "switchboard") {
                this.draw3DSwitchboard(ctx, obs, time);
            }
        });

        // Map Outer Border with Neon Barrier
        ctx.strokeStyle = "#ff3366";
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, this.map.width, this.map.height);
    }

    drawBedroomDoorways(ctx, time) {
        ctx.save();
        // West Entrance Doorway Threshold (x: 2050, y: 280 to 440)
        ctx.fillStyle = "rgba(0, 242, 254, 0.12)";
        ctx.fillRect(2035, 280, 50, 160);
        ctx.strokeStyle = "rgba(0, 242, 254, 0.6)";
        ctx.lineWidth = 2;
        ctx.strokeRect(2035, 280, 50, 160);

        // Animated neon entry chevrons pointing east
        const flowOffset1 = (time * 40) % 20;
        ctx.fillStyle = "rgba(0, 242, 254, 0.7)";
        ctx.font = "bold 14px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("▶ DORMITORIOS ▶", 2060, 365);

        // Doorframe pillars
        ctx.fillStyle = "#334155";
        ctx.fillRect(2045, 276, 30, 8);
        ctx.fillRect(2045, 436, 30, 8);

        // South Entrance Doorway Threshold (x: 2280 to 2440, y: 600)
        ctx.fillStyle = "rgba(0, 242, 254, 0.12)";
        ctx.fillRect(2280, 585, 160, 50);
        ctx.strokeStyle = "rgba(0, 242, 254, 0.6)";
        ctx.lineWidth = 2;
        ctx.strokeRect(2280, 585, 160, 50);

        ctx.fillStyle = "rgba(0, 242, 254, 0.7)";
        ctx.fillText("▲ DORMITORIOS ▲", 2360, 615);

        // Doorframe pillars
        ctx.fillStyle = "#334155";
        ctx.fillRect(2276, 595, 8, 30);
        ctx.fillRect(2436, 595, 8, 30);
        ctx.restore();
    }

    draw3DWall(ctx, obs) {
        ctx.save();
        // Drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(obs.x + 3, obs.y + 3, obs.w, obs.h);

        // Wall Extruded Base
        const wallGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
        wallGrad.addColorStop(0, "#1e293b");
        wallGrad.addColorStop(0.5, "#0f172a");
        wallGrad.addColorStop(1, "#1e293b");
        ctx.fillStyle = wallGrad;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // Beveled Top Neon Cap
        ctx.strokeStyle = "#00d2ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Corner metallic bolts on longer walls
        if (obs.w > 60 || obs.h > 60) {
            ctx.fillStyle = "#94a3b8";
            ctx.beginPath();
            ctx.arc(obs.x + 6, obs.y + 6, 2, 0, Math.PI * 2);
            ctx.arc(obs.x + obs.w - 6, obs.y + obs.h - 6, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    draw3DTable(ctx, obs, time) {
        ctx.save();
        // 1. Soft Ambient Floor Drop Shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.beginPath();
        ctx.roundRect(obs.x + 6, obs.y + 12, obs.w - 12, obs.h, 16);
        ctx.fill();

        // 2. 4 3D Metallic Legs with floor contact pads
        const legW = 12;
        const legH = 20;
        const legPad = 10;
        ctx.fillStyle = "#1e293b";
        // Top-left, top-right, bottom-left, bottom-right legs
        ctx.fillRect(obs.x + legPad, obs.y + obs.h - 10, legW, legH);
        ctx.fillRect(obs.x + obs.w - legPad - legW, obs.y + obs.h - 10, legW, legH);

        // 3. 3D Table Apron / Side Depth
        const apronGrad = ctx.createLinearGradient(obs.x, obs.y + obs.h - 18, obs.x, obs.y + obs.h);
        apronGrad.addColorStop(0, "#451a03");
        apronGrad.addColorStop(1, "#1f0f03");
        ctx.fillStyle = apronGrad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y + obs.h - 18, obs.w, 18, [0, 0, 12, 12]);
        ctx.fill();

        // 4. Beveled Polished Wood/Steel Tabletop
        const tableGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h - 14);
        tableGrad.addColorStop(0, "#92400e");
        tableGrad.addColorStop(0.3, "#78350f");
        tableGrad.addColorStop(0.8, "#552407");
        tableGrad.addColorStop(1, "#361604");
        ctx.fillStyle = tableGrad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h - 14, 14);
        ctx.fill();

        // Golden Trim Edge
        ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Specular highlight line along top edge
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(obs.x + 14, obs.y + 3);
        ctx.lineTo(obs.x + obs.w - 14, obs.y + 3);
        ctx.stroke();

        // 5. 3D Table Items & Food
        // Plate 1: Sunny-side up egg + bacon (Left side)
        const p1x = obs.x + 36;
        const p1y = obs.y + 34;
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.arc(p1x, p1y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Egg White
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p1x - 2, p1y, 7, 0, Math.PI * 2);
        ctx.fill();
        // Egg Yolk
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(p1x - 2, p1y, 4, 0, Math.PI * 2);
        ctx.fill();
        // Bacon strip
        ctx.fillStyle = "#b91c1c";
        ctx.fillRect(p1x + 3, p1y - 6, 4, 12);

        // Plate 2: Space Sausages (Right side)
        const p2x = obs.x + obs.w - 36;
        const p2y = obs.y + 34;
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.arc(p2x, p2y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#991b1b";
        ctx.beginPath();
        ctx.ellipse(p2x - 3, p2y, 4, 9, Math.PI / 6, 0, Math.PI * 2);
        ctx.ellipse(p2x + 4, p2y, 4, 9, -Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();

        // Coffee Cup with Steaming Particles (Center Top)
        const cupX = obs.x + obs.w / 2;
        const cupY = obs.y + 24;
        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.arc(cupX, cupY, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#451a03";
        ctx.beginPath();
        ctx.arc(cupX, cupY, 6, 0, Math.PI * 2);
        ctx.fill();
        // Rising steam particles
        for (let s = 0; s < 3; s++) {
            const steamAge = ((time * 1.5 + s * 0.7) % 2);
            const steamY = cupY - 8 - steamAge * 14;
            const steamX = cupX + Math.sin(time * 3 + s) * 4;
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 0.6 - steamAge * 0.3)})`;
            ctx.beginPath();
            ctx.arc(steamX, steamY, 2 + steamAge * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Space Juice Cup (Center Bottom)
        const jX = obs.x + obs.w / 2;
        const jY = obs.y + 54;
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.arc(jX, jY, 8, 0, Math.PI * 2);
        ctx.fill();
        // Straw
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(jX, jY);
        ctx.lineTo(jX + 7, jY - 8);
        ctx.stroke();

        ctx.restore();
    }

    draw3DBuffet(ctx, obs, time) {
        ctx.save();
        // Drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(obs.x + 4, obs.y + 8, obs.w, obs.h);

        // Stainless Counter
        const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        grad.addColorStop(0, "#475569");
        grad.addColorStop(0.5, "#334155");
        grad.addColorStop(1, "#1e293b");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
        ctx.fill();
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.stroke();

        // 3 Food Warming Wells
        const wellW = 32;
        const wellH = 22;
        const colors = ["#f59e0b", "#10b981", "#ef4444"];
        for (let i = 0; i < 3; i++) {
            const wx = obs.x + 14 + i * (wellW + 8);
            const wy = obs.y + 12;
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(wx - 2, wy - 2, wellW + 4, wellH + 4);
            ctx.fillStyle = colors[i];
            ctx.fillRect(wx, wy, wellW, wellH);
            // Sneeze Guard Glass line
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(wx, wy + 4);
            ctx.lineTo(wx + wellW, wy + 4);
            ctx.stroke();
        }

        // Buffet Label
        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.textAlign = "center";
        ctx.fillText("BUFFET MATIAS & BRUS", obs.x + obs.w / 2, obs.y + obs.h - 8);

        ctx.restore();
    }

    draw3DFridge(ctx, obs) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(obs.x + 3, obs.y + 6, obs.w, obs.h);

        // Stainless Steel Double-Door Body
        const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y);
        grad.addColorStop(0, "#94a3b8");
        grad.addColorStop(0.5, "#cbd5e1");
        grad.addColorStop(1, "#64748b");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
        ctx.fill();
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Door divider
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.w / 2, obs.y + 4);
        ctx.lineTo(obs.x + obs.w / 2, obs.y + obs.h - 6);
        ctx.stroke();

        // Chrome Door Handles
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(obs.x + obs.w / 2 - 5, obs.y + 18, 3, 20);
        ctx.fillRect(obs.x + obs.w / 2 + 2, obs.y + 18, 3, 20);

        // Colorful Fridge Magnets
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(obs.x + 8, obs.y + 12, 6, 6);
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(obs.x + 16, obs.y + 14, 5, 5);
        ctx.fillStyle = "#10b981";
        ctx.fillRect(obs.x + obs.w - 14, obs.y + 12, 6, 6);

        ctx.restore();
    }

    draw3DMicrowave(ctx, obs, time) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(obs.x + 3, obs.y + 5, obs.w, obs.h);

        // Cupboard Shelf
        ctx.fillStyle = "#78350f";
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 6);
        ctx.fill();
        ctx.strokeStyle = "#451a03";
        ctx.stroke();

        // Digital Microwave Box
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(obs.x + 6, obs.y + 8, obs.w - 12, obs.h - 16);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(obs.x + 10, obs.y + 12, obs.w - 28, obs.h - 24);

        // Glowing Digital Clock Display
        ctx.font = "bold 8px monospace";
        ctx.fillStyle = "#22c55e";
        ctx.fillText("12:00", obs.x + obs.w - 22, obs.y + 20);

        ctx.restore();
    }

    draw3DSofa(ctx, obs) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.roundRect(obs.x + 4, obs.y + 10, obs.w, obs.h, 14);
        ctx.fill();

        // Velvet Navy Sofa Base & Cushions
        const sofaGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        sofaGrad.addColorStop(0, "#1e3a8a");
        sofaGrad.addColorStop(0.5, "#1e40af");
        sofaGrad.addColorStop(1, "#172554");
        ctx.fillStyle = sofaGrad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 14);
        ctx.fill();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Backrest roll
        ctx.fillStyle = "#1d4ed8";
        ctx.beginPath();
        ctx.roundRect(obs.x + 6, obs.y + 4, obs.w - 12, 18, 8);
        ctx.fill();

        // 3 Seat Cushions
        const cW = (obs.w - 20) / 3;
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = "#2563eb";
            ctx.beginPath();
            ctx.roundRect(obs.x + 10 + i * cW, obs.y + 26, cW - 4, obs.h - 32, 6);
            ctx.fill();
        }

        // Throw pillows
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(obs.x + 10, obs.y + 16, 12, 12);
        ctx.fillStyle = "#ec4899";
        ctx.fillRect(obs.x + obs.w - 22, obs.y + 16, 12, 12);

        ctx.restore();
    }

    draw3DTV(ctx, obs, time) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(obs.x + 2, obs.y + 4, obs.w, obs.h);

        // Ultra-wide TV Frame
        ctx.fillStyle = "#020617";
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Glowing Screen
        ctx.fillStyle = "#082f49";
        ctx.fillRect(obs.x + 4, obs.y + 3, obs.w - 8, obs.h - 6);

        // Radar Waveform Signal
        ctx.strokeStyle = "#00f2fe";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const startY = obs.y + obs.h / 2;
        ctx.moveTo(obs.x + 6, startY);
        for (let x = obs.x + 6; x <= obs.x + obs.w - 6; x += 6) {
            const wave = Math.sin(time * 6 + (x - obs.x) * 0.15) * 4;
            ctx.lineTo(x, startY + wave);
        }
        ctx.stroke();

        ctx.restore();
    }

    draw3DBed(ctx, obs) {
        ctx.save();
        // Drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(obs.x + 4, obs.y + 8, obs.w, obs.h);

        // Wooden Bedframe
        ctx.fillStyle = "#78350f";
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
        ctx.fill();
        ctx.strokeStyle = "#451a03";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Thick Mattress
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.roundRect(obs.x + 6, obs.y + 8, obs.w - 12, obs.h - 14, 6);
        ctx.fill();

        // Puffy Pillow
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(obs.x + 10, obs.y + 12, 28, 22, 6);
        ctx.fill();
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Colorful Quilt Blanket (Matias Yellow, Brus Blue, Guest Purple)
        const isMatias = obs.x < 2250;
        const isBrus = obs.x >= 2250 && obs.x < 2450;
        const quiltColor = isMatias ? "#f59e0b" : (isBrus ? "#3b82f6" : "#a855f7");

        ctx.fillStyle = quiltColor;
        ctx.beginPath();
        ctx.roundRect(obs.x + 44, obs.y + 10, obs.w - 52, obs.h - 18, 6);
        ctx.fill();

        // Label on headboard
        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        const bedLabel = isMatias ? "MATIAS" : (isBrus ? "BRUS" : "AMIGOS");
        ctx.fillText(bedLabel, obs.x + obs.w / 2, obs.y + obs.h - 4);

        ctx.restore();
    }

    draw3DWardrobe(ctx, obs) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(obs.x + 5, obs.y + 8, obs.w, obs.h);

        // Hardwood Wardrobe Closet
        const woodGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        woodGrad.addColorStop(0, "#854d0e");
        woodGrad.addColorStop(0.5, "#713f12");
        woodGrad.addColorStop(1, "#422006");
        ctx.fillStyle = woodGrad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
        ctx.fill();
        ctx.strokeStyle = "#ca8a04";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Double paneled doors
        const doorW = (obs.w - 16) / 2;
        ctx.strokeStyle = "#422006";
        ctx.strokeRect(obs.x + 6, obs.y + 6, doorW, obs.h - 12);
        ctx.strokeRect(obs.x + 10 + doorW, obs.y + 6, doorW, obs.h - 12);

        // Brass Handles
        ctx.fillStyle = "#facc15";
        ctx.fillRect(obs.x + doorW + 2, obs.y + obs.h / 2 - 8, 3, 16);
        ctx.fillRect(obs.x + doorW + 11, obs.y + obs.h / 2 - 8, 3, 16);

        // Wardrobe Header Label
        ctx.font = "bold 10px 'Orbitron', sans-serif";
        ctx.fillStyle = "#fef08a";
        ctx.textAlign = "center";
        ctx.fillText("👗 VESTIDOR", obs.x + obs.w / 2, obs.y + 20);

        ctx.restore();
    }

    draw3DWasher(ctx, obs, time) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(obs.x + 3, obs.y + 6, obs.w, obs.h);

        // Metallic White Chassis
        ctx.fillStyle = "#f1f5f9";
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
        ctx.fill();
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Control Panel
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, 12);
        ctx.fillStyle = "#00f2fe";
        ctx.fillRect(obs.x + obs.w - 14, obs.y + 7, 6, 6);

        // Circular Glass Door Porthole
        const cx = obs.x + obs.w / 2;
        const cy = obs.y + obs.h / 2 + 6;
        ctx.fillStyle = "#334155";
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();

        // Swirling Water inside
        ctx.fillStyle = "rgba(6, 182, 212, 0.7)";
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();

        // Spinning bubble effect
        const spinAngle = time * 8;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, spinAngle, spinAngle + Math.PI * 0.8);
        ctx.stroke();

        ctx.restore();
    }

    draw3DStage(ctx, obs, time) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(obs.x + 6, obs.y + 12, obs.w, obs.h);

        // Stage Floor
        const stageGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        stageGrad.addColorStop(0, "#312e81");
        stageGrad.addColorStop(0.5, "#1e1b4b");
        stageGrad.addColorStop(1, "#0f172a");
        ctx.fillStyle = stageGrad;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 12);
        ctx.fill();

        // Animated RGB Neon Strip along edge
        const hue = (time * 90) % 360;
        ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // 4 Rhythm Dance Pads (Left, Down, Up, Right)
        const pads = ["⬅️", "⬇️", "⬆️", "➡️"];
        const padW = 28;
        const padGap = (obs.w - 4 * padW) / 5;
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let i = 0; i < 4; i++) {
            const px = obs.x + padGap + i * (padW + padGap) + padW / 2;
            const py = obs.y + obs.h / 2;
            ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
            ctx.beginPath();
            ctx.arc(px, py, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillText(pads[i], px, py);
        }

        ctx.font = "bold 10px 'Orbitron', sans-serif";
        ctx.fillStyle = `hsl(${hue}, 100%, 75%)`;
        ctx.fillText("🎵 ESCENARIO MUSICAL", obs.x + obs.w / 2, obs.y + 18);

        ctx.restore();
    }

    draw3DSwitchboard(ctx, obs, time) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(obs.x + 4, obs.y + 6, obs.w, obs.h);

        ctx.fillStyle = "#334155";
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Blinking diodes
        ctx.fillStyle = (Math.sin(time * 5) > 0) ? "#ef4444" : "#22c55e";
        ctx.beginPath();
        ctx.arc(obs.x + 18, obs.y + 18, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = (Math.sin(time * 3 + 1) > 0) ? "#3b82f6" : "#eab308";
        ctx.beginPath();
        ctx.arc(obs.x + 36, obs.y + 18, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = "#f59e0b";
        ctx.fillText("⚡ ENERGÍA", obs.x + obs.w / 2, obs.y + obs.h - 12);
        ctx.restore();
    }

    drawInvisButtons(ctx) {
        if (!this.invisButtons || this.invisButtons.length === 0) return;
        const time = Date.now() / 1000;

        this.invisButtons.forEach(btn => {
            const bob = Math.sin(time * 3 + btn.x) * 4;
            ctx.save();
            ctx.translate(btn.x, btn.y + bob);

            // Ground mystical shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
            ctx.beginPath();
            ctx.ellipse(0, 18 - bob * 0.5, 16, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Astral expanding pulse rings
            const pulse = (time * 1.8) % 1;
            ctx.strokeStyle = `rgba(0, 242, 254, ${1 - pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 14 + pulse * 18, 0, Math.PI * 2);
            ctx.stroke();

            // Glowing magical ghost button base
            const btnGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
            btnGrad.addColorStop(0, "#ffffff");
            btnGrad.addColorStop(0.4, "#00f2fe");
            btnGrad.addColorStop(0.8, "#4facfe");
            btnGrad.addColorStop(1, "#a855f7");

            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Ghost icon in center
            ctx.font = "14px 'Rajdhani', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("👻", 0, 0);

            // Hovering badge text
            ctx.font = "bold 10px 'Orbitron', sans-serif";
            ctx.fillStyle = "#00f2fe";
            ctx.textAlign = "center";
            ctx.fillText("⚡ BOTÓN INVISIBILIDAD", 0, -22);

            ctx.restore();
        });
    }

    drawSparks(ctx) {
        this.sparks.forEach(s => {
            ctx.save();
            const alpha = s.life / s.maxLife;
            ctx.fillStyle = s.color;
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    drawAmbientDust(ctx) {
        ctx.save();
        const time = Date.now() / 1000;
        this.ambientParticles.forEach(p => {
            const sway = Math.sin((p.swaySeed || 0) + time * 1.5) * 5;
            const alpha = (0.2 + Math.sin(p.pulse) * 0.15) * p.alpha;
            ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`; // Warm golden dust motes
            ctx.beginPath();
            ctx.arc(p.x + sway, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawLighting(ctx, w, h) {
        if (this.graphicsQuality === "low") {
            this.drawPhysicalBulbs(ctx);
            return;
        }

        const me = this.players.get(this.myPlayerId);
        const time = Date.now() / 1000;

        // Reset offscreen lighting canvas
        const lCanvas = this.lightingCanvas;
        const lCtx = this.lightingCtx;
        const lw = lCanvas.width;
        const lh = lCanvas.height;
        lCtx.clearRect(0, 0, lw, lh);

        // Scale factor from world to lighting canvas
        const scaleX = lw / this.screenWidth;
        const scaleY = lh / this.screenHeight;

        // Ambient space station cafeteria overlay (clear and soft)
        const ambientAlpha = (this.graphicsQuality === "ultra") ? 0.22 : 0.16;
        lCtx.fillStyle = `rgba(6, 10, 20, ${ambientAlpha})`;
        lCtx.fillRect(0, 0, lw, lh);

        // Helper to convert world coordinate to lighting canvas coordinate
        const toLX = (wx) => Math.round((this.canvas.width / (2 * this.dpr) - this.camera.x + wx) * scaleX);
        const toLY = (wy) => Math.round((this.canvas.height / (2 * this.dpr) - this.camera.y + wy) * scaleY);

        lCtx.save();
        lCtx.globalCompositeOperation = "destination-out";

        // 1. SOL / SUNBEAMS pouring in from observation windows
        const sunWindows = [
            { x1: 950, y1: 350, x2: 1250, y2: 350, reach: 460 },
            { x1: 1450, y1: 350, x2: 1750, y2: 350, reach: 460 },
            { x1: 2150, y1: 100, x2: 2550, y2: 100, reach: 400 } // Bedroom skylight
        ];

        sunWindows.forEach(sw => {
            const lx1 = toLX(sw.x1);
            const ly1 = toLY(sw.y1);
            const lx2 = toLX(sw.x2);
            const ly2 = toLY(sw.y2);
            const lReach = sw.reach * scaleY;
            const slant = 180 * scaleX; // 30-degree sunbeam slant

            const sunGrad = lCtx.createLinearGradient((lx1 + lx2) / 2, ly1, (lx1 + lx2) / 2 + slant, ly1 + lReach);
            sunGrad.addColorStop(0, "rgba(255, 245, 200, 0.88)");
            sunGrad.addColorStop(0.3, "rgba(255, 235, 170, 0.55)");
            sunGrad.addColorStop(0.7, "rgba(255, 220, 130, 0.25)");
            sunGrad.addColorStop(1, "rgba(255, 220, 130, 0)");

            lCtx.fillStyle = sunGrad;
            lCtx.beginPath();
            lCtx.moveTo(lx1, ly1);
            lCtx.lineTo(lx2, ly2);
            lCtx.lineTo(lx2 + slant, ly2 + lReach);
            lCtx.lineTo(lx1 + slant, ly1 + lReach);
            lCtx.closePath();
            lCtx.fill();
        });

        // 2. BOMBILLAS COLGANTES (PENDANT INCANDESCENT BULBS)
        const hangingBulbs = [
            { x: 1120, y: 420, swingOffset: 0 },
            { x: 1400, y: 420, swingOffset: 1.2 },
            { x: 1680, y: 420, swingOffset: 2.4 },
            { x: 400, y: 310, swingOffset: 0.5 },
            { x: 410, y: 1220, swingOffset: 1.8 },
            { x: 2380, y: 490, swingOffset: 3.1 },
            { x: 750, y: 700, swingOffset: 0.9 },
            { x: 1950, y: 700, swingOffset: 2.1 }
        ];

        hangingBulbs.forEach(bulb => {
            const swing = Math.sin(time * 2 + bulb.swingOffset) * 4;
            const bx = toLX(bulb.x + swing);
            const by = toLY(bulb.y);
            const lightRadius = 190 * scaleX;

            const bulbGrad = lCtx.createRadialGradient(bx, by, 6 * scaleX, bx, by, lightRadius);
            bulbGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
            bulbGrad.addColorStop(0.2, "rgba(255, 225, 120, 0.85)");
            bulbGrad.addColorStop(0.5, "rgba(255, 170, 40, 0.45)");
            bulbGrad.addColorStop(0.85, "rgba(245, 130, 20, 0.12)");
            bulbGrad.addColorStop(1, "rgba(245, 130, 20, 0)");

            lCtx.fillStyle = bulbGrad;
            lCtx.beginPath();
            lCtx.arc(bx, by, lightRadius, 0, Math.PI * 2);
            lCtx.fill();
        });

        // 3. PLAYER FLASHLIGHT / AURA (FOR ALL ALIVE PLAYERS)
        this.players.forEach(p => {
            if (!p.alive || p.in_vent) return;
            if (p.is_invisible && p.id !== this.myPlayerId) return;

            const px = toLX(p.renderX);
            const py = toLY(p.renderY);
            const isLocal = (p.id === this.myPlayerId);
            const baseRad = isLocal ? (p.role === "impostor" ? 330 : 260) : 210;
            const visionRadius = baseRad * scaleX;

            const playerGrad = lCtx.createRadialGradient(px, py, 15 * scaleX, px, py, visionRadius);
            playerGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
            playerGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.85)");
            playerGrad.addColorStop(0.8, "rgba(255, 255, 255, 0.3)");
            playerGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

            lCtx.fillStyle = playerGrad;
            lCtx.beginPath();
            lCtx.arc(px, py, visionRadius, 0, Math.PI * 2);
            lCtx.fill();
        });

        // 3.1 CAFETERIA CENTRAL TABLE ILLUMINATION
        const tableLX = toLX(1350);
        const tableLY = toLY(700);
        const tableGrad = lCtx.createRadialGradient(tableLX, tableLY, 12 * scaleX, tableLX, tableLY, 260 * scaleX);
        tableGrad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
        tableGrad.addColorStop(0.35, "rgba(255, 245, 190, 0.75)");
        tableGrad.addColorStop(0.75, "rgba(255, 235, 150, 0.25)");
        tableGrad.addColorStop(1, "rgba(255, 235, 150, 0)");
        lCtx.fillStyle = tableGrad;
        lCtx.beginPath();
        lCtx.arc(tableLX, tableLY, 260 * scaleX, 0, Math.PI * 2);
        lCtx.fill();

        // 4. TV SCREEN BLUE LIGHT CAST
        const tvX = toLX(1550);
        const tvY = toLY(990);
        const tvGlow = lCtx.createRadialGradient(tvX, tvY, 10 * scaleX, tvX, tvY + 50 * scaleY, 140 * scaleX);
        const tvFlicker = 0.6 + Math.sin(time * 12) * 0.15;
        tvGlow.addColorStop(0, `rgba(56, 189, 248, ${tvFlicker})`);
        tvGlow.addColorStop(0.5, `rgba(14, 165, 233, ${tvFlicker * 0.5})`);
        tvGlow.addColorStop(1, "rgba(14, 165, 233, 0)");
        lCtx.fillStyle = tvGlow;
        lCtx.beginPath();
        lCtx.arc(tvX, tvY + 30 * scaleY, 140 * scaleX, 0, Math.PI * 2);
        lCtx.fill();

        // 5. GHOST INVISIBILITY BUTTONS ASTRAL GLOW
        this.invisButtons.forEach(btn => {
            const bx = toLX(btn.x);
            const by = toLY(btn.y);
            const bGrad = lCtx.createRadialGradient(bx, by, 5 * scaleX, bx, by, 90 * scaleX);
            bGrad.addColorStop(0, "rgba(0, 242, 254, 0.9)");
            bGrad.addColorStop(0.6, "rgba(168, 85, 247, 0.4)");
            bGrad.addColorStop(1, "rgba(168, 85, 247, 0)");
            lCtx.fillStyle = bGrad;
            lCtx.beginPath();
            lCtx.arc(bx, by, 90 * scaleX, 0, Math.PI * 2);
            lCtx.fill();
        });

        // 6. ZOMBIE CATS GREEN PIERCING EYE GLOW
        this.zombieCats.forEach(cat => {
            if (!cat.alive) return;
            const cx = toLX(cat.x);
            const cy = toLY(cat.y);
            const cGrad = lCtx.createRadialGradient(cx, cy, 2 * scaleX, cx, cy, 60 * scaleX);
            cGrad.addColorStop(0, "rgba(0, 230, 118, 0.85)");
            cGrad.addColorStop(1, "rgba(0, 230, 118, 0)");
            lCtx.fillStyle = cGrad;
            lCtx.beginPath();
            lCtx.arc(cx, cy, 60 * scaleX, 0, Math.PI * 2);
            lCtx.fill();
        });

        // 7. CLONE IMPOSTORS RED EVIL GLOW
        this.cloneImpostors.forEach(clone => {
            if (!clone.alive) return;
            const clx = toLX(clone.x);
            const cly = toLY(clone.y);
            const clGrad = lCtx.createRadialGradient(clx, cly, 2 * scaleX, clx, cly, 75 * scaleX);
            clGrad.addColorStop(0, "rgba(255, 51, 102, 0.85)");
            clGrad.addColorStop(1, "rgba(255, 51, 102, 0)");
            lCtx.fillStyle = clGrad;
            lCtx.beginPath();
            lCtx.arc(clx, cly, 75 * scaleX, 0, Math.PI * 2);
            lCtx.fill();
        });

        lCtx.restore();

        // Blit lighting canvas onto main canvas in screen space
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(lCanvas, 0, 0, this.screenWidth * this.dpr, this.screenHeight * this.dpr);

        // Draw physical hanging incandescent bulb fixtures on top in world space
        ctx.restore();
        this.drawPhysicalBulbs(ctx);
    }

    drawPhysicalBulbs(ctx) {
        const time = Date.now() / 1000;
        const hangingBulbs = [
            { x: 1120, y: 420, ceilingY: 350, swingOffset: 0 },
            { x: 1400, y: 420, ceilingY: 350, swingOffset: 1.2 },
            { x: 1680, y: 420, ceilingY: 350, swingOffset: 2.4 },
            { x: 400, y: 310, ceilingY: 200, swingOffset: 0.5 },
            { x: 410, y: 1220, ceilingY: 1000, swingOffset: 1.8 },
            { x: 2380, y: 490, ceilingY: 380, swingOffset: 3.1 },
            { x: 750, y: 700, ceilingY: 550, swingOffset: 0.9 },
            { x: 1950, y: 700, ceilingY: 550, swingOffset: 2.1 }
        ];

        hangingBulbs.forEach(b => {
            const swing = Math.sin(time * 2 + b.swingOffset) * 4;
            const bulbX = b.x + swing;
            const bulbY = b.y;

            ctx.save();

            // Wire from ceiling
            ctx.strokeStyle = "#1e293b";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.x, b.ceilingY);
            ctx.lineTo(bulbX, bulbY - 14);
            ctx.stroke();

            // Brass Socket
            ctx.fillStyle = "#b45309";
            ctx.fillRect(bulbX - 4, bulbY - 14, 8, 6);

            // Glass bulb teardrop
            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(bulbX, bulbY - 4, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(bulbX - 4, bulbY - 8);
            ctx.lineTo(bulbX + 4, bulbY - 8);
            ctx.lineTo(bulbX + 5, bulbY - 3);
            ctx.lineTo(bulbX - 5, bulbY - 3);
            ctx.closePath();
            ctx.fill();

            // Glowing tungsten filament
            ctx.strokeStyle = "#ea580c";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(bulbX - 2, bulbY - 3);
            ctx.lineTo(bulbX, bulbY - 6);
            ctx.lineTo(bulbX + 2, bulbY - 3);
            ctx.stroke();

            ctx.restore();
        });
    }

    drawStations(ctx) {
        // 3D Emergency Console Pedestal in Cafeteria (x: 1350, y: 520)
        const eb = this.map.emergency_button;
        if (eb) {
            ctx.save();
            const time = Date.now() / 1000;

            // 1. Floor Hazard Ring / Caution Perimeter
            ctx.strokeStyle = "#eab308";
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(eb.x, eb.y, 48, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Soft floor contact shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(eb.x, eb.y + 14, 40, 18, 0, 0, Math.PI * 2);
            ctx.fill();

            // 2. 3D Cylindrical Pedestal Base Column
            const baseGrad = ctx.createLinearGradient(eb.x - 32, 0, eb.x + 32, 0);
            baseGrad.addColorStop(0, "#0f172a");
            baseGrad.addColorStop(0.3, "#334155");
            baseGrad.addColorStop(0.7, "#475569");
            baseGrad.addColorStop(1, "#0f172a");
            ctx.fillStyle = baseGrad;
            ctx.beginPath();
            ctx.roundRect(eb.x - 30, eb.y - 12, 60, 36, 12);
            ctx.fill();
            ctx.strokeStyle = "#00f2fe";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 3. Raised Red Emergency Button with Pulsing Glow
            const pulse = (Math.sin(time * 6) + 1) * 0.5;
            const btnGrad = ctx.createRadialGradient(eb.x, eb.y - 2, 2, eb.x, eb.y - 2, 20);
            btnGrad.addColorStop(0, "#fca5a5");
            btnGrad.addColorStop(0.4, "#ef4444");
            btnGrad.addColorStop(0.8, "#b91c1c");
            btnGrad.addColorStop(1, "#7f1d1d");

            // Red warning aura when near
            if (this.nearEmergencyButton) {
                ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + pulse * 0.3})`;
                ctx.beginPath();
                ctx.arc(eb.x, eb.y - 2, 32 + pulse * 6, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            ctx.arc(eb.x, eb.y - 2, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            // 4. Transparent Glass Protective Dome with Specular Glare
            ctx.fillStyle = "rgba(0, 242, 254, 0.12)";
            ctx.beginPath();
            ctx.arc(eb.x, eb.y - 4, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Curved glare line on glass
            ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(eb.x - 4, eb.y - 8, 16, Math.PI * 1.1, Math.PI * 1.6);
            ctx.stroke();

            // 5. Header Label
            ctx.font = "bold 11px 'Orbitron', sans-serif";
            ctx.fillStyle = "#ef4444";
            ctx.textAlign = "center";
            ctx.fillText("🚨 BOTÓN DE EMERGENCIA", eb.x, eb.y + 44);

            // 6. Interactive Floating Badge when player is near
            if (this.nearEmergencyButton) {
                const badgeY = eb.y - 42 + Math.sin(time * 5) * 3;
                ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
                ctx.strokeStyle = "#facc15";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(eb.x - 100, badgeY - 14, 200, 26, 8);
                ctx.fill();
                ctx.stroke();

                ctx.font = "bold 11px 'Rajdhani', sans-serif";
                ctx.fillStyle = "#facc15";
                ctx.fillText("⚡ ¡TOCA AQUÍ O PULSA ESPACIO/E!", eb.x, badgeY + 4);
            }

            ctx.restore();
        }

        // Task Stations
        this.map.tasks.forEach(t => {
            const isAssigned = this.assignedTasks.includes(t.id);
            const isNear = this.nearbyTask && this.nearbyTask.id === t.id;

            ctx.save();
            ctx.fillStyle = isAssigned ? (isNear ? "#ffd600" : "#f1c40f") : "#555";
            ctx.beginPath();
            ctx.arc(t.x, t.y, 16, 0, Math.PI * 2);
            ctx.fill();

            if (isAssigned) {
                const pulse = 1 + Math.sin(Date.now() / 200) * 0.15;
                ctx.strokeStyle = isNear ? "#00e676" : "rgba(241, 196, 15, 0.4)";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(t.x, t.y, t.radius * pulse, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.font = "bold 11px 'Rajdhani', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(t.name, t.x, t.y - 22);
            ctx.restore();
        });
    }

    drawVents(ctx) {
        if (!this.map.vents) return;
        this.map.vents.forEach(v => {
            const isNear = this.nearbyVent && this.nearbyVent.id === v.id;
            ctx.save();
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(v.x - 22, v.y - 15, 44, 30);
            ctx.strokeStyle = isNear && this.myRole === "impostor" ? "#9b59b6" : "#7f8c8d";
            ctx.lineWidth = 2;
            ctx.strokeRect(v.x - 22, v.y - 15, 44, 30);

            ctx.strokeStyle = "#111";
            for (let i = -14; i <= 14; i += 7) {
                ctx.beginPath();
                ctx.moveTo(v.x + i, v.y - 10);
                ctx.lineTo(v.x + i, v.y + 10);
                ctx.stroke();
            }
            ctx.restore();
        });
    }

    drawCollectibles(ctx) {
        const time = Date.now() / 250;
        const bob = Math.sin(time) * 4;

        this.collectibles.forEach(col => {
            ctx.save();
            ctx.translate(col.x, col.y + bob);

            if (col.type === "star") {
                // Yellow Star (Design 4)
                ctx.fillStyle = "#ffd600";
                ctx.strokeStyle = "#f39c12";
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 16, -Math.sin((18 + i * 72) * Math.PI / 180) * 16);
                    ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 8, -Math.sin((54 + i * 72) * Math.PI / 180) * 8);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (col.type === "coin") {
                // Golden Ring / Coin (Design 4)
                ctx.fillStyle = "#f39c12";
                ctx.beginPath();
                ctx.arc(0, 0, 13, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#f1c40f";
                ctx.beginPath();
                ctx.arc(0, 0, 9, 0, Math.PI * 2);
                ctx.fill();
            } else if (col.type === "crystal") {
                // Blue Power Gem (Design 4)
                ctx.fillStyle = "#00d2ff";
                ctx.strokeStyle = "#0083b0";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.lineTo(12, -4);
                ctx.lineTo(8, 12);
                ctx.lineTo(-8, 12);
                ctx.lineTo(-12, -4);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        });
    }

    drawZombieCats(ctx) {
        const time = Date.now() / 1000;
        const coatColors = [
            { body: "#475569", ear: "#1e293b", belly: "#cbd5e1" }, // Gris zombi
            { body: "#18181b", ear: "#09090b", belly: "#ffffff" }, // Esmoquin
            { body: "#ea580c", ear: "#9a3412", belly: "#ffedd5" }, // Atigrado naranja
            { body: "#334155", ear: "#0f172a", belly: "#94a3b8" }  // Fantasmal
        ];

        this.zombieCats.forEach((cat, idx) => {
            if (!cat.alive) return;

            ctx.save();
            ctx.translate(cat.x, cat.y);

            const coat = coatColors[idx % coatColors.length];

            // 1. Toxic Green Ground Shadow & Mist
            const toxicPulse = (Math.sin(time * 4 + idx) + 1) * 0.5;
            ctx.fillStyle = `rgba(34, 197, 94, ${0.18 + toxicPulse * 0.15})`;
            ctx.beginPath();
            ctx.ellipse(0, 14, 22 + toxicPulse * 4, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Contact Shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(0, 14, 15, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // 2. Twitching Animated Tail
            const tailWag = Math.sin(time * 5 + idx) * 0.35;
            ctx.strokeStyle = coat.ear;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(12, 6);
            ctx.quadraticCurveTo(24 + tailWag * 8, 0, 22 + tailWag * 12, -14);
            ctx.stroke();

            // 3. Zombie Cat Body
            ctx.fillStyle = coat.body;
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fill();

            // Belly patch
            ctx.fillStyle = coat.belly;
            ctx.beginPath();
            ctx.ellipse(0, 4, 8, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            // 4. Cat Ears with dark tips
            ctx.fillStyle = coat.ear;
            ctx.beginPath();
            ctx.moveTo(-12, -8);
            ctx.lineTo(-18, -24);
            ctx.lineTo(-4, -14);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(12, -8);
            ctx.lineTo(18, -24);
            ctx.lineTo(4, -14);
            ctx.closePath();
            ctx.fill();

            // Inner Ear pinkish/decay
            ctx.fillStyle = "rgba(244, 114, 182, 0.5)";
            ctx.beginPath();
            ctx.moveTo(-11, -9);
            ctx.lineTo(-15, -20);
            ctx.lineTo(-5, -13);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(11, -9);
            ctx.lineTo(15, -20);
            ctx.lineTo(5, -13);
            ctx.closePath();
            ctx.fill();

            // 5. Glowing Green Zombie Eyes with Pupil Slits
            const eyeGlow = 0.8 + toxicPulse * 0.2;
            ctx.fillStyle = `rgba(0, 230, 118, ${eyeGlow})`;
            ctx.beginPath();
            ctx.arc(-6, -2, 4.5, 0, Math.PI * 2);
            ctx.arc(6, -2, 4.5, 0, Math.PI * 2);
            ctx.fill();

            // Pupil Slits
            ctx.fillStyle = "#000000";
            ctx.fillRect(-6.5, -5, 1.5, 6);
            ctx.fillRect(5.5, -5, 1.5, 6);

            // Nose
            ctx.fillStyle = "#f43f5e";
            ctx.beginPath();
            ctx.moveTo(-2, 3);
            ctx.lineTo(2, 3);
            ctx.lineTo(0, 5);
            ctx.closePath();
            ctx.fill();

            // Whiskers
            ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-7, 3); ctx.lineTo(-18, 1);
            ctx.moveTo(-7, 5); ctx.lineTo(-18, 7);
            ctx.moveTo(7, 3); ctx.lineTo(18, 1);
            ctx.moveTo(7, 5); ctx.lineTo(18, 7);
            ctx.stroke();

            // 6. Overhead Health Bar
            ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
            ctx.fillRect(-18, -28, 36, 6);
            ctx.fillStyle = "#00e676";
            const maxHp = 90;
            const curHp = Math.max(0, cat.hp || maxHp);
            ctx.fillRect(-18, -28, (curHp / maxHp) * 36, 6);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(-18, -28, 36, 6);

            ctx.font = "bold 9px 'Rajdhani', sans-serif";
            ctx.fillStyle = "#a8ff78";
            ctx.textAlign = "center";
            ctx.fillText(`🐱 Gato Zombi #${idx + 1}`, 0, -32);

            ctx.restore();
        });
    }

    drawLightOrbs(ctx) {
        const time = Date.now() / 200;
        this.lightOrbs.forEach(orb => {
            if (!orb || typeof orb.x !== "number" || typeof orb.y !== "number") return;
            ctx.save();
            ctx.translate(orb.x, orb.y);

            const isArmed = (orb.armed === true || (typeof orb.arm_timer === "number" && orb.arm_timer <= 0));

            // Floor warning ring
            ctx.save();
            if (!isArmed) {
                // Assembling animation
                ctx.strokeStyle = "rgba(234, 179, 8, 0.7)";
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, 24, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // Armed trap circle on floor
                const ringPulse = (Math.sin(time * 2) + 1) * 2.5;
                ctx.strokeStyle = "rgba(0, 242, 254, 0.85)";
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, 26 + ringPulse, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();

            // Pulsing magic light with safe fallback radius
            const baseRadius = (typeof orb.radius === "number" && orb.radius > 0) ? orb.radius : 24;
            const pulse = 1 + Math.sin(time) * 0.25;
            const finalRadius = Math.max(1, baseRadius * pulse);
            const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, finalRadius);

            if (!isArmed) {
                grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
                grad.addColorStop(0.5, "rgba(245, 158, 11, 0.75)");
                grad.addColorStop(1, "rgba(234, 88, 12, 0)");
            } else {
                grad.addColorStop(0, "rgba(255, 255, 255, 1)");
                grad.addColorStop(0.5, "rgba(0, 210, 255, 0.85)");
                grad.addColorStop(1, "rgba(255, 51, 102, 0)");
            }

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, finalRadius, 0, Math.PI * 2);
            ctx.fill();

            // Rotating Light Rune
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 12, time, time + Math.PI * 1.4);
            ctx.stroke();

            ctx.font = "bold 10px 'Orbitron', sans-serif";
            if (!isArmed) {
                ctx.fillStyle = "#facc15";
                ctx.textAlign = "center";
                ctx.fillText("⏳ ARMANDO ORBE...", 0, -32);
            } else {
                ctx.fillStyle = "#00f2fe";
                ctx.textAlign = "center";
                ctx.fillText("⚠️ PISAR PARA CLONAR", 0, -32);
            }

            ctx.restore();
        });
    }

    drawCloneImpostors(ctx) {
        this.cloneImpostors.forEach(clone => {
            if (!clone.alive) return;

            ctx.save();
            ctx.translate(clone.x, clone.y);

            // Shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(0, 20, 18, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Clone Body
            const bodyColor = clone.color?.hex || "#e74c3c";
            ctx.fillStyle = bodyColor;
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fill();

            // Tie
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(-3, 0, 6, 14);

            // Red Evil Visor
            ctx.fillStyle = "#ff3366";
            ctx.beginPath();
            ctx.ellipse(6, -2, 10, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Hat
            this.drawHat(ctx, clone.hat, 0, -18);

            // Clone HP Bar & Label
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(-18, -36, 36, 5);
            ctx.fillStyle = "#ff3366";
            ctx.fillRect(-18, -36, (clone.hp / 120) * 36, 5);

            ctx.font = "bold 12px 'Rajdhani', sans-serif";
            ctx.fillStyle = "#ff3366";
            ctx.textAlign = "center";
            ctx.fillText(clone.name, 0, -42);

            ctx.restore();
        });
    }

    drawPlayers(ctx) {
        const me = this.players.get(this.myPlayerId);

        this.players.forEach(p => {
            // 1. In-vent sewer crawling visualization (Paso por dentro de las alcantarillas)
            if (p.in_vent) {
                const canSeeVentPlayer = (p.id === this.myPlayerId) || (this.myRole === "impostor") || (me && !me.alive);
                if (!canSeeVentPlayer) return;

                ctx.save();
                ctx.translate(p.renderX, p.renderY);

                const crawlTime = Date.now() / 200;
                const ripple = Math.sin(crawlTime) * 3;

                // Sewer water ripple around crawling player
                ctx.strokeStyle = "rgba(52, 211, 153, 0.75)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 16 + Math.abs(ripple) * 2, 0, Math.PI * 2);
                ctx.stroke();

                // Crawling posture impostor (inside pipe)
                ctx.fillStyle = "#1e293b";
                ctx.beginPath();
                ctx.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2);
                ctx.fill();

                // Glowing visor
                ctx.fillStyle = "#ff3366";
                ctx.beginPath();
                ctx.arc(5, -2, 4.5, 0, Math.PI * 2);
                ctx.fill();

                // Flashlight beam illuminating sewer pipe interior
                const beamGrad = ctx.createRadialGradient(5, -2, 2, 26, -2, 35);
                beamGrad.addColorStop(0, "rgba(255, 51, 102, 0.75)");
                beamGrad.addColorStop(1, "rgba(255, 51, 102, 0)");
                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.moveTo(5, -2);
                ctx.lineTo(36, -14);
                ctx.lineTo(36, 10);
                ctx.closePath();
                ctx.fill();

                // Status tag
                ctx.font = "bold 11px 'Orbitron', sans-serif";
                ctx.fillStyle = "#c084fc";
                ctx.textAlign = "center";
                ctx.fillText("🕵️ DENTRO DE LA ALCANTARILLA", 0, -22);

                if (p.id === this.myPlayerId) {
                    ctx.fillStyle = "#facc15";
                    ctx.font = "bold 9px 'Rajdhani', sans-serif";
                    ctx.fillText("[V] Salir de la alcantarilla", 0, 24);
                }

                ctx.restore();
                return;
            }

            // 2. Invisibility check
            if (p.is_invisible) {
                if (p.id !== this.myPlayerId && me && me.alive) {
                    return; // Completely invisible to opponents!
                }
            }

            ctx.save();
            ctx.translate(p.renderX, p.renderY);

            const charKey = (p.character || "matias").toLowerCase();
            const theme = CHARACTER_THEMES[charKey] || (p.color ? { suitColor: p.color.hex, suitShade: "#1d4ed8", light: "#ffffff", pocket: "rgba(0,0,0,0.2)" } : CHARACTER_THEMES.matias);
            const isGirl = (p.gender === "girl" || charKey === "nina_blanca" || charKey === "reina_flor");
            const isMatias = (charKey === "matias" || p.name.toLowerCase().includes("matias"));
            const suitColor = theme.suitColor;
            const suitShade = theme.suitShade;
            const walkOffset = Math.sin(p.walkAnim || 0) * 4;

            // Invisibility translucent cloaked figure for local player
            if (p.is_invisible) {
                ctx.globalAlpha = 0.35;

                // Holographic electric cloaking grid rings
                ctx.strokeStyle = "rgba(0, 242, 254, 0.7)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, 22, 0, Math.PI * 2);
                ctx.stroke();
            } else if (!p.alive) {
                ctx.globalAlpha = 0.55;
            }

            // 1. Drop Shadow 3D
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.beginPath();
            ctx.ellipse(0, 22, 18, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Cat tail for Gato Azul behind player
            if (charKey === "gato_azul") {
                const tailWag = Math.sin((p.walkAnim || 0) * 1.5 + Date.now() / 250) * 8;
                ctx.strokeStyle = suitColor;
                ctx.lineWidth = 5.5;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(-10, 8 + walkOffset * 0.3);
                ctx.bezierCurveTo(-22 + tailWag, 2, -26 + tailWag * 1.4, -6, -24 + tailWag, -12);
                ctx.stroke();
                // White tip of cat tail
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 4.5;
                ctx.beginPath();
                ctx.moveTo(-25 + tailWag * 1.2, -8);
                ctx.lineTo(-24 + tailWag, -12);
                ctx.stroke();
            }

            // 2. Backpack / Oxygen tank with shading
            ctx.fillStyle = suitShade;
            ctx.fillRect(-22, -10 + walkOffset * 0.5, 7, 18);

            // 3. LEGS: 3D SUIT
            // Left leg
            ctx.fillStyle = suitColor;
            ctx.fillRect(-12, 10 + walkOffset, 9, 11);
            // Right leg with shadow depth
            ctx.fillStyle = suitShade;
            ctx.fillRect(3, 10 - walkOffset, 9, 11);

            // Crease seam lines on suit
            ctx.strokeStyle = theme.pocket || "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(0, 10);
            ctx.lineTo(0, 18);
            ctx.stroke();

            // 4. SNEAKERS: WHITE 3D (ZAPATOS BLANCOS CON SUELA Y CORDONES)
            // Left sneaker
            ctx.fillStyle = "#64748b"; // rubber sole
            ctx.fillRect(-14, 21 + walkOffset, 12, 3);
            ctx.fillStyle = "#ffffff"; // clean white body
            ctx.beginPath();
            ctx.ellipse(-8, 19 + walkOffset, 6, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#94a3b8"; // laces
            ctx.fillRect(-10, 18 + walkOffset, 4, 1.5);

            // Right sneaker
            ctx.fillStyle = "#475569"; // sole
            ctx.fillRect(1, 21 - walkOffset, 12, 3);
            ctx.fillStyle = "#f8fafc"; // body
            ctx.beginPath();
            ctx.ellipse(7, 19 - walkOffset, 6, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#94a3b8"; // laces
            ctx.fillRect(5, 18 - walkOffset, 4, 1.5);

            // 5. TORSO: SUIT WITH 3D SPHERICAL SHADING, DISTINCT BADGE & METALLIC ZIPPER
            const torsoGrad = ctx.createRadialGradient(-5, -4 + walkOffset * 0.5, 3, 0, 1 + walkOffset * 0.5, 19);
            torsoGrad.addColorStop(0, theme.light || "#ffffff");
            torsoGrad.addColorStop(0.35, suitColor);
            torsoGrad.addColorStop(1, suitShade);
            ctx.fillStyle = torsoGrad;
            ctx.beginPath();
            ctx.arc(0, 1 + walkOffset * 0.5, 18, 0, Math.PI * 2);
            ctx.fill();

            // Chest Badge specific to character
            const badgeX = -7;
            const badgeY = 1 + walkOffset * 0.5;
            ctx.save();
            ctx.translate(badgeX, badgeY);

            if (charKey === "matias") {
                // Golden Star
                ctx.fillStyle = "#ffd600";
                ctx.strokeStyle = "#d97706";
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * 4.5, -Math.sin((18 + i * 72) * Math.PI / 180) * 4.5);
                    ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * 2.2, -Math.sin((54 + i * 72) * Math.PI / 180) * 2.2);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (charKey === "fantasma") {
                // Cyan Cyber Arc Reactor / Core
                ctx.fillStyle = "#00f2fe";
                ctx.beginPath();
                ctx.arc(0, 0, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, 2, 0, Math.PI * 2);
                ctx.stroke();
            } else if (charKey === "gato_azul") {
                // White Cat Paw Print
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(0, 1, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(-2.5, -2, 1.2, 0, Math.PI * 2);
                ctx.arc(0, -3.2, 1.2, 0, Math.PI * 2);
                ctx.arc(2.5, -2, 1.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "reina_flor") {
                // Pink Blossom Flower
                ctx.fillStyle = "#f472b6";
                for (let i = 0; i < 5; i++) {
                    const ang = i * (Math.PI * 2 / 5);
                    ctx.beginPath();
                    ctx.arc(Math.cos(ang) * 2.8, Math.sin(ang) * 2.8, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = "#fef08a";
                ctx.beginPath();
                ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "duende_verde") {
                // Green 4-leaf Lucky Clover
                ctx.fillStyle = "#4ade80";
                for (let i = 0; i < 4; i++) {
                    const ang = i * (Math.PI / 2);
                    ctx.beginPath();
                    ctx.arc(Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, 1.8, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = "#15803d";
                ctx.beginPath();
                ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "granjero_rojo") {
                // Golden Wheat Sheaf
                ctx.strokeStyle = "#fef08a";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-1, 4); ctx.lineTo(1, -4);
                ctx.stroke();
                ctx.fillStyle = "#fde047";
                ctx.beginPath();
                ctx.ellipse(2, -2, 1.5, 2.5, 0.4, 0, Math.PI * 2);
                ctx.ellipse(-1, 0, 1.5, 2.5, -0.4, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "sanador_naranja") {
                // White Medical Cross
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(-1.5, -4, 3, 8);
                ctx.fillRect(-4, -1.5, 8, 3);
            } else if (charKey === "nina_blanca") {
                // Ethereal Lavender Butterfly
                ctx.fillStyle = "#c084fc";
                ctx.beginPath();
                ctx.ellipse(-2.5, -1.5, 2.2, 3, -0.4, 0, Math.PI * 2);
                ctx.ellipse(2.5, -1.5, 2.2, 3, 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#f472b6";
                ctx.beginPath();
                ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "mistico_uva") {
                // Golden Crescent Moon
                ctx.fillStyle = "#fde047";
                ctx.beginPath();
                ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = theme.suitColor;
                ctx.beginPath();
                ctx.arc(1.5, -1, 3.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "mago_negro") {
                // Arcane Violet Diamond / Rune
                ctx.fillStyle = "#c084fc";
                ctx.beginPath();
                ctx.moveTo(0, -4.5); ctx.lineTo(3.5, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-3.5, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = "#e879f9";
                ctx.lineWidth = 1;
                ctx.stroke();
            } else if (charKey === "ciclope_astral") {
                // Radiant Cosmic Starburst
                ctx.fillStyle = "#38bdf8";
                ctx.beginPath();
                ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, -5); ctx.lineTo(0, 5);
                ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
                ctx.stroke();
            } else {
                ctx.fillStyle = "#ffd600";
                ctx.beginPath();
                ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Metallic Front Zipper (Cierre metálico)
            ctx.strokeStyle = "#334155";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -6 + walkOffset * 0.5);
            ctx.lineTo(0, 14 + walkOffset * 0.5);
            ctx.stroke();

            // Silver Zipper Teeth dashes
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.setLineDash([2, 2]);
            ctx.moveTo(0, -6 + walkOffset * 0.5);
            ctx.lineTo(0, 14 + walkOffset * 0.5);
            ctx.stroke();
            ctx.setLineDash([]);

            // Zipper Puller Slider (Tirador de la cremallera)
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(-2, 2 + walkOffset * 0.5, 4, 5);
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(-1, 5 + walkOffset * 0.5, 2, 2);

            // Kangaroo Pockets
            ctx.strokeStyle = theme.pocket || "rgba(0,0,0,0.2)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 6 + walkOffset * 0.5, 10, 0.2 * Math.PI, 0.8 * Math.PI);
            ctx.stroke();

            // 6. 3D FACE WITH CHARACTER SPECIFICITY
            const faceGrad = ctx.createRadialGradient(-3, -12 + walkOffset * 0.5, 2, 0, -10 + walkOffset * 0.5, 13);
            if (charKey === "fantasma") {
                faceGrad.addColorStop(0, "#f8fafc");
                faceGrad.addColorStop(0.5, "#e2e8f0");
                faceGrad.addColorStop(1, "#cbd5e1");
            } else {
                faceGrad.addColorStop(0, "#fff5eb");
                faceGrad.addColorStop(0.5, "#ffdfba");
                faceGrad.addColorStop(1, "#f5c596");
            }
            ctx.fillStyle = faceGrad;
            ctx.beginPath();
            ctx.arc(0, -10 + walkOffset * 0.5, 12, 0, Math.PI * 2);
            ctx.fill();

            // Rosy cheeks (except for cyber/robotic entities)
            if (charKey !== "fantasma" && charKey !== "ciclope_astral") {
                ctx.fillStyle = "rgba(248, 113, 113, 0.45)";
                ctx.beginPath();
                ctx.arc(-7, -7 + walkOffset * 0.5, 3, 0, Math.PI * 2);
                ctx.arc(7, -7 + walkOffset * 0.5, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Eyes / Visor Rendering
            if (charKey === "ciclope_astral") {
                // Large single cyclops cosmic eye
                const eyeY = -10 + walkOffset * 0.5;
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(0, eyeY, 6.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 1.6;
                ctx.stroke();

                const irisGrad = ctx.createRadialGradient(0, eyeY, 1, 0, eyeY, 4.5);
                irisGrad.addColorStop(0, "#38bdf8");
                irisGrad.addColorStop(0.5, "#6366f1");
                irisGrad.addColorStop(1, "#0f172a");
                ctx.fillStyle = irisGrad;
                ctx.beginPath();
                ctx.arc(0, eyeY, 4.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "#020617";
                ctx.beginPath();
                ctx.arc(0, eyeY, 2.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(1.2, eyeY - 1.5, 1.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (charKey === "fantasma") {
                // Cybernetic visor across eyes
                const visorY = -11 + walkOffset * 0.5;
                ctx.fillStyle = "#0f172a";
                ctx.fillRect(-8, visorY - 3, 16, 6);
                ctx.fillStyle = "#00f2fe";
                ctx.fillRect(-7, visorY - 2, 14, 4);
                // Visor scanning light
                const scanX = Math.sin(Date.now() / 200) * 4.5;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(scanX - 1.5, visorY - 2, 3, 4);
            } else if (charKey === "mago_negro") {
                // Mystical glowing violet eyes
                const eyeY = -10 + walkOffset * 0.5;
                ctx.fillStyle = "#c084fc";
                ctx.beginPath();
                ctx.ellipse(-4, eyeY, 2.5, 4, 0, 0, Math.PI * 2);
                ctx.ellipse(4, eyeY, 2.5, 4, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(-4, eyeY - 1, 1, 0, Math.PI * 2);
                ctx.arc(4, eyeY - 1, 1, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Standard expressive cartoon eyes
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.ellipse(-4, -10 + walkOffset * 0.5, 3.5, 5, 0, 0, Math.PI * 2);
                ctx.ellipse(4, -10 + walkOffset * 0.5, 3.5, 5, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "#1e293b";
                ctx.beginPath();
                ctx.arc(-3.5, -10 + walkOffset * 0.5, 2.2, 0, Math.PI * 2);
                ctx.arc(4.5, -10 + walkOffset * 0.5, 2.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(-4, -11 + walkOffset * 0.5, 1, 0, Math.PI * 2);
                ctx.arc(4, -11 + walkOffset * 0.5, 1, 0, Math.PI * 2);
                ctx.fill();
            }

            // Gato Azul Cat Whiskers and Nose
            if (charKey === "gato_azul") {
                ctx.strokeStyle = "#1e293b";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(-5, -6 + walkOffset * 0.5); ctx.lineTo(-13, -8 + walkOffset * 0.5);
                ctx.moveTo(-5, -5 + walkOffset * 0.5); ctx.lineTo(-13, -4 + walkOffset * 0.5);
                ctx.moveTo(5, -6 + walkOffset * 0.5); ctx.lineTo(13, -8 + walkOffset * 0.5);
                ctx.moveTo(5, -5 + walkOffset * 0.5); ctx.lineTo(13, -4 + walkOffset * 0.5);
                ctx.stroke();

                ctx.fillStyle = "#f472b6";
                ctx.beginPath();
                ctx.arc(0, -6 + walkOffset * 0.5, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }

            // Duende Verde Pointed Elf Ears
            if (charKey === "duende_verde") {
                ctx.fillStyle = "#22c55e";
                ctx.beginPath();
                ctx.moveTo(-11, -11 + walkOffset * 0.5);
                ctx.lineTo(-17, -15 + walkOffset * 0.5);
                ctx.lineTo(-11, -7 + walkOffset * 0.5);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(11, -11 + walkOffset * 0.5);
                ctx.lineTo(17, -15 + walkOffset * 0.5);
                ctx.lineTo(11, -7 + walkOffset * 0.5);
                ctx.fill();
            }

            // Místico Uva Third Eye Gem
            if (charKey === "mistico_uva") {
                ctx.fillStyle = "#d946ef";
                ctx.beginPath();
                ctx.arc(0, -17 + walkOffset * 0.5, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }

            // GENDER & HAIR DIFFERENTIATION
            if (isGirl) {
                // Eyelashes (Pestañas)
                ctx.strokeStyle = "#1e293b";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(-7, -13 + walkOffset * 0.5);
                ctx.lineTo(-9, -15 + walkOffset * 0.5);
                ctx.moveTo(-5, -14 + walkOffset * 0.5);
                ctx.lineTo(-6, -17 + walkOffset * 0.5);
                ctx.moveTo(7, -13 + walkOffset * 0.5);
                ctx.lineTo(9, -15 + walkOffset * 0.5);
                ctx.moveTo(5, -14 + walkOffset * 0.5);
                ctx.lineTo(6, -17 + walkOffset * 0.5);
                ctx.stroke();

                // Twintails / Pigtails
                const pigtailBounce = Math.sin((p.walkAnim || 0) * 1.5) * 3;
                ctx.fillStyle = (charKey === "nina_blanca") ? "#e2e8f0" : "#5a3825";
                ctx.beginPath();
                ctx.ellipse(-14, -10 + walkOffset * 0.5 + pigtailBounce, 5, 10, -0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(14, -10 + walkOffset * 0.5 - pigtailBounce, 5, 10, 0.4, 0, Math.PI * 2);
                ctx.fill();

                // Bows
                ctx.fillStyle = (charKey === "reina_flor") ? "#f472b6" : "#fd79a8";
                ctx.beginPath();
                ctx.arc(-13, -15 + walkOffset * 0.5 + pigtailBounce, 3, 0, Math.PI * 2);
                ctx.arc(13, -15 + walkOffset * 0.5 - pigtailBounce, 3, 0, Math.PI * 2);
                ctx.fill();

                // Bangs
                ctx.fillStyle = (charKey === "nina_blanca") ? "#e2e8f0" : "#5a3825";
                ctx.beginPath();
                ctx.arc(0, -17 + walkOffset * 0.5, 10, 0.9 * Math.PI, 0.1 * Math.PI);
                ctx.fill();
            } else {
                // Boyish spiky hair
                ctx.fillStyle = (charKey === "fantasma") ? "#475569" : (charKey === "mago_negro" ? "#18181b" : "#362217");
                ctx.beginPath();
                ctx.arc(0, -18 + walkOffset * 0.5, 10, 0.8 * Math.PI, 0.2 * Math.PI);
                ctx.lineTo(3, -24 + walkOffset * 0.5);
                ctx.lineTo(-2, -21 + walkOffset * 0.5);
                ctx.lineTo(-6, -23 + walkOffset * 0.5);
                ctx.fill();
            }

            // Friendly Smile (when not disguised as impostor)
            ctx.strokeStyle = "#991b1b";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, -6 + walkOffset * 0.5, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
            ctx.stroke();

            // 7. Hat on Head (with signature default fallback for each character)
            const defaultHats = {
                matias: "mini_matias",
                fantasma: "microscope_bot",
                gato_azul: "cat_mask",
                reina_flor: "crown_flower",
                duende_verde: "leprechaun_gold",
                granjero_rojo: "straw_hat",
                sanador_naranja: "healing_plant",
                nina_blanca: "butterfly_bow",
                mistico_uva: "alien_antennas",
                mago_negro: "magic_tophat",
                ciclope_astral: "cyclops_eye"
            };
            const effectiveHat = p.hat || defaultHats[charKey] || null;
            this.drawHat(ctx, effectiveHat, 0, -22 + walkOffset * 0.5);

            // 8. Weapon in Hand (with signature default fallback for each character)
            const defaultWeapons = {
                matias: "racket",
                fantasma: "microscope",
                gato_azul: "pan",
                reina_flor: "magic_flower",
                duende_verde: "gold_pot",
                granjero_rojo: "wheat_fork",
                sanador_naranja: "herbs_basket",
                nina_blanca: "star_wand",
                mistico_uva: "crystal_wand",
                mago_negro: "magic_cane",
                ciclope_astral: "crystal_orb"
            };
            const effectiveWeapon = p.weapon || defaultWeapons[charKey] || null;
            this.drawWeapon(ctx, effectiveWeapon, 16, 6 + walkOffset * 0.5);

            // Impostor Disguise Vapor Swirls (Only visible to local impostor)
            if (p.is_disguised && p.id === this.myPlayerId) {
                const sTime = Date.now() / 250;
                for (let s = 0; s < 4; s++) {
                    const sAngle = sTime + s * (Math.PI / 2);
                    const sx = Math.cos(sAngle) * 20;
                    const sy = Math.sin(sAngle) * 12 + 8;
                    ctx.fillStyle = "rgba(168, 85, 247, 0.4)";
                    ctx.beginPath();
                    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.font = "bold 11px 'Orbitron', sans-serif";
                ctx.fillStyle = "#c084fc";
                ctx.textAlign = "center";
                ctx.fillText(`🎭 CAMUFLADO (${Math.ceil(p.disguise_timer || 0)}s)`, 0, -56);
            }

            // Invisibility indicator for local player
            if (p.is_invisible && p.id === this.myPlayerId) {
                ctx.font = "bold 11px 'Orbitron', sans-serif";
                ctx.fillStyle = "#00f2fe";
                ctx.textAlign = "center";
                ctx.fillText(`👻 INVISIBLE (${Math.ceil(p.invis_time_left || 0)}s)`, 0, -70);
            }

            // HP Bar
            if (p.alive) {
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.fillRect(-16, -34, 32, 4);
                ctx.fillStyle = p.hp > 40 ? "#00e676" : "#ff3366";
                ctx.fillRect(-16, -34, (p.hp / 100) * 32, 4);
            }

            // Name Tag with Character Badge icon
            ctx.globalAlpha = 1.0;
            ctx.font = "bold 13px 'Rajdhani', sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = p.role === "impostor" ? "#ff3366" : "#ffffff";
            const charIcons = {
                matias: "👦 ",
                fantasma: "🔬 ",
                gato_azul: "🐱 ",
                reina_flor: "🌸 ",
                duende_verde: "🍀 ",
                granjero_rojo: "🌾 ",
                sanador_naranja: "🌿 ",
                nina_blanca: "🦋 ",
                mistico_uva: "🍇 ",
                mago_negro: "🎩 ",
                ciclope_astral: "🔮 "
            };
            const roleBadge = charIcons[charKey] || (isGirl ? "👧 " : "👦 ");
            ctx.fillText(roleBadge + p.name, 0, -42);

            if (p.id === this.myPlayerId) {
                ctx.fillStyle = "#00d2ff";
                ctx.fillText("▲ (TÚ)", 0, -54);
            }

            ctx.restore();
        });
    }

    drawBrusCompanion(ctx) {
        const brus = this.brusCompanion;
        if (!brus || this.gameState !== "PLAYING") return;

        ctx.save();
        ctx.translate(brus.x, brus.y);

        const isSitting = (brus.state === "sitting");
        const isAlert = (brus.state === "alert");
        const isCelebrating = (brus.state === "celebrating");
        const isTrotting = (brus.state === "trotting");

        const flip = brus.facingRight ? 1 : -1;
        ctx.scale(flip, 1);

        const hopY = isCelebrating ? -Math.abs(Math.sin(Date.now() / 120)) * 14 : (isTrotting ? -Math.abs(Math.sin(brus.walkAnim)) * 4 : 0);
        const wagAngle = Math.sin(Date.now() / (isAlert ? 80 : 180)) * (isAlert ? 0.6 : 0.45);

        // 1. Drop shadow 3D
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 10, isSitting ? 13 : 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(0, hopY);

        // 2. Tail with white tip
        ctx.save();
        ctx.translate(-10, isSitting ? 2 : -2);
        ctx.rotate(-0.4 + wagAngle);
        ctx.strokeStyle = "#b45309";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-10, -8, -14, -15);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-11, -10);
        ctx.lineTo(-14, -15);
        ctx.stroke();
        ctx.restore();

        // 3. Hind legs
        ctx.fillStyle = "#92400e";
        if (isSitting) {
            ctx.beginPath();
            ctx.ellipse(-6, 7, 6, 4, -0.2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const legOffset = Math.sin(brus.walkAnim) * 4;
            ctx.beginPath();
            ctx.ellipse(-8 + legOffset, 7, 3.5, 5, 0, 0, Math.PI * 2);
            ctx.ellipse(-4 - legOffset, 7, 3.5, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. Body
        const bodyGrad = ctx.createRadialGradient(-2, 0, 3, 0, 0, 16);
        bodyGrad.addColorStop(0, "#fef08a");
        bodyGrad.addColorStop(0.4, "#f59e0b");
        bodyGrad.addColorStop(1, "#b45309");
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        if (isSitting) {
            ctx.ellipse(-1, 2, 11, 10, 0.2, 0, Math.PI * 2);
        } else {
            ctx.ellipse(-1, 0, 13, 9, 0, 0, Math.PI * 2);
        }
        ctx.fill();

        // Chest patch
        ctx.fillStyle = "#fffbeb";
        ctx.beginPath();
        ctx.ellipse(5, 0, 5, 6, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Front legs
        ctx.fillStyle = "#d97706";
        if (isSitting) {
            ctx.beginPath();
            ctx.ellipse(6, 6, 3, 6, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(6, 9, 3.2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const frontLegOffset = Math.sin(brus.walkAnim + Math.PI) * 4;
            ctx.beginPath();
            ctx.ellipse(5 + frontLegOffset, 6, 3, 6, 0, 0, Math.PI * 2);
            ctx.ellipse(9 - frontLegOffset, 6, 3, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(5 + frontLegOffset, 8, 2.8, 0, Math.PI * 2);
            ctx.arc(9 - frontLegOffset, 8, 2.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Collar & Golden Tag
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(6, -6, 6, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(6, -2, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // 6. Puppy Head
        const headGrad = ctx.createRadialGradient(8, -11, 2, 8, -10, 10);
        headGrad.addColorStop(0, "#fef08a");
        headGrad.addColorStop(0.5, "#f59e0b");
        headGrad.addColorStop(1, "#b45309");
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(8, -10, 9.5, 0, Math.PI * 2);
        ctx.fill();

        // Cream Muzzle
        ctx.fillStyle = "#fffbeb";
        ctx.beginPath();
        ctx.ellipse(12, -8, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.ellipse(15, -9, 2, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mouth
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (isCelebrating || isTrotting) {
            ctx.arc(13, -7, 2.5, 0, Math.PI);
            ctx.stroke();
            ctx.fillStyle = "#f43f5e";
            ctx.beginPath();
            ctx.arc(13, -6.2, 1.6, 0, Math.PI);
            ctx.fill();
        } else {
            ctx.arc(13, -7.5, 2, 0.1 * Math.PI, 0.9 * Math.PI);
            ctx.stroke();
        }

        // Eyes
        const eyeX = 10;
        const eyeY = -12;
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, isAlert ? 2.8 : 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(eyeX + 0.6, eyeY - 0.7, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // 7. Ears
        const earFlap = isTrotting ? Math.sin(brus.walkAnim) * 0.2 : 0;
        ctx.fillStyle = "#78350f";
        if (isAlert) {
            ctx.beginPath();
            ctx.moveTo(3, -16);
            ctx.lineTo(5, -27);
            ctx.lineTo(10, -18);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(1, -24);
            ctx.lineTo(6, -16);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.save();
            ctx.translate(3, -15);
            ctx.rotate(0.3 + earFlap);
            ctx.beginPath();
            ctx.ellipse(0, 5, 4, 8, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 8. Emotional Cues
        if (isAlert) {
            ctx.restore();
            ctx.save();
            ctx.translate(brus.x, brus.y + hopY);
            ctx.font = "bold 13px 'Orbitron', sans-serif";
            ctx.fillStyle = "#facc15";
            ctx.textAlign = "center";
            ctx.shadowColor = "#eab308";
            ctx.shadowBlur = 8;
            ctx.fillText("¡ALERTA!", 0, -28);
            ctx.restore();
            return;
        } else if (isCelebrating) {
            ctx.restore();
            ctx.save();
            ctx.translate(brus.x, brus.y + hopY);
            ctx.font = "14px 'Orbitron', sans-serif";
            ctx.fillStyle = "#38bdf8";
            ctx.textAlign = "center";
            ctx.shadowColor = "#38bdf8";
            ctx.shadowBlur = 10;
            ctx.fillText("⭐", 0, -28);
            ctx.restore();
            return;
        }

        ctx.restore();
    }

    drawStealthVignette(ctx, w, h) {
        const me = this.players.get(this.myPlayerId);
        if (!me || !me.alive || !me.in_stealth) return;

        ctx.save();
        const time = Date.now() / 350;
        const pulse = Math.sin(time) * 4;

        ctx.translate(me.renderX, me.renderY);

        const shadowGrad = ctx.createRadialGradient(0, 0, 16, 0, 0, 50 + pulse);
        shadowGrad.addColorStop(0, "rgba(15, 23, 42, 0.75)");
        shadowGrad.addColorStop(0.5, "rgba(15, 23, 42, 0.45)");
        shadowGrad.addColorStop(1, "rgba(15, 23, 42, 0)");

        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 50 + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 9px 'Orbitron', sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.textAlign = "center";
        ctx.shadowColor = "#0284c7";
        ctx.shadowBlur = 6;
        ctx.fillText("🌿 MODO SIGILO (OCULTO)", 0, 36);

        ctx.restore();
    }

    drawHat(ctx, hatId, x, y) {
        ctx.save();
        ctx.translate(x, y);

        if (hatId === "mini_matias") {
            // 1. Mini Matias on head (From Drawing 1)
            ctx.fillStyle = "#f1c40f";
            ctx.beginPath();
            ctx.arc(0, -8, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#333";
            ctx.beginPath();
            ctx.arc(-3, -8, 1.5, 0, Math.PI * 2);
            ctx.arc(3, -8, 1.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "microscope_bot") {
            // 2. Ghost Scientist Cyber Microscope Visor & Robot Antenna
            ctx.fillStyle = "#475569";
            ctx.fillRect(-10, -10, 20, 7);
            ctx.fillStyle = "#00f2fe";
            ctx.beginPath();
            ctx.arc(-4, -6.5, 3, 0, Math.PI * 2);
            ctx.arc(4, -6.5, 3, 0, Math.PI * 2);
            ctx.fill();
            // Antenna
            ctx.strokeStyle = "#94a3b8";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(0, -18);
            ctx.stroke();
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath();
            ctx.arc(0, -19, 2.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "cat_mask") {
            // 3. Black cat ears with pink inner ear
            ctx.fillStyle = "#1e293b";
            ctx.beginPath();
            ctx.moveTo(-11, 0); ctx.lineTo(-14, -14); ctx.lineTo(-4, -6); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(11, 0); ctx.lineTo(14, -14); ctx.lineTo(4, -6); ctx.fill();
            ctx.fillStyle = "#f472b6";
            ctx.beginPath();
            ctx.moveTo(-10, -2); ctx.lineTo(-12, -11); ctx.lineTo(-5, -6); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(10, -2); ctx.lineTo(12, -11); ctx.lineTo(5, -6); ctx.fill();
        } else if (hatId === "crown_flower") {
            // 4. Reina Flor: Golden crown with purple/pink blossom
            ctx.fillStyle = "#ffd600";
            ctx.beginPath();
            ctx.moveTo(-9, 0); ctx.lineTo(-11, -8); ctx.lineTo(-4, -5);
            ctx.lineTo(0, -11); ctx.lineTo(4, -5); ctx.lineTo(11, -8); ctx.lineTo(9, 0);
            ctx.closePath();
            ctx.fill();
            // Flower atop
            ctx.fillStyle = "#ec4899";
            ctx.beginPath();
            ctx.arc(0, -15, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(0, -15, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "leprechaun_gold") {
            // 5. Duende Verde: Green top hat with gold buckle and gold coin
            ctx.fillStyle = "#15803d";
            ctx.fillRect(-11, -2, 22, 4); // brim
            ctx.fillRect(-8, -14, 16, 12); // crown
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(-8, -5, 16, 3); // band
            // Gold coin on hat
            ctx.fillStyle = "#ffd600";
            ctx.beginPath();
            ctx.arc(5, -11, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#d97706";
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (hatId === "straw_hat") {
            // 6. Granjero Rojo: Straw hat with red ribbon and golden wheat sprig
            ctx.fillStyle = "#eab308";
            ctx.beginPath();
            ctx.ellipse(0, -2, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ca8a04";
            ctx.beginPath();
            ctx.arc(0, -7, 8, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = "#dc2626";
            ctx.fillRect(-7, -4, 14, 2.5); // red ribbon
            // Wheat sprig
            ctx.strokeStyle = "#fef08a";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(4, -4); ctx.lineTo(9, -12); ctx.stroke();
        } else if (hatId === "healing_plant") {
            // 7. Sanador Naranja: Healing plant sprout
            ctx.fillStyle = "#22c55e";
            ctx.beginPath();
            ctx.ellipse(-5, -8, 5, 3, -0.4, 0, Math.PI * 2);
            ctx.ellipse(5, -8, 5, 3, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#4ade80";
            ctx.beginPath();
            ctx.arc(0, -12, 3.5, 0, Math.PI * 2);
            ctx.fill();
            // Tiny red cross
            ctx.fillStyle = "#ef4444";
            ctx.fillRect(-1, -14, 2, 4);
            ctx.fillRect(-2, -13, 4, 2);
        } else if (hatId === "butterfly_bow") {
            // 8. Niña Blanca: Tender butterfly bow
            ctx.fillStyle = "#c084fc";
            ctx.beginPath();
            ctx.moveTo(0, -4);
            ctx.lineTo(-9, -12); ctx.lineTo(-11, -5); ctx.lineTo(0, -4);
            ctx.lineTo(9, -12); ctx.lineTo(11, -5); ctx.lineTo(0, -4);
            ctx.fill();
            ctx.fillStyle = "#f472b6";
            ctx.beginPath();
            ctx.arc(0, -5, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // Antennas
            ctx.strokeStyle = "#a855f7";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-1, -6); ctx.lineTo(-4, -13);
            ctx.moveTo(1, -6); ctx.lineTo(4, -13);
            ctx.stroke();
        } else if (hatId === "alien_antennas") {
            // 9. Místico Uva: Dual alien antennas with glowing spheres
            ctx.strokeStyle = "#a855f7";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-4, 0); ctx.lineTo(-8, -16);
            ctx.moveTo(4, 0); ctx.lineTo(8, -16);
            ctx.stroke();
            ctx.fillStyle = "#d946ef";
            ctx.beginPath();
            ctx.arc(-8, -17, 3.5, 0, Math.PI * 2);
            ctx.arc(8, -17, 3.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "magic_tophat") {
            // 10. Mago Negro: Magic top hat with rabbit ears
            ctx.fillStyle = "#18181b";
            ctx.fillRect(-11, -2, 22, 3.5);
            ctx.fillRect(-8, -15, 16, 13);
            ctx.fillStyle = "#dc2626";
            ctx.fillRect(-8, -4, 16, 2); // red ribbon
            // White rabbit ears
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.ellipse(-3, -20, 2, 6, -0.2, 0, Math.PI * 2);
            ctx.ellipse(3, -20, 2, 6, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f472b6";
            ctx.beginPath();
            ctx.ellipse(-3, -20, 1, 4, -0.2, 0, Math.PI * 2);
            ctx.ellipse(3, -20, 1, 4, 0.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "cyclops_eye") {
            // 11. Cíclope Astral: Astral optic crest with glowing eye
            ctx.fillStyle = "#334155";
            ctx.fillRect(-8, -8, 16, 6);
            ctx.fillStyle = "#00f2fe";
            ctx.beginPath();
            ctx.arc(0, -5, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(1, -6, 1.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "pan_egg") {
            // Frying pan with egg
            ctx.fillStyle = "#2d3436";
            ctx.fillRect(-10, -4, 20, 5);
            ctx.fillRect(8, -5, 8, 3);
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, -3, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f39c12";
            ctx.beginPath();
            ctx.arc(1, -3, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "party_cone") {
            // Yellow party cone
            ctx.fillStyle = "#f1c40f";
            ctx.beginPath();
            ctx.moveTo(-8, 0); ctx.lineTo(0, -22); ctx.lineTo(8, 0); ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#e67e22";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (hatId === "purple_flower") {
            // Purple plume / flower
            ctx.fillStyle = "#9b59b6";
            ctx.beginPath();
            ctx.arc(0, -12, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f1c40f";
            ctx.beginPath();
            ctx.arc(0, -12, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "alien_antenna") {
            // Alien antenna with red light
            ctx.strokeStyle = "#bdc3c7";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, -16); ctx.stroke();
            ctx.fillStyle = "#ff3366";
            ctx.beginPath();
            ctx.arc(0, -18, 5, 0, Math.PI * 2);
            ctx.fill();
        } else if (hatId === "crown") {
            // Golden Crown
            ctx.fillStyle = "#ffd600";
            ctx.beginPath();
            ctx.moveTo(-10, 0); ctx.lineTo(-12, -12); ctx.lineTo(-4, -6);
            ctx.lineTo(0, -15); ctx.lineTo(4, -6); ctx.lineTo(12, -12); ctx.lineTo(10, 0);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    drawWeapon(ctx, weaponId, x, y) {
        ctx.save();
        ctx.translate(x, y);

        if (weaponId === "racket") {
            // 1. Matías: Padel/Tennis Racket & Ball
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, -5, 6, 8, 0, 0, Math.PI * 2);
            ctx.stroke();
            // Strings
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-4, -5); ctx.lineTo(4, -5);
            ctx.moveTo(0, -11); ctx.lineTo(0, 1);
            ctx.stroke();
            // Handle
            ctx.strokeStyle = "#1e293b";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 3); ctx.lineTo(0, 12); ctx.stroke();
            // Yellow ball
            ctx.fillStyle = "#facc15";
            ctx.beginPath();
            ctx.arc(7, -8, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "microscope") {
            // 2. Fantasma Científico: Microscope
            ctx.fillStyle = "#64748b";
            ctx.fillRect(-6, 8, 12, 3); // base
            ctx.fillRect(-2, 0, 4, 8); // pillar
            ctx.fillStyle = "#0ea5e9";
            ctx.beginPath();
            ctx.arc(2, -4, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#334155";
            ctx.fillRect(0, -9, 4, 9); // eyepiece tube
        } else if (weaponId === "pan") {
            // 3. Pan with fried egg
            ctx.fillStyle = "#2d3436";
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(8, -2, 8, 4);
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f39c12";
            ctx.beginPath();
            ctx.arc(1, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "magic_flower") {
            // 4. Reina Flor: Magic Flower Wand
            ctx.strokeStyle = "#15803d";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 10); ctx.lineTo(0, -4); ctx.stroke();
            ctx.fillStyle = "#f472b6";
            ctx.beginPath();
            ctx.arc(0, -6, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(0, -6, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "gold_pot") {
            // 5. Duende Verde: Pot of gold coins
            ctx.fillStyle = "#1e293b";
            ctx.beginPath();
            ctx.arc(0, 2, 7, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = "#ffd600";
            ctx.beginPath();
            ctx.ellipse(0, 1, 7, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "wheat_fork") {
            // 6. Granjero Rojo: Pitchfork / wheat
            ctx.strokeStyle = "#ca8a04";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 12); ctx.lineTo(0, -8); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-5, -6); ctx.lineTo(-5, -12);
            ctx.moveTo(0, -6); ctx.lineTo(0, -13);
            ctx.moveTo(5, -6); ctx.lineTo(5, -12);
            ctx.stroke();
        } else if (weaponId === "herbs_basket") {
            // 7. Sanador Naranja: Herbs basket
            ctx.fillStyle = "#b45309";
            ctx.beginPath();
            ctx.arc(0, 3, 7, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = "#22c55e";
            ctx.beginPath();
            ctx.arc(-2, 0, 3, 0, Math.PI * 2);
            ctx.arc(2, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "star_wand") {
            // 8. Niña Blanca: Golden Star Wand
            ctx.strokeStyle = "#eab308";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 11); ctx.lineTo(0, -4); ctx.stroke();
            ctx.fillStyle = "#ffd600";
            ctx.beginPath();
            ctx.arc(0, -6, 4.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "crystal_wand") {
            // 9. Místico Uva: Crystal Wand
            ctx.strokeStyle = "#581c87";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 12); ctx.lineTo(0, -5); ctx.stroke();
            ctx.fillStyle = "#c084fc";
            ctx.beginPath();
            ctx.moveTo(0, -12); ctx.lineTo(4, -5); ctx.lineTo(0, -1); ctx.lineTo(-4, -5);
            ctx.closePath();
            ctx.fill();
        } else if (weaponId === "magic_cane") {
            // 10. Mago Negro: Magician Cane
            ctx.strokeStyle = "#09090b";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 12); ctx.lineTo(0, -8); ctx.stroke();
            ctx.fillStyle = "#ffd600";
            ctx.beginPath();
            ctx.arc(0, -8, 3.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (weaponId === "crystal_orb") {
            // 11. Cíclope Astral: Crystal Orb
            ctx.fillStyle = "rgba(0, 242, 254, 0.85)";
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (weaponId === "energy_sword") {
            // Double-edged energy spear / sword
            ctx.strokeStyle = "#00d2ff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
            ctx.fillStyle = "#00ffff";
            ctx.beginPath();
            ctx.moveTo(0, -22); ctx.lineTo(-6, -12); ctx.lineTo(6, -12); ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(0, 22); ctx.lineTo(-6, 12); ctx.lineTo(6, 12); ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    drawDeadBodies(ctx) {
        this.deadBodies.forEach(b => {
            ctx.save();
            ctx.translate(b.x, b.y);

            ctx.fillStyle = "rgba(192, 57, 43, 0.75)";
            ctx.beginPath();
            ctx.ellipse(0, 8, 22, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = b.color?.hex || "#e74c3c";
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI);
            ctx.fill();

            ctx.fillStyle = "#ecf0f1";
            ctx.fillRect(-3, -12, 6, 14);
            ctx.beginPath();
            ctx.arc(-2, -12, 4, 0, Math.PI * 2);
            ctx.arc(2, -12, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = "bold 11px 'Rajdhani', sans-serif";
            ctx.fillStyle = "#ff7675";
            ctx.textAlign = "center";
            ctx.fillText(`Cuerpo de ${b.victim_name}`, 0, 26);
            ctx.restore();
        });
    }

    drawPunchEffects(ctx) {
        this.punchEffects.forEach(e => {
            ctx.save();
            ctx.font = "bold 16px 'Orbitron', sans-serif";
            ctx.fillStyle = e.color || "#ffd600";
            ctx.textAlign = "center";
            ctx.fillText(e.text, e.x, e.y);
            ctx.restore();
        });
    }

    drawFogOfWar(ctx, w, h) {
        const me = this.players.get(this.myPlayerId);
        if (!me || !me.alive) return;

        const visionRadius = me.role === "impostor" ? 400 : 270;

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = w;
        maskCanvas.height = h;
        const mctx = maskCanvas.getContext("2d");

        mctx.fillStyle = "rgba(5, 7, 12, 0.88)";
        mctx.fillRect(0, 0, w, h);

        const screenX = w / 2;
        const screenY = h / 2;

        const radGrad = mctx.createRadialGradient(screenX, screenY, visionRadius * 0.35, screenX, screenY, visionRadius);
        radGrad.addColorStop(0, "rgba(0,0,0,1)");
        radGrad.addColorStop(1, "rgba(0,0,0,0)");

        mctx.globalCompositeOperation = "destination-out";
        mctx.fillStyle = radGrad;
        mctx.beginPath();
        mctx.arc(screenX, screenY, visionRadius, 0, Math.PI * 2);
        mctx.fill();

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.restore();
    }

    drawMinimap(canvas) {
        if (!canvas || !this.map) return;
        const ctx = canvas.getContext("2d");
        const cw = canvas.width;
        const ch = canvas.height;
        const scaleX = cw / 2800;
        const scaleY = ch / 2100;

        // Background space
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, cw, ch);

        // Rooms & Floor Zones
        const rooms = [
            { name: "REACTOR", x: 100, y: 100, w: 470, h: 420, color: "rgba(59, 130, 246, 0.15)" },
            { name: "CAFETERÍA", x: 850, y: 350, w: 1000, h: 700, color: "rgba(241, 196, 15, 0.15)" },
            { name: "HABITACIÓN", x: 2050, y: 100, w: 650, h: 520, color: "rgba(168, 85, 247, 0.15)" },
            { name: "ELECTRICIDAD", x: 150, y: 1000, w: 520, h: 470, color: "rgba(234, 179, 8, 0.15)" },
            { name: "SALA DE MÚSICA", x: 1000, y: 1350, w: 770, h: 520, color: "rgba(236, 72, 153, 0.15)" },
            { name: "NAVEGACIÓN", x: 2050, y: 800, w: 670, h: 620, color: "rgba(34, 197, 94, 0.15)" }
        ];

        rooms.forEach(r => {
            ctx.fillStyle = r.color;
            ctx.fillRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
            ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
            ctx.lineWidth = 1;
            ctx.strokeRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);

            ctx.fillStyle = "rgba(226, 232, 240, 0.75)";
            ctx.font = "bold 9px 'Orbitron', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(r.name, (r.x + r.w / 2) * scaleX, (r.y + 20) * scaleY);
        });

        // Obstacles (walls)
        if (this.map.obstacles) {
            ctx.fillStyle = "#334155";
            this.map.obstacles.forEach(obs => {
                ctx.fillRect(obs.x * scaleX, obs.y * scaleY, obs.w * scaleX, obs.h * scaleY);
            });
        }

        // Vents
        if (this.map.vents) {
            ctx.fillStyle = "#06b6d4";
            this.map.vents.forEach(v => {
                ctx.beginPath();
                ctx.arc(v.x * scaleX, v.y * scaleY, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Emergency Button
        if (this.map.emergency_button) {
            const eb = this.map.emergency_button;
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(eb.x * scaleX, eb.y * scaleY, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Tasks
        if (this.map.tasks) {
            this.map.tasks.forEach(t => {
                const isAssigned = (this.assignedTasks || []).includes(t.id);
                const isDone = this.completedTasks && this.completedTasks.has(t.id);
                ctx.fillStyle = isDone ? "#64748b" : (isAssigned ? "#22c55e" : "#0ea5e9");
                ctx.beginPath();
                ctx.arc(t.x * scaleX, t.y * scaleY, isAssigned ? 4.5 : 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Zombie Cats
        (this.zombieCats || []).forEach(cat => {
            if (cat.alive) {
                ctx.fillStyle = "#f472b6";
                ctx.beginPath();
                ctx.arc(cat.x * scaleX, cat.y * scaleY, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Current Player (Radar Ping)
        const me = this.players.get(this.myPlayerId);
        if (me) {
            ctx.fillStyle = "#f1c40f";
            ctx.beginPath();
            ctx.arc(me.renderX * scaleX, me.renderY * scaleY, 6, 0, Math.PI * 2);
            ctx.fill();

            // Glowing ring
            ctx.strokeStyle = "rgba(241, 196, 15, 0.75)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(me.renderX * scaleX, me.renderY * scaleY, 10, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("TÚ", me.renderX * scaleX, (me.renderY * scaleY) - 9);
        }
    }
}

window.gameEngine = new GameEngine();
