import unittest
import sys
import os

server_dir = os.path.dirname(os.path.abspath(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from game_state import GameRoom, Player, CarnivorousPlant


class TestAssistedReviveAndGameOver(unittest.TestCase):
    def setUp(self):
        self.room = GameRoom("test_room")
        self.room.state = "PLAYING"

    def test_revive_does_not_progress_without_teammates(self):
        """Downed bodies must NOT auto-revive without active teammate help."""
        victim = self.room.add_player("vic_1", "Victim1")
        victim.alive = False
        victim.hp = 0

        # Create downed body with 20s timer
        body = self.room.create_dead_body(victim)
        initial_timer = body["revive_timer"]

        # Tick room 5 seconds with NO helpers nearby
        self.room.tick_dead_bodies(5.0)

        # Timer must remain unchanged at 20.0s (not automatic!)
        self.assertEqual(body["revive_timer"], initial_timer)
        self.assertFalse(body["revive_boosted"])
        self.assertFalse(victim.alive)

    def test_revive_progresses_when_teammate_nearby(self):
        """Downed body timer ticks down when an alive crewmate is near (<70px)."""
        victim = self.room.add_player("vic_2", "Victim2")
        victim.alive = False
        victim.hp = 0

        helper = self.room.add_player("helper_1", "Helper1")
        helper.role = "crewmate"
        helper.alive = True
        helper.x, helper.y = 100.0, 100.0

        body = self.room.create_dead_body(victim)
        body["x"], body["y"] = 110.0, 110.0  # ~14px distance (<70px)

        # Tick 2 seconds with helper
        self.room.tick_dead_bodies(2.0)

        # Timer should have decreased by at least 2.0 * 3.0 = 6.0s
        self.assertLessEqual(body["revive_timer"], 14.0)
        self.assertTrue(body["revive_boosted"])

    def test_game_over_delayed_while_bodies_in_play(self):
        """Impostor victory must not fire prematurely while bodies can be dragged/digested."""
        impostor = self.room.add_player("imp_1", "Impostor1")
        impostor.role = "impostor"
        impostor.alive = True

        crewmate = self.room.add_player("crew_1", "Crew1")
        crewmate.role = "crewmate"
        crewmate.alive = False  # Knocked down!
        crewmate.hp = 0

        body = self.room.create_dead_body(crewmate)

        # check_game_over: alive_crewmates is 0, but unconsumed body exists
        is_over = self.room.check_game_over()
        self.assertFalse(is_over)
        self.assertEqual(self.room.state, "PLAYING")

        # Now simulate body being trapped in plant and fully digested / removed
        self.room.dead_bodies = []
        is_over_now = self.room.check_game_over()
        self.assertTrue(is_over_now)
        self.assertEqual(self.room.state, "GAME_OVER")
        self.assertEqual(self.room.winner, "IMPOSTOR")

    def test_snapshot_memoization_consistency(self):
        """get_snapshot_for_player must reuse per-tick memoization across players."""
        p1 = self.room.add_player("p1", "Player1")
        p2 = self.room.add_player("p2", "Player2")

        # Run tick to initialize state and clear cache
        self.room.tick(0.033)

        snap1 = self.room.get_snapshot_for_player("p1")
        snap2 = self.room.get_snapshot_for_player("p2")

        # World entities must be identical references from memoized common dictionary
        self.assertIs(snap1["cats"], snap2["cats"])
        self.assertIs(snap1["carnivorous_plants"], snap2["carnivorous_plants"])
        self.assertIs(snap1["skeleton_cats"], snap2["skeleton_cats"])
        self.assertEqual(snap1["timestamp"], snap2["timestamp"])


if __name__ == "__main__":
    unittest.main()
