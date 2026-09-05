import time
import math
import random
import uuid

# Map Dimensions
MAP_WIDTH = 2800
MAP_HEIGHT = 2100
PLAYER_RADIUS = 24
PLAYER_SPEED = 280
IMPOSTOR_SPEED = 320
KILL_RANGE = 75
ATTACK_RANGE = 70
KILL_COOLDOWN = 16.0

# Predefined map layout based on the design concepts:
# Cafetería con mesas de comida, Sala de Habitación con camas y vestidor,
# Sala de Música y Escenario, Reactor, Electricidad, Navegación y Pasillos.
MAP_OBSTACLES = [
    # Reactor (Top Left)
    {"x": 100, "y": 100, "w": 450, "h": 20, "type": "wall"},
    {"x": 100, "y": 100, "w": 20, "h": 400, "type": "wall"},
    {"x": 100, "y": 500, "w": 220, "h": 20, "type": "wall"},
    {"x": 420, "y": 500, "w": 130, "h": 20, "type": "wall"},
    {"x": 550, "y": 100, "w": 20, "h": 420, "type": "wall"},
    {"x": 280, "y": 260, "w": 110, "h": 110, "type": "generator"},

    # Cafetería de Comida Central (Matias & Brus Hub)
    {"x": 850, "y": 350, "w": 1000, "h": 20, "type": "wall"},
    {"x": 850, "y": 1050, "w": 1000, "h": 20, "type": "wall"},
    {"x": 850, "y": 350, "w": 20, "h": 220, "type": "wall"},
    {"x": 850, "y": 800, "w": 20, "h": 270, "type": "wall"},
    {"x": 1850, "y": 350, "w": 20, "h": 220, "type": "wall"},
    {"x": 1850, "y": 800, "w": 20, "h": 270, "type": "wall"},
    {"x": 1270, "y": 620, "w": 160, "h": 160, "type": "meeting_table"}, # Mesa redonda de reuniones con boton de emergencia
    {"x": 980, "y": 450, "w": 150, "h": 70, "type": "buffet"},   # Barra de comida / buffet caliente
    {"x": 1570, "y": 450, "w": 150, "h": 70, "type": "buffet"},  # Barra de bebidas y refrescos
    {"x": 1180, "y": 380, "w": 70, "h": 65, "type": "fridge"},   # Nevera de cafeteria con comida
    {"x": 1730, "y": 380, "w": 70, "h": 55, "type": "microwave"},# Alacena con microondas
    {"x": 1000, "y": 880, "w": 130, "h": 65, "type": "table"},   # Mesa de comensales 1
    {"x": 1570, "y": 880, "w": 130, "h": 65, "type": "table"},   # Mesa de comensales 2

    # Sala de Habitación / Dormitorios (Top Right)
    {"x": 2050, "y": 100, "w": 650, "h": 20, "type": "wall"},
    {"x": 2050, "y": 100, "w": 20, "h": 180, "type": "wall"},   # Pared oeste norte (puerta de 160px de 280 a 440)
    {"x": 2050, "y": 440, "w": 20, "h": 160, "type": "wall"},   # Pared oeste sur
    {"x": 2050, "y": 600, "w": 230, "h": 20, "type": "wall"},   # Pared sur oeste (puerta de 160px de 2280 a 2440)
    {"x": 2440, "y": 600, "w": 260, "h": 20, "type": "wall"},   # Pared sur este
    {"x": 2700, "y": 100, "w": 20, "h": 520, "type": "wall"},
    {"x": 1930, "y": 180, "w": 60, "h": 60, "type": "washer"},   # Lavadora automática con tambor
    {"x": 2150, "y": 180, "w": 110, "h": 70, "type": "bed"},      # Cama Matias
    {"x": 2350, "y": 180, "w": 110, "h": 70, "type": "bed"},      # Cama Brus
    {"x": 2540, "y": 180, "w": 110, "h": 70, "type": "bed"},      # Cama Invitado
    {"x": 2300, "y": 460, "w": 160, "h": 60, "type": "wardrobe"}, # Armario de Trajes y Sombreros

    # Electricidad (Lower Left)
    {"x": 150, "y": 1000, "w": 500, "h": 20, "type": "wall"},
    {"x": 150, "y": 1000, "w": 20, "h": 450, "type": "wall"},
    {"x": 150, "y": 1450, "w": 500, "h": 20, "type": "wall"},
    {"x": 650, "y": 1000, "w": 20, "h": 220, "type": "wall"},
    {"x": 350, "y": 1180, "w": 130, "h": 90, "type": "switchboard"},

    # Navegación y Control (Right)
    {"x": 2050, "y": 800, "w": 650, "h": 20, "type": "wall"},
    {"x": 2050, "y": 1400, "w": 650, "h": 20, "type": "wall"},
    {"x": 2700, "y": 800, "w": 20, "h": 620, "type": "wall"},
    {"x": 2050, "y": 800, "w": 20, "h": 220, "type": "wall"},
    {"x": 2050, "y": 1200, "w": 20, "h": 220, "type": "wall"},

    # Sala de Música, Baile y Peleas (Escenario Central Inferior)
    {"x": 1000, "y": 1350, "w": 750, "h": 20, "type": "wall"},
    {"x": 1000, "y": 1350, "w": 20, "h": 500, "type": "wall"},
    {"x": 1750, "y": 1350, "w": 20, "h": 500, "type": "wall"},
    {"x": 1000, "y": 1850, "w": 300, "h": 20, "type": "wall"},
    {"x": 1450, "y": 1850, "w": 320, "h": 20, "type": "wall"},
    {"x": 1280, "y": 1550, "w": 180, "h": 100, "type": "stage"} # Escenario de Baile y Batalla Musical
]

# Task Stations
TASK_STATIONS = [
    {"id": "task_1", "name": "Alinear Generador Reactor", "x": 330, "y": 310, "room": "Reactor", "radius": 50, "duration": 3.0},
    {"id": "task_2", "name": "Preparar Huevos en Sartén", "x": 1050, "y": 490, "room": "Cafetería", "radius": 50, "duration": 2.5},
    {"id": "task_3", "name": "Servir Refrescos Espaciales", "x": 1650, "y": 490, "room": "Cafetería", "radius": 50, "duration": 2.5},
    {"id": "task_4", "name": "Tender Camas en Habitación", "x": 2200, "y": 210, "room": "Habitación", "radius": 50, "duration": 2.5},
    {"id": "task_5", "name": "Cambiar Trajes en Armario", "x": 2380, "y": 490, "room": "Habitación", "radius": 50, "duration": 2.0},
    {"id": "task_6", "name": "Reparar Fusibles de Luz", "x": 410, "y": 1220, "room": "Electricidad", "radius": 50, "duration": 3.0},
    {"id": "task_7", "name": "Trazar Rumbo de Navegación", "x": 2380, "y": 920, "room": "Navegación", "radius": 50, "duration": 3.5},
    {"id": "task_8", "name": "Batalla de Canción en Escenario", "x": 1370, "y": 1600, "room": "Sala de Música", "radius": 60, "duration": 4.0}
]

WARDROBE_STATION = {"x": 2380, "y": 490, "radius": 60}
FOOD_BUFFET = {"x": 1050, "y": 480, "radius": 65}
EMERGENCY_BUTTON = {"x": 1350, "y": 700, "radius": 55}

VENTS = [
    {"id": "vent_1", "x": 480, "y": 160, "connected_to": "vent_2", "room": "Reactor"},
    {"id": "vent_2", "x": 580, "y": 1060, "connected_to": "vent_1", "room": "Electricidad"},
    {"id": "vent_3", "x": 920, "y": 420, "connected_to": "vent_4", "room": "Cafetería"},
    {"id": "vent_4", "x": 2120, "y": 880, "connected_to": "vent_3", "room": "Navegación"},
    {"id": "vent_5", "x": 2120, "y": 160, "connected_to": "vent_6", "room": "Habitación"},
    {"id": "vent_6", "x": 1080, "y": 1420, "connected_to": "vent_5", "room": "Sala de Música"}
]

# EXACT HATS FROM MATIAS & BRUS DRAWINGS
HATS_CATALOG = [
    {"id": "none", "name": "Sin Sombrero", "icon": "❌"},
    {"id": "mini_matias", "name": "Mini Matias en la Cabeza", "icon": "👶"},
    {"id": "pan_egg", "name": "Sartén con Huevo Frito", "icon": "🍳"},
    {"id": "party_cone", "name": "Cono de Fiesta Amarillo", "icon": "🥳"},
    {"id": "purple_flower", "name": "Flor / Pluma Morada Elegante", "icon": "🪶"},
    {"id": "alien_antenna", "name": "Antena Alien con Luz Roja", "icon": "📡"},
    {"id": "cat_mask", "name": "Orejas de Gato Negro", "icon": "🐱"},
    {"id": "crown", "name": "Corona Real Dorada", "icon": "👑"},
    {"id": "green_antenna", "name": "Antena Verde Espacial", "icon": "👽"}
]

# EXACT SKINS / OUTFITS
SKINS_CATALOG = [
    {"id": "onesie_tie", "name": "Mameluco Espacial con Corbata", "icon": "👔"},
    {"id": "yrorsio_suit", "name": "Traje Negro Elegante (Estilo Yrorsio)", "icon": "🤵"},
    {"id": "cyber_suit", "name": "Armadura Cyber Neón", "icon": "🤖"},
    {"id": "sport_suit", "name": "Traje Deportivo de Carreras", "icon": "🏃"},
    {"id": "ninja_suit", "name": "Túnica Ninja Sombría", "icon": "🥷"}
]

# WEAPONS FOR BRAWLS
WEAPONS_CATALOG = [
    {"id": "fists", "name": "Puñetazos Limpios", "dmg": 20, "icon": "👊"},
    {"id": "pan", "name": "Sartén con Huevo Frito", "dmg": 35, "icon": "🍳"},
    {"id": "energy_sword", "name": "Espada de Energía Doble", "dmg": 45, "icon": "⚡"}
]

PLAYER_COLORS = [
    {"name": "Amarillo Matias", "hex": "#f1c40f"},
    {"name": "Azul Brus", "hex": "#3498db"},
    {"name": "Verde Guerrero", "hex": "#2ecc71"},
    {"name": "Rosa Elegante", "hex": "#fd79a8"},
    {"name": "Negro Sombra", "hex": "#2d3436"},
    {"name": "Naranja Fuego", "hex": "#e67e22"},
    {"name": "Morado Místico", "hex": "#9b59b6"},
    {"name": "Cian Láser", "hex": "#00d2ff"},
    {"name": "Lima Neón", "hex": "#00b894"},
    {"name": "Blanco Estelar", "hex": "#ecf0f1"}
]

CHARACTERS_CATALOG = [
    {
        "id": "matias",
        "num": 1,
        "name": "Matías",
        "gender": "boy",
        "color": {"name": "Amarillo Matías", "hex": "#f1c40f"},
        "hat": "mini_matias",
        "weapon": "racket",
        "icon": "👦",
        "desc": "Vestido de amarillo 3D, cierre metálico, mini-Matías y tenis blancos"
    },
    {
        "id": "fantasma",
        "num": 2,
        "name": "Fantasma Científico",
        "gender": "boy",
        "color": {"name": "Gris Fantasma", "hex": "#94a3b8"},
        "hat": "microscope_bot",
        "weapon": "microscope",
        "icon": "🔬",
        "desc": "Siempre de gris, tiene un robot/visor y microscopio científico"
    },
    {
        "id": "gato_azul",
        "num": 3,
        "name": "Gato Azul",
        "gender": "boy",
        "color": {"name": "Azul Espacial", "hex": "#3498db"},
        "hat": "cat_mask",
        "weapon": "pan",
        "icon": "🐱",
        "desc": "Vestido azul con sombrero de orejas de gato negro y gatito"
    },
    {
        "id": "reina_flor",
        "num": 4,
        "name": "Reina Flor",
        "gender": "girl",
        "color": {"name": "Rosado Claro", "hex": "#f472b6"},
        "hat": "crown_flower",
        "weapon": "magic_flower",
        "icon": "🌸",
        "desc": "Vestido rosado claro, corona dorada y sombrero de flor púrpura"
    },
    {
        "id": "duende_verde",
        "num": 5,
        "name": "Duende Verde",
        "gender": "boy",
        "color": {"name": "Verde Esmeralda", "hex": "#22c55e"},
        "hat": "leprechaun_gold",
        "weapon": "gold_pot",
        "icon": "🍀",
        "desc": "Vestido verde con sombrero de trébol y moneda de oro brillante"
    },
    {
        "id": "granjero_rojo",
        "num": 6,
        "name": "Granjero Rojo",
        "gender": "boy",
        "color": {"name": "Rojo Escarlata", "hex": "#ef4444"},
        "hat": "straw_hat",
        "weapon": "wheat_fork",
        "icon": "🌾",
        "desc": "Vestido rojo y porta sombrero de paja con espiga dorada"
    },
    {
        "id": "sanador_naranja",
        "num": 7,
        "name": "Sanador Naranja",
        "gender": "boy",
        "color": {"name": "Naranja Sanador", "hex": "#f97316"},
        "hat": "healing_plant",
        "weapon": "herbs_basket",
        "icon": "🌿",
        "desc": "Vestido naranja y porta sombrero de planta sanadora y canasta"
    },
    {
        "id": "nina_blanca",
        "num": 8,
        "name": "Niña Blanca",
        "gender": "girl",
        "color": {"name": "Blanco Puro", "hex": "#f8fafc"},
        "hat": "butterfly_bow",
        "weapon": "star_wand",
        "icon": "🦋",
        "desc": "Niña de blanco, rostro sonriente tierno y sombrero de mariposa"
    },
    {
        "id": "mistico_uva",
        "num": 9,
        "name": "Místico Uva",
        "gender": "boy",
        "color": {"name": "Color Uva", "hex": "#9333ea"},
        "hat": "alien_antennas",
        "weapon": "crystal_wand",
        "icon": "🍇",
        "desc": "Vestido color uva y sombrero de antenas espaciales luminosas"
    },
    {
        "id": "mago_negro",
        "num": 10,
        "name": "Mago Oscuro",
        "gender": "boy",
        "color": {"name": "Negro Mágico", "hex": "#27272a"},
        "hat": "magic_tophat",
        "weapon": "magic_cane",
        "icon": "🎩",
        "desc": "Vestido negro con sombrero de copa alta de mago y conejito"
    },
    {
        "id": "ciclope_astral",
        "num": 11,
        "name": "Cíclope Astral",
        "gender": "boy",
        "color": {"name": "Gris Acero", "hex": "#475569"},
        "hat": "cyclops_eye",
        "weapon": "crystal_orb",
        "icon": "🔮",
        "desc": "Cíclope con ojo amigable, esfera mágica y criatura en la cabeza"
    }
]

def check_circle_rect_collision(cx, cy, radius, rx, ry, rw, rh):
    closest_x = max(rx, min(cx, rx + rw))
    closest_y = max(ry, min(cy, ry + rh))
    dx = cx - closest_x
    dy = cy - closest_y
    return (dx * dx + dy * dy) < (radius * radius)

def resolve_obstacle_collision(x, y, radius):
    x = max(radius + 10, min(x, MAP_WIDTH - radius - 10))
    y = max(radius + 10, min(y, MAP_HEIGHT - radius - 10))

    for obs in MAP_OBSTACLES:
        rx, ry, rw, rh = obs["x"], obs["y"], obs["w"], obs["h"]
        if check_circle_rect_collision(x, y, radius, rx, ry, rw, rh):
            closest_x = max(rx, min(x, rx + rw))
            closest_y = max(ry, min(y, ry + rh))
            dx = x - closest_x
            dy = y - closest_y
            dist = math.hypot(dx, dy)
            if dist < 0.001:
                overlap_left = x - rx
                overlap_right = (rx + rw) - x
                overlap_top = y - ry
                overlap_bottom = (ry + rh) - y
                min_overlap = min(overlap_left, overlap_right, overlap_top, overlap_bottom)
                if min_overlap == overlap_left:
                    x = rx - radius
                elif min_overlap == overlap_right:
                    x = rx + rw + radius
                elif min_overlap == overlap_top:
                    y = ry - radius
                else:
                    y = ry + rh + radius
            else:
                push = (radius - dist)
                x += (dx / dist) * push
                y += (dy / dist) * push
    return x, y


class CollectibleItem:
    """Collectibles drawn in design 4: Yellow Star, Golden Coin, Blue Crystal"""
    def __init__(self, item_id, item_type, x, y):
        self.id = item_id
        self.type = item_type  # 'star', 'coin', 'crystal'
        self.x = x
        self.y = y
        self.radius = 16
        self.collected = False

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "x": round(self.x, 1),
            "y": round(self.y, 1)
        }


class ZombieCat:
    """Child-sized Zombie Cat that roams the station"""
    def __init__(self, cat_id, x, y):
        self.id = cat_id
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = 0.0
        self.hp = 90
        self.max_hp = 90
        self.alive = True
        self.speed = 150
        self.change_dir_timer = random.uniform(1.0, 3.0)
        self.radius = 18
        self.respawn_timer = 0.0

    def tick(self, dt):
        if not self.alive:
            self.respawn_timer -= dt
            if self.respawn_timer <= 0:
                self.alive = True
                self.hp = self.max_hp
            return

        self.change_dir_timer -= dt
        if self.change_dir_timer <= 0:
            angle = random.uniform(0, math.pi * 2)
            self.vx = math.cos(angle) * self.speed
            self.vy = math.sin(angle) * self.speed
            self.change_dir_timer = random.uniform(2.0, 4.5)

        new_x = self.x + self.vx * dt
        new_y = self.y + self.vy * dt
        self.x, self.y = resolve_obstacle_collision(new_x, new_y, self.radius)

    def to_dict(self):
        return {
            "id": self.id,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "hp": self.hp,
            "max_hp": self.max_hp,
            "alive": self.alive
        }


class LightOrb:
    """Floating magic clone orb dropped when a zombie cat dies; shoots out with random impulse and slows down by friction"""
    def __init__(self, orb_id, x, y, vx=0.0, vy=0.0):
        self.id = orb_id
        self.x = float(x)
        self.y = float(y)
        self.vx = float(vx)
        self.vy = float(vy)
        self.radius = 24
        self.lifetime = 30.0
        self.arm_timer = 1.0  # 1.0s grace arming period
        self.armed = False
        self.active = True

    def tick(self, dt):
        if self.arm_timer > 0:
            self.arm_timer -= dt
            if self.arm_timer <= 0:
                self.armed = True
        self.lifetime -= dt
        if self.lifetime <= 0:
            self.active = False
            return

        # Physical displacement and friction deceleration
        if abs(self.vx) > 1.0 or abs(self.vy) > 1.0:
            self.x += self.vx * dt
            self.y += self.vy * dt
            friction = max(0.0, 1.0 - 3.8 * dt)
            self.vx *= friction
            self.vy *= friction

        # Keep orb inside map boundary
        self.x = max(60.0, min(float(MAP_WIDTH - 60), self.x))
        self.y = max(60.0, min(float(MAP_HEIGHT - 60), self.y))

    def to_dict(self):
        return {
            "id": self.id,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "radius": self.radius,
            "lifetime": round(self.lifetime, 1),
            "armed": self.armed,
            "arm_timer": round(max(0, self.arm_timer), 2)
        }


class InvisibilityButton:
    """Secret magic button dropped by a ghost; grants 8s invisibility when picked up"""
    def __init__(self, button_id, x, y, spawned_by):
        self.id = button_id
        self.x = x
        self.y = y
        self.spawned_by = spawned_by
        self.radius = 22
        self.active = True
        self.lifetime = 45.0

    def tick(self, dt):
        self.lifetime -= dt
        if self.lifetime <= 0:
            self.active = False

    def to_dict(self):
        return {
            "id": self.id,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "radius": self.radius,
            "active": self.active,
            "lifetime": round(self.lifetime, 1)
        }


class CloneImpostor:
    """Evil impostor clone generated when a player touches the light orb"""
    def __init__(self, clone_id, creator_player):
        self.id = clone_id
        self.name = f"{creator_player.name} (CLON)"
        self.gender = getattr(creator_player, 'gender', 'boy')
        self.character = getattr(creator_player, 'character', 'matias')
        self.color = creator_player.color
        self.hat = creator_player.hat
        self.skin = creator_player.skin
        self.weapon = creator_player.weapon
        self.x = creator_player.x + random.uniform(40, 60)
        self.y = creator_player.y + random.uniform(40, 60)
        self.vx = 0.0
        self.vy = 0.0
        self.hp = 120
        self.max_hp = 120
        self.alive = True
        self.role = "impostor"
        self.is_clone = True
        self.original_id = creator_player.id
        self.speed = 230
        self.attack_cd = 2.0
        self.radius = PLAYER_RADIUS

    def tick(self, dt, target_players):
        if not self.alive:
            return

        self.attack_cd = max(0.0, self.attack_cd - dt)

        closest_target = None
        closest_dist = 650

        for p in target_players:
            if p.alive and not getattr(p, 'is_clone', False) and p.id != self.id:
                dist = math.hypot(self.x - p.x, self.y - p.y)
                if dist < closest_dist:
                    closest_dist = dist
                    closest_target = p

        if closest_target:
            dx = closest_target.x - self.x
            dy = closest_target.y - self.y
            dist = math.hypot(dx, dy)
            if dist > 38:
                self.vx = (dx / dist) * self.speed
                self.vy = (dy / dist) * self.speed
            else:
                self.vx = 0
                self.vy = 0
                if self.attack_cd <= 0:
                    self.attack_cd = 2.2
                    closest_target.hp = max(0, closest_target.hp - 25)
                    if closest_target.hp <= 0:
                        closest_target.alive = False
        else:
            self.vx = 0
            self.vy = 0

        new_x = self.x + self.vx * dt
        new_y = self.y + self.vy * dt
        self.x, self.y = resolve_obstacle_collision(new_x, new_y, self.radius)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "gender": getattr(self, "gender", "boy"),
            "character": getattr(self, "character", "matias"),
            "color": self.color,
            "hat": self.hat,
            "skin": self.skin,
            "weapon": self.weapon,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "vx": round(self.vx, 2),
            "vy": round(self.vy, 2),
            "hp": self.hp,
            "max_hp": self.max_hp,
            "role": "impostor",
            "alive": self.alive,
            "is_clone": True
        }


class Player:
    def __init__(self, player_id, name, color_idx, gender="boy", character="matias"):
        self.id = player_id
        
        # Match character with CHARACTERS_CATALOG
        char_info = next((c for c in CHARACTERS_CATALOG if c["id"] == str(character).lower()), None)
        if not char_info:
            char_info = CHARACTERS_CATALOG[color_idx % len(CHARACTERS_CATALOG)]
        
        self.character = char_info["id"]
        self.character_num = char_info["num"]
        self.name = name or char_info["name"]
        self.gender = gender if gender in ("boy", "girl") else char_info["gender"]
        self.color = char_info["color"]
        self.hat = char_info["hat"]
        self.weapon = char_info["weapon"]
        self.skin = "onesie_tie"
        angle = (color_idx * (2.0 * math.pi / 10.0)) + random.uniform(-0.1, 0.1)
        self.x = 1350.0 + math.cos(angle) * 160.0
        self.y = 700.0 + math.sin(angle) * 160.0
        self.target_x = self.x
        self.target_y = self.y
        self.vx = 0.0
        self.vy = 0.0
        self.hp = 100
        self.max_hp = 100
        self.stamina = 100
        self.score = 0
        self.stars_collected = 0
        self.role = "crewmate"  # 'crewmate' or 'impostor'
        self.alive = True
        self.ready = False
        self.kill_cooldown = KILL_COOLDOWN
        self.punch_cooldown = 0.0
        self.current_task = None
        self.task_progress = 0.0
        self.completed_tasks = set()
        self.assigned_tasks = []
        self.in_vent = None
        self.kills = 0
        self.ping = 0
        self.is_clone = False
        # Impostor Shapeshift / Disguise
        self.disguise = None
        self.disguise_timer = 0.0
        # Ghost Invisibility Button effect
        self.invis_timer = 0.0
        self.ghost_button_cooldown = 0.0

    def assign_tasks(self, task_pool):
        self.assigned_tasks = random.sample([t["id"] for t in task_pool], min(4, len(task_pool)))
        self.completed_tasks = set()

    def to_dict(self, viewer_role=None, is_self=False):
        visible_role = self.role if (is_self or viewer_role == "impostor" or viewer_role == "ghost") else "crewmate"
        is_disguised = bool(self.disguise and self.disguise_timer > 0)
        show_disguise = is_disguised and not is_self and viewer_role != "impostor"

        display_name = self.disguise["name"] if show_disguise else self.name
        display_char = self.disguise["character"] if show_disguise else self.character
        display_gender = self.disguise["gender"] if show_disguise else self.gender
        display_color = self.disguise["color"] if show_disguise else self.color
        display_hat = self.disguise["hat"] if show_disguise else self.hat
        display_skin = self.disguise["skin"] if show_disguise else self.skin

        return {
            "id": self.id,
            "name": display_name,
            "real_name": self.name if (is_self or viewer_role == "impostor") else None,
            "gender": display_gender,
            "character": display_char,
            "color": display_color,
            "hat": display_hat,
            "skin": display_skin,
            "weapon": self.weapon,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "vx": round(self.vx, 2),
            "vy": round(self.vy, 2),
            "hp": self.hp,
            "max_hp": self.max_hp,
            "stamina": self.stamina,
            "score": self.score,
            "role": visible_role if not self.alive else (visible_role if is_self or viewer_role == "impostor" else "unknown"),
            "alive": self.alive,
            "ready": self.ready,
            "kill_cd": round(max(0, self.kill_cooldown), 1) if (is_self and self.role == "impostor") else 0,
            "in_vent": bool(self.in_vent),
            "vent_id": self.in_vent,
            "is_invisible": self.invis_timer > 0,
            "invis_time_left": round(max(0, self.invis_timer), 1),
            "is_disguised": is_disguised,
            "disguise_timer": round(max(0, self.disguise_timer), 1),
            "ghost_button_cd": round(max(0, self.ghost_button_cooldown), 1),
            "completed_tasks_count": len(self.completed_tasks),
            "completed_tasks": list(self.completed_tasks) if is_self else [],
            "total_tasks_count": len(self.assigned_tasks),
            "kills": self.kills,
            "ping": self.ping,
            "is_clone": False
        }


class GameRoom:
    def __init__(self, room_id):
        self.id = room_id
        self.players = {}
        self.zombie_cats = []
        self.light_orbs = []
        self.clone_impostors = []
        self.collectibles = []
        self.invis_buttons = []
        self.state = "LOBBY"
        self.state_timer = 0.0
        self.winner = None
        self.dead_bodies = []
        self.meeting = {
            "caller": None,
            "reason": None,
            "votes": {},
            "timer": 0.0,
            "result": None
        }
        self.created_at = time.time()
        self.last_tick = time.time()
        self.episode = 1
        self.max_episodes = 9
        self.init_world_entities()

    def init_world_entities(self):
        self.invis_buttons = []
        self.zombie_cats = [
            ZombieCat("cat_1", 350, 350),      # Reactor Norte
            ZombieCat("cat_2", 420, 1250),     # Electricidad
            ZombieCat("cat_3", 2250, 950),     # Navegación Superior
            ZombieCat("cat_4", 1400, 1650),    # Sala de Música
            ZombieCat("cat_5", 2150, 480),     # Habitación Oeste
            ZombieCat("cat_6", 2480, 320),     # Habitación Este
            ZombieCat("cat_7", 1020, 720),     # Cafetería Oeste
            ZombieCat("cat_8", 1680, 720),     # Cafetería Este
            ZombieCat("cat_9", 680, 500),      # Pasillo Reactor-Cafetería
            ZombieCat("cat_10", 1950, 720),    # Pasillo Cafetería-Navegación
            ZombieCat("cat_11", 520, 920),     # Pasillo Electricidad Superior
            ZombieCat("cat_12", 2350, 1250)    # Navegación Sur
        ]
        self.collectibles = [
            CollectibleItem("star_1", "star", 1350, 450),
            CollectibleItem("star_2", "star", 330, 200),
            CollectibleItem("coin_1", "coin", 1550, 750),
            CollectibleItem("coin_2", "coin", 2400, 250),
            CollectibleItem("crystal_1", "crystal", 1200, 1500),
            CollectibleItem("crystal_2", "crystal", 450, 1300)
        ]

    def add_player(self, player_id, name="", gender="boy", character="matias"):
        color_idx = len(self.players)
        player = Player(player_id, name, color_idx, gender=gender, character=character)
        
        # Spawn in open cafeteria ring around the central meeting table
        spawn_idx = len(self.players)
        angle = (spawn_idx * (2.0 * math.pi / 10.0)) + random.uniform(-0.08, 0.08)
        player.x = 1350.0 + math.cos(angle) * 160.0
        player.y = 700.0 + math.sin(angle) * 160.0
        player.target_x = player.x
        player.target_y = player.y

        self.players[player_id] = player
        return player

    def remove_player(self, player_id):
        if player_id in self.players:
            del self.players[player_id]
            if self.state == "PLAYING":
                self.check_game_over()

    def update_customization(self, player_id, hat_id, skin_id, weapon_id, gender=None):
        player = self.players.get(player_id)
        if player:
            if any(h["id"] == hat_id for h in HATS_CATALOG):
                player.hat = hat_id
            if any(s["id"] == skin_id for s in SKINS_CATALOG):
                player.skin = skin_id
            if any(w["id"] == weapon_id for w in WEAPONS_CATALOG):
                player.weapon = weapon_id
            if gender in ("boy", "girl"):
                player.gender = gender

    def start_game(self):
        if len(self.players) < 1:
            return False

        player_list = list(self.players.values())
        if len(player_list) == 1:
            # Modo 1 Jugador: El jugador es tripulante y los impostores son los clones malvados de la luz
            impostors = []
        else:
            num_impostors = 1 if len(player_list) <= 6 else 2
            impostors = random.sample(player_list, num_impostors)

        for idx, p in enumerate(player_list):
            p.alive = True
            p.hp = 100
            p.stamina = 100
            p.in_vent = None
            p.kill_cooldown = KILL_COOLDOWN
            p.punch_cooldown = 0.0
            p.invis_timer = 0.0
            p.disguise = None
            p.disguise_timer = 0.0
            p.ghost_button_cooldown = 0.0
            # Open circular ring around the central meeting table (radius 160px)
            angle = idx * (2.0 * math.pi / max(1, len(player_list)))
            p.x = 1350.0 + math.cos(angle) * 160.0
            p.y = 700.0 + math.sin(angle) * 160.0
            p.target_x = p.x
            p.target_y = p.y
            p.vx = 0.0
            p.vy = 0.0
            p.assign_tasks(TASK_STATIONS)
            if p in impostors:
                p.role = "impostor"
            else:
                p.role = "crewmate"

        self.dead_bodies = []
        self.light_orbs = []
        self.clone_impostors = []
        self.invis_buttons = []
        self.init_world_entities()
        self.state = "PLAYING"
        self.state_timer = 0.0
        self.winner = None
        return True

    def update_player_input(self, player_id, vx, vy):
        player = self.players.get(player_id)
        if not player or not player.alive:
            return
        speed = 280
        player.vx = vx * speed
        player.vy = vy * speed

    def tick(self, dt):
        self.state_timer += dt

        if self.state == "PLAYING":
            # Update world entities timers first
            self.light_orbs = [orb for orb in self.light_orbs if orb.active]
            for orb in self.light_orbs:
                orb.tick(dt)

            self.invis_buttons = [b for b in self.invis_buttons if b.active]
            for btn in self.invis_buttons:
                btn.tick(dt)

            for cat in self.zombie_cats:
                cat.tick(dt)

            all_alive_humans = [p for p in self.players.values() if p.alive and p.invis_timer <= 0]
            for p in self.players.values():
                if p.alive and not p.in_vent:
                    new_x = p.x + p.vx * dt
                    new_y = p.y + p.vy * dt
                    p.x, p.y = resolve_obstacle_collision(new_x, new_y, PLAYER_RADIUS)

                if p.punch_cooldown > 0:
                    p.punch_cooldown = max(0.0, p.punch_cooldown - dt)

                if p.role == "impostor" and p.kill_cooldown > 0:
                    p.kill_cooldown = max(0.0, p.kill_cooldown - dt)

                if p.invis_timer > 0:
                    p.invis_timer = max(0.0, p.invis_timer - dt)

                if p.disguise_timer > 0:
                    p.disguise_timer = max(0.0, p.disguise_timer - dt)
                    if p.disguise_timer <= 0:
                        p.disguise = None

                if p.ghost_button_cooldown > 0:
                    p.ghost_button_cooldown = max(0.0, p.ghost_button_cooldown - dt)

                # Pickup Invisibility Button
                for btn in self.invis_buttons:
                    if btn.active and p.alive:
                        dist = math.hypot(p.x - btn.x, p.y - btn.y)
                        if dist < (PLAYER_RADIUS + btn.radius):
                            btn.active = False
                            p.invis_timer = 8.0

                # Step on armed Light Orb -> Clone transformation!
                # Only creates a clone if the orb has finished its 1.2s arming delay AND a player steps on it!
                for orb in self.light_orbs:
                    if orb.active and orb.armed and p.alive:
                        dist = math.hypot(p.x - orb.x, p.y - orb.y)
                        if dist < (PLAYER_RADIUS + orb.radius):
                            orb.active = False
                            clone_id = f"clone_{uuid.uuid4().hex[:6]}"
                            clone = CloneImpostor(clone_id, p)
                            self.clone_impostors.append(clone)

                # Collect stars/coins/crystals
                for col in self.collectibles:
                    if not col.collected and p.alive:
                        dist = math.hypot(p.x - col.x, p.y - col.y)
                        if dist < (PLAYER_RADIUS + col.radius):
                            col.collected = True
                            if col.type == "star":
                                p.score += 100
                                p.stars_collected += 1
                            elif col.type == "coin":
                                p.score += 50
                            elif col.type == "crystal":
                                p.hp = min(p.max_hp, p.hp + 30)

                # Progress tasks
                if p.current_task and p.alive and p.role == "crewmate":
                    p.task_progress += dt
                    station = next((t for t in TASK_STATIONS if t["id"] == p.current_task), None)
                    if station and p.task_progress >= station["duration"]:
                        p.completed_tasks.add(p.current_task)
                        p.current_task = None
                        p.task_progress = 0.0
                        self.check_game_over()

            for clone in self.clone_impostors:
                clone.tick(dt, all_alive_humans)

            # Check if any player's HP dropped to 0 (from clones, brawls, etc.)
            for p in self.players.values():
                if p.alive and p.hp <= 0:
                    p.alive = False
                    self.dead_bodies.append({
                        "id": f"body_{uuid.uuid4().hex[:6]}",
                        "victim_id": p.id,
                        "victim_name": p.name,
                        "color": p.color,
                        "hat": p.hat,
                        "skin": p.skin,
                        "x": round(p.x, 1),
                        "y": round(p.y, 1),
                        "time": time.time()
                    })

            self.check_game_over()

        elif self.state == "MEETING":
            self.meeting["timer"] -= dt
            if self.meeting["timer"] <= 0:
                self.resolve_meeting()

        elif self.state == "MEETING_RESULT":
            self.meeting_result_timer = getattr(self, "meeting_result_timer", 4.0) - dt
            if self.meeting_result_timer <= 0:
                if not self.check_game_over():
                    self.state = "PLAYING"

    def try_punch(self, attacker_id):
        if self.state != "PLAYING":
            return False, "Juego no activo", None

        attacker = self.players.get(attacker_id)
        if not attacker or not attacker.alive:
            return False, "No puedes atacar", None

        if attacker.punch_cooldown > 0:
            return False, "Recargando golpe...", None

        weapon_info = next((w for w in WEAPONS_CATALOG if w["id"] == attacker.weapon), WEAPONS_CATALOG[0])
        damage = weapon_info["dmg"]
        attacker.punch_cooldown = 0.55
        hit_info = {"type": "miss", "weapon": attacker.weapon}

        # 1. Check hitting Zombie Cats
        for cat in self.zombie_cats:
            if cat.alive:
                dist = math.hypot(attacker.x - cat.x, attacker.y - cat.y)
                if dist < ATTACK_RANGE + cat.radius:
                    cat.hp -= damage
                    if cat.hp <= 0:
                        cat.alive = False
                        cat.respawn_timer = 30.0
                        attacker.score += 200
                        orb_id = f"orb_{uuid.uuid4().hex[:6]}"
                        angle = random.uniform(0.0, 2.0 * math.pi)
                        speed = random.uniform(260.0, 420.0)
                        vx = math.cos(angle) * speed
                        vy = math.sin(angle) * speed
                        self.light_orbs.append(LightOrb(orb_id, cat.x, cat.y, vx, vy))
                    hit_info = {"type": "cat_hit", "cat_id": cat.id, "cat_dead": not cat.alive, "x": cat.x, "y": cat.y, "weapon": attacker.weapon}
                    return True, "¡Golpeaste al Gato Zombi!", hit_info

        # 2. Check hitting Evil Clone Impostors
        for clone in self.clone_impostors:
            if clone.alive:
                dist = math.hypot(attacker.x - clone.x, attacker.y - clone.y)
                if dist < ATTACK_RANGE + clone.radius:
                    clone.hp -= damage
                    if clone.hp <= 0:
                        clone.alive = False
                        attacker.score += 350
                    hit_info = {"type": "clone_hit", "clone_id": clone.id, "clone_dead": not clone.alive, "x": clone.x, "y": clone.y, "weapon": attacker.weapon}
                    return True, "¡Golpeaste al Clon Impostor!", hit_info

        # 3. Check hitting other players in brawls
        for other in self.players.values():
            if other.id != attacker.id and other.alive:
                dist = math.hypot(attacker.x - other.x, attacker.y - other.y)
                if dist < ATTACK_RANGE:
                    other.hp = max(0, other.hp - damage)
                    if other.hp <= 0:
                        other.alive = False
                        self.dead_bodies.append({
                            "id": f"body_{uuid.uuid4().hex[:6]}",
                            "victim_id": other.id,
                            "victim_name": other.name,
                            "color": other.color,
                            "hat": other.hat,
                            "skin": other.skin,
                            "x": round(other.x, 1),
                            "y": round(other.y, 1),
                            "time": time.time()
                        })
                        self.check_game_over()
                    hit_info = {"type": "player_hit", "target_id": other.id, "target_hp": other.hp, "x": other.x, "y": other.y, "weapon": attacker.weapon}
                    return True, f"¡Golpeaste a {other.name}!", hit_info

        return True, "Golpe al aire", hit_info

    def try_kill(self, impostor_id, target_id):
        if self.state != "PLAYING":
            return False, "Juego no activo"

        impostor = self.players.get(impostor_id)
        target = self.players.get(target_id)

        if not impostor or not target:
            return False, "Jugador inválido"
        if impostor.role != "impostor" or not impostor.alive:
            return False, "Solo el impostor vivo puede eliminar"
        if impostor.kill_cooldown > 0:
            return False, f"Recarga de ataque activa ({round(impostor.kill_cooldown, 1)}s)"
        if not target.alive or target.role == "impostor":
            return False, "Objetivo inválido"

        dist = math.hypot(impostor.x - target.x, impostor.y - target.y)
        if dist > KILL_RANGE:
            return False, "Demasiado lejos del objetivo"

        target.alive = False
        target.hp = 0
        impostor.kill_cooldown = KILL_COOLDOWN
        impostor.kills += 1
        self.dead_bodies.append({
            "id": f"body_{uuid.uuid4().hex[:6]}",
            "victim_id": target.id,
            "victim_name": target.name,
            "color": target.color,
            "hat": target.hat,
            "skin": target.skin,
            "x": round(target.x, 1),
            "y": round(target.y, 1),
            "time": time.time()
        })

        self.check_game_over()
        return True, "Objetivo eliminado"

    def try_vent(self, impostor_id, vent_id):
        if self.state != "PLAYING":
            return False, "Juego no activo"
        impostor = self.players.get(impostor_id)
        if not impostor or impostor.role != "impostor" or not impostor.alive:
            return False, "No autorizado"

        vent = next((v for v in VENTS if v["id"] == vent_id), None)
        if not vent:
            return False, "Ventilador inexistente"

        if impostor.in_vent == vent_id:
            impostor.in_vent = None
            impostor.x = vent["x"]
            impostor.y = vent["y"] + 30
            return True, "Saliste de la ventilación"
        else:
            dist = math.hypot(impostor.x - vent["x"], impostor.y - vent["y"])
            if dist < 60:
                impostor.in_vent = vent_id
                impostor.x = vent["x"]
                impostor.y = vent["y"]
                return True, "Entraste a la ventilación"
            elif impostor.in_vent:
                target_vent = next((v for v in VENTS if v["id"] == vent["connected_to"]), None)
                if target_vent:
                    impostor.in_vent = target_vent["id"]
                    impostor.x = target_vent["x"]
                    impostor.y = target_vent["y"]
                    return True, f"Te desplazaste por la alcantarilla a {target_vent['room']}"
        return False, "Demasiado lejos"

    def try_shapeshift(self, impostor_id, target_id):
        if self.state != "PLAYING":
            return False, "Juego no activo"
        impostor = self.players.get(impostor_id)
        if not impostor or impostor.role != "impostor" or not impostor.alive:
            return False, "Solo el impostor vivo puede camuflarse"

        target = self.players.get(target_id)
        if not target or target.id == impostor.id:
            impostor.disguise = None
            impostor.disguise_timer = 0.0
            return True, "Camuflaje desactivado"

        impostor.disguise = {
            "name": target.name,
            "character": target.character,
            "gender": target.gender,
            "color": target.color,
            "hat": target.hat,
            "skin": target.skin
        }
        impostor.disguise_timer = 18.0
        return True, f"¡Camuflado como {target.name}!"

    def try_ghost_drop_invis_button(self, ghost_id):
        if self.state != "PLAYING":
            return False, "Juego no activo"
        ghost = self.players.get(ghost_id)
        if not ghost or ghost.alive:
            return False, "Solo los fantasmas pueden entregar botones de invisibilidad"
        if ghost.ghost_button_cooldown > 0:
            return False, f"Recargando botón ({round(ghost.ghost_button_cooldown, 1)}s)"

        ghost.ghost_button_cooldown = 12.0
        btn_id = f"invis_{uuid.uuid4().hex[:6]}"
        self.invis_buttons.append(InvisibilityButton(btn_id, ghost.x, ghost.y, ghost.id))
        return True, "¡Has entregado un botón de invisibilidad!"

    def report_body_or_button(self, reporter_id, is_body=False, body_id=None):
        if self.state != "PLAYING":
            return False
        reporter = self.players.get(reporter_id)
        if not reporter or not reporter.alive:
            return False

        reason = "Cuerpo Reportado" if is_body else "Reunión de Emergencia"
        self.state = "MEETING"
        self.meeting = {
            "caller": reporter.name,
            "reason": reason,
            "votes": {},
            "timer": 30.0,
            "result": None
        }
        return True

    def cast_vote(self, voter_id, target_id):
        if self.state != "MEETING":
            return False
        voter = self.players.get(voter_id)
        if not voter or not voter.alive:
            return False

        self.meeting["votes"][voter_id] = target_id
        alive_players = [p for p in self.players.values() if p.alive]
        if len(self.meeting["votes"]) >= len(alive_players):
            self.resolve_meeting()
        return True

    def resolve_meeting(self):
        tally = {}
        for voter_id, target_id in self.meeting["votes"].items():
            tally[target_id] = tally.get(target_id, 0) + 1

        if not tally:
            ejected = None
        else:
            sorted_votes = sorted(tally.items(), key=lambda item: item[1], reverse=True)
            top_target, top_count = sorted_votes[0]
            if len(sorted_votes) > 1 and sorted_votes[1][1] == top_count:
                ejected = None
            elif top_target == "skip":
                ejected = None
            else:
                ejected = self.players.get(top_target)

        if ejected:
            ejected.alive = False
            result_msg = f"{ejected.name} fue expulsado. Era {'un IMPOSTOR' if ejected.role == 'impostor' else 'un TRIPULANTE'}."
        else:
            result_msg = "Nadie fue expulsado (Empate o Salteo)."

        self.meeting["result"] = result_msg

        for p in self.players.values():
            p.x = 1350 + random.uniform(-80, 80)
            p.y = 700 + random.uniform(-60, 60)
            p.vx = 0
            p.vy = 0
            p.in_vent = None
            if p.role == "impostor":
                p.kill_cooldown = KILL_COOLDOWN

        self.dead_bodies = []

        if not self.check_game_over():
            self.state = "MEETING_RESULT"
            self.meeting_result_timer = 4.0

    def check_game_over(self):
        if self.state not in ("PLAYING", "MEETING_RESULT"):
            return False

        alive_players = [p for p in self.players.values() if p.alive and p.hp > 0]
        if not alive_players and len(self.players) > 0:
            self.state = "GAME_OVER"
            self.winner = "IMPOSTOR"
            return True

        alive_crewmates = sum(1 for p in alive_players if p.role == "crewmate")
        alive_player_impostors = sum(1 for p in alive_players if p.role == "impostor")
        alive_clones = sum(1 for c in self.clone_impostors if c.alive and c.hp > 0)
        has_initial_impostor = any(p.role == "impostor" for p in self.players.values())

        # 1. Impostor Victory: All crewmates eliminated
        if len(self.players) > 0 and alive_crewmates == 0:
            self.state = "GAME_OVER"
            self.winner = "IMPOSTOR"
            return True

        # 2. Crewmate Victory by Tasks: All assigned tasks completed
        total_tasks = sum(len(p.assigned_tasks) for p in self.players.values() if p.role == "crewmate")
        completed_tasks = sum(len(p.completed_tasks) for p in self.players.values() if p.role == "crewmate")
        if total_tasks > 0 and completed_tasks >= total_tasks:
            self.state = "GAME_OVER"
            self.winner = "CREWMATE_TASKS"
            return True

        # 3. Crewmate Victory by Eliminating Impostors:
        # ONLY if there was an assigned player impostor who is now dead and no active clones
        if has_initial_impostor and alive_player_impostors == 0 and alive_clones == 0:
            self.state = "GAME_OVER"
            self.winner = "CREWMATE"
            return True

        return False

    def get_snapshot_for_player(self, player_id):
        player = self.players.get(player_id)
        viewer_role = player.role if player else "ghost"
        is_alive = player.alive if player else False

        total_tasks = max(1, sum(len(p.assigned_tasks) for p in self.players.values() if p.role == "crewmate"))
        completed_tasks = sum(len(p.completed_tasks) for p in self.players.values() if p.role == "crewmate")
        task_percentage = round((completed_tasks / total_tasks) * 100, 1)

        players_data = []
        for p in self.players.values():
            if p.in_vent and p.id != player_id and viewer_role != "impostor" and is_alive:
                continue
            # Invisible player is hidden from other alive players
            if p.invis_timer > 0 and p.id != player_id and is_alive and viewer_role != "ghost":
                continue
            players_data.append(p.to_dict(viewer_role="ghost" if not is_alive else viewer_role, is_self=(p.id == player_id)))

        return {
            "type": "sync",
            "room_id": self.id,
            "state": self.state,
            "winner": self.winner,
            "episode": getattr(self, "episode", 1),
            "task_bar": task_percentage,
            "players": players_data,
            "cats": [c.to_dict() for c in self.zombie_cats],
            "orbs": [o.to_dict() for o in self.light_orbs],
            "invis_buttons": [b.to_dict() for b in self.invis_buttons if b.active],
            "clones": [cl.to_dict() for cl in self.clone_impostors],
            "collectibles": [col.to_dict() for col in self.collectibles if not col.collected],
            "bodies": self.dead_bodies,
            "meeting": self.meeting if self.state in ("MEETING", "MEETING_RESULT") else None,
            "timestamp": time.time()
        }
