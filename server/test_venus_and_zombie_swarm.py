import unittest
import sys
import os
import time

server_dir = os.path.dirname(os.path.abspath(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from game_state import GameRoom, CarnivorousPlant, ZombieCat, SkeletonCat, Player


class TestVenusAndZombieSwarm(unittest.TestCase):
    def setUp(self):
        self.room = GameRoom("TEST_SWARM_ROOM")

    def test_initial_maceta_venus_plants(self):
        # Must have at least 4 strategic maceta plants placed initially
        self.assertGreaterEqual(len(self.room.carnivorous_plants), 4)
        for plant in self.room.carnivorous_plants:
            self.assertTrue(getattr(plant, "is_pot", False))
            self.assertEqual(plant.state, "idle")
            self.assertEqual(plant.digestion_timer, 0.0)

    def test_venus_digestion_cycle_25_seconds(self):
        plant = CarnivorousPlant("test_plant", 1000.0, 1000.0, is_pot=True)
        body = {
            "id": "body_123",
            "victim_id": "p_victim",
            "victim_name": "Victim",
            "x": 1000.0,
            "y": 1000.0,
            "revive_timer": 15.0,
            "carrier_cat_id": None,
            "is_trapped_in_plant": False
        }
        self.room.dead_bodies = [body]
        
        # Deliver to plant
        plant.trap_body(body)
        self.assertEqual(plant.state, "digesting")
        self.assertEqual(plant.digestion_timer, 25.0)
        self.assertTrue(body["is_trapped_in_plant"])
        self.assertEqual(body["plant_id"], "test_plant")

        # Tick 10 seconds: still digesting, body still in list
        plant.tick(10.0, self.room.dead_bodies)
        self.assertEqual(plant.state, "digesting")
        self.assertAlmostEqual(plant.digestion_timer, 15.0, places=1)
        self.assertIn(body, self.room.dead_bodies)

        # Tick remaining 15.5 seconds: digestion completes, body removed, fed_count increases
        plant.tick(15.5, self.room.dead_bodies)
        self.assertEqual(plant.state, "idle")
        self.assertEqual(plant.fed_count, 1)
        self.assertNotIn(body, self.room.dead_bodies)

    def test_skeleton_cat_metamorphosis_on_death(self):
        self.room.state = "PLAYING"
        # Attacker player
        attacker = self.room.add_player("p_attacker", "Matias")
        initial_plants_count = len(self.room.carnivorous_plants)

        # Add a skeleton cat next to attacker
        skel = SkeletonCat("skel_test", attacker.x + 10, attacker.y + 10)
        self.room.skeleton_cats = [skel]

        # First hit: drops to 1 hp
        success, msg, hit = self.room.try_punch(attacker)
        self.assertTrue(success)
        self.assertEqual(skel.hp, 1)
        self.assertTrue(skel.alive)
        self.assertEqual(len(self.room.carnivorous_plants), initial_plants_count)

        # Reset punch cooldown
        attacker.punch_cooldown = 0.0

        # Second hit: dies and spawns new CarnivorousPlant at its location
        success, msg, hit = self.room.try_punch(attacker)
        self.assertTrue(success)
        self.assertEqual(skel.hp, 0)
        self.assertFalse(skel.alive)
        self.assertEqual(len(self.room.carnivorous_plants), initial_plants_count + 1)
        new_plant = self.room.carnivorous_plants[-1]
        self.assertEqual(new_plant.x, skel.x)
        self.assertEqual(new_plant.y, skel.y)

    def test_zombie_cat_swarm_hauls_body_to_venus(self):
        cat = self.room.zombie_cats[0]
        cat.x, cat.y = 500.0, 500.0
        cat.hauling_body_id = None
        cat.target_body_id = None

        body = {
            "id": "body_target",
            "victim_id": "p_vic",
            "victim_name": "PoorGuy",
            "x": 510.0,
            "y": 510.0,
            "revive_timer": 20.0,
            "carrier_cat_id": None,
            "is_trapped_in_plant": False
        }
        self.room.dead_bodies = [body]
        
        # Place a plant nearby at 580, 500
        test_plant = CarnivorousPlant("target_plant", 580.0, 500.0, is_pot=True)
        self.room.carnivorous_plants = [test_plant]

        # Tick cat: it is close to body (<28px), so it should latch and haul
        cat.tick_swarm(0.1, self.room.dead_bodies, self.room.carnivorous_plants)
        self.assertEqual(cat.hauling_body_id, "body_target")
        self.assertEqual(body["carrier_cat_id"], cat.id)

        # Hit cat: drops body
        cat.take_hit_and_drop_body(self.room.dead_bodies)
        self.assertIsNone(cat.hauling_body_id)
        self.assertIsNone(body["carrier_cat_id"])
        self.assertEqual(cat.state, "stunned")
        self.assertGreater(cat.stun_timer, 0.0)

    def test_downed_player_revive_20s_and_proximity_boost(self):
        victim = self.room.add_player("p_vic", "Victim")
        victim.alive = False
        victim.hp = 0

        # Helper crewmate standing close to the body
        helper = self.room.add_player("p_helper", "Helper")
        helper.role = "crewmate"
        helper.alive = True
        helper.x, helper.y = 1000.0, 1000.0

        body = {
            "id": "body_vic",
            "victim_id": victim.id,
            "victim_name": victim.name,
            "x": 1010.0,
            "y": 1010.0,
            "revive_timer": 20.0,
            "carrier_cat_id": None,
            "is_trapped_in_plant": False
        }
        self.room.dead_bodies = [body]
        self.room.state = "PLAYING"

        # Tick 2 seconds with helper nearby: should drop faster than 2.0s due to proximity boost
        self.room.tick_dead_bodies(2.0)
        # 2.0s with 3x rate means elapsed ~ 6.0s, so revive_timer <= 15.0
        self.assertLess(body["revive_timer"], 16.0)

        # Directly tick to 0: victim should revive
        self.room.tick_dead_bodies(body["revive_timer"] + 0.1)
        self.assertTrue(victim.alive)
        self.assertGreater(victim.hp, 0)
        self.assertEqual(len(self.room.dead_bodies), 0)

    def test_zombie_cat_releases_body_if_no_idle_plant_or_trap_fails(self):
        cat = self.room.zombie_cats[0]
        cat.x, cat.y = 500.0, 500.0
        cat.hauling_body_id = "body_edge"
        cat.state = "hauling_body"

        body = {
            "id": "body_edge",
            "victim_name": "VictimEdge",
            "x": 490.0,
            "y": 490.0,
            "revive_timer": 15.0,
            "carrier_cat_id": cat.id,
            "is_trapped_in_plant": False
        }
        self.room.dead_bodies = [body]

        # Case 1: All plants are currently digesting (no idle plants available)
        digesting_plant = CarnivorousPlant("busy_plant", 520.0, 500.0, is_pot=True)
        digesting_plant.state = "digesting"
        digesting_plant.digestion_timer = 20.0
        self.room.carnivorous_plants = [digesting_plant]

        cat.tick_swarm(0.1, self.room.dead_bodies, self.room.carnivorous_plants)
        # Should gracefully release the body lock
        self.assertIsNone(body["carrier_cat_id"])
        self.assertIsNone(cat.hauling_body_id)
        self.assertEqual(cat.state, "roaming")



if __name__ == "__main__":
    unittest.main()
