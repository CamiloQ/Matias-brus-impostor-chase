"""Module containing backend logic."""
import asyncio
import os
import json
import time
import math
import uuid
import struct
import hashlib
import base64
import mimetypes
from pathlib import Path
from game_state import (
    GameRoom, MAP_OBSTACLES, TASK_STATIONS, EMERGENCY_BUTTON, VENTS,
    MAP_WIDTH, MAP_HEIGHT, HATS_CATALOG, SKINS_CATALOG, WEAPONS_CATALOG,
    FOOD_BUFFET, WARDROBE_STATION, CHARACTERS_CATALOG
)

PORT = int(os.environ.get("PORT", 3000))
HOST = os.environ.get("HOST", "0.0.0.0")
CLIENT_DIR = Path(__file__).parent.parent / "client"

OP_CONT = 0x0
OP_TEXT = 0x1
OP_BINARY = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA

ROOMS = {}
CONNECTIONS = {}

def get_lan_ip():
    """Docstring for get_lan_ip."""
    try:
        import subprocess
        out = subprocess.check_output(['ip', 'route', 'get', '1.1.1.1'], stderr=subprocess.DEVNULL).decode().strip()
        parts = out.split()
        if 'src' in parts:
            return parts[parts.index('src') + 1]
    except Exception:
        pass
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "192.168.1.4"

def make_ws_frame(message_str):
    """Docstring for make_ws_frame."""
    payload = message_str.encode('utf-8')
    length = len(payload)
    header = bytearray([0x81])
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    return bytes(header + payload)

async def read_ws_frame(reader):
    """Docstring for read_ws_frame."""
    head = await reader.readexactly(2)
    b1, b2 = head[0], head[1]
    opcode = b1 & 0x0F
    is_masked = bool(b2 & 0x80)
    length = b2 & 0x7F

    if length == 126:
        len_bytes = await reader.readexactly(2)
        length = struct.unpack("!H", len_bytes)[0]
    elif length == 127:
        len_bytes = await reader.readexactly(8)
        length = struct.unpack("!Q", len_bytes)[0]

    mask_key = b""
    if is_masked:
        mask_key = await reader.readexactly(4)

    payload = await reader.readexactly(length)
    if is_masked:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

    return opcode, payload

async def send_json(writer, data_dict):
    """Docstring for send_json."""
    try:
        frame = make_ws_frame(json.dumps(data_dict))
        writer.write(frame)
        await writer.drain()
    except Exception:
        pass

async def broadcast_to_room(room_id, data_dict, exclude_writer=None):
    """Docstring for broadcast_to_room."""
    room = ROOMS.get(room_id)
    if not room:
        return
    for w, info in list(CONNECTIONS.items()):
        if info.get("room_id") == room_id and w != exclude_writer:
            await send_json(w, data_dict)

async def handle_ws_message(writer, msg_str):
    """Docstring for handle_ws_message."""
    try:
        data = json.loads(msg_str)
    except Exception:
        return

    msg_type = data.get("type")
    conn_info = CONNECTIONS.get(writer, {})
    player_id = conn_info.get("player_id")
    room_id = conn_info.get("room_id")
    room = ROOMS.get(room_id) if room_id else None

    if msg_type == "ping":
        await send_json(writer, {"type": "pong", "client_time": data.get("client_time", 0)})

    elif msg_type == "join_room":
        target_room_id = str(data.get("room_id", "")).strip().upper()
        if not target_room_id:
            # Everyone without a specific room code always joins CHASE-MAIN together
            target_room_id = "CHASE-MAIN"

        player_name = str(data.get("name", "")).strip()[:16] or "Matias"
        player_gender = str(data.get("gender", "boy")).strip().lower()
        if player_gender not in ("boy", "girl"):
            player_gender = "boy"
        valid_char_ids = [c["id"] for c in CHARACTERS_CATALOG]
        player_character = str(data.get("character", "matias")).strip().lower()
        if player_character not in valid_char_ids:
            player_character = "matias"

        char_meta = next((c for c in CHARACTERS_CATALOG if c["id"] == player_character), CHARACTERS_CATALOG[0])
        player_name = str(data.get("name", "")).strip()[:16] or char_meta["name"]
        player_gender = str(data.get("gender", char_meta["gender"])).strip().lower()
        if player_gender not in ("boy", "girl"):
            player_gender = char_meta["gender"]

        if target_room_id not in ROOMS:
            ROOMS[target_room_id] = GameRoom(target_room_id)

        room = ROOMS[target_room_id]

        if len(room.players) >= 12:
            await send_json(writer, {"type": "error", "message": "La sala está llena (máx 12)"})
            return

        # Name collision handling: Disambiguate if name already exists
        existing_names = [p.name.strip().lower() for p in room.players.values()]
        if player_name.lower() in existing_names:
            player_name = f"{player_name} {len(room.players) + 1}"

        player = room.add_player(player_id, player_name, gender=player_gender, character=player_character)
        conn_info["room_id"] = target_room_id

        await send_json(writer, {
            "type": "joined_room",
            "room_id": target_room_id,
            "player_id": player_id,
            "player": player.to_dict(is_self=True),
            "catalogs": {
                "characters": CHARACTERS_CATALOG,
                "hats": HATS_CATALOG,
                "skins": SKINS_CATALOG,
                "weapons": WEAPONS_CATALOG
            },
            "map": {
                "width": MAP_WIDTH,
                "height": MAP_HEIGHT,
                "obstacles": MAP_OBSTACLES,
                "tasks": TASK_STATIONS,
                "vents": VENTS,
                "emergency_button": EMERGENCY_BUTTON,
                "food_buffet": FOOD_BUFFET,
                "wardrobe": WARDROBE_STATION
            }
        })

        # HOT-JOIN: If game is already in progress, drop player straight in as active crewmate!
        if room.state == "PLAYING":
            player.assign_tasks(TASK_STATIONS)
            player.role = "crewmate"
            player.alive = True
            spawn_angle = len(room.players) * (2.0 * math.pi / 10.0)
            player.x = 1350.0 + math.cos(spawn_angle) * 160.0
            player.y = 700.0 + math.sin(spawn_angle) * 160.0
            player.target_x = player.x
            player.target_y = player.y
            await send_json(writer, {
                "type": "game_started",
                "role": "crewmate",
                "assigned_tasks": player.assigned_tasks,
                "players_count": len(room.players)
            })

        await broadcast_to_room(target_room_id, {
            "type": "player_joined",
            "player": player.to_dict(),
            "players_count": len(room.players)
        })

    elif msg_type == "update_wardrobe":
        if room:
            hat = data.get("hat", "none")
            skin = data.get("skin", "onesie_tie")
            weapon = data.get("weapon", "pan")
            gender = data.get("gender", None)
            room.update_customization(player_id, hat, skin, weapon, gender=gender)
            p = room.players.get(player_id)
            if p:
                await broadcast_to_room(room_id, {
                    "type": "wardrobe_changed",
                    "player_id": player_id,
                    "gender": p.gender,
                    "hat": p.hat,
                    "skin": p.skin,
                    "weapon": p.weapon
                })

    elif msg_type == "punch":
        if room:
            success, msg, hit_info = room.try_punch(player_id)
            if hit_info:
                await broadcast_to_room(room_id, {
                    "type": "punch_event",
                    "attacker_id": player_id,
                    "hit": hit_info
                })

    elif msg_type == "start_game":
        if room and room.state in ("LOBBY", "GAME_OVER"):
            if room.start_game():
                for w, info in list(CONNECTIONS.items()):
                    if info.get("room_id") == room_id:
                        p_id = info.get("player_id")
                        p = room.players.get(p_id)
                        await send_json(w, {
                            "type": "game_started",
                            "role": p.role if p else "crewmate",
                            "assigned_tasks": p.assigned_tasks if p else [],
                            "impostor_count": sum(1 for pl in room.players.values() if pl.role == "impostor")
                        })

    elif msg_type == "return_to_lobby":
        if room:
            room.episode = (room.episode % room.max_episodes) + 1
            room.state = "LOBBY"
            room.winner = None
            room.dead_bodies = []
            room.clone_impostors = []
            room.light_orbs = []
            room.meeting = {
                "caller": None,
                "reason": None,
                "votes": {},
                "timer": 0.0,
                "result": None
            }
            room.init_world_entities()
            for p in room.players.values():
                p.alive = True
                p.hp = 100
                p.score = 0
                p.completed_tasks = set()
                p.current_task = None
                p.in_vent = None
            await broadcast_to_room(room_id, {
                "type": "returned_to_lobby",
                "room_id": room_id,
                "episode": room.episode
            })

    elif msg_type == "input":
        if room and room.state == "PLAYING":
            vx = float(data.get("vx", 0))
            vy = float(data.get("vy", 0))
            room.update_player_input(player_id, vx, vy)

    elif msg_type == "kill":
        if room:
            target_id = data.get("target_id")
            success, msg = room.try_kill(player_id, target_id)
            await send_json(writer, {"type": "kill_result", "success": success, "message": msg})
            if success:
                await broadcast_to_room(room_id, {
                    "type": "sound_event",
                    "sound": "kill",
                    "victim_id": target_id
                })

    elif msg_type == "vent":
        if room:
            vent_id = data.get("vent_id")
            success, msg = room.try_vent(player_id, vent_id)
            await send_json(writer, {"type": "vent_result", "success": success, "message": msg})

    elif msg_type == "shapeshift":
        if room:
            target_id = data.get("target_id")
            success, msg = room.try_shapeshift(player_id, target_id)
            await send_json(writer, {"type": "shapeshift_result", "success": success, "message": msg})
            if success:
                await broadcast_to_room(room_id, {
                    "type": "sound_event",
                    "sound": "shapeshift",
                    "impostor_id": player_id
                })

    elif msg_type == "ghost_drop_invis":
        if room:
            success, msg = room.try_ghost_drop_invis_button(player_id)
            await send_json(writer, {"type": "ghost_drop_result", "success": success, "message": msg})

    elif msg_type == "report":
        if room:
            is_body = bool(data.get("is_body", False))
            body_id = data.get("body_id")
            if room.report_body_or_button(player_id, is_body, body_id):
                await broadcast_to_room(room_id, {
                    "type": "meeting_started",
                    "meeting": room.meeting
                })

    elif msg_type == "vote":
        if room and room.state == "MEETING":
            target_id = data.get("target_id", "skip")
            room.cast_vote(player_id, target_id)
            await broadcast_to_room(room_id, {
                "type": "vote_cast",
                "voter_id": player_id,
                "has_voted": list(room.meeting["votes"].keys())
            })

    elif msg_type == "start_task":
        if room and room.state == "PLAYING":
            task_id = data.get("task_id")
            player = room.players.get(player_id)
            if player and player.alive:
                player.current_task = task_id
                player.task_progress = 0.0

    elif msg_type == "complete_task":
        if room and room.state == "PLAYING":
            task_id = data.get("task_id")
            player = room.players.get(player_id)
            if player and player.alive and task_id:
                player.completed_tasks.add(task_id)
                player.current_task = None
                player.task_progress = 0.0
                player.score += 150
                room.check_game_over()
                await broadcast_to_room(room_id, {
                    "type": "task_completed",
                    "player_id": player_id,
                    "task_id": task_id,
                    "completed_count": len(player.completed_tasks),
                    "total_tasks": len(player.assigned_tasks)
                })

    elif msg_type == "cancel_task":
        if room and room.state == "PLAYING":
            player = room.players.get(player_id)
            if player:
                player.current_task = None
                player.task_progress = 0.0

    elif msg_type == "chat":
        if room:
            text = str(data.get("text", "")).strip()[:100]
            player = room.players.get(player_id)
            if text and player:
                await broadcast_to_room(room_id, {
                    "type": "chat_message",
                    "player_id": player.id,
                    "name": player.name,
                    "color": player.color,
                    "alive": player.alive,
                    "text": text,
                    "time": time.time()
                })


async def handle_connection(reader, writer):
    """Docstring for handle_connection."""
    conn_id = uuid.uuid4().hex[:8]
    CONNECTIONS[writer] = {"id": conn_id, "player_id": conn_id, "room_id": None}

    try:
        request_line = await reader.readline()
        if not request_line:
            writer.close()
            return

        method, path, *_ = request_line.decode("utf-8", errors="ignore").strip().split()
        headers = {}
        while True:
            line = await reader.readline()
            if not line or line == b"\r\n":
                break
            header_text = line.decode("utf-8", errors="ignore").strip()
            if ":" in header_text:
                k, v = header_text.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if headers.get("upgrade", "").lower() == "websocket":
            sec_key = headers.get("sec-websocket-key")
            if not sec_key:
                writer.close()
                return

            magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept_key = base64.b64encode(hashlib.sha1((sec_key + magic).encode()).digest()).decode()

            response = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
            )
            writer.write(response.encode())
            await writer.drain()

            while True:
                opcode, payload = await read_ws_frame(reader)
                if opcode == OP_CLOSE:
                    break
                elif opcode == OP_TEXT:
                    await handle_ws_message(writer, payload.decode("utf-8", errors="ignore"))
                elif opcode == OP_PING:
                    writer.write(bytes([0x8A, 0x00]))
                    await writer.drain()

        else:
            clean_path = path.split("?")[0]
            if clean_path in ("/health", "/healthz"):
                res = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK"
                writer.write(res)
                await writer.drain()
                writer.close()
                return

            if clean_path == "/api/network-info":
                lan_ip = get_lan_ip()
                active_rooms = [r_id for r_id, r in ROOMS.items() if len(r.players) > 0]
                primary_room = active_rooms[0] if active_rooms else "CHASE-MAIN"
                body = json.dumps({
                    "lan_ip": lan_ip,
                    "port": PORT,
                    "room_id": primary_room,
                    "lan_url": f"http://{lan_ip}:{PORT}",
                    "play_url": f"http://{lan_ip}:{PORT}/?play=1"
                }).encode("utf-8")
                res = (
                    f"HTTP/1.1 200 OK\r\n"
                    f"Content-Type: application/json; charset=utf-8\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    f"Access-Control-Allow-Origin: *\r\n"
                    f"Connection: close\r\n\r\n"
                ).encode("utf-8") + body
                writer.write(res)
                await writer.drain()
                writer.close()
                return

            if clean_path == "/api/rooms":
                rooms_list = []
                for r_id, r in ROOMS.items():
                    if len(r.players) > 0:
                        rooms_list.append({
                            "room_id": r_id,
                            "players": len(r.players),
                            "max_players": 12,
                            "state": r.state,
                            "player_names": [p.name for p in list(r.players.values())[:6]]
                        })
                body = json.dumps({"rooms": rooms_list}).encode("utf-8")
                res = (
                    f"HTTP/1.1 200 OK\r\n"
                    f"Content-Type: application/json; charset=utf-8\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    f"Access-Control-Allow-Origin: *\r\n"
                    f"Connection: close\r\n\r\n"
                ).encode("utf-8") + body
                writer.write(res)
                await writer.drain()
                writer.close()
                return

            if clean_path in ("/", ""):
                clean_path = "/index.html"

            file_path = (CLIENT_DIR / clean_path.lstrip("/")).resolve()

            if CLIENT_DIR not in file_path.parents and file_path != CLIENT_DIR / "index.html":
                file_path = CLIENT_DIR / "index.html"

            if file_path.exists() and file_path.is_file():
                mime, _ = mimetypes.guess_type(str(file_path))
                mime = mime or "application/octet-stream"
                content = file_path.read_bytes()
                res = (
                    f"HTTP/1.1 200 OK\r\n"
                    f"Content-Type: {mime}; charset=utf-8\r\n"
                    f"Content-Length: {len(content)}\r\n"
                    f"Access-Control-Allow-Origin: *\r\n"
                    f"Connection: close\r\n\r\n"
                ).encode("utf-8") + content
                writer.write(res)
            else:
                res = b"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found"
                writer.write(res)
            await writer.drain()
            writer.close()

    except Exception:
        pass
    finally:
        info = CONNECTIONS.pop(writer, {})
        room_id = info.get("room_id")
        player_id = info.get("player_id")
        if room_id and room_id in ROOMS:
            room = ROOMS[room_id]
            room.remove_player(player_id)
            asyncio.create_task(broadcast_to_room(room_id, {
                "type": "player_left",
                "player_id": player_id,
                "players_count": len(room.players)
            }))
        try:
            writer.close()
        except Exception:
            pass


async def game_tick_loop():
    """Docstring for game_tick_loop."""
    tick_rate = 30
    dt = 1.0 / tick_rate

    while True:
        start_time = time.time()

        for room_id, room in list(ROOMS.items()):
            room.tick(dt)

            for w, info in list(CONNECTIONS.items()):
                if info.get("room_id") == room_id:
                    p_id = info.get("player_id")
                    snapshot = room.get_snapshot_for_player(p_id)
                    await send_json(w, snapshot)

        elapsed = time.time() - start_time
        sleep_time = max(0.001, dt - elapsed)
        await asyncio.sleep(sleep_time)


async def main():
    """Docstring for main."""
    global PORT
    server = None
    env_port = os.environ.get("PORT")
    ports_to_try = [int(env_port)] if env_port else [PORT, 3001, 3002, 8080, 8000]
    for try_port in ports_to_try:
        try:
            server = await asyncio.start_server(handle_connection, HOST, try_port, reuse_address=True)
            PORT = try_port
            break
        except OSError:
            continue

    if not server:
        print(f"❌ Error: No se pudo enlazar ningún puerto libre.")
        return

    lan_ip = get_lan_ip()
    print("=" * 60)
    print(f"🚀 MATIAS & BRUS: IMPOSTOR CHASE SERVER")
    print(f"👉 En esta PC:     http://localhost:{PORT}")
    print(f"👉 Misma Red Wi-Fi: http://{lan_ip}:{PORT}")
    print("=" * 60)

    asyncio.create_task(game_tick_loop())

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServidor detenido correctamente.")
