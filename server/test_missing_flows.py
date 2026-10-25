import unittest
from game_state import GameRoom, Player, VENTS


class TestMissingFlowsAndAuditFixes(unittest.TestCase):
    def test_player_connected_initialized_in_init(self):
        """B4: Player.__init__ must initialize self.connected = True."""
        p = Player("p1", "Matias", 0)
        self.assertIn("connected", p.__dict__)
        self.assertTrue(p.connected)

    def test_sliding_window_rate_limiter_boundary(self):
        """B5: SlidingWindowRateLimiter must reject >max_calls across any rolling 1.0s window."""
        from server import SlidingWindowRateLimiter

        limiter = SlidingWindowRateLimiter(max_calls=5, window_sec=1.0)
        # 5 calls at t = 0.8s -> all allowed
        for _ in range(5):
            self.assertTrue(limiter.allow(now=0.8))
        # 6th call at t = 1.1s (still within 1.0s of t=0.8s) -> MUST be rejected!
        # (A naive fixed-window reset at t=1.0s would have allowed another 5 calls here)
        self.assertFalse(limiter.allow(now=1.1))
        # At t = 1.81s (> 1.0s after 0.8s), calls are allowed again
        self.assertTrue(limiter.allow(now=1.81))

    def test_try_vent_entry_teleport_and_exit(self):
        """Impostor can enter a nearby vent, teleport to connected vent, and exit."""
        room = GameRoom("ROOM-VENT")
        p1 = room.add_player("p1", "Impostor")
        p2 = room.add_player("p2", "Crewmate")
        room.start_game()
        p1.role = "impostor"
        p2.role = "crewmate"

        vent1 = VENTS[0]  # vent_1 connected to vent_2
        vent2 = next(v for v in VENTS if v["id"] == vent1["connected_to"])

        # Crewmate cannot use vents
        p2.x, p2.y = vent1["x"], vent1["y"]
        ok, _ = room.try_vent("p2", vent1["id"])
        self.assertFalse(ok)

        # Impostor too far from vent cannot enter
        p1.x, p1.y = vent1["x"] + 200, vent1["y"] + 200
        ok, msg = room.try_vent("p1", vent1["id"])
        self.assertFalse(ok)
        self.assertIsNone(p1.in_vent)

        # Impostor close to vent1 enters
        p1.x, p1.y = vent1["x"] + 10, vent1["y"]
        ok, msg = room.try_vent("p1", vent1["id"])
        self.assertTrue(ok)
        self.assertEqual(p1.in_vent, vent1["id"])

        # While in vent1, calling try_vent with vent1 again (when far from vent2) or connected vent:
        # Calling try_vent(p1, vent1["id"]) while already in vent1 exits the vent
        ok, msg = room.try_vent("p1", vent1["id"])
        self.assertTrue(ok)
        self.assertIsNone(p1.in_vent)

        # Re-enter vent1, then teleport via connected vent
        p1.x, p1.y = vent1["x"], vent1["y"]
        room.try_vent("p1", vent1["id"])
        self.assertEqual(p1.in_vent, vent1["id"])
        # Trigger travel through vent1 (which connects to vent2) by targeting a distant vent with connected_to
        ok, msg = room.try_vent("p1", vent2["id"])
        self.assertTrue(ok)
        self.assertEqual(p1.in_vent, vent1["id"])

    def test_try_shapeshift_disguise_and_timer_expiry(self):
        """Impostor can disguise as another player for 18s and reverts after timer expires."""
        room = GameRoom("ROOM-SHAPE")
        p1 = room.add_player("p1", "Matias", character="matias")
        p2 = room.add_player("p2", "Reina", character="reina_flor", gender="girl")
        room.start_game()
        p1.role = "impostor"
        p2.role = "crewmate"

        ok, msg = room.try_shapeshift("p1", "p2")
        self.assertTrue(ok)
        self.assertIsNotNone(p1.disguise)
        self.assertEqual(p1.disguise["name"], "Reina")
        self.assertEqual(p1.disguise["character"], "reina_flor")
        self.assertAlmostEqual(p1.disguise_timer, 18.0)

        # Crewmate snapshot sees disguised appearance
        snap_for_crew = room.get_snapshot_for_player("p2")
        p1_in_snap = next(p for p in snap_for_crew["players"] if p["id"] == "p1")
        self.assertEqual(p1_in_snap["name"], "Reina")
        self.assertEqual(p1_in_snap["character"], "reina_flor")

        # Tick 18.5 seconds -> disguise expires
        room.tick(18.5)
        self.assertIsNone(p1.disguise)
        self.assertEqual(p1.disguise_timer, 0.0)

    def test_report_vote_and_meeting_resolution(self):
        """Reporting starts MEETING, majority vote ejects target, tie skips ejection."""
        room = GameRoom("ROOM-VOTE")
        p1 = room.add_player("p1", "P1")
        p2 = room.add_player("p2", "P2")
        p3 = room.add_player("p3", "P3")
        room.start_game()
        p1.role = "crewmate"
        p2.role = "crewmate"
        p3.role = "impostor"

        # Start emergency meeting
        self.assertTrue(room.report_body_or_button("p1", is_body=False))
        self.assertEqual(room.state, "MEETING")

        # Tie vote: p1 votes p2, p2 votes p1, p3 votes skip -> tie between p1, p2, skip
        room.cast_vote("p1", "p2")
        room.cast_vote("p2", "p1")
        room.cast_vote("p3", "skip")
        self.assertEqual(room.state, "MEETING_RESULT")
        self.assertTrue(p1.alive and p2.alive and p3.alive)
        self.assertIn("Nadie fue expulsado", room.meeting["result"])

        # Advance past MEETING_RESULT (4.0s) back to PLAYING
        room.tick(4.5)
        self.assertEqual(room.state, "PLAYING")

        # Second meeting: majority votes out impostor p3 -> shows verdict in MEETING_RESULT, then GAME_OVER
        self.assertTrue(room.report_body_or_button("p1", is_body=True))
        room.cast_vote("p1", "p3")
        room.cast_vote("p2", "p3")
        room.cast_vote("p3", "p1")
        self.assertFalse(p3.alive)
        self.assertEqual(room.state, "MEETING_RESULT")
        self.assertIn("IMPOSTOR", room.meeting["result"])
        room.tick(4.5)
        self.assertEqual(room.state, "GAME_OVER")
        self.assertEqual(room.winner, "CREWMATE")

    def test_boost_revive_reduces_timer(self):
        """boost_revive subtracts 1.5s from downed body's revive_timer when crewmate is within 85px."""
        room = GameRoom("ROOM-REVIVE")
        p1 = room.add_player("p1", "Helper")
        p2 = room.add_player("p2", "Victim")
        p3 = room.add_player("p3", "Impostor")
        room.start_game()
        p1.role = "crewmate"
        p2.role = "crewmate"
        p3.role = "impostor"

        p2.alive = False
        p2.hp = 0
        body = room.create_dead_body(p2)
        initial_timer = body["revive_timer"]

        # Place helper within 85px
        p1.x, p1.y = body["x"] + 30, body["y"]
        ok, msg = room.boost_revive("p1", body["id"])
        self.assertTrue(ok)
        self.assertAlmostEqual(body["revive_timer"], initial_timer - 1.5)
        self.assertTrue(body["revive_boosted"])

    def test_return_to_lobby_resets_room_and_players(self):
        """room.return_to_lobby() resets room state, bodies, clones, and all players."""
        room = GameRoom("ROOM-RESET")
        p1 = room.add_player("p1", "P1")
        p2 = room.add_player("p2", "P2")
        room.start_game()
        p2.alive = False
        p2.hp = 0
        p1.score = 500
        p1.in_vent = "vent_1"
        room.create_dead_body(p2)

        room.return_to_lobby()
        self.assertEqual(room.state, "LOBBY")
        self.assertIsNone(room.winner)
        self.assertEqual(len(room.dead_bodies), 0)
        self.assertTrue(p2.alive)
        self.assertEqual(p2.hp, 100)
        self.assertEqual(p1.score, 0)
        self.assertIsNone(p1.in_vent)

    def test_multiroom_snapshot_isolation(self):
        """Two concurrent GameRooms return strictly isolated snapshots per room."""
        room_a = GameRoom("ROOM-A")
        room_b = GameRoom("ROOM-B")
        room_a.add_player("pa", "Alice")
        room_b.add_player("pb", "Bob")
        room_a.start_game()
        room_b.start_game()
        room_a.tick(0.033)
        room_b.tick(0.033)

        snap_a = room_a.get_snapshot_for_player("pa")
        snap_b = room_b.get_snapshot_for_player("pb")
        self.assertEqual(snap_a["room_id"], "ROOM-A")
        self.assertEqual(snap_b["room_id"], "ROOM-B")
        self.assertEqual([p["id"] for p in snap_a["players"]], ["pa"])
        self.assertEqual([p["id"] for p in snap_b["players"]], ["pb"])

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

    def test_origin_validation_blocks_startswith_spoofing_and_allows_preview_domains(self):
        """Origin check must reject localhost.evil.com and allow Railway preview/same-host origins."""
        import server as srv
        self.assertTrue(srv.is_allowed_origin(""))
        self.assertTrue(srv.is_allowed_origin("http://localhost:3000"))
        self.assertTrue(srv.is_allowed_origin("http://127.0.0.1:8080"))
        self.assertTrue(srv.is_allowed_origin("https://matias-brus-impostor-chase-production.up.railway.app"))
        self.assertTrue(srv.is_allowed_origin("https://app-preview-pr-42.up.railway.app"))
        self.assertTrue(srv.is_allowed_origin("https://custom.example.com", req_host="custom.example.com"))
        self.assertFalse(srv.is_allowed_origin("http://localhost.evil.com"))
        self.assertFalse(srv.is_allowed_origin("http://127.0.0.1.evil.com"))
        self.assertFalse(srv.is_allowed_origin("https://evil.com", req_host="matias-brus-impostor-chase-production.up.railway.app"))

    def test_update_player_input_clamps_speed_and_rejects_nan_inf(self):
        """update_player_input must clamp vector magnitude to 1.0 (max speed 280) and reject NaN/Inf."""
        import math
        room = GameRoom("SPEED_TEST")
        p1 = room.add_player("p1", "Runner")
        room.start_game()

        room.update_player_input("p1", 1000.0, 0.0)
        self.assertAlmostEqual(math.hypot(p1.vx, p1.vy), 280.0, places=3)

        room.update_player_input("p1", 100.0, 100.0)
        self.assertAlmostEqual(math.hypot(p1.vx, p1.vy), 280.0, places=3)

        orig_x, orig_y = p1.x, p1.y
        room.update_player_input("p1", float("nan"), 0.0)
        room.update_player_input("p1", 0.0, float("inf"))
        room.tick(0.1)
        self.assertTrue(math.isfinite(p1.x) and math.isfinite(p1.y))
        self.assertTrue(math.isfinite(p1.vx) and math.isfinite(p1.vy))

    def test_join_room_prevents_connected_name_hijack_and_preserves_disconnected_role_alive(self):
        """Joining with an active player's name must not hijack their session or reset role/alive on reconnect."""
        import asyncio
        import json
        import server as srv

        class DummyW:
            def __init__(self):
                self.closed = False
                self.msgs = []
            def write(self, b):
                pass
            async def drain(self):
                pass
            def close(self):
                self.closed = True
            async def wait_closed(self):
                pass

        async def _run():
            srv.ROOMS.clear()
            srv.CONNECTIONS.clear()
            w1 = DummyW()
            w2 = DummyW()
            srv.CONNECTIONS[w1] = {"id": "p1", "player_id": "p1", "room_id": None}
            srv.CONNECTIONS[w2] = {"id": "p2", "player_id": "p2", "room_id": None}

            orig_send = srv.send_json
            async def mock_send(w, d):
                w.msgs.append(d)
            srv.send_json = mock_send
            try:
                await srv.handle_ws_message(w1, json.dumps({"type": "join_room", "room_id": "HIJACK_ROOM", "name": "Matias"}))
                room = srv.ROOMS["HIJACK_ROOM"]
                room.start_game()
                p1 = room.players["p1"]
                p1.role = "impostor"
                p1.alive = True
                p1.connected = True

                # Attacker w2 tries to join with name "Matias" while p1 is connected
                await srv.handle_ws_message(w2, json.dumps({"type": "join_room", "room_id": "HIJACK_ROOM", "name": "Matias"}))
                self.assertFalse(w1.closed, "Connected player's socket must NOT be closed by same-name joiner")
                self.assertEqual(p1.role, "impostor", "Connected impostor must NOT be reset to crewmate")
                self.assertIn("p2", room.players, "Second joiner must be added as a separate disambiguated player")
                self.assertNotEqual(room.players["p2"].name, "Matias")

                # Now simulate p1 genuinely disconnecting while dead/impostor and reconnecting by name
                p1.connected = False
                p1.alive = False
                w3 = DummyW()
                srv.CONNECTIONS[w3] = {"id": "p3", "player_id": "p3", "room_id": None}
                await srv.handle_ws_message(w3, json.dumps({"type": "join_room", "room_id": "HIJACK_ROOM", "name": "Matias"}))
                self.assertEqual(srv.CONNECTIONS[w3]["player_id"], "p1", "Disconnected player should be reclaimed by name")
                self.assertEqual(p1.role, "impostor", "Reclaimed player's role must be preserved")
                self.assertFalse(p1.alive, "Reclaimed dead player must NOT be revived by hot-join")
            finally:
                srv.send_json = orig_send

        asyncio.run(_run())

    def test_host_and_state_authorization_for_start_game_and_return_to_lobby(self):
        """Only the host can start_game or return_to_lobby, and return_to_lobby is blocked during PLAYING."""
        import asyncio
        import json
        import server as srv

        class DummyW:
            def __init__(self):
                self.msgs = []
            def write(self, b):
                pass
            async def drain(self):
                pass
            def close(self):
                pass
            async def wait_closed(self):
                pass

        async def _run():
            srv.ROOMS.clear()
            srv.CONNECTIONS.clear()
            w_host = DummyW()
            w_guest = DummyW()
            srv.CONNECTIONS[w_host] = {"id": "host_1", "player_id": "host_1", "room_id": None}
            srv.CONNECTIONS[w_guest] = {"id": "guest_2", "player_id": "guest_2", "room_id": None}

            orig_send = srv.send_json
            async def mock_send(w, d):
                w.msgs.append(d)
            srv.send_json = mock_send
            try:
                await srv.handle_ws_message(w_host, json.dumps({"type": "join_room", "room_id": "AUTH_ROOM", "name": "Host"}))
                await srv.handle_ws_message(w_guest, json.dumps({"type": "join_room", "room_id": "AUTH_ROOM", "name": "Guest"}))
                room = srv.ROOMS["AUTH_ROOM"]
                self.assertEqual(room.host_id, "host_1")

                # Guest tries to start_game -> must be ignored
                await srv.handle_ws_message(w_guest, json.dumps({"type": "start_game"}))
                self.assertEqual(room.state, "LOBBY")

                # Host starts game -> succeeds
                await srv.handle_ws_message(w_host, json.dumps({"type": "start_game"}))
                self.assertEqual(room.state, "PLAYING")

                # Guest OR Host tries to return_to_lobby mid-game (PLAYING) -> must be blocked
                await srv.handle_ws_message(w_guest, json.dumps({"type": "return_to_lobby"}))
                self.assertEqual(room.state, "PLAYING")
                await srv.handle_ws_message(w_host, json.dumps({"type": "return_to_lobby"}))
                self.assertEqual(room.state, "PLAYING")

                # When GAME_OVER, guest still cannot return_to_lobby while host is connected, but host can
                room.state = "GAME_OVER"
                await srv.handle_ws_message(w_guest, json.dumps({"type": "return_to_lobby"}))
                self.assertEqual(room.state, "GAME_OVER")
                await srv.handle_ws_message(w_host, json.dumps({"type": "return_to_lobby"}))
                self.assertEqual(room.state, "LOBBY")
            finally:
                srv.send_json = orig_send

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
