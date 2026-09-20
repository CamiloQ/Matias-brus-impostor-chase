import unittest
import math
import sys
import os

server_dir = os.path.dirname(os.path.abspath(__file__))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from game_state import GameRoom, Player, CHARACTERS_CATALOG, HATS_CATALOG, WEAPONS_CATALOG, ZombieCat


class TestCharacterAndScavengerAI(unittest.TestCase):
    def setUp(self):
        self.room = GameRoom("TEST_ROOM")

    def test_catalogs_contain_all_character_items(self):
        """All 11 characters in CHARACTERS_CATALOG must have valid hats and weapons in the catalogs with balanced damage"""
        hat_ids = {h["id"] for h in HATS_CATALOG}
        weapon_ids = {w["id"] for w in WEAPONS_CATALOG}
        weapon_map = {w["id"]: w for w in WEAPONS_CATALOG}

        for char in CHARACTERS_CATALOG:
            char_id = char["id"]
            self.assertIn(char["hat"], hat_ids, f"Character {char_id} hat '{char['hat']}' missing from HATS_CATALOG")
            self.assertIn(char["weapon"], weapon_ids, f"Character {char_id} weapon '{char['weapon']}' missing from WEAPONS_CATALOG")

            w_info = weapon_map[char["weapon"]]
            self.assertGreaterEqual(w_info["dmg"], 25, f"Weapon {char['weapon']} damage should be at least 25")
            self.assertLessEqual(w_info["dmg"], 45, f"Weapon {char['weapon']} damage should be balanced <= 45")

    def test_player_reclaim_updates_character(self):
        """When an existing player re-joins or changes character in waiting room, appearance and items update cleanly"""
        p = self.room.add_player("p1", name="Matías", gender="boy", character="matias")
        self.assertEqual(p.character, "matias")
        self.assertEqual(p.hat, "mini_matias")
        self.assertEqual(p.weapon, "racket")

        # Player reclaims session picking duende_verde
        p_reclaimed = self.room.add_player("p1", name="Duende", gender="boy", character="duende_verde")
        self.assertEqual(p_reclaimed.character, "duende_verde")
        self.assertEqual(p_reclaimed.color["hex"], "#22c55e")
        self.assertEqual(p_reclaimed.hat, "leprechaun_gold")
        self.assertEqual(p_reclaimed.weapon, "gold_pot")

        # Player reclaims session picking reina_flor (female)
        p_reclaimed2 = self.room.add_player("p1", name="Reina", gender="girl", character="reina_flor")
        self.assertEqual(p_reclaimed2.character, "reina_flor")
        self.assertEqual(p_reclaimed2.gender, "girl")
        self.assertEqual(p_reclaimed2.color["hex"], "#f472b6")
        self.assertEqual(p_reclaimed2.hat, "crown_flower")
        self.assertEqual(p_reclaimed2.weapon, "magic_flower")

    def test_update_customization_with_character(self):
        """Calling update_customization with a character parameter switches the character identity"""
        p = self.room.add_player("p2", name="Astronauta", gender="boy", character="matias")
        self.room.update_customization("p2", hat_id="cyclops_eye", skin_id="cyber_suit", weapon_id="crystal_orb", gender="boy", character="ciclope_astral")

        self.assertEqual(p.character, "ciclope_astral")
        self.assertEqual(p.hat, "cyclops_eye")
        self.assertEqual(p.weapon, "crystal_orb")
        self.assertEqual(p.skin, "cyber_suit")

    def test_dead_body_contains_character_and_gender(self):
        """Downed body stores the victim's chosen character and gender for accurate HUD rendering"""
        p = self.room.add_player("p3", name="Niña Blanca", gender="girl", character="nina_blanca")
        body = self.room.create_dead_body(p)

        self.assertEqual(body["character"], "nina_blanca")
        self.assertEqual(body["gender"], "girl")
        self.assertEqual(body["hat"], "butterfly_bow")
        self.assertEqual(body["victim_name"], "Niña Blanca")

    def test_scavenger_cat_ignores_corpse_outside_sensory_range(self):
        """Zombie cats further than 650px must NOT activate on a corpse, avoiding map-wide chaotic stampedes"""
        p = self.room.add_player("victim", name="Victim", gender="boy", character="matias")
        p.x, p.y = 2200.0, 1500.0
        body = self.room.create_dead_body(p)

        # Cat located across the station (Reactor area at 200, 200 - dist ~2385px)
        cat = ZombieCat("cat_far", 200.0, 200.0)
        dist = math.hypot(cat.x - body["x"], cat.y - body["y"])
        self.assertGreater(dist, 650.0)

        cat.tick_swarm(0.1, self.room.dead_bodies, self.room.carnivorous_plants, self.room.players, self.room)
        self.assertEqual(cat.state, "roaming")
        self.assertIsNone(cat.target_body_id)
        self.assertIsNone(body.get("targeted_by_cat_id"))

    def test_scavenger_cat_activates_within_sensory_range_and_reserves_body(self):
        """Cat within 650px senses the corpse and reserves it, preventing other distant cats from dogpiling"""
        p = self.room.add_player("victim2", name="Victim2", gender="boy", character="matias")
        p.x, p.y = 500.0, 500.0
        body = self.room.create_dead_body(p)

        cat_near = ZombieCat("cat_near", 580.0, 500.0) # dist 80px <= 650px
        cat_second = ZombieCat("cat_second", 850.0, 500.0) # dist 350px <= 650px

        # Near cat detects and targets
        cat_near.tick_swarm(0.1, self.room.dead_bodies, self.room.carnivorous_plants, self.room.players, self.room)
        self.assertEqual(cat_near.state, "seeking_body")
        self.assertEqual(cat_near.target_body_id, body["id"])
        self.assertEqual(body.get("targeted_by_cat_id"), cat_near.id)

        # Second cat runs tick: body is already reserved by cat_near, so cat_second ignores it
        cat_second.tick_swarm(0.1, self.room.dead_bodies, self.room.carnivorous_plants, self.room.players, self.room)
        self.assertEqual(cat_second.state, "roaming")
        self.assertIsNone(cat_second.target_body_id)

    def test_scavenger_cat_attacks_reviving_crewmate(self):
        """If an alive crewmate is actively reviving or assisting near the body (<70px), approaching cat attacks the rescuer"""
        victim = self.room.add_player("victim3", name="Victim3", gender="boy", character="matias")
        victim.x, victim.y = 500.0, 500.0
        body = self.room.create_dead_body(victim)

        rescuer = self.room.add_player("rescuer", name="Rescuer", gender="boy", character="sanador_naranja")
        rescuer.x, rescuer.y = 525.0, 500.0 # 25px from body (within 70px revive range)

        cat = ZombieCat("cat_ambush", 620.0, 500.0) # 120px from body (within 180px defensive detection range)

        cat.tick_swarm(0.1, self.room.dead_bodies, self.room.carnivorous_plants, self.room.players, self.room)
        # Cat should detect rescuer and switch to aggro mode instead of mindlessly vacuuming body
        self.assertEqual(cat.state, "aggro")
        self.assertEqual(cat.target_player_id, rescuer.id)
        self.assertIsNone(body.get("targeted_by_cat_id"))

    def test_scavenger_cat_releases_reservation_on_damage(self):
        """When a scavenger cat is hit while hauling or seeking a body, all reservations are released"""
        p = self.room.add_player("victim4", name="Victim4", gender="boy", character="matias")
        p.x, p.y = 500.0, 500.0
        body = self.room.create_dead_body(p)

        cat = ZombieCat("cat_hit", 520.0, 500.0)
        cat.target_body_id = body["id"]
        body["targeted_by_cat_id"] = cat.id
        body["carrier_cat_id"] = cat.id
        cat.hauling_body_id = body["id"]

        cat.take_hit_and_drop_body(self.room.dead_bodies, attacker_id="rescuer")
        self.assertIsNone(body.get("targeted_by_cat_id"))
        self.assertIsNone(body.get("carrier_cat_id"))
        self.assertIsNone(cat.hauling_body_id)
        self.assertIsNone(cat.target_body_id)
        self.assertEqual(cat.state, "aggro")
        self.assertEqual(cat.target_player_id, "rescuer")


if __name__ == "__main__":
    unittest.main()
