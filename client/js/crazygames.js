/**
 * Matias & Brus: Impostor Chase - CrazyGames SDK v3 Integration Module
 * Official Documentation: https://docs.crazygames.com/sdk/html5/v3/
 */

class CrazyGamesService {
    constructor() {
        this.sdk = null;
        this.initialized = false;
        this.isCrazyGames = false;
        this.lastAdTime = 0;
        this.adCooldownMs = 60000; // Mínimo 60s entre midgame ads
    }

    async init() {
        if (this.initialized) return;
        if (typeof window.CrazyGames !== "undefined" && window.CrazyGames.SDK) {
            try {
                this.sdk = window.CrazyGames.SDK;
                await this.sdk.init();
                this.initialized = true;
                this.isCrazyGames = true;
                console.log("[CrazyGames] SDK v3 inicializado correctamente.");
            } catch (err) {
                console.warn("[CrazyGames] Error inicializando SDK:", err);
            }
        } else {
            console.log("[CrazyGames] SDK no detectado. Modo standalone/PWA activo.");
        }
    }

    gameplayStart() {
        if (!this.initialized || !this.sdk?.game?.gameplayStart) return;
        try {
            this.sdk.game.gameplayStart();
            console.log("[CrazyGames] gameplayStart notificado.");
        } catch (e) {
            console.warn("[CrazyGames] Error en gameplayStart:", e);
        }
    }

    gameplayStop() {
        if (!this.initialized || !this.sdk?.game?.gameplayStop) return;
        try {
            this.sdk.game.gameplayStop();
            console.log("[CrazyGames] gameplayStop notificado.");
        } catch (e) {
            console.warn("[CrazyGames] Error en gameplayStop:", e);
        }
    }

    requestMidgameAd(onComplete) {
        const callback = typeof onComplete === "function" ? onComplete : () => {};
        if (!this.initialized || !this.sdk?.ad?.requestAd) {
            callback();
            return;
        }

        const now = Date.now();
        if (now - this.lastAdTime < this.adCooldownMs) {
            console.log("[CrazyGames] Midgame ad ignorado por cooldown.");
            callback();
            return;
        }

        try {
            // Silenciar audio durante la reproducción del anuncio
            if (window.gameAudio && typeof window.gameAudio.setMuted === "function") {
                window.gameAudio.setMuted(true);
            }
            this.sdk.ad.requestAd("midgame", {
                adStarted: () => {
                    console.log("[CrazyGames] Midgame Ad iniciado.");
                },
                adFinished: () => {
                    this.lastAdTime = Date.now();
                    console.log("[CrazyGames] Midgame Ad completado.");
                    if (window.gameAudio && typeof window.gameAudio.setMuted === "function") {
                        window.gameAudio.setMuted(false);
                    }
                    callback();
                },
                adError: (err) => {
                    console.warn("[CrazyGames] Midgame Ad error:", err);
                    if (window.gameAudio && typeof window.gameAudio.setMuted === "function") {
                        window.gameAudio.setMuted(false);
                    }
                    callback();
                }
            });
        } catch (e) {
            console.warn("[CrazyGames] Excepción solicitando midgame ad:", e);
            if (window.gameAudio && typeof window.gameAudio.setMuted === "function") {
                window.gameAudio.setMuted(false);
            }
            callback();
        }
    }

    updateRoom(roomId, isJoinable = true) {
        if (!this.initialized || !this.sdk?.game?.updateRoom || !roomId) return;
        try {
            this.sdk.game.updateRoom({ roomId, isJoinable });
        } catch (e) {
            console.warn("[CrazyGames] Error en updateRoom:", e);
        }
    }

    getInviteLink(roomId) {
        if (!this.initialized || !this.sdk?.game?.inviteLink) {
            const baseUrl = window.location.origin + window.location.pathname;
            return `${baseUrl}?room=${encodeURIComponent(roomId)}`;
        }
        try {
            return this.sdk.game.inviteLink({ roomId });
        } catch (e) {
            const baseUrl = window.location.origin + window.location.pathname;
            return `${baseUrl}?room=${encodeURIComponent(roomId)}`;
        }
    }
}

window.crazyGamesService = new CrazyGamesService();
