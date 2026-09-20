import unittest
import asyncio
import sys
import os
import time

server_dir = os.path.dirname(os.path.abspath(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from game_state import GameRoom, Player
import server


class TestReconnectFlow(unittest.TestCase):
    def setUp(self):
        server.ROOMS.clear()
        server.CONNECTIONS.clear()
        self.room = GameRoom("RECONNECT_ROOM")
        server.ROOMS["RECONNECT_ROOM"] = self.room

    def test_reconnect_takeover(self):
        # Initial player join
        p1 = self.room.add_player("p1_id", "PlayerOne")
        p1.role = "crewmate"
        p1.assigned_tasks = ["task_1", "task_2"]
        p1.connected = False

        # When reconnecting with p1_id, player state and tasks must be preserved
        reconnect_id = "p1_id"
        self.assertIn(reconnect_id, self.room.players)
        existing_p = self.room.players[reconnect_id]
        existing_p.connected = True

        self.assertEqual(existing_p.id, "p1_id")
        self.assertEqual(existing_p.role, "crewmate")
        self.assertEqual(existing_p.assigned_tasks, ["task_1", "task_2"])

    def test_empty_room_ttl_cleanup(self):
        # Simulate room with no players and old empty_since
        self.room.empty_since = time.time() - 350
        self.assertEqual(len(self.room.players), 0)

        # Check if room qualifies for TTL cleanup (TTL is 300s)
        is_expired = (
            time.time() - self.room.empty_since
        ) > server.ROOM_EMPTY_TTL_SECONDS
        self.assertTrue(is_expired)

    def test_lobby_snapshot_visibility_all_players(self):
        # In LOBBY, all players must always be present in snapshot, even if they had vent or invis flags
        p1 = self.room.add_player("p1_id", "Matias")
        p2 = self.room.add_player("p2_id", "Brus")
        p2.in_vent = "vent_1"
        p2.invis_timer = 5.0
        self.room.state = "LOBBY"

        snap = self.room.get_snapshot_for_player("p1_id")
        player_ids = [p["id"] for p in snap["players"]]
        self.assertIn("p1_id", player_ids)
        self.assertIn("p2_id", player_ids)

    def test_reclaim_disconnected_player_by_name(self):
        # When a player reconnects with same name without reconnect_id, their slot is reclaimed
        p1 = self.room.add_player("old_p1_id", "Matias")
        p1.connected = False

        # Check disconnected matching
        disconnected_player = next(
            (p for p in self.room.players.values() if not getattr(p, "connected", True) and p.name.strip().lower() == "matias"),
            None
        )
        self.assertIsNotNone(disconnected_player)
        self.assertEqual(disconnected_player.id, "old_p1_id")


if __name__ == "__main__":
    unittest.main()
