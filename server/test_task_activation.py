"""Tests for task station physical reachability, state synchronization, and anti-cheat validation."""

import unittest
import math
from game_state import (
    GameRoom,
    Player,
    TASK_STATIONS,
    MAP_OBSTACLES,
    PLAYER_RADIUS,
    resolve_obstacle_collision,
)


class TestTaskActivation(unittest.TestCase):
    """Test suite ensuring all room tasks are reachable and functional."""

    def setUp(self):
        self.room = GameRoom("test_tasks_room")
        self.room.add_player("p1", "Tester")
        self.player = self.room.players["p1"]
        self.player.role = "crewmate"

    def test_all_task_stations_physically_reachable(self):
        """Verify that player can physically get within reach distance for every task station."""
        reach_margin = 115.0  # Max interaction threshold used by client

        for task in TASK_STATIONS:
            task_id = task["id"]
            tx, ty = task["x"], task["y"]
            min_dist = float("inf")

            # Test approaches from 16 angles around the station
            for angle_idx in range(16):
                angle = angle_idx * (2.0 * math.pi / 16.0)
                # Try placing player at 100px away and resolving collision
                approach_x = tx + math.cos(angle) * 90.0
                approach_y = ty + math.sin(angle) * 90.0
                resolved_x, resolved_y = resolve_obstacle_collision(
                    approach_x, approach_y, PLAYER_RADIUS
                )
                dist = math.hypot(resolved_x - tx, resolved_y - ty)
                if dist < min_dist:
                    min_dist = dist

            station_reach = max(task["radius"] + 30.0, reach_margin)
            self.assertLess(
                min_dist,
                station_reach,
                f"Task {task_id} in {task['room']} is unreachable! Min distance: {min_dist:.1f}, Reach: {station_reach}",
            )

    def test_reactor_generator_task_reachable(self):
        """Explicitly test task_1 in Reactor around the 110x110 generator."""
        task_1 = next(t for t in TASK_STATIONS if t["id"] == "task_1")
        # Generator is (280, 260, 110, 110). Player on the left edge: x=258, y=310
        x, y = resolve_obstacle_collision(258, 310, PLAYER_RADIUS)
        dist = math.hypot(x - task_1["x"], y - task_1["y"])
        # With station radius 85, reach threshold is max(85+30, 115) = 115px
        self.assertLessEqual(dist, 85 + 30)

    def test_assign_all_room_tasks(self):
        """Verify all room tasks are assigned to ensure every room is active."""
        self.player.assign_tasks(TASK_STATIONS)
        self.assertEqual(len(self.player.assigned_tasks), len(TASK_STATIONS))
        for station in TASK_STATIONS:
            self.assertIn(station["id"], self.player.assigned_tasks)

    def test_to_dict_serializes_assigned_tasks(self):
        """Verify assigned_tasks are included in snapshot for the local player."""
        self.player.assign_tasks(TASK_STATIONS)
        self.player.completed_tasks.add("task_1")

        self_dict = self.player.to_dict(is_self=True)
        self.assertIn("assigned_tasks", self_dict)
        self.assertEqual(len(self_dict["assigned_tasks"]), len(TASK_STATIONS))
        self.assertIn("task_1", self_dict["assigned_tasks"])
        self.assertIn("task_1", self_dict["completed_tasks"])

        # Other players should not see private assigned_tasks list
        other_dict = self.player.to_dict(is_self=False)
        self.assertEqual(other_dict["assigned_tasks"], [])

    def test_task_progression_in_tick(self):
        """Verify room.tick advances task progress and completes it after station duration."""
        self.room.start_game()
        p = self.room.players["p1"]
        p.role = "crewmate"
        p.current_task = "task_5"  # duration = 2.0s
        p.task_progress = 0.0

        # Advance 1.0 second (not yet done)
        self.room.tick(1.0)
        self.assertAlmostEqual(p.task_progress, 1.0, places=1)
        self.assertNotIn("task_5", p.completed_tasks)
        self.assertEqual(p.current_task, "task_5")

        # Advance another 1.1 seconds (total 2.1s >= 2.0s duration)
        self.room.tick(1.1)
        self.assertIn("task_5", p.completed_tasks)
        self.assertIsNone(p.current_task)
        self.assertEqual(p.task_progress, 0.0)


if __name__ == "__main__":
    unittest.main()
