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


if __name__ == "__main__":
    unittest.main()
