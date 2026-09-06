import unittest
import sys
import os
import time

server_dir = os.path.dirname(os.path.abspath(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from game_state import GameRoom, Player, ZombieCat, LightOrb, CollectibleItem, TASK_STATIONS, PLAYER_RADIUS


class TestGameState(unittest.TestCase):
    def setUp(self):
        self.room = GameRoom("TEST_ROOM")

    def test_add_player(self):
        self.room.add_player("player1", "test_name", "boy", "matias")
        self.assertIn("player1", self.room.players)
        self.assertEqual(self.room.players["player1"].name, "test_name")
        self.assertIsNone(self.room.empty_since)

    def test_remove_player(self):
        self.room.add_player("player1", "test_name", "boy", "matias")
        self.room.remove_player("player1")
        self.assertNotIn("player1", self.room.players)
        self.assertIsNotNone(self.room.empty_since)

    def test_start_game(self):
        for i in range(5):
            self.room.add_player(f"player{i}", f"test{i}", "boy", "matias")
        
        self.room.start_game()
        
        impostors = sum(1 for p in self.room.players.values() if p.role == "impostor")
        crewmates = sum(1 for p in self.room.players.values() if p.role == "crewmate")
        
        self.assertEqual(impostors, 1)
        self.assertEqual(crewmates, 4)

    def test_movement(self):
        self.room.add_player("player1", "test_name", "boy", "matias")
        self.room.start_game()
        player = self.room.players["player1"]
        
        start_x, start_y = 650.0, 650.0
        player.x = start_x
        player.y = start_y
        player.vx = 100
        player.vy = 0
        
        self.room.tick(0.1)
        
        self.assertGreater(player.x, start_x)
        self.assertEqual(player.y, start_y)

    def test_try_kill(self):
        self.room.add_player("imp", "impostor_name", "boy", "matias")
        self.room.add_player("crew", "crewmate_name", "boy", "matias")
        self.room.start_game()
        
        imp = self.room.players["imp"]
        crew = self.room.players["crew"]
        
        imp.role = "impostor"
        crew.role = "crewmate"
        imp.kill_cooldown = 0
        
        imp.x, imp.y = 100, 100
        crew.x, crew.y = 110, 110
        
        success, msg = self.room.try_kill("imp", "crew")
        self.assertTrue(success)
        self.assertFalse(crew.alive)

    def test_stealth_mechanic(self):
        self.room.add_player("stealthy", "ghost", "boy", "fantasma")
        self.room.start_game()
        p = self.room.players["stealthy"]
        
        p.in_vent = True
        self.room.tick(0.1)
        self.assertFalse(p.in_stealth)
        
        p.in_vent = False
        p.x, p.y = 1560, 860 
        p.vx, p.vy = 10, 10 # Speed < 25
        self.room.tick(0.1)
        self.assertTrue(p.in_stealth)

    def test_clone_mechanic(self):
        self.room.add_player("player1", "test_name", "boy", "matias")
        self.room.start_game()
        p = self.room.players["player1"]
        p.x, p.y = 100, 100
        
        orb = LightOrb("orb1", 100, 100)
        orb.armed = True
        self.room.light_orbs.append(orb)
        
        self.room.tick(0.1)
        
        self.assertFalse(orb.active)
        self.assertEqual(len(self.room.clone_impostors), 1)
        
        clone = self.room.clone_impostors[0]
        self.assertEqual(clone.role, "impostor")
        self.assertTrue(clone.is_clone)
        self.assertEqual(clone.original_id, "player1")

    def test_room_empty_since_and_ttl(self):
        empty_room = GameRoom("EMPTY_ROOM")
        self.assertIsNone(empty_room.empty_since)
        
        empty_room.add_player("p1", "Name")
        empty_room.remove_player("p1")
        self.assertIsNotNone(empty_room.empty_since)
        self.assertLessEqual(empty_room.empty_since, time.time())

    def test_scored_tasks_anti_cheat(self):
        self.room.add_player("p1", "Worker")
        self.room.start_game()
        p = self.room.players["p1"]
        p.role = "crewmate"
        p.assigned_tasks = ["task_1", "task_2"]
        p.completed_tasks = {"task_1"}
        
        self.assertIn("task_1", p.completed_tasks)
        self.assertNotIn("task_1", p.scored_tasks)
        
        p.scored_tasks.add("task_1")
        self.assertIn("task_1", p.scored_tasks)


if __name__ == "__main__":
    unittest.main()
