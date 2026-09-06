class NetworkClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        try {
            this.myPlayerId = sessionStorage.getItem("chase_player_id") || null;
            this.currentRoom = sessionStorage.getItem("chase_room_id") || null;
        } catch (e) {
            this.myPlayerId = null;
            this.currentRoom = null;
        }
        this.ping = 0;
        this.pingInterval = null;
        this.listeners = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 8; // ~2.5 min of retrying total, see backoff below
        this.reconnectTimer = null;
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0; // reset the backoff once we're actually back online
                this.startPingLoop();
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error("Error parsing message", e);
                }
            };

            this.ws.onclose = () => {
                this.connected = false;
                clearInterval(this.pingInterval);
                this.emit("disconnected");
                this.attemptReconnect();
            };

            this.ws.onerror = (err) => {
                reject(err);
            };
        });
    }

    // RELIABILITY: the old version tried to reconnect exactly once, 2s after a
    // drop. On real mobile networks a single retry is not enough (a Railway
    // redeploy, a brief connectivity blip, a tunnel switching networks can
    // easily outlast 2s) — after that one attempt failed there was no more
    // code to retry, so the player was stuck disconnected until they manually
    // reloaded the page. This retries with exponential backoff (2s, 4s, 8s...
    // capped at 20s) up to maxReconnectAttempts, and tells the UI what's
    // happening via "reconnecting" / "reconnect_failed" events.
    attemptReconnect() {
        if (!this.currentRoom || !this.myPlayerId) return;
        if (this.reconnectTimer) return; // already scheduled
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit("reconnect_failed");
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(2000 * (2 ** (this.reconnectAttempts - 1)), 20000);
        this.emit("reconnecting", { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts, delay });

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect().then(() => {
                this.send({
                    type: "join_room",
                    room_id: this.currentRoom,
                    reconnect_id: this.myPlayerId
                });
            }).catch(() => {
                // connect() rejects via ws.onerror; onclose will also fire and
                // schedule the next attempt on its own, so nothing else to do here.
            });
        }, delay);
    }

    startPingLoop() {
        this.pingInterval = setInterval(() => {
            if (this.connected && this.ws.readyState === WebSocket.OPEN) {
                this.send({ type: "ping", client_time: Date.now() });
            }
        }, 2000);
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    handleMessage(msg) {
        switch (msg.type) {
            case "pong":
                this.ping = Date.now() - msg.client_time;
                this.emit("ping", this.ping);
                break;
            case "joined_room":
                this.myPlayerId = msg.player_id;
                this.currentRoom = msg.room_id;
                try {
                    sessionStorage.setItem("chase_player_id", msg.player_id);
                    sessionStorage.setItem("chase_room_id", msg.room_id);
                } catch (e) {}
                this.emit("joined_room", msg);
                break;
            case "player_joined":
            case "player_left":
            case "game_started":
            case "sync":
            case "meeting_started":
            case "vote_cast":
            case "sound_event":
            case "chat_message":
            case "returned_to_lobby":
            case "error":
                this.emit(msg.type, msg);
                break;
            default:
                this.emit(msg.type, msg);
                break;
        }
    }

    joinRoom(roomId, nickname, gender = "boy", character = "matias") {
        this.send({ type: "join_room", room_id: roomId, name: nickname, gender, character });
    }

    startGame() {
        this.send({ type: "start_game" });
    }

    sendInput(vx, vy) {
        this.send({ type: "input", vx, vy });
    }

    sendKill(targetId) {
        this.send({ type: "kill", target_id: targetId });
    }

    sendVent(ventId) {
        this.send({ type: "vent", vent_id: ventId });
    }

    sendReport(isBody, bodyId = null) {
        this.send({ type: "report", is_body: isBody, body_id: bodyId });
    }

    sendVote(targetId) {
        this.send({ type: "vote", target_id: targetId });
    }

    sendStartTask(taskId) {
        this.send({ type: "start_task", task_id: taskId });
    }

    sendCompleteTask(taskId) {
        this.send({ type: "complete_task", task_id: taskId });
    }

    sendCancelTask() {
        this.send({ type: "cancel_task" });
    }

    sendChat(text) {
        this.send({ type: "chat", text: text });
    }

    sendShapeshift(targetId) {
        this.send({ type: "shapeshift", target_id: targetId });
    }

    sendGhostDropInvis() {
        this.send({ type: "ghost_drop_invis" });
    }
}

window.network = new NetworkClient();
