/* =========================================================================
   Brújula + altímetro GPS — app.js
   -------------------------------------------------------------------------
   1. Dibuja la rosa de los vientos (SVG).
   2. Lee la orientación del móvil y calcula el rumbo (norte magnético).
   3. Lee el GPS (altitud, precisión, lat/lon).
   4. Mantiene la pantalla encendida y registra el service worker (PWA).
   ========================================================================= */

'use strict';

// ---------- Referencias al DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  rose: $('rose'),
  headingDeg: $('heading-deg'),
  headingCard: $('heading-card'),
  alt: $('alt'),
  altAcc: $('alt-acc'),
  lat: $('lat'),
  lon: $('lon'),
  posAcc: $('pos-acc'),
  status: $('status'),
  start: $('start'),
  startBtn: $('start-btn'),
};

/* =========================================================================
   1. ROSA DE LOS VIENTOS
   Se genera por código: marcas cada 5°, números cada 30°, letras N/E/S/O.
   El SVG usa un sistema de coordenadas centrado en (0,0) con radio 160.
   ========================================================================= */
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Punto en la circunferencia. 0° = arriba, sentido horario (como una brújula).
function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
}

function buildRose(svg) {
  svg.append(svgEl('circle', { class: 'rose__bg', r: 156 }));

  for (let d = 0; d < 360; d += 5) {
    const big = d % 90 === 0;
    const mid = d % 30 === 0;
    const len = big ? 18 : mid ? 13 : 7;
    const p1 = polar(150, d);
    const p2 = polar(150 - len, d);
    svg.append(svgEl('line', {
      class: big ? 'rose__tick rose__tick--big' : mid ? 'rose__tick rose__tick--mid' : 'rose__tick',
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
    }));

    // Números cada 30° (excepto donde van las letras cardinales)
    if (mid && !big) {
      const p = polar(120, d);
      const t = svgEl('text', { class: 'rose__num', x: p.x, y: p.y, transform: `rotate(${d} ${p.x} ${p.y})` });
      t.textContent = d;
      svg.append(t);
    }
  }

  // Puntos cardinales (en español: O = oeste)
  const cardinals = [['N', 0], ['E', 90], ['S', 180], ['O', 270]];
  for (const [label, d] of cardinals) {
    const p = polar(112, d);
    const t = svgEl('text', {
      class: label === 'N' ? 'rose__card rose__card--n' : 'rose__card',
      x: p.x, y: p.y, transform: `rotate(${d} ${p.x} ${p.y})`,
    });
    t.textContent = label;
    svg.append(t);
  }

  // Intercardinales más pequeños
  const inter = [['NE', 45], ['SE', 135], ['SO', 225], ['NO', 315]];
  for (const [label, d] of inter) {
    const p = polar(112, d);
    const t = svgEl('text', {
      class: 'rose__card rose__card--sm',
      x: p.x, y: p.y, transform: `rotate(${d} ${p.x} ${p.y})`,
    });
    t.textContent = label;
    svg.append(t);
  }

  // Aguja: mitad roja hacia el norte de la rosa, mitad clara hacia el sur
  svg.append(svgEl('polygon', { class: 'rose__needle-n', points: '0,-90 9,0 -9,0' }));
  svg.append(svgEl('polygon', { class: 'rose__needle-s', points: '0,90 9,0 -9,0' }));
  svg.append(svgEl('circle', { class: 'rose__hub', r: 7 }));
}

/* =========================================================================
   2. RUMBO (COMPASS HEADING)
   -------------------------------------------------------------------------
   El evento de orientación da tres ángulos (en grados):
     alpha: giro alrededor del eje Z (perpendicular a la pantalla) 0..360
     beta : inclinación adelante/atrás (eje X)                    -180..180
     gamma: inclinación izquierda/derecha (eje Y)                  -90..90
   En Android/Chrome, el evento "deviceorientationabsolute" da estos ángulos
   respecto a la Tierra (usa el magnetómetro), así que podemos sacar el norte.

   Si el móvil está plano, rumbo = 360 - alpha. Pero si lo inclinas, eso
   falla; por eso usamos la matriz de rotación completa (compensación de
   inclinación).

   Idea: con alpha/beta/gamma calculamos hacia dónde apuntan dos ejes del
   móvil en coordenadas terrestres (x = Este, y = Norte, z = arriba):
     · el borde superior del móvil  → sirve cuando el móvil está plano
     · la cámara trasera            → sirve cuando el móvil está vertical
   Cada uno falla en el caso contrario (apunta al cielo/suelo y su proyección
   horizontal es ~0), pero si los SUMAMOS siempre queda un vector horizontal
   útil, y ambos apuntan "hacia delante" cuando sujetas el móvil normalmente.
   ========================================================================= */
function headingFromOrientation(alpha, beta, gamma) {
  const r = Math.PI / 180;
  const sA = Math.sin(alpha * r), cA = Math.cos(alpha * r);
  const sB = Math.sin(beta * r),  cB = Math.cos(beta * r);
  const sG = Math.sin(gamma * r), cG = Math.cos(gamma * r);

  // Borde superior del móvil (eje +Y) → componentes Este / Norte
  const topE = -sA * cB;
  const topN =  cA * cB;

  // Cámara trasera (eje -Z) → componentes Este / Norte
  const backE = -cA * sG - sA * sB * cG;
  const backN = -sA * sG + cA * sB * cG;

  // Rumbo = ángulo del vector suma medido desde el Norte en sentido horario
  const h = Math.atan2(topE + backE, topN + backN) * (180 / Math.PI);
  return (h + 360) % 360;
}

// Ángulo de la pantalla (0 vertical, 90/270 apaisado) para corregir el rumbo
function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

/* ---- Suavizado ----
   Los sensores tiemblan. Un filtro paso bajo simple sirve, PERO los ángulos
   son circulares: promediar 359° y 1° da 180° (¡mal!). Por eso filtramos el
   seno y el coseno por separado y reconstruimos el ángulo con atan2. */
const SMOOTHING = 0.15;          // 0 = muy suave/lento, 1 = sin filtro
let sinF = null, cosF = null;

function smoothHeading(h) {
  const rad = (h * Math.PI) / 180;
  if (sinF === null) { sinF = Math.sin(rad); cosF = Math.cos(rad); }
  sinF += SMOOTHING * (Math.sin(rad) - sinF);
  cosF += SMOOTHING * (Math.cos(rad) - cosF);
  return (Math.atan2(sinF, cosF) * (180 / Math.PI) + 360) % 360;
}

/* ---- Giro de la rosa sin "vueltas locas" ----
   Si pasamos de 359° a 1° directamente con CSS, la rosa daría una vuelta
   entera hacia atrás. Acumulamos el giro por el camino más corto. */
let roseRotation = 0;
function rotateRose(heading) {
  const target = -heading;
  let delta = ((target - roseRotation) % 360 + 540) % 360 - 180; // -180..180
  roseRotation += delta;
  ui.rose.style.transform = `rotate(${roseRotation}deg)`;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function cardinal(h) {
  return CARDINALS[Math.round(h / 45) % 8];
}

let lastOrientationAt = 0;

function onOrientation(e) {
  let heading;

  if (typeof e.webkitCompassHeading === 'number') {
    // iPhone (por si acaso): Safari ya da el rumbo calculado
    heading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    // Si el evento normal no es absoluto, no sirve para el norte
    if (e.type === 'deviceorientation' && !e.absolute) return;
    heading = headingFromOrientation(e.alpha, e.beta, e.gamma);
  } else {
    return;
  }

  heading = (heading + screenAngle()) % 360;
  const h = smoothHeading(heading);

  lastOrientationAt = performance.now();
  rotateRose(h);
  ui.headingDeg.textContent = `${String(Math.round(h) % 360).padStart(3, '0')}°`;
  ui.headingCard.textContent = cardinal(h);
}

async function startCompass() {
  // iOS 13+ exige pedir permiso explícito (en Android no existe esta función)
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') { setStatus('Permiso de orientación denegado'); return; }
    } catch (err) {
      setStatus('No se pudo pedir permiso de orientación');
      return;
    }
  }

  if ('ondeviceorientationabsolute' in window) {
    // Android / Chrome: lo que queremos
    window.addEventListener('deviceorientationabsolute', onOrientation);
  } else if ('ondeviceorientation' in window) {
    // Otros navegadores: solo vale si el evento viene marcado como absoluto
    window.addEventListener('deviceorientation', onOrientation);
  } else {
    setStatus('Este navegador no da acceso a la brújula');
    return;
  }

  // Si en 3 s no llega ningún dato, probablemente no hay magnetómetro (o es un PC)
  setTimeout(() => {
    if (!lastOrientationAt) setStatus('No llegan datos de orientación. ¿Estás en un móvil con brújula?');
  }, 3000);
}

/* =========================================================================
   3. GPS: ALTITUD Y POSICIÓN
   -------------------------------------------------------------------------
   watchPosition llama a la función cada vez que hay una posición nueva.
   enableHighAccuracy: fuerza el GPS real (más preciso, gasta más batería).
   coords.altitude puede ser null hasta que el GPS tiene "fix" en 3D.
   ========================================================================= */
function startGPS() {
  if (!('geolocation' in navigator)) {
    setStatus('Este navegador no tiene geolocalización');
    return;
  }

  navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 30000,
  });
  setStatus('Buscando señal GPS…');
}

function onPosition(pos) {
  const c = pos.coords;

  ui.lat.textContent = formatCoord(c.latitude, 'N', 'S');
  ui.lon.textContent = formatCoord(c.longitude, 'E', 'O');
  ui.posAcc.textContent = Math.round(c.accuracy);

  if (c.altitude !== null) {
    ui.alt.textContent = Math.round(c.altitude);
    ui.altAcc.textContent = c.altitudeAccuracy !== null ? Math.round(c.altitudeAccuracy) : '?';
    setStatus('');
  } else {
    ui.alt.textContent = '—';
    ui.altAcc.textContent = '—';
    setStatus('Posición OK, esperando altitud del GPS…');
  }
}

function onPositionError(err) {
  const msg = {
    1: 'Permiso de ubicación denegado',
    2: 'Ubicación no disponible',
    3: 'El GPS tarda en responder…',
  }[err.code] || 'Error de GPS';
  setStatus(msg);
}

// 43.0612 → "43.06120° N"
function formatCoord(value, pos, neg) {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? pos : neg}`;
}

/* =========================================================================
   4. EXTRAS: pantalla encendida, estado, PWA
   ========================================================================= */

// Wake Lock: evita que la pantalla se apague mientras usas la brújula
let wakeLock = null;
async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* no es crítico */ }
}
// El wake lock se libera al cambiar de app; lo pedimos de nuevo al volver
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock !== null) keepScreenOn();
});

function setStatus(text) {
  ui.status.textContent = text;
}

// Registrar el service worker (permite instalar la app y usarla offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------- Arranque ----------
buildRose(ui.rose);

ui.startBtn.addEventListener('click', async () => {
  ui.start.hidden = true;
  await startCompass();
  startGPS();
  keepScreenOn();
});
