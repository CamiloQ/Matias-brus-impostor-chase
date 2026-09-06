const CHARACTER_METADATA = {
    matias: { name: "Matías", icon: "👦", color: "#f1c40f" },
    fantasma: { name: "Fantasma", icon: "🔬", color: "#94a3b8" },
    gato_azul: { name: "Gato Azul", icon: "🐱", color: "#3b82f6" },
    reina_flor: { name: "Reina Flor", icon: "🌸", color: "#f472b6" },
    duende_verde: { name: "Duende Verde", icon: "🍀", color: "#22c55e" },
    granjero_rojo: { name: "Granjero Rojo", icon: "🌾", color: "#ef4444" },
    sanador_naranja: { name: "Sanador Naranja", icon: "🌿", color: "#f97316" },
    nina_blanca: { name: "Niña Blanca", icon: "🦋", color: "#f8fafc" },
    mistico_uva: { name: "Místico Uva", icon: "🍇", color: "#9333ea" },
    mago_negro: { name: "Mago Oscuro", icon: "🎩", color: "#27272a" },
    ciclope_astral: { name: "Cíclope Astral", icon: "👁️", color: "#475569" }
};

function sanitizeHTML(text) {
    if (!text) return "";
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
class UIManager {
    constructor() {
        this.joystickVector = { x: 0, y: 0 };
        this.currentTaskStation = null;
        this.taskInterval = null;

        // Customization State
        this.selectedHat = "mini_matias";
        this.selectedSkin = "onesie_tie";
        this.selectedWeapon = "pan";
        this.catalogs = { hats: [], skins: [], weapons: [] };

        // Song Battle State
        this.songBattleActive = false;
        this.rhythmScore = 0;
        this.rhythmCombo = 0;
        this.songTimer = null;

        // PWA Install Prompt
        this.deferredInstallPrompt = null;

        this.initDOM();
        this.bindEvents();
        this.initServiceWorker();
    }

    initDOM() {
        this.lobbyScreen = document.getElementById("lobby-screen");
        this.waitingScreen = document.getElementById("waiting-room-screen");
        this.topBar = document.getElementById("top-bar");
        this.taskChecklist = document.getElementById("task-checklist");
        this.actionControls = document.getElementById("action-controls");
        this.roleBanner = document.getElementById("role-banner");
        this.connectionToast = document.getElementById("connection-toast");
        this.taskModal = document.getElementById("task-modal");
        this.meetingModal = document.getElementById("meeting-modal");
        this.gameOverModal = document.getElementById("game-over-modal");
        this.wardrobeModal = document.getElementById("wardrobe-modal");
        this.songBattleModal = document.getElementById("song-battle-modal");
        this.minimapModal = document.getElementById("minimap-modal");
        this.btnToggleMap = document.getElementById("btn-toggle-map");
        this.btnCloseMap = document.getElementById("btn-close-map");
        this.minimapCanvas = document.getElementById("minimapCanvas");
        this.pwaInstallBox = document.getElementById("pwa-install-box");
        this.btnInstallPwa = document.getElementById("btn-install-pwa");

        // Action Buttons
        this.btnPunch = document.getElementById("btn-punch");
        this.btnWardrobeHud = document.getElementById("btn-wardrobe-hud");
        this.btnUse = document.getElementById("btn-use");
        this.btnReport = document.getElementById("btn-report");
        this.btnKill = document.getElementById("btn-kill");
        this.btnVent = document.getElementById("btn-vent");
        this.btnShapeshift = document.getElementById("btn-shapeshift");
        this.btnGhostInvis = document.getElementById("btn-ghost-invis");
        this.ghostCdTimer = document.getElementById("ghost-cd-timer");
        this.shapeshiftModal = document.getElementById("shapeshift-modal");
        this.shapeshiftCrewGrid = document.getElementById("shapeshift-crew-grid");
        this.btnCloseShapeshift = document.getElementById("btn-close-shapeshift");
        this.btnRemoveDisguise = document.getElementById("btn-remove-disguise");
        this.btnFullscreen = document.getElementById("btn-fullscreen");
        this.killCdTimer = document.getElementById("kill-cd-timer");

        // Lobby
        this.inputNickname = document.getElementById("player-nickname");
        this.btnCreate = document.getElementById("btn-create-room");
        this.btnJoin = document.getElementById("btn-join-room");
        this.inputRoomCode = document.getElementById("join-room-code");
        this.btnStartGame = document.getElementById("btn-start-game");
        this.btnLeaveRoom = document.getElementById("btn-leave-room");
        this.displayRoomCode = document.getElementById("display-room-code");
        this.btnCopyCode = document.getElementById("btn-copy-code");
        this.waitingGrid = document.getElementById("waiting-players-grid");
        this.waitingCount = document.getElementById("waiting-players-count");

        // HUD
        this.scoreDisplay = document.getElementById("score-display");
        this.pingDisplay = document.getElementById("ping-display");
        this.taskProgressFill = document.getElementById("task-progress-fill");
        this.taskList = document.getElementById("task-list");
        this.btnToggleTasks = document.getElementById("btn-toggle-tasks");
        this.btnToggleChat = document.getElementById("btn-toggle-chat");
        this.orientationHint = document.getElementById("orientation-hint");

        // Chat
        this.chatForm = document.getElementById("chat-form");
        this.chatInput = document.getElementById("chat-input");
        this.chatMessages = document.getElementById("chat-messages");

        // Dynamic Floating Joystick
        this.touchZone = document.getElementById("joystick-touch-zone");
        this.joystickBase = document.getElementById("joystick-base");
        this.joystickStick = document.getElementById("joystick-stick");

        const savedNick = localStorage.getItem("chase_nickname");
        if (savedNick) this.inputNickname.value = savedNick;

        this.autoStartPending = false;
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get("room");
        const playParam = urlParams.get("play");
        if (playParam === "1") {
            this.autoStartPending = true;
        }
        // Si la URL contiene room, pre-rellenar código de sala
        if (roomParam) {
            this.inputRoomCode.value = roomParam;
            const joinTab = document.querySelector('.tab-btn[data-tab="join"]');
            if (joinTab) joinTab.click();
        }
    }

    bindActionTap(button, handler) {
        if (!button) return;
        let lastTouchTime = 0;
        button.addEventListener("pointerdown", (e) => {
            if (button.disabled) return;
            e.preventDefault();
            lastTouchTime = Date.now();
            handler();
        });
        button.addEventListener("click", (e) => {
            if (Date.now() - lastTouchTime < 400) return;
            if (button.disabled) return;
            handler();
        });
    }

    bindEvents() {
        // Unlock Web Audio on first mobile touch
        window.addEventListener("touchstart", () => {
            if (window.soundEngine) window.soundEngine.init();
        }, { once: true });
        window.addEventListener("click", () => {
            if (window.soundEngine) window.soundEngine.init();
        }, { once: true });

        // Fullscreen Toggle with landscape lock for mobile / tablets
        if (this.btnFullscreen) {
            this.btnFullscreen.addEventListener("click", () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().then(() => {
                        if (screen.orientation && screen.orientation.lock) {
                            screen.orientation.lock("landscape").catch(() => {});
                        }
                    }).catch(() => {});
                } else {
                    document.exitFullscreen().catch(() => {});
                }
            });
        }

        // Toggle Task Checklist on mobile/tablet
        if (this.btnToggleTasks && this.taskChecklist) {
            this.btnToggleTasks.addEventListener("click", (e) => {
                e.stopPropagation();
                this.taskChecklist.classList.toggle("mobile-open");
                this.vibrate(25);
            });
        }
        const taskBarContainer = document.querySelector(".task-bar-container");
        if (taskBarContainer && this.taskChecklist) {
            taskBarContainer.addEventListener("click", () => {
                this.taskChecklist.classList.toggle("mobile-open");
                this.vibrate(25);
            });
        }

        // Toggle Chat on mobile/tablet
        if (this.btnToggleChat) {
            this.btnToggleChat.addEventListener("click", (e) => {
                e.stopPropagation();
                const chatWidget = document.getElementById("chat-widget");
                if (chatWidget) {
                    chatWidget.classList.toggle("mobile-open");
                    if (chatWidget.classList.contains("mobile-open")) {
                        const chatInput = document.getElementById("chat-input");
                        if (chatInput) chatInput.focus();
                    }
                }
                this.vibrate(25);
            });
        }

        // Toggle Radar Minimap
        if (this.btnToggleMap) {
            this.btnToggleMap.addEventListener("click", (e) => {
                e.stopPropagation();
                this.vibrate(25);
                window.soundEngine.playClick();
                if (this.minimapModal) {
                    this.minimapModal.classList.toggle("hidden");
                    if (!this.minimapModal.classList.contains("hidden") && window.gameEngine) {
                        window.gameEngine.drawMinimap(this.minimapCanvas);
                    }
                }
            });
        }
        if (this.btnCloseMap) {
            this.btnCloseMap.addEventListener("click", () => {
                if (this.minimapModal) this.minimapModal.classList.add("hidden");
            });
        }

        // Check for mobile portrait orientation hint
        const updateOrientationHint = () => {
            if (!this.orientationHint) return;
            const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            const isPortrait = window.innerHeight > window.innerWidth;
            if (isTouch && isPortrait) {
                this.orientationHint.classList.remove("hidden");
            } else {
                this.orientationHint.classList.add("hidden");
            }
        };
        window.addEventListener("resize", updateOrientationHint);
        window.addEventListener("orientationchange", updateOrientationHint);
        updateOrientationHint();

        // PWA Install prompt handling
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            if (this.pwaInstallBox) this.pwaInstallBox.classList.remove("hidden");
        });

        if (this.btnInstallPwa) {
            this.btnInstallPwa.addEventListener("click", async () => {
                if (this.deferredInstallPrompt) {
                    this.deferredInstallPrompt.prompt();
                    const { outcome } = await this.deferredInstallPrompt.userChoice;
                    if (outcome === "accepted") {
                        this.pwaInstallBox.classList.add("hidden");
                    }
                }
            });
        }

        // Graphics Quality Controls
        const btnGfxQuality = document.getElementById("btn-gfx-quality");
        const gfxOptBtns = document.querySelectorAll(".gfx-opt-btn");

        const updateGfxUI = (q) => {
            if (btnGfxQuality) {
                if (q === "ultra") {
                    btnGfxQuality.textContent = "✨ ULTRA";
                    btnGfxQuality.style.borderColor = "#10b981";
                    btnGfxQuality.style.color = "#34d399";
                } else if (q === "medium") {
                    btnGfxQuality.textContent = "⭐ NORMAL";
                    btnGfxQuality.style.borderColor = "#f59e0b";
                    btnGfxQuality.style.color = "#fbbf24";
                } else {
                    btnGfxQuality.textContent = "⚡ RÁPIDO";
                    btnGfxQuality.style.borderColor = "#60a5fa";
                    btnGfxQuality.style.color = "#93c5fd";
                }
            }
            gfxOptBtns.forEach(b => {
                b.classList.toggle("active", b.getAttribute("data-quality") === q);
            });
        };

        const currentQ = localStorage.getItem("chase_gfx_quality") || "low";
        updateGfxUI(currentQ);

        const cycleQuality = () => {
            const current = (window.gameEngine && window.gameEngine.graphicsQuality) || "low";
            const next = current === "low" ? "medium" : current === "medium" ? "ultra" : "low";
            if (window.gameEngine) window.gameEngine.setQuality(next);
            updateGfxUI(next);
            this.vibrate(15);
            window.soundEngine.playClick();
        };

        if (btnGfxQuality) {
            btnGfxQuality.addEventListener("click", cycleQuality);
        }

        gfxOptBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const q = btn.getAttribute("data-quality");
                if (window.gameEngine) window.gameEngine.setQuality(q);
                updateGfxUI(q);
                this.vibrate(15);
                window.soundEngine.playClick();
            });
        });

        // Character Selection (11 Personajes Oficiales)
        this.selectedCharacter = "matias";
        this.selectedGender = "boy";

        const CHAR_NAMES = {
            "matias": "Matías",
            "fantasma": "Fantasma",
            "gato_azul": "Gato Azul",
            "reina_flor": "Reina Flor",
            "duende_verde": "Duende Verde",
            "granjero_rojo": "Granjero Rojo",
            "sanador_naranja": "Sanador",
            "nina_blanca": "Niña Blanca",
            "mistico_uva": "Místico Uva",
            "mago_negro": "Mago Oscuro",
            "ciclope_astral": "Cíclope Astral"
        };

        const charButtons = document.querySelectorAll(".char-select-btn");
        const selectChar = (btn) => {
            const charId = btn.getAttribute("data-character");
            if (charId) {
                this.selectedCharacter = charId;
                charButtons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                const currentVal = (this.inputNickname.value || "").trim();
                const isDefault = !currentVal || currentVal === "Matias" || currentVal === "Niña" || Object.values(CHAR_NAMES).includes(currentVal);
                if (isDefault && CHAR_NAMES[charId]) {
                    this.inputNickname.value = CHAR_NAMES[charId];
                }

                if (charId === "nina_blanca" || charId === "reina_flor") {
                    this.selectedGender = "girl";
                    const gBtn = document.getElementById("btn-gender-girl");
                    if (gBtn) gBtn.classList.add("active");
                    const bBtn = document.getElementById("btn-gender-boy");
                    if (bBtn) bBtn.classList.remove("active");
                } else {
                    this.selectedGender = "boy";
                    const bBtn = document.getElementById("btn-gender-boy");
                    if (bBtn) bBtn.classList.add("active");
                    const gBtn = document.getElementById("btn-gender-girl");
                    if (gBtn) gBtn.classList.remove("active");
                }

                this.vibrate(20);
                if (window.soundEngine) window.soundEngine.playClick();
            }
        };

        charButtons.forEach(btn => {
            btn.addEventListener("pointerdown", () => selectChar(btn));
            btn.addEventListener("click", () => selectChar(btn));
        });

        const btnGenderBoy = document.getElementById("btn-gender-boy");
        const btnGenderGirl = document.getElementById("btn-gender-girl");

        if (btnGenderBoy && btnGenderGirl) {
            btnGenderBoy.addEventListener("click", () => {
                this.selectedGender = "boy";
                btnGenderBoy.classList.add("active");
                btnGenderGirl.classList.remove("active");
                this.vibrate(15);
                window.soundEngine.playClick();
            });

            btnGenderGirl.addEventListener("click", () => {
                this.selectedGender = "girl";
                btnGenderGirl.classList.add("active");
                btnGenderBoy.classList.remove("active");
                this.vibrate(15);
                window.soundEngine.playClick();
            });
        }

        // Wardrobe Gender Toggle
        document.querySelectorAll(".w-gender-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const g = btn.getAttribute("data-wgender");
                if (g) {
                    this.selectedGender = g;
                    document.querySelectorAll(".w-gender-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    this.vibrate(15);
                    window.soundEngine.playClick();
                    this.saveWardrobe();
                }
            });
        });

        // Tab switching
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
                btn.classList.add("active");
                const targetTab = btn.getAttribute("data-tab");
                document.getElementById(`tab-${targetTab}-content`).classList.add("active");
                window.soundEngine.playClick();
            });
        });

        // Wardrobe tabs
        document.querySelectorAll(".w-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".w-tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".wardrobe-grid").forEach(g => g.classList.remove("active"));
                btn.classList.add("active");
                const targetTab = btn.getAttribute("data-wtab");
                document.getElementById(`wtab-${targetTab}`).classList.add("active");
                window.soundEngine.playClick();
            });
        });

        // Create Room
        this.btnCreate.addEventListener("click", async () => {
            this.vibrate(25);
            window.soundEngine.playClick();
            const nick = this.inputNickname.value.trim() || "Matias";
            localStorage.setItem("chase_nickname", nick);
            await this.ensureConnected();
            window.network.joinRoom("", nick, this.selectedGender || "boy", this.selectedCharacter || "matias");
        });

        // Refresh rooms button
        const btnRefreshRooms = document.getElementById("btn-refresh-rooms");
        if (btnRefreshRooms) {
            btnRefreshRooms.addEventListener("click", () => {
                this.vibrate(15);
                window.soundEngine.playClick();
                this.fetchActiveRooms();
            });
        }

        // Auto-fetch rooms when Salas Activas tab is selected
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.getAttribute("data-tab") === "join") {
                    this.fetchActiveRooms();
                }
            });
        });

        // Join Room
        this.btnJoin.addEventListener("click", async () => {
            this.vibrate(25);
            window.soundEngine.playClick();
            const nick = this.inputNickname.value.trim() || "Brus";
            const code = this.inputRoomCode.value.trim().toUpperCase();
            if (!code) {
                alert("Por favor ingresa un código de sala válido");
                return;
            }
            localStorage.setItem("chase_nickname", nick);
            await this.ensureConnected();
            window.network.joinRoom(code, nick, this.selectedGender || "boy", this.selectedCharacter || "matias");
        });

        // Start Game
        this.btnStartGame.addEventListener("click", () => {
            this.vibrate(30);
            window.soundEngine.playClick();
            window.network.startGame();
        });

        this.btnLeaveRoom.addEventListener("click", () => {
            window.location.reload();
        });

        // Copy Link
        this.btnCopyCode.addEventListener("click", () => {
            this.vibrate(25);
            window.soundEngine.playClick();
            const code = this.displayRoomCode.textContent;
            const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                const originalText = this.btnCopyCode.textContent;
                this.btnCopyCode.textContent = "✅ ¡Copiado!";
                setTimeout(() => this.btnCopyCode.textContent = originalText, 2000);
            }).catch(() => {
                prompt("Copia este enlace:", inviteUrl);
            });
        });

        // Instant Touch/Pointer Action Binding Helper (Eliminates click delay on mobile)
        const bindActionTap = (elem, handler) => {
            if (!elem) return;
            let lastTrigger = 0;
            const trigger = (e) => {
                if (elem.disabled) return;
                const now = Date.now();
                if (now - lastTrigger < 180) return; // 180ms debounce
                lastTrigger = now;
                if (e && e.cancelable && e.type !== "click") {
                    e.preventDefault();
                }
                handler(e);
            };

            elem.addEventListener("pointerdown", trigger, { passive: false });
            elem.addEventListener("click", trigger);
        };

        // Punch Attack
        bindActionTap(this.btnPunch, () => {
            this.vibrate(35);
            window.gameEngine.triggerPunch();
        });

        // Wardrobe button
        bindActionTap(this.btnWardrobeHud, () => {
            this.vibrate(25);
            window.soundEngine.playClick();
            this.openWardrobeModal();
        });

        document.getElementById("btn-close-wardrobe").addEventListener("click", () => {
            this.wardrobeModal.classList.add("hidden");
        });

        document.getElementById("btn-save-wardrobe").addEventListener("click", () => {
            this.vibrate(30);
            window.soundEngine.playClick();
            this.saveWardrobe();
            this.wardrobeModal.classList.add("hidden");
        });

        // Action Buttons
        bindActionTap(this.btnUse, () => {
            this.vibrate(30);
            window.soundEngine.playClick();
            if (window.gameEngine.nearWardrobe) {
                this.openWardrobeModal();
            } else if (window.gameEngine.nearbyTask) {
                if (window.gameEngine.nearbyTask.id === "task_8") {
                    this.openSongBattleModal();
                } else {
                    this.openTaskModal(window.gameEngine.nearbyTask);
                }
            } else if (window.gameEngine.nearEmergencyButton) {
                this.vibrate([100, 50, 100]);
                window.soundEngine.playAlarm();
                window.network.sendReport(false);
            }
        });

        bindActionTap(this.btnReport, () => {
            this.vibrate([80, 40, 80]);
            window.soundEngine.playClick();
            if (window.gameEngine.nearbyBody) {
                window.soundEngine.playAlarm();
                window.network.sendReport(true, window.gameEngine.nearbyBody.id);
            }
        });

        bindActionTap(this.btnKill, () => {
            if (window.gameEngine.nearbyVictim) {
                this.vibrate(100);
                window.soundEngine.playKill();
                window.network.sendKill(window.gameEngine.nearbyVictim.id);
            }
        });

        bindActionTap(this.btnVent, () => {
            if (window.gameEngine.nearbyVent) {
                this.vibrate(30);
                window.soundEngine.playVent();
                window.network.sendVent(window.gameEngine.nearbyVent.id);
            }
        });

        if (this.btnShapeshift) {
            bindActionTap(this.btnShapeshift, () => {
                this.vibrate(30);
                window.soundEngine.playClick();
                this.openShapeshiftModal();
            });
        }

        if (this.btnCloseShapeshift) {
            this.btnCloseShapeshift.addEventListener("click", () => {
                if (this.shapeshiftModal) this.shapeshiftModal.classList.add("hidden");
            });
        }

        if (this.btnRemoveDisguise) {
            bindActionTap(this.btnRemoveDisguise, () => {
                this.vibrate(25);
                window.soundEngine.playClick();
                window.network.sendShapeshift("");
                if (this.shapeshiftModal) this.shapeshiftModal.classList.add("hidden");
            });
        }

        if (this.btnGhostInvis) {
            bindActionTap(this.btnGhostInvis, () => {
                this.vibrate(40);
                window.soundEngine.playClick();
                window.network.sendGhostDropInvis();
            });
        }

        document.getElementById("btn-close-task").addEventListener("click", () => {
            this.closeTaskModal();
        });

        document.getElementById("btn-close-song-battle").addEventListener("click", () => {
            this.closeSongBattleModal();
        });

        document.getElementById("btn-skip-vote").addEventListener("click", () => {
            this.vibrate(25);
            window.soundEngine.playClick();
            window.network.sendVote("skip");
            document.getElementById("vote-status-msg").textContent = "Has votado por saltar.";
        });

        document.getElementById("btn-return-lobby").addEventListener("click", () => {
            this.vibrate(25);
            window.soundEngine.playClick();
            this.gameOverModal.classList.remove("active");
            this.gameOverModal.classList.add("hidden");
            this.topBar.classList.add("hidden");
            this.taskChecklist.classList.add("hidden");
            this.actionControls.classList.add("hidden");
            this.waitingScreen.classList.remove("hidden");
            window.gameEngine.gameState = "LOBBY";
            window.network.send({ type: "return_to_lobby" });
        });

        // Chat
        this.chatForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const text = this.chatInput.value.trim();
            if (text) {
                window.network.sendChat(text);
                this.chatInput.value = "";
            }
        });

        // Song Battle Touch Controls
        document.querySelectorAll(".r-btn").forEach(btn => {
            btn.addEventListener("touchstart", (e) => {
                e.preventDefault();
                const dir = btn.getAttribute("data-dir");
                this.hitRhythmNote(dir);
            });
            btn.addEventListener("mousedown", () => {
                const dir = btn.getAttribute("data-dir");
                this.hitRhythmNote(dir);
            });
        });

        window.addEventListener("keydown", (e) => {
            if (this.songBattleActive) {
                if (e.code === "ArrowLeft" || e.code === "KeyA") this.hitRhythmNote("left");
                if (e.code === "ArrowDown" || e.code === "KeyS") this.hitRhythmNote("down");
                if (e.code === "ArrowUp" || e.code === "KeyW") this.hitRhythmNote("up");
                if (e.code === "ArrowRight" || e.code === "KeyD") this.hitRhythmNote("right");
            }
        });

        // Setup Floating Mobile Joystick
        this.setupDynamicFloatingJoystick();
        this.bindNetworkEvents();
    }

    vibrate(pattern) {
        if ("vibrate" in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) { /* eslint-disable-line no-unused-vars */ }
        }
    }

    initServiceWorker() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("./sw.js").catch(() => {});
        }
    }

    async ensureConnected() {
        if (!window.network.connected) {
            await window.network.connect();
        }
    }

    async fetchActiveRooms() {
        const listEl = document.getElementById("active-rooms-list");
        if (!listEl) return;
        listEl.innerHTML = '<div class="rooms-loading">⏳ Buscando salas...</div>';
        try {
            const res = await fetch("/api/rooms");
            const data = await res.json();
            const rooms = data.rooms || [];
            if (rooms.length === 0) {
                listEl.innerHTML = '<div class="no-rooms-msg">No hay salas activas. ¡Crea una nueva!</div>';
                return;
            }
            listEl.innerHTML = "";
            rooms.forEach(r => {
                const stateLabel = r.state === "PLAYING"
                    ? '<span class="room-playing">🎮 EN JUEGO</span>'
                    : '<span class="room-waiting">⏳ ESPERANDO</span>';
                const namesStr = (r.player_names || []).join(", ");
                const card = document.createElement("div");
                card.className = "room-card-entry";
                card.innerHTML = `
                    <div class="room-card-info">
                        <div class="room-card-code">🚀 ${sanitizeHTML(r.room_id)}</div>
                        <div class="room-card-status">${sanitizeHTML(stateLabel)} · ${sanitizeHTML(namesStr)}</div>
                    </div>
                    <div class="room-card-players">👤 ${r.players}/${r.max_players}</div>
                    <button class="room-card-join-btn">UNIRSE</button>
                `;
                card.addEventListener("click", () => {
                    this.joinActiveRoom(r.room_id);
                });
                listEl.appendChild(card);
            });
        } catch (err) {
            listEl.innerHTML = '<div class="no-rooms-msg">Error al buscar salas. Intenta de nuevo.</div>';
        }
    }

    async joinActiveRoom(roomId) {
        this.vibrate(25);
        window.soundEngine.playClick();
        const nick = this.inputNickname.value.trim() || "Matias";
        localStorage.setItem("chase_nickname", nick);
        await this.ensureConnected();
        window.network.joinRoom(roomId, nick, this.selectedGender || "boy", this.selectedCharacter || "matias");
    }

    bindNetworkEvents() {
        window.network.on("ping", (pingMs) => {
            this.pingDisplay.textContent = `${pingMs} ms`;
        });

        window.network.on("joined_room", (data) => {
            this.lobbyScreen.classList.add("hidden");
            this.waitingScreen.classList.remove("hidden");
            this.displayRoomCode.textContent = data.room_id;
            this.catalogs = data.catalogs || {};
            if (data.player && data.player.gender) {
                this.selectedGender = data.player.gender;
                document.querySelectorAll(".w-gender-btn").forEach(b => {
                    b.classList.toggle("active", b.getAttribute("data-wgender") === this.selectedGender);
                });
            }
            this.renderWardrobeCatalog();
            window.gameEngine.init(data.map, data.player_id);

            // Inicia automáticamente la sala solo si ingresó por enlace directo ?play=1
            if (this.autoStartPending) {
                this.autoStartPending = false;
                setTimeout(() => {
                    if (window.gameEngine.gameState === "LOBBY") {
                        window.network.startGame();
                    }
                }, 800);
            }
        });

        window.network.on("returned_to_lobby", () => {
            this.gameOverModal.classList.remove("active");
            this.gameOverModal.classList.add("hidden");
            this.topBar.classList.add("hidden");
            this.taskChecklist.classList.add("hidden");
            this.actionControls.classList.add("hidden");
            if (this.btnKill) this.btnKill.classList.add("hidden");
            if (this.btnVent) this.btnVent.classList.add("hidden");
            if (this.btnShapeshift) this.btnShapeshift.classList.add("hidden");
            if (this.btnGhostInvis) this.btnGhostInvis.classList.add("hidden");
            this.waitingScreen.classList.remove("hidden");
            window.gameEngine.gameState = "LOBBY";
        });

        window.network.on("game_started", (data) => {
            this.waitingScreen.classList.add("hidden");
            this.topBar.classList.remove("hidden");
            this.taskChecklist.classList.remove("hidden");
            this.actionControls.classList.remove("hidden");

            window.gameEngine.assignedTasks = data.assigned_tasks;
            this.renderTaskList(data.assigned_tasks);
            this.showRoleBanner(data.role);

            if (data.role === "impostor") {
                this.btnKill.classList.remove("hidden");
                this.btnVent.classList.remove("hidden");
            } else {
                this.btnKill.classList.add("hidden");
                this.btnVent.classList.add("hidden");
            }
        });

        window.network.on("sync", (snapshot) => {
            window.gameEngine.handleSync(snapshot);
            this.taskProgressFill.style.width = `${snapshot.task_bar}%`;

            const myPlayerObj = snapshot.players.find(p => p.id === window.gameEngine.myPlayerId);
            if (myPlayerObj && Array.isArray(myPlayerObj.completed_tasks)) {
                myPlayerObj.completed_tasks.forEach(taskId => {
                    const li = document.getElementById(`task-item-${taskId}`);
                    if (li && !li.classList.contains("completed")) {
                        li.classList.add("completed");
                        const iconSpan = li.querySelector("span");
                        if (iconSpan) iconSpan.textContent = "✅";
                    }
                });
            }

            // Auto-transition to PLAYING if game is ongoing and waitingScreen/lobbyScreen is active
            if (snapshot.state === "PLAYING" && (!this.waitingScreen.classList.contains("hidden") || !this.lobbyScreen.classList.contains("hidden"))) {
                this.lobbyScreen.classList.add("hidden");
                this.waitingScreen.classList.add("hidden");
                this.topBar.classList.remove("hidden");
                this.taskChecklist.classList.remove("hidden");
                this.actionControls.classList.remove("hidden");
                window.gameEngine.gameState = "PLAYING";

                const me = window.gameEngine.players.get(window.gameEngine.myPlayerId);
                if (me && me.role === "impostor") {
                    this.btnKill.classList.remove("hidden");
                    this.btnVent.classList.remove("hidden");
                    this.btnShapeshift.classList.remove("hidden");
                }
            }

            if (snapshot.state === "LOBBY") {
                this.updateWaitingPlayers(snapshot.players);
            }

            if (snapshot.state === "GAME_OVER" && !this.gameOverModal.classList.contains("active")) {
                this.showGameOver(snapshot.winner);
            }

            // Episode display update
            if (snapshot.episode) {
                const epEl = document.getElementById("episode-display");
                if (epEl) epEl.textContent = `EP ${snapshot.episode}`;
            }

            // Meeting result verdict display during MEETING_RESULT
            if (snapshot.state === "MEETING_RESULT" && snapshot.meeting && snapshot.meeting.result) {
                const statusMsg = document.getElementById("vote-status-msg");
                if (statusMsg) {
                    statusMsg.textContent = snapshot.meeting.result;
                    statusMsg.style.color = "#ffd600";
                    statusMsg.style.fontWeight = "bold";
                    statusMsg.style.fontSize = "1.05rem";
                }
                const countdownEl = document.getElementById("meeting-countdown");
                if (countdownEl) countdownEl.textContent = "EXPULSIÓN";
            }

            // Auto-hide meeting modal when match resumes to PLAYING
            if (snapshot.state === "PLAYING" && !this.meetingModal.classList.contains("hidden")) {
                this.meetingModal.classList.add("hidden");
            }

            // Real-time minimap radar update when modal is open
            if (this.minimapModal && !this.minimapModal.classList.contains("hidden") && window.gameEngine) {
                window.gameEngine.drawMinimap(this.minimapCanvas);
            }
        });

        window.network.on("punch_event", (evt) => {
            const hit = evt.hit;
            let text = "💥 ¡GOLPE!";
            let color = "#ffd600";
            if (hit.type === "cat_hit") {
                text = hit.cat_dead ? "¡ZOMBI DERROTADO! (SUELTA LUZ)" : "¡VENCE AL ZOMBI!";
                color = "#00e676";
                window.soundEngine.playCatSound();
            } else if (hit.type === "clone_hit") {
                text = hit.clone_dead ? "Venciste al impostor" : "GOLPE AL CLON";
                color = "#ff3366";
            } else if (hit.type === "player_hit") {
                text = "💥 ¡PELEA!";
                color = "#f39c12";
            }

            if (hit.x && hit.y) {
                window.gameEngine.punchEffects.push({
                    x: hit.x,
                    y: hit.y - 15,
                    text: text,
                    color: color,
                    time: 1.2
                });
            }
        });

        window.network.on("meeting_started", (data) => {
            this.closeTaskModal();
            this.closeSongBattleModal();
            this.vibrate([100, 50, 100]);
            window.soundEngine.playAlarm();
            this.openMeetingModal(data.meeting);
        });

        window.network.on("chat_message", (msg) => {
            const div = document.createElement("div");
            div.className = "chat-msg";
            div.innerHTML = `<span class="chat-sender" style="color: ${sanitizeHTML(msg.color?.hex || '#00d2ff')}">${sanitizeHTML(msg.name)}:</span> <span>${sanitizeHTML(msg.text)}</span>`;
            this.chatMessages.appendChild(div);
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

            const chatWidget = document.getElementById("chat-widget");
            if (this.btnToggleChat && chatWidget && !chatWidget.classList.contains("mobile-open")) {
                this.btnToggleChat.style.background = "rgba(0, 242, 254, 0.45)";
                this.btnToggleChat.style.borderColor = "#00f2fe";
                setTimeout(() => {
                    if (this.btnToggleChat) {
                        this.btnToggleChat.style.background = "";
                        this.btnToggleChat.style.borderColor = "";
                    }
                }, 3000);
            }
        });

        window.network.on("sound_event", (evt) => {
            if (evt.sound === "kill") {
                window.soundEngine.playKill();
            } else if (evt.sound === "shapeshift") {
                window.soundEngine.playCloneBeam();
            }
        });

        window.network.on("error", (err) => {
            alert(err.message || "Ocurrió un error");
        });

        // RELIABILITY UX: the old code had no visual feedback at all when the
        // connection dropped — the game just silently froze from the
        // player's point of view. These three events (emitted by
        // attemptReconnect() in network.js) drive a small non-blocking toast
        // instead of an alert(), so a brief blip doesn't interrupt gameplay.
        window.network.on("reconnecting", ({ attempt, max }) => {
            if (this.connectionToast) {
                this.connectionToast.textContent = `🔌 Reconectando... (${attempt}/${max})`;
                this.connectionToast.classList.remove("hidden");
            }
        });

        window.network.on("reconnect_failed", () => {
            if (this.connectionToast) {
                this.connectionToast.textContent = "⚠️ No se pudo reconectar. Recarga la página.";
                this.connectionToast.classList.remove("hidden");
            }
        });

        window.network.on("joined_room", () => {
            if (this.connectionToast) {
                this.connectionToast.classList.add("hidden");
            }
        });
    }

    renderWardrobeCatalog() {
        const hatsContainer = document.getElementById("wtab-hats");
        hatsContainer.innerHTML = "";
        (this.catalogs.hats || []).forEach(h => {
            const card = document.createElement("div");
            card.className = `wardrobe-card ${this.selectedHat === h.id ? 'selected' : ''}`;
            card.innerHTML = `<span class="wardrobe-icon">${h.icon}</span><span class="wardrobe-name">${h.name}</span>`;
            card.addEventListener("click", () => {
                this.vibrate(20);
                window.soundEngine.playClick();
                document.querySelectorAll("#wtab-hats .wardrobe-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                this.selectedHat = h.id;
            });
            hatsContainer.appendChild(card);
        });

        const skinsContainer = document.getElementById("wtab-skins");
        skinsContainer.innerHTML = "";
        (this.catalogs.skins || []).forEach(s => {
            const card = document.createElement("div");
            card.className = `wardrobe-card ${this.selectedSkin === s.id ? 'selected' : ''}`;
            card.innerHTML = `<span class="wardrobe-icon">${s.icon}</span><span class="wardrobe-name">${s.name}</span>`;
            card.addEventListener("click", () => {
                this.vibrate(20);
                window.soundEngine.playClick();
                document.querySelectorAll("#wtab-skins .wardrobe-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                this.selectedSkin = s.id;
            });
            skinsContainer.appendChild(card);
        });

        const weaponsContainer = document.getElementById("wtab-weapons");
        weaponsContainer.innerHTML = "";
        (this.catalogs.weapons || []).forEach(w => {
            const card = document.createElement("div");
            card.className = `wardrobe-card ${this.selectedWeapon === w.id ? 'selected' : ''}`;
            card.innerHTML = `<span class="wardrobe-icon">${w.icon}</span><span class="wardrobe-name">${w.name}</span>`;
            card.addEventListener("click", () => {
                this.vibrate(20);
                window.soundEngine.playClick();
                document.querySelectorAll("#wtab-weapons .wardrobe-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                this.selectedWeapon = w.id;
            });
            weaponsContainer.appendChild(card);
        });
    }

    openWardrobeModal() {
        this.resetJoystick();
        this.wardrobeModal.classList.remove("hidden");
    }

    saveWardrobe() {
        window.network.send({
            type: "update_wardrobe",
            gender: this.selectedGender,
            hat: this.selectedHat,
            skin: this.selectedSkin,
            weapon: this.selectedWeapon
        });
    }

    openSongBattleModal() {
        this.resetJoystick();
        this.songBattleActive = true;
        this.rhythmScore = 0;
        this.rhythmCombo = 0;
        document.getElementById("rhythm-score").textContent = "0";
        document.getElementById("rhythm-combo").textContent = "0";
        this.songBattleModal.classList.remove("hidden");
        window.network.sendStartTask("task_8");
        this.startRhythmBattle();
    }

    startRhythmBattle() {
        const dirs = ["left", "down", "up", "right"];
        let step = 0;
        this.songTimer = setInterval(() => {
            if (!this.songBattleActive) return;
            const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
            window.soundEngine.playRhythmNote(randomDir);
            this.highlightTargetArrow(randomDir);

            step++;
            if (step >= 24) {
                this.vibrate([50, 50, 100]);
                window.soundEngine.playTaskComplete();
                const li = document.getElementById("task-item-task_8");
                if (li) li.classList.add("completed");
                window.network.sendCompleteTask("task_8");
                setTimeout(() => this.closeSongBattleModal(true), 500);
            }
        }, 600);
    }

    highlightTargetArrow(dir) {
        const arrow = document.querySelector(`.target-arrow.${dir}`);
        if (arrow) {
            arrow.classList.add("active");
            setTimeout(() => arrow.classList.remove("active"), 200);
        }
    }

    hitRhythmNote(dir) {
        if (!this.songBattleActive) return;
        this.vibrate(20);
        if (window.soundEngine) {
            window.soundEngine.playPentatonicChime(this.rhythmCombo);
        }
        this.rhythmCombo++;
        this.rhythmScore += 50 * this.rhythmCombo;
        document.getElementById("rhythm-combo").textContent = this.rhythmCombo;
        document.getElementById("rhythm-score").textContent = this.rhythmScore;
        this.highlightTargetArrow(dir);
        if (window.gameEngine && window.gameEngine.brusCompanion) {
            window.gameEngine.brusCompanion.celebrateTimer = 0.4;
        }
    }

    closeSongBattleModal(completed = false) {
        this.songBattleActive = false;
        if (this.songTimer) {
            clearInterval(this.songTimer);
            this.songTimer = null;
        }
        this.songBattleModal.classList.add("hidden");
        if (!completed) {
            window.network.sendCancelTask();
        }
    }

    updateWaitingPlayers(players) {
        this.waitingCount.textContent = players.length;
        this.waitingGrid.innerHTML = "";
        players.forEach(p => {
            const el = document.createElement("div");
            el.className = "player-token";
            const charKey = (p.character || "matias").toLowerCase();
            const meta = CHARACTER_METADATA[charKey];
            const icon = meta ? meta.icon : (p.gender === "girl" ? "👧" : "👦");
            const colorHex = p.color?.hex || meta?.color || "#3498db";
            el.innerHTML = `
                <div class="player-avatar-circle" style="background-color: ${colorHex}; display:flex; align-items:center; justify-content:center; font-size:16px;">${icon}</div>
                <span>${sanitizeHTML(p.name)}</span>
            `;
            this.waitingGrid.appendChild(el);
        });
    }

    showRoleBanner(role) {
        const card = document.getElementById("role-card");
        const title = document.getElementById("role-title");
        const desc = document.getElementById("role-desc");

        card.className = `role-card ${role}`;
        if (role === "impostor") {
            title.textContent = "IMPOSTOR";
            desc.textContent = "Sabotea, utiliza los conductos y elimina a todos los tripulantes sin ser descubierto.";
        } else {
            title.textContent = "TRIPULANTE";
            desc.textContent = "Completa todas tus tareas, pelea con sartenes contra los gatos zombis y destruye a los clones.";
        }

        this.roleBanner.classList.remove("hidden");
        setTimeout(() => {
            this.roleBanner.classList.add("hidden");
        }, 3500);
    }

    renderTaskList(taskIds) {
        this.taskList.innerHTML = "";
        if (!window.gameEngine.map || !taskIds) return;
        taskIds.forEach(item => {
            const taskId = typeof item === "string" ? item : (item && item.id);
            if (!taskId) return;
            const t = window.gameEngine.map.tasks.find(x => x.id === taskId);
            if (t) {
                const li = document.createElement("li");
                li.id = `task-item-${t.id}`;
                li.innerHTML = `<span>⚙</span> ${t.room}: ${t.name}`;
                this.taskList.appendChild(li);
            }
        });
    }

    updateActionButtons(state) {
        if (!state.alive) {
            // Dead player (Ghost)
            this.btnUse.disabled = true;
            this.btnReport.disabled = true;
            this.btnKill.classList.add("hidden");
            this.btnVent.classList.add("hidden");
            if (this.btnShapeshift) this.btnShapeshift.classList.add("hidden");

            if (this.btnGhostInvis) {
                this.btnGhostInvis.classList.remove("hidden");
                if (state.ghost_button_cd > 0) {
                    this.btnGhostInvis.disabled = true;
                    if (this.ghostCdTimer) {
                        this.ghostCdTimer.classList.remove("hidden");
                        this.ghostCdTimer.textContent = `${Math.ceil(state.ghost_button_cd)}s`;
                    }
                } else {
                    this.btnGhostInvis.disabled = false;
                    if (this.ghostCdTimer) this.ghostCdTimer.classList.add("hidden");
                }
            }
            return;
        }

        // Alive player
        if (this.btnGhostInvis) this.btnGhostInvis.classList.add("hidden");

        if (state.task || state.emergency || state.wardrobe) {
            this.btnUse.disabled = false;
            if (state.wardrobe) {
                this.btnUse.querySelector(".btn-text").textContent = "VESTIDOR";
            } else if (state.emergency) {
                this.btnUse.querySelector(".btn-text").textContent = "EMERGENCIA";
            } else {
                this.btnUse.querySelector(".btn-text").textContent = "TAREA";
            }
        } else {
            this.btnUse.disabled = true;
            this.btnUse.querySelector(".btn-text").textContent = "USAR";
        }

        this.btnReport.disabled = !state.body;

        if (state.role === "impostor") {
            this.btnKill.classList.remove("hidden");
            this.btnVent.classList.remove("hidden");
            if (this.btnShapeshift) {
                this.btnShapeshift.classList.remove("hidden");
                this.btnShapeshift.disabled = false;
                if (state.is_disguised) {
                    this.btnShapeshift.querySelector(".btn-text").textContent = `CAMUFLADO (${Math.ceil(state.disguise_timer || 0)}s)`;
                } else {
                    this.btnShapeshift.querySelector(".btn-text").textContent = "CAMUFLAJE";
                }
            }

            if (state.killCd > 0) {
                this.btnKill.disabled = true;
                this.killCdTimer.classList.remove("hidden");
                this.killCdTimer.textContent = `${Math.ceil(state.killCd)}s`;
            } else {
                this.killCdTimer.classList.add("hidden");
                this.btnKill.disabled = !state.victim;
            }
            this.btnVent.disabled = !state.vent;
        } else {
            this.btnKill.classList.add("hidden");
            this.btnVent.classList.add("hidden");
            if (this.btnShapeshift) this.btnShapeshift.classList.add("hidden");
        }

        if (this.scoreDisplay && state.score !== undefined) {
            this.scoreDisplay.textContent = state.score;
        }
    }

    openShapeshiftModal() {
        this.resetJoystick();
        if (!this.shapeshiftModal || !this.shapeshiftCrewGrid) return;
        this.shapeshiftCrewGrid.innerHTML = "";

        const myId = window.gameEngine.myPlayerId;
        const candidates = [];
        window.gameEngine.players.forEach(p => {
            if (p.id !== myId && p.alive) {
                candidates.push(p);
            }
        });

        if (candidates.length === 0) {
            this.shapeshiftCrewGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #94a3b8; font-size: 0.9rem;">
                    No hay otros tripulantes vivos para imitar en este momento.
                </div>
            `;
        } else {
            candidates.forEach(cand => {
                const card = document.createElement("div");
                card.className = "shapeshift-card";
                const charKey = (cand.character || "matias").toLowerCase();
                const meta = CHARACTER_METADATA[charKey];
                const icon = meta ? meta.icon : (cand.gender === "girl" ? "👧" : "👦");
                const charName = meta ? meta.name : (cand.character || "Astronauta");
                const colorHex = cand.color?.hex || meta?.color || "#f1c40f";
                card.innerHTML = `
                    <div class="ss-avatar" style="background: ${colorHex};">
                        ${icon}
                    </div>
                    <div class="ss-info">
                        <span class="ss-name">${sanitizeHTML(cand.name)}</span>
                        <span class="ss-role-text">${charName} (${cand.gender === 'girl' ? 'Niña' : 'Niño'})</span>
                    </div>
                    <button class="ss-btn-pick">CAMUFLARSE</button>
                `;
                card.addEventListener("click", () => {
                    this.vibrate(40);
                    window.soundEngine.playClick();
                    window.network.sendShapeshift(cand.id);
                    this.shapeshiftModal.classList.add("hidden");
                });
                this.shapeshiftCrewGrid.appendChild(card);
            });
        }

        this.shapeshiftModal.classList.remove("hidden");
    }

    openTaskModal(task) {
        this.resetJoystick();
        this.currentTaskStation = task;
        document.getElementById("task-modal-title").textContent = `⚙️ ${task.room}: ${task.name}`;
        this.taskModal.classList.remove("hidden");
        window.network.sendStartTask(task.id);

        const container = document.getElementById("minigame-container");
        container.innerHTML = `
            <div style="padding: 10px 0; text-align: center; width: 100%;">
                <p id="task-status-hint" style="margin-bottom: 14px; color: #38bdf8; font-family: 'Rajdhani', sans-serif; font-size: 1.15rem; font-weight: 700; letter-spacing: 0.5px;">
                    🔧 Mantén presionado el botón para calibrar los sistemas
                </p>
                <button id="btn-hold-task" type="button">
                    <span style="font-size: 1.25rem;">⚡ MANTENER PRESIONADO</span>
                    <span class="task-hold-instruction">Toca o mantén [ESPACIO / E]</span>
                </button>
            </div>
        `;

        const holdBtn = document.getElementById("btn-hold-task");
        const progBar = document.getElementById("minigame-progress");
        const percentLabel = document.getElementById("minigame-percent");
        if (progBar) progBar.style.width = "0%";
        if (percentLabel) percentLabel.textContent = "0%";

        let progress = 0;
        let isHolding = false;

        const startHold = (e) => {
            if (e) {
                e.preventDefault();
                if (e.pointerId && holdBtn.setPointerCapture) {
                    try { holdBtn.setPointerCapture(e.pointerId); } catch(err) { /* eslint-disable-line no-unused-vars */ }  
                }
            }
            if (isHolding) return;
            isHolding = true;
            holdBtn.classList.add("holding");
            this.vibrate(30);
            if (window.soundEngine) window.soundEngine.playClick();

            if (this.taskInterval) clearInterval(this.taskInterval);
            this.taskInterval = setInterval(() => {
                if (!isHolding) return;
                progress = Math.min(100, progress + 4);
                if (progBar) progBar.style.width = `${progress}%`;
                if (percentLabel) percentLabel.textContent = `${progress}%`;
                const hint = document.getElementById("task-status-hint");
                if (hint) hint.textContent = `⚡ CALIBRANDO SISTEMAS... [${progress}%]`;
                if (progress % 20 === 0) this.vibrate(15);

                if (progress >= 100) {
                    clearInterval(this.taskInterval);
                    this.taskInterval = null;
                    isHolding = false;
                    holdBtn.classList.remove("holding");
                    this.vibrate([60, 40, 100]);
                    if (window.soundEngine) window.soundEngine.playTaskComplete();
                    if (hint) {
                        hint.style.color = "#00e676";
                        hint.textContent = "✅ ¡TAREA COMPLETADA CON ÉXITO!";
                    }
                    const li = document.getElementById(`task-item-${task.id}`);
                    if (li) li.classList.add("completed");
                    window.network.sendCompleteTask(task.id);
                    setTimeout(() => this.closeTaskModal(true), 500);
                }
            }, 60);
        };

        const stopHold = (e) => {
            if (e && e.pointerId && holdBtn.releasePointerCapture) {
                try { holdBtn.releasePointerCapture(e.pointerId); } catch(err) { /* eslint-disable-line no-unused-vars */ }  
            }
            if (!isHolding) return;
            isHolding = false;
            holdBtn.classList.remove("holding");
            if (this.taskInterval) {
                clearInterval(this.taskInterval);
                this.taskInterval = null;
            }
            const hint = document.getElementById("task-status-hint");
            if (hint && progress < 100) {
                hint.style.color = "#fbbf24";
                hint.textContent = "⚠️ Mantenlo presionado hasta que llegue al 100%";
            }
        };

        holdBtn.addEventListener("pointerdown", startHold);
        holdBtn.addEventListener("pointerup", stopHold);
        holdBtn.addEventListener("pointercancel", stopHold);

        // Keyboard hold support (Space or E)
        const onKeyDown = (e) => {
            if ((e.code === "Space" || e.code === "KeyE") && !isHolding) {
                e.preventDefault();
                startHold();
            }
        };
        const onKeyUp = (e) => {
            if (e.code === "Space" || e.code === "KeyE") {
                e.preventDefault();
                stopHold();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        this.taskKeyHandler = { down: onKeyDown, up: onKeyUp };
    }

    closeTaskModal(completed = false) {
        if (this.taskInterval) clearInterval(this.taskInterval);
        this.taskInterval = null;
        if (this.taskKeyHandler) {
            window.removeEventListener("keydown", this.taskKeyHandler.down);
            window.removeEventListener("keyup", this.taskKeyHandler.up);
            this.taskKeyHandler = null;
        }
        this.taskModal.classList.add("hidden");
        if (completed) {
            if (window.soundEngine) window.soundEngine.playPentatonicArpeggio();
            if (window.gameEngine && window.gameEngine.brusCompanion) {
                window.gameEngine.brusCompanion.celebrateTimer = 1.2;
                window.gameEngine.brusCompanion.state = "celebrating";
            }
        }
        if (this.currentTaskStation) {
            if (!completed) {
                window.network.sendCancelTask();
            }
            this.currentTaskStation = null;
        }
    }

    openMeetingModal(meeting) {
        this.resetJoystick();
        this.meetingModal.classList.remove("hidden");
        document.getElementById("meeting-reason-text").textContent = `¡${meeting.reason.toUpperCase()}!`;
        document.getElementById("meeting-caller-text").textContent = `Convocada por: ${meeting.caller}`;

        const grid = document.getElementById("voting-grid");
        grid.innerHTML = "";

        window.gameEngine.players.forEach(p => {
            const card = document.createElement("div");
            card.className = `vote-card ${!p.alive ? 'dead' : ''}`;
            const charKey = (p.character || "matias").toLowerCase();
            const meta = CHARACTER_METADATA[charKey];
            const gIcon = meta ? meta.icon : (p.gender === "girl" ? "👧" : "👦");
            const colorHex = p.color?.hex || meta?.color || '#3498db';
            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="player-avatar-circle" style="background-color:${colorHex}; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:13px;">${gIcon}</div>
                    <strong>${sanitizeHTML(p.name)}</strong>
                </div>
                <span>${!p.alive ? '☠ MUERTO' : 'VOTAR'}</span>
            `;

            if (p.alive) {
                card.addEventListener("click", () => {
                    this.vibrate(25);
                    window.soundEngine.playClick();
                    document.querySelectorAll(".vote-card").forEach(c => c.classList.remove("selected"));
                    card.classList.add("selected");
                    window.network.sendVote(p.id);
                    document.getElementById("vote-status-msg").textContent = `Has votado por: ${sanitizeHTML(p.name)}`;
                });
            }
            grid.appendChild(card);
        });

        if (this.meetingTimer) clearInterval(this.meetingTimer);
        let timeLeft = 30;
        const countdownEl = document.getElementById("meeting-countdown");
        this.meetingTimer = setInterval(() => {
            timeLeft -= 1;
            if (window.gameEngine.gameState === "MEETING") {
                countdownEl.textContent = Math.max(0, timeLeft);
            }
            if (timeLeft <= 0 || window.gameEngine.gameState === "PLAYING" || window.gameEngine.gameState === "GAME_OVER") {
                clearInterval(this.meetingTimer);
                this.meetingTimer = null;
                this.meetingModal.classList.add("hidden");
            }
        }, 1000);
    }

    showGameOver(winner) {
        if (this.gameOverModal.classList.contains("active")) return;
        this.gameOverModal.classList.add("active");
        this.gameOverModal.classList.remove("hidden");
        const title = document.getElementById("game-over-title");
        const sub = document.getElementById("game-over-subtitle");

        if (winner === "IMPOSTOR") {
            title.textContent = "VICTORIA DEL IMPOSTOR";
            title.style.color = "#ff3366";
            sub.textContent = "El impostor eliminó a la tripulación.";
        } else {
            title.textContent = "VICTORIA DE LA TRIPULACIÓN";
            title.style.color = "#00d2ff";
            sub.textContent = winner === "CREWMATE_TASKS" ? "¡Todas las tareas fueron completadas a tiempo!" : "¡Todos los impostores y clones fueron descubiertos!";
        }
    }

    resetJoystick() {
        this.joystickVector = { x: 0, y: 0 };
        if (this.joystickBase) {
            this.joystickBase.classList.add("hidden");
        }
        if (this.joystickStick) {
            this.joystickStick.style.transform = "translate(0px, 0px)";
        }
        if (window.gameEngine) {
            window.gameEngine.updateInputVector();
        }
    }

    setupDynamicFloatingJoystick() {
        let activePointerId = null;
        let origin = { x: 0, y: 0 };
        const maxDist = 45;

        const isInGame = () => {
            if (!window.gameEngine) return false;
            const lobbyEl = document.getElementById("lobby-screen");
            const isLobbyVisible = lobbyEl && !lobbyEl.classList.contains("hidden");
            return !isLobbyVisible && window.gameEngine.gameState !== "MEETING" && window.gameEngine.gameState !== "GAME_OVER";
        };

        const onPointerDown = (e) => {
            if (activePointerId !== null) return;
            if (!isInGame()) return;
            if (e.pointerType === "mouse") return; // Joystick is only for touch screens

            activePointerId = e.pointerId;
            try { this.touchZone.setPointerCapture(e.pointerId); } catch (_) { /* eslint-disable-line no-unused-vars */ }

            const rect = this.touchZone.getBoundingClientRect();
            origin = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            this.joystickBase.style.left = `${origin.x}px`;
            this.joystickBase.style.top = `${origin.y}px`;
            this.joystickBase.classList.remove("hidden");
            this.joystickStick.style.transform = "translate(0px, 0px)";
            this.joystickVector = { x: 0, y: 0 };
            if (window.gameEngine) window.gameEngine.updateInputVector();
        };

        const onPointerMove = (e) => {
            if (activePointerId !== e.pointerId) return;
            const rect = this.touchZone.getBoundingClientRect();
            const touchX = e.clientX - rect.left;
            const touchY = e.clientY - rect.top;
            const dx = touchX - origin.x;
            const dy = touchY - origin.y;
            const dist = Math.hypot(dx, dy);
            const clampedDist = Math.min(dist, maxDist);
            const angle = Math.atan2(dy, dx);

            const sx = Math.cos(angle) * clampedDist;
            const sy = Math.sin(angle) * clampedDist;

            this.joystickStick.style.transform = `translate(${sx}px, ${sy}px)`;
            this.joystickVector = {
                x: sx / maxDist,
                y: sy / maxDist
            };
            if (window.gameEngine) window.gameEngine.updateInputVector();
        };

        const onPointerUp = (e) => {
            if (activePointerId !== e.pointerId) return;
            try { this.touchZone.releasePointerCapture(e.pointerId); } catch (_) { /* eslint-disable-line no-unused-vars */ }
            activePointerId = null;
            this.joystickBase.classList.add("hidden");
            this.joystickStick.style.transform = "translate(0px, 0px)";
            this.joystickVector = { x: 0, y: 0 };
            if (window.gameEngine) window.gameEngine.updateInputVector();
        };

        this.touchZone.addEventListener("pointerdown", onPointerDown);
        this.touchZone.addEventListener("pointermove", onPointerMove);
        this.touchZone.addEventListener("pointerup", onPointerUp);
        this.touchZone.addEventListener("pointercancel", onPointerUp);

        // Fallback for older iOS touch events
        this.touchZone.addEventListener("touchstart", (e) => {
            if (e.cancelable) e.preventDefault();
        }, { passive: false });
    }
}

window.uiManager = new UIManager();
