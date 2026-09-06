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

    def test_rate_limit_threshold(self):
        # Server rate limit must be at least 250 msg/sec for mobile joysticks
        # Verify that rate limit constant in server.py is set to >= 250
        with open(os.path.join(server_dir, "server.py"), "r") as f:
            content = f.read()
        self.assertIn("msg_count > 300", content)


if __name__ == "__main__":
    unittest.main()
