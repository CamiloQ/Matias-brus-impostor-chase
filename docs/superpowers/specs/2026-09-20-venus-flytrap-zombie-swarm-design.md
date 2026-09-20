# Especificación de Diseño: Venus Atrapamoscas, Enjambre Zombi Carroñero y Reanimación

**Fecha:** 2026-09-20  
**Proyecto:** Matias & Brus: Impostor Chase  
**Estado:** Aprobado  

---

## 1. Visión General y Objetivos
Transformar la dinámica de eliminación de cuerpos en una **carrera contra el tiempo** estratégica y emocionante:
1. **Gráficos de Venus Atrapamoscas (*Dionaea muscipula*):** Rediseñar el renderizado procedural en Canvas de las plantas carnívoras para asemejarse fielmente a la fotografía de referencia (valvas bivalvas carmesí/rojo con borde verde lima, cilios/dientes marginales afilados entrelazados, filamentos sensibles y base en maceta de terracota).
2. **Gatos Esqueleto Animados y Metamorfosis:** Animar la cola vertebral y las orejas de los gatos esqueleto; al recibir su segundo golpe y morir, brota en esa coordenada una **nueva maceta con Venus Atrapamoscas**.
3. **Mecánica de Reanimación (Revivir):** Al caer derrotado, el jugador tiene un contador de **20 segundos** para revivir en el sitio. Los compañeros vivos pueden acelerar el rescate a **3x de velocidad**.
4. **Enjambre Zombi Carroñero (Enfoque 2):** Los cuerpos en el suelo activan a la manada de gatos zombi. El gato más cercano corre hacia el cuerpo, lo arrastra físicamente y busca entregarlo a la maceta de Venus más cercana. Si el gato que arrastra el cuerpo es golpeado, lo suelta, pero los demás gatos del enjambre intentarán disputar el botín.
5. **Digestión Irreversible (Opción B):** Si la Venus recibe el cuerpo dentro de sus fauces, se cierra de inmediato (*snap-chomp*) y entra en un ciclo de digestión de **25 segundos** bloqueando al jugador hasta consumirlo por completo.

---

## 2. Arquitectura de Entidades y Estados

### 2.1 Venus Atrapamoscas (`CarnivorousPlant`)
* **Propiedades:**
  - `id: str`
  - `x: float`, `y: float` (posición fija / enraizada en maceta)
  - `radius: float` (radio de detección y fauces, base 32.0px)
  - `state: "idle" | "snapping" | "digesting"`
  - `digestion_timer: float` (25.0s al atrapar un cuerpo)
  - `fed_count: int` (contador de cuerpos consumidos)
  - `trapped_victim_name: str | None`
  - `is_pot: bool = True`
* **Ciclo de Vida:**
  - `state == "idle"`: Abierta, en espera. Detecta si un cuerpo arrastrado por un gato entra en su radio (`dist < radius + 15`).
  - Al entrar un cuerpo: `state = "digesting"`, `digestion_timer = 25.0`, `trapped_victim_name = body["victim_name"]`. El cuerpo queda enlazado a la planta y cancela su revivir.
  - Al terminar los 25.0s: `fed_count += 1`, `radius = min(radius + 4.0, 52.0)`, `state = "idle"`, y el cuerpo se elimina definitivamente.

### 2.2 Gato Zombi Carroñero (`ZombieCat`)
* **Propiedades:**
  - `state: "roaming" | "seeking_body" | "hauling_body" | "stunned"`
  - `target_body_id: str | None`
  - `hauling_body_id: str | None`
  - `stun_timer: float = 0.0`
* **Comportamiento en Tick:**
  - Si hay cuerpos libres en `dead_bodies` (`not b.get("is_trapped_in_plant") and not b.get("carrier_cat_id")`):
    - El gato zombi más cercano fija `target_body_id = body["id"]` y `state = "seeking_body"`.
    - Corre hacia el cuerpo a velocidad estándar (150 px/s).
  - Al alcanzar el cuerpo (`dist < 28`):
    - `state = "hauling_body"`, `hauling_body_id = body["id"]`, `body["carrier_cat_id"] = cat.id`.
  - En estado `hauling_body`:
    - Localiza la `CarnivorousPlant` en maceta más cercana en estado `"idle"`.
    - Se desplaza hacia la maceta arrastrando el cuerpo tras de sí a 115 px/s. Las coordenadas del cuerpo se actualizan detrás del gato con una distancia de arrastre (~22px).
    - Al llegar al radio de la Venus (`dist < plant.radius + 10`): entrega el cuerpo a la planta, se desvincula (`hauling_body_id = None`), y regresa a `"roaming"`.
  - Si recibe un golpe (puñetazo/arma de jugador):
    - Recibe daño normal. Si estaba arrastrando un cuerpo, lo libera (`hauling_body_id = None`, `body["carrier_cat_id"] = None`).
    - Pasa a `state = "stunned"`, `stun_timer = 2.0s`. Los demás gatos del enjambre pueden reclamar el cuerpo libre.

### 2.3 Gato Esqueleto (`SkeletonCat`)
* **Animaciones:**
  - `tail_angle`: Columna vertebral de hueso oscilando senoidalmente con `time`.
  - `ear_twitch`: Espasmos/contracciones aleatorias en las orejas óseas.
* **Metamorfosis:**
  - Vida: 2 golpes. Al llegar a `hp <= 0`, en lugar de desaparecer simplemente, instancia una nueva `CarnivorousPlant(new_id, x, y)` en maceta, que se agrega a la lista `self.carnivorous_plants` del servidor.

### 2.4 Cuerpos Caídos y Mecánica de Reanimación (`dead_bodies`)
* **Estructura:**
  - `id: str`
  - `victim_id: str`, `victim_name: str`
  - `color, hat, skin`
  - `x: float`, `y: float`
  - `revive_timer: float = 20.0`
  - `carrier_cat_id: str | None = None`
  - `is_trapped_in_plant: bool = False`
  - `plant_id: str | None = None`
* **Lógica de Revivir:**
  - Si no está atrapado en una planta (`not is_trapped_in_plant`):
    - `revive_timer -= dt`
    - Si hay compañeros de tripulación vivos a menos de 55px interactuando/presionando reanimar: `revive_timer -= dt * 2.5` (efecto acumulativo de aceleración).
    - Si `revive_timer <= 0`: El jugador reaparece en `(x, y)` con vida regenerada (60 HP), vivo y activo. El cuerpo se remueve de `dead_bodies`.

---

## 3. Especificación Visual y de Renderizado (HTML5 Canvas)

### 3.1 Venus Atrapamoscas (*Dionaea muscipula*)
* **Maceta:**
  - Dibujada con gradiente lineal terracota (`#b95d36`, `#8a3b1e`).
  - Anillo/reborde superior y relleno de tierra negra con césped/musgo verde oscuro (`#1b4d2e`).
* **Hojas Basales:**
  - 4 a 6 hojas carnosas en roseta que parten del centro de la maceta.
* **Valvas de la Trampa:**
  - Forma de semicírculos/elipses convexas pareadas simulando las dos mitades de la trampa.
  - Exterior verde esmeralda y lima con borde iluminado (`#7cb342`, `#558b2f`).
  - Interior cóncavo en **rojo carmesí profundo y escarlata brillante** (`#b01b2e`, `#e74c3c`).
  - 3 pelos disparadores en el centro del cáliz (`#7f1d1d`).
* **Cilios / Dientes Marginales:**
  - Dientes triangulares estilizados en el perímetro externo (8-10 por lóbulo) con puntas curvadas.
  - En estado `"idle"`, las valvas están desplegadas a unos 70 grados mostrando el interior rojo.
  - En estado `"digesting"`, las valvas se juntan cerradas a 0 grados, los dientes se intercalan herméticamente, el cuerpo vegetal pulsa y se dibuja el texto/barra de digestión: `Digiriendo: X.Xs`.

### 3.2 Gato Esqueleto
* Segmentos óseos de costillas y vértebras.
* Cola de vértebras dibujada con nodos interconectados que ondean rítmicamente al caminar.
* Orejas triangulares con espasmo de rotación.

### 3.3 Gato Zombi Arrastrando y Cuerpos
* Cuando `p.carrier_cat_id` está activo, se traza un cordón de ectoplasma/arrastre entre el gato y el cuerpo.
* El cuerpo muestra una barra circular de progreso sobre su cabeza con el tiempo restante para revivir (`revive_timer`), en color verde cian mientras se recupera, o rojo si está siendo arrastrado.
