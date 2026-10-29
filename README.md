# Brújula + altímetro GPS (PWA)

Webapp para Android que muestra:

- **Rumbo** (norte magnético) con una rosa de los vientos que gira
- **Altitud GPS** con su precisión (± m)
- **Latitud y longitud**

Hecha con HTML, CSS y JavaScript puro, sin dependencias ni compilación.

## Ficheros

| Fichero | Qué hace |
|---|---|
| `index.html` | Estructura de la pantalla |
| `styles.css` | Estilos |
| `app.js` | Dibuja la rosa y lee la brújula y el GPS. Está comentado paso a paso |
| `manifest.json` | Permite instalarla en la pantalla de inicio |
| `sw.js` | Service worker: guarda la app para usarla sin conexión |
| `icons/` | Iconos de la app |

## Cómo funciona

**Brújula.** Chrome en Android emite el evento `deviceorientationabsolute` con tres ángulos (`alpha`, `beta`, `gamma`) referidos a la Tierra. Con ellos se calcula hacia dónde apunta el móvil y se compensa la inclinación (ver `headingFromOrientation` en `app.js`). Después se suaviza la lectura filtrando el seno y el coseno; si se promediaran los grados directamente, 359° y 1° darían 180°.

**Altitud.** `navigator.geolocation.watchPosition` con `enableHighAccuracy: true`. La altitud puede tardar en aparecer porque el GPS necesita "fix" 3D.

> ⚠️ En Android la altitud del GPS suele ir referida al **elipsoide WGS84**, no al nivel del mar. En Euskadi eso hace que salga unos **~50 m más alta** que la altitud real de los mapas. Una posible mejora es corregirla con un modelo de geoide (EGM96).

## Requisitos

- **HTTPS**: sin él, el navegador no da acceso a los sensores ni al GPS. GitHub Pages ya lo incluye.
- Un móvil con magnetómetro. Casi todos lo tienen.
- Hay que pulsar «Iniciar» para que el navegador permita activar los sensores.

## Publicar en GitHub Pages

1. Crea un repo nuevo en GitHub (por ejemplo `brujula`).
2. Sube todos los ficheros de esta carpeta a la raíz del repo. Puedes hacerlo desde la web con *Add file → Upload files* o con git:
   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/brujula.git
   git push -u origin main
   ```
3. En el repo, ve a **Settings → Pages → Source: Deploy from a branch → main / (root)** y pulsa Save.
4. En uno o dos minutos estará en `https://TU_USUARIO.github.io/brujula/`.
5. Ábrela en Chrome en el móvil y elige el menú **⋮ → Añadir a pantalla de inicio / Instalar app**.

## Actualizar la app

Si cambias algún fichero, sube también la versión en `sw.js` (`brujula-v1` → `brujula-v2`). Si no lo haces, el móvil seguirá usando la copia guardada en caché.

## Probar en el ordenador

`python -m http.server` y abre `http://localhost:8000`. Verás el diseño, pero la brújula no funcionará en un PC. En Chrome DevTools, en *More tools → Sensors*, puedes simular la ubicación.

## Si algo falla

- **El rumbo da saltos o está desviado:** calibra moviendo el móvil haciendo un «8» y aléjate de imanes, del ordenador o de estructuras metálicas.
- **"No llegan datos de orientación":** el navegador o el dispositivo no tienen magnetómetro.
- **La altitud se queda en "—":** sal al exterior y espera unos segundos a que el GPS la tenga.
