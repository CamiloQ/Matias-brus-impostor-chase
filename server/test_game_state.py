import pytest
from game_state import GameRoom, Player, ZombieCat, TASK_STATIONS, PLAYER_RADIUS

@pytest.fixture
def room():
    return GameRoom("TEST_ROOM")

def test_add_player(room):
    room.add_player("player1", "test_name", "boy", "matias")
    assert "player1" in room.players
    assert room.players["player1"].name == "test_name"

def test_remove_player(room):
    room.add_player("player1", "test_name", "boy", "matias")
    room.remove_player("player1")
    assert "player1" not in room.players

def test_start_game(room):
    for i in range(5):
        room.add_player(f"player{i}", f"test{i}", "boy", "matias")
    
    room.start_game()
    
    impostors = sum(1 for p in room.players.values() if p.role == "impostor")
    crewmates = sum(1 for p in room.players.values() if p.role == "crewmate")
    
    assert impostors == 1
    assert crewmates == 4

def test_movement(room):
    room.add_player("player1", "test_name", "boy", "matias")
    room.start_game()
    player = room.players["player1"]
    
    # Place player at a valid open area (away from tables)
    start_x, start_y = 650.0, 650.0
    player.x = start_x
    player.y = start_y
    player.vx = 100
    player.vy = 0
    
    # Tick simulates the movement
    room.tick(0.1)
    
    # Player should move to the right
    assert player.x > start_x
    assert player.y == start_y

def test_try_kill(room):
    room.add_player("imp", "impostor_name", "boy", "matias")
    room.add_player("crew", "crewmate_name", "boy", "matias")
    room.start_game()
    
    imp = room.players["imp"]
    crew = room.players["crew"]
    
    # Force roles for test
    imp.role = "impostor"
    crew.role = "crewmate"
    imp.kill_cooldown = 0
    
    # Place them close to each other
    imp.x, imp.y = 100, 100
    crew.x, crew.y = 110, 110
    
    success, msg = room.try_kill("imp", "crew")
    assert success is True
    assert crew.alive is False

def test_stealth_mechanic(room):
    room.add_player("stealthy", "ghost", "boy", "fantasma")
    room.start_game()
    p = room.players["stealthy"]
    
    # Place player in a vent to simulate stealth logic (or verify the speed stealth calculation if possible)
    # The game defines `is_in_stealth_zone(x, y)` but without modifying map constants directly we simulate entering stealth via vent
    p.in_vent = True
    room.tick(0.1)
    
    # Assert they are effectively hidden or have related flags
    assert p.in_stealth is False # Explicitly set to false when in vent in game logic, but the vent logic itself provides hiding
    
    # Let's test the actual in_stealth field behavior for a player moving slowly
    # We need a coordinate inside the stealth zone (x < 1300, y > 1200) for testing stealth
    p.in_vent = False
    p.x, p.y = 1560, 860 
    p.vx, p.vy = 10, 10 # Speed < 25
    room.tick(0.1)
    
    assert p.in_stealth is True

def test_clone_mechanic(room):
    room.add_player("player1", "test_name", "boy", "matias")
    room.start_game()
    p = room.players["player1"]
    p.x, p.y = 100, 100
    
    # Add a fake armed light orb at the player's position
    from game_state import LightOrb
    orb = LightOrb("orb1", 100, 100)
    orb.armed = True
    room.light_orbs.append(orb)
    
    room.tick(0.1)
    
    assert orb.active is False
    assert len(room.clone_impostors) == 1
    
    clone = room.clone_impostors[0]
    assert clone.role == "impostor"
    assert clone.is_clone is True
    assert clone.original_id == "player1"
