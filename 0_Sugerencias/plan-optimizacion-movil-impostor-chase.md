# Plan de implementación — Optimización móvil de Impostor Chase

**Objetivo:** reducir el consumo de CPU/GPU en el render loop, acelerar la carga
repetida de la PWA, y limpiar peso muerto del repo — sin arriesgar romper la
sincronización visual ni el gameplay actual.

**Repo:** `CamiloQ/Matias-brus-impostor-chase`
**Basado en:** auditoría de `client/js/game.js`, `client/sw.js` y `client/icons/`

---

## Cómo leer este plan

Está ordenado por **riesgo/esfuerzo**, no por impacto — empieza por lo que es
seguro y rápido de aplicar, y deja lo más invasivo (el cacheo de sprites) para
cuando ya tengas una base estable y puedas probarlo con calma. Cada fase es
independiente: puedes hacer commit y desplegar fase por fase sin esperar a
terminar el plan completo.

---

## Fase 0 — Limpieza (5 minutos, riesgo cero)

**Qué hacer:**
1. Eliminar `client/icons/Gemini_Generated_Imagen.jfif` (2.46 MB, no referenciado
   en ningún `.js`/`.html`/`.css` — confirmado por búsqueda en todo el repo).
2. `git rm client/icons/Gemini_Generated_Imagen.jfif`

**Por qué primero:** no toca código de ejecución, cero riesgo de romper algo,
y reduce el tamaño del repo/clone/build de inmediato.

**Commit sugerido:** `chore: remove unused 2.4MB image asset`

---

## Fase 1 — Quick wins de render (30-60 min, riesgo bajo)

### 1.1 Gatear `shadowBlur` por calidad gráfica

`shadowBlur` es una de las operaciones más caras de Canvas 2D en móvil (varios
navegadores lo procesan por software, no por GPU). Aparece en `game.js` en las
líneas ~4136, 4148 y 4181, en el render de jugadores.

**Cambio:**
```js
// Antes (siempre activo):
ctx.shadowBlur = 8;
ctx.shadowColor = "...";
// ... dibujo ...

// Después (solo en calidad media/ultra):
if (this.graphicsQuality !== "low") {
    ctx.shadowBlur = 8;
    ctx.shadowColor = "...";
}
// ... dibujo ...
if (this.graphicsQuality !== "low") {
    ctx.shadowBlur = 0; // resetear siempre después de usarlo
}
```

**Prueba:** activa calidad "low" desde el selector de gráficos in-game, confirma
visualmente que el halo/sombra desaparece pero el personaje sigue siendo
reconocible.

### 1.2 Arreglar el cache-key mismatch del Service Worker

`sw.js` precachea `'./js/game.js'` pero el HTML pide `js/game.js?v=12` — son
llaves distintas en el Cache API, así que el offline fallback casi nunca
encuentra coincidencia real.

**Cambio en `sw.js`:**
```js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/ws')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })) // <- fix
  );
});
```

**Prueba:** con DevTools → Application → Service Workers, marca "Offline" y
recarga — la app debería seguir cargando desde caché en vez de mostrar el
error de navegador sin conexión.

**Commit sugerido:** `fix(perf): gate shadowBlur by quality, fix SW cache key mismatch`

---

## Fase 2 — Service Worker: cache-first para assets estáticos (1-2 h, riesgo medio)

**Problema:** hoy todo es *network-first* — cada apertura de la app espera la
red antes de mostrar nada, aunque el archivo no haya cambiado.

**Cambio de estrategia:**
- **Cache-first** para: `css/style.css`, `js/*.js`, `manifest.json`, íconos.
- **Network-first** (como está hoy) para: `index.html` — así, si subes una
  nueva versión, el HTML se refresca rápido y trae los nuevos `?v=N` de los
  scripts.

```js
const STATIC_ASSETS = /\.(js|css|png|svg|json)$/;

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('/ws')) return;

  if (STATIC_ASSETS.test(url)) {
    // Cache-first con actualización en segundo plano (stale-while-revalidate)
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else {
    // index.html y todo lo demás: network-first (como ya estaba)
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
  }
});
```

**Importante:** cuando subas cambios de JS/CSS, sube también la versión (`?v=13`)
en `index.html` como ya haces — así el navegador pide la URL nueva y el
cache-first no sirve una versión vieja por error.

**Prueba:**
1. Abre la app una vez con red normal (se cachea todo).
2. Corta la red / modo avión.
3. Recarga: debe abrir casi instantáneo desde caché.
4. Reconecta, sube un cambio con nuevo `?v=`, recarga: debe traer la versión nueva.

**Commit sugerido:** `perf: cache-first strategy for static assets in service worker`

---

## Fase 3 — Cacheo de sprites (el cambio de mayor impacto, 1-2 días, riesgo medio-alto)

Esta es la optimización que más CPU/GPU ahorra: hoy cada personaje se dibuja
con múltiples gradientes recalculados 30 veces por segundo. La idea es
dibujar cada apariencia de personaje **una sola vez** a un canvas offscreen, y
en el loop de render simplemente "pegarla" con `drawImage`.

### 3.1 Diseño

- Crear una clase `SpriteCache` que:
  - Recibe la combinación de apariencia de un jugador (character, hat, skin,
    weapon, color) como clave.
  - Si no existe en caché, dibuja el personaje una vez en un
    `OffscreenCanvas` (o `<canvas>` normal oculto) usando el código de dibujo
    vectorial que ya existe, y lo guarda.
  - Devuelve el canvas cacheado para hacer `drawImage`.
- La caché se invalida solo cuando cambia la apariencia (vestidor), no cada
  frame — para eso ya tienes el evento `update_customization`.
- Animaciones simples (caminar, parpadeo) se resuelven con **varios frames
  pre-renderizados** (ej. 4-8 poses de caminata) en vez de recalcular
  gradientes por pose en tiempo real — como un sprite sheet clásico.

### 3.2 Pasos concretos

1. **Extraer** la función actual de dibujo de personaje (`drawPlayer` o como
   se llame en `game.js`, líneas ~3463-3700) para que reciba un `ctx`
   cualquiera, no necesariamente el del canvas principal — así puede usarse
   tanto para pintar en pantalla como para pintar en el offscreen.
2. **Crear** `SpriteCache.getOrRender(appearanceKey, drawFn)`:
   ```js
   class SpriteCache {
     constructor() { this.cache = new Map(); }

     getOrRender(key, size, drawFn) {
       if (this.cache.has(key)) return this.cache.get(key);
       const canvas = document.createElement("canvas");
       canvas.width = size; canvas.height = size;
       const ctx = canvas.getContext("2d");
       drawFn(ctx); // usa la función de dibujo existente, sin cambios
       this.cache.set(key, canvas);
       return canvas;
     }

     invalidate(key) { this.cache.delete(key); }
   }
   ```
3. **Reemplazar** en el loop de render principal la llamada directa a
   dibujo vectorial por:
   ```js
   const key = `${player.character}-${player.hat}-${player.skin}-${player.color}`;
   const sprite = this.spriteCache.getOrRender(key, 64, (offscreenCtx) => {
     this.drawPlayerVector(offscreenCtx, player); // la función vieja, sin tocar
   });
   ctx.drawImage(sprite, screenX - 32, screenY - 32);
   ```
4. **Gatear por calidad**: en `graphicsQuality === "ultra"`, si quieres,
   deja el dibujo vectorial en vivo (más detalle, menos rendimiento); en
   `"low"`/`"medium"`, siempre usar el sprite cacheado.
5. **Invalidar caché** cuando llega `update_customization` para ese jugador.

### 3.3 Pruebas antes de mergear

- [ ] Partida con 8-12 jugadores simultáneos en un Android de gama media —
      medir FPS antes/después con el panel Performance de Chrome DevTools
      (conectado por `chrome://inspect` a un dispositivo real, no solo el
      emulador).
- [ ] Cambiar de vestidor a mitad de partida y confirmar que el sprite se
      actualiza (no queda cacheada la apariencia vieja).
- [ ] Verificar que los efectos dinámicos (disguise de impostor, invisibilidad
      de fantasma) sigan viéndose bien — esos si necesitan lógica en tiempo
      real además del sprite base (opacidad, tinte), no solo un bitmap fijo.
- [ ] Confirmar que el consumo de memoria no crece sin límite — con hasta
      ~12 jugadores por sala y pocas combinaciones de apariencia, el mapa de
      caché debería quedarse pequeño, pero vale la pena loguear
      `spriteCache.cache.size` durante una partida larga.

**Commit sugerido:** `perf: cache character sprites to offscreen canvas instead of redrawing gradients every frame`

---

## Fase 4 — Solo si después de la Fase 3 sigue habiendo caída de FPS (opcional)

No la ataques todavía. Es una reescritura grande y probablemente innecesaria
si la Fase 3 resuelve el cuello de botella real.

- Medir primero con DevTools Performance en un dispositivo real de gama media
  con 8-12 jugadores y efectos activos.
- Si el cuello de botella sigue siendo el render (no la red, no la lógica de
  juego), evaluar migrar el render a **PixiJS** (WebGL con fallback
  automático a Canvas 2D, misma idea de sprites que ya tendrías de la Fase 3,
  así que la migración sería incremental y no un reinicio desde cero).

---

## Orden de despliegue recomendado

| Fase | Riesgo | Esfuerzo | Se puede desplegar sola |
|------|--------|----------|--------------------------|
| 0 — Limpieza | Ninguno | 5 min | Sí |
| 1 — Quick wins render + SW | Bajo | 30-60 min | Sí |
| 2 — SW cache-first | Medio | 1-2 h | Sí |
| 3 — Sprite caching | Medio-alto | 1-2 días | Sí, pero probar bien antes |
| 4 — Evaluar WebGL/PixiJS | Alto | Días/semanas | Solo si Fase 3 no alcanza |

Despliega y verifica cada fase en producción (Railway) antes de empezar la
siguiente — así, si algo sale mal, sabes exactamente qué commit revertir.

## Cómo medir si funcionó

- Chrome DevTools → Performance → graba 10s de gameplay con 8+ jugadores,
  compara el % de tiempo en "Rendering"/"Painting" antes y después de la
  Fase 3.
- `chrome://inspect` conectado a un Android real de gama media (no un flagship)
  — los resultados en desktop no son representativos del dispositivo real que
  van a usar los jugadores.
- Lighthouse (panel de Chrome DevTools) para el puntaje de PWA/Performance
  antes y después de la Fase 2.
