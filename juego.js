/* ============================================================
   IMÁGENES
   Se intentan cargar primero tus archivos JPG/PNG originales.
   Si no están, se usan los SVG de respaldo incluidos en /img.
   ============================================================ */
const CARPETA = "img/"; // La barra final es importante para formar las rutas.
const IMG = {
  fondo:     CARPETA + "fondo.jpg",
  cubo:      CARPETA + "cubo.jpg",
  titulo:    CARPETA + "titulo.png",
  victoria:  CARPETA + "victoria.jpg"
};
const RESPALDOS = {
  fondo:     CARPETA + "fondo.svg",
  cubo:      CARPETA + "cubo.svg",
  titulo:    CARPETA + "titulo.svg",
  victoria:  CARPETA + "victoria.svg"
};
// Imágenes usadas tanto para los sustos como para la criatura que te persigue.
const SUSTOS = ["susto1.jpg", "susto2.jpg", "susto3.jpg", "susto4.jpg", "susto5.jpg", "susto6.jpg"];

const $ = id => document.getElementById(id);
const cFondo = $('fondo'), cJuego = $('juego'), cOsc = $('oscuridad');
const gF = cFondo.getContext('2d'), gG = cJuego.getContext('2d'), gO = cOsc.getContext('2d');
const mundo = document.createElement('canvas'), gM = mundo.getContext('2d', {willReadFrequently:true});

// Carga una imagen y prueba un respaldo local si el archivo original no existe.
function cargarImagen(ruta, respaldo, alCargar) {
  const imagen = new Image();
  let probandoRespaldo = false;
  imagen.onload = () => { if (alCargar) alCargar(imagen); };
  imagen.onerror = () => {
    if (!probandoRespaldo && respaldo) {
      probandoRespaldo = true;
      imagen.src = respaldo;
    } else {
      console.error('No se pudo cargar la imagen:', ruta);
    }
  };
  imagen.src = ruta;
  return imagen;
}

// Asigna una imagen a un elemento HTML con el mismo sistema de respaldo.
function asignarImagen(elemento, ruta, respaldo) {
  let probandoRespaldo = false;
  elemento.onerror = () => {
    if (!probandoRespaldo && respaldo) {
      probandoRespaldo = true;
      elemento.src = respaldo;
    } else {
      elemento.style.display = 'none';
      console.error('No se pudo mostrar la imagen:', ruta);
    }
  };
  elemento.onload = () => { elemento.style.display = ''; };
  elemento.src = ruta;
}

const cargadas = {};
for (const k in IMG) {
  cargarImagen(IMG[k], RESPALDOS[k], imagen => { cargadas[k] = imagen; });
}
asignarImagen($('imgTitulo'), IMG.titulo, RESPALDOS.titulo);
asignarImagen($('imgVictoria'), IMG.victoria, RESPALDOS.victoria);

const SU = SUSTOS.map((nombre, indice) =>
  cargarImagen(CARPETA + nombre, CARPETA + `susto${indice + 1}.svg`)
);
const ok = i => i && i.complete && i.naturalWidth > 0;

// ---- Parámetros ----
const C = 72, P = 46;            // celda y ancho del pasillo
const COLS = 29, FILAS = 19;     // laberinto grande
const CUBO = 24;                 // tamaño del cubo
const VEL = 170;                 // píxeles por segundo
const ZOOM = 1.6;                // cámara cercana
const RADIO = 190;               // radio de la linterna (pantalla)

let W, H, estado = 'menu', px, py, inicio, meta, paredes, MW, MH, tf = 0, ultimo = 0;
const teclas = {};
let rastro = [], largo = 0, acecho = null;

/* ---------- LABERINTO ---------- */
function generar() {
  MW = mundo.width = COLS * C; MH = mundo.height = FILAS * C;
  const vis = Array.from({length: FILAS}, () => Array(COLS).fill(false)), pasos = [], pila = [[0, 0]];
  vis[0][0] = true;
  while (pila.length) {
    const [c, r] = pila[pila.length - 1];
    const vec = [[1,0],[-1,0],[0,1],[0,-1]].map(d => [c + d[0], r + d[1]])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < COLS && b < FILAS && !vis[b][a]);
    if (!vec.length) { pila.pop(); continue; }
    const [a, b] = vec[Math.floor(Math.random() * vec.length)];
    vis[b][a] = true; pasos.push([c, r, a, b]); pila.push([a, b]);
  }
  gM.globalCompositeOperation = 'source-over'; gM.clearRect(0, 0, MW, MH);
  const g = gM.createLinearGradient(0, 0, MW, MH);
  g.addColorStop(0, '#7a0000'); g.addColorStop(.5, '#b00606'); g.addColorStop(1, '#6a0000');
  gM.fillStyle = g; gM.fillRect(0, 0, MW, MH);
  gM.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 1800; i++) {
    gM.fillStyle = `rgba(${40 + Math.random() * 60},0,0,${Math.random() * .5})`;
    gM.fillRect(Math.random() * MW, Math.random() * MH, 1 + Math.random() * 3, 10 + Math.random() * 60);
  }
  gM.globalCompositeOperation = 'destination-out'; gM.fillStyle = '#000';
  const cen = (c, r) => [c * C + C / 2, r * C + C / 2];
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) { const [x, y] = cen(c, r); gM.fillRect(x - P / 2, y - P / 2, P, P); }
  for (const [c1, r1, c2, r2] of pasos) {
    const [x1, y1] = cen(c1, r1), [x2, y2] = cen(c2, r2);
    gM.fillRect(Math.min(x1, x2) - P / 2, Math.min(y1, y2) - P / 2, Math.abs(x2 - x1) + P, Math.abs(y2 - y1) + P);
  }
  gM.globalCompositeOperation = 'source-over';
  paredes = gM.getImageData(0, 0, MW, MH).data;
  inicio = cen(0, 0); meta = cen(COLS - 1, FILAS - 1);
  px = inicio[0]; py = inicio[1];
}

// Cualquier punto del borde del cubo sobre una pared = muerte
const PUNTOS = []; for (const t of [-12,-8,-4,0,4,8,12]) PUNTOS.push([t,-12],[t,12],[-12,t],[12,t]);
function choca(x, y) {
  for (const [dx, dy] of PUNTOS) {
    const ax = Math.round(x + dx), ay = Math.round(y + dy);
    if (ax < 0 || ay < 0 || ax >= MW || ay >= MH) return true;
    if (paredes[(ay * MW + ax) * 4 + 3] > 20) return true;
  }
  return false;
}

/* ---------- AUDIO ---------- */
let ac;
function iniciarAudio() {
  const AudioContextDisponible = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextDisponible) return; // El juego sigue funcionando aunque el navegador no tenga audio web.
  try {
    ac = ac || new AudioContextDisponible();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  } catch (error) {
    console.warn('El audio no está disponible en este navegador:', error);
  }
}
function grito() {
  if (!ac) return;
  const t = ac.currentTime, d = 2.6, dist = ac.createWaveShaper(), curva = new Float32Array(44100);
  for (let i = 0; i < 44100; i++) { const x = i * 2 / 44100 - 1; curva[i] = (3 + 400) * x * 20 * (Math.PI / 180) / (Math.PI + 400 * Math.abs(x)); }
  dist.curve = curva; dist.oversample = '4x';
  const comp = ac.createDynamicsCompressor(), vol = ac.createGain(), env = ac.createGain();
  vol.gain.value = 2.2;
  env.gain.setValueAtTime(1, t); env.gain.linearRampToValueAtTime(1, t + d - .5); env.gain.linearRampToValueAtTime(0, t + d);
  env.connect(dist); dist.connect(comp); comp.connect(vol); vol.connect(ac.destination);
  [1, 1.5, 2.02, .5].forEach((m, i) => {
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = i % 2 ? 'square' : 'sawtooth';
    o.frequency.setValueAtTime(450 * m, t);
    o.frequency.exponentialRampToValueAtTime(1500 * m, t + .25);
    o.frequency.linearRampToValueAtTime(950 * m, t + d);
    lfo.frequency.value = 13 + i * 3; lg.gain.value = 90 * m;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(env);
    o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
  });
  const buf = ac.createBuffer(1, ac.sampleRate * d, ac.sampleRate), dat = buf.getChannelData(0);
  for (let i = 0; i < dat.length; i++) dat[i] = Math.random() * 2 - 1;
  const ru = ac.createBufferSource(), bp = ac.createBiquadFilter();
  ru.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = .6;
  ru.connect(bp); bp.connect(env); ru.start(t);
}

/* ---------- ESTADOS ---------- */
function mostrar(id) { document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('on')); if (id) $(id).classList.add('on'); }
function perder() {
  if (estado !== 'jugando') return;
  estado = 'muerto';
  const indiceSusto = Math.floor(Math.random() * SUSTOS.length);
  asignarImagen($('imgScare'), CARPETA + SUSTOS[indiceSusto], CARPETA + `susto${indiceSusto + 1}.svg`);
  const f = $('scare').querySelector('.flash'); f.style.animation = 'none'; f.offsetHeight; f.style.animation = '';
  mostrar('scare'); grito();
  if (navigator.vibrate) navigator.vibrate([200, 80, 300]);
  setTimeout(() => mostrar('derrota'), 2600);
}
function ganar() { estado = 'ganado'; mostrar('victoria'); }
function nuevo() {
  generar(); estado = 'jugando'; mostrar(null);
  rastro = [{x: px, y: py, s: 0}]; largo = 0;
  acecho = {img: SU[Math.floor(Math.random() * SU.length)], gap: 650, on: false, peligro: false, pr: 0, j: 0, x: 0, y: 0, lat: 0};
}
$('btnEntrar').onclick = () => { iniciarAudio(); nuevo(); };
$('btnReintentar').onclick = nuevo;
$('btnOtra').onclick = nuevo;

/* ---------- ENTRADA: WASD ---------- */
addEventListener('keydown', e => { if (['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) { teclas[e.code] = true; e.preventDefault(); } });
addEventListener('keyup', e => { teclas[e.code] = false; });
addEventListener('blur', () => { for (const k in teclas) teclas[k] = false; });
addEventListener('pointermove', e => { $('luz').style.left = e.clientX + 'px'; $('luz').style.top = e.clientY + 'px'; });
function resize() { W = cFondo.width = cJuego.width = cOsc.width = innerWidth; H = cFondo.height = cJuego.height = cOsc.height = innerHeight; }
addEventListener('resize', resize);

/* ---------- FONDO ANIMADO ---------- */
const ceniza = Array.from({length: 90}, () => ({x: Math.random(), y: Math.random(), v: .0002 + Math.random() * .0006, r: 1 + Math.random() * 2.5}));
const niebla = Array.from({length: 7}, () => ({x: Math.random(), y: Math.random(), r: 200 + Math.random() * 250, v: (Math.random() - .5) * .0004}));
function dibujarFondo() {
  gF.fillStyle = '#050000'; gF.fillRect(0, 0, W, H);
  const im = cargadas.fondo;
  if (im) {
    const s = Math.max(W / im.width, H / im.height) * (1.15 + Math.sin(tf / 200) * .03);
    gF.globalAlpha = .55 + Math.random() * .08;
    gF.drawImage(im, (W - im.width * s) / 2 - (px || 0) * .05, (H - im.height * s) / 2 - (py || 0) * .05, im.width * s, im.height * s);
    gF.globalAlpha = 1;
  }
  for (const n of niebla) {
    n.x += n.v; if (n.x > 1.3) n.x = -.3; if (n.x < -.3) n.x = 1.3;
    const g = gF.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r);
    g.addColorStop(0, `rgba(120,0,0,${.18 + Math.sin(tf / 60 + n.r) * .06})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    gF.fillStyle = g; gF.fillRect(0, 0, W, H);
  }
  gF.fillStyle = 'rgba(200,60,40,.6)';
  for (const c of ceniza) {
    c.y -= c.v; c.x += Math.sin(tf / 50 + c.r) * .0005; if (c.y < 0) { c.y = 1; c.x = Math.random(); }
    gF.beginPath(); gF.arc(c.x * W, c.y * H, c.r, 0, 7); gF.fill();
  }
  if (Math.random() < .012) { gF.fillStyle = 'rgba(255,0,0,.12)'; gF.fillRect(0, 0, W, H); }
}

/* ---------- MUNDO (cámara que sigue al cubo) ---------- */
function dibujarJuego() {
  gG.clearRect(0, 0, W, H);
  if (!paredes) return;
  gG.save();
  gG.translate(W / 2, H / 2); gG.scale(ZOOM, ZOOM); gG.translate(-px, -py);
  gG.drawImage(mundo, 0, 0);
  // salida (solo visible dentro de la luz)
  gG.fillStyle = `rgba(255,255,255,${.6 + Math.sin(tf / 8) * .3})`;
  gG.shadowColor = '#fff'; gG.shadowBlur = 20;
  gG.beginPath(); gG.arc(meta[0], meta[1], 9, 0, 7); gG.fill();
  gG.shadowBlur = 0;
  // cubo
  gG.save(); gG.translate(px, py);
  gG.shadowColor = '#ffd9a0'; gG.shadowBlur = 18;
  if (cargadas.cubo) gG.drawImage(cargadas.cubo, -CUBO / 2, -CUBO / 2, CUBO, CUBO);
  else {
    const g = gG.createLinearGradient(-CUBO / 2, -CUBO / 2, CUBO / 2, CUBO / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#bbb');
    gG.fillStyle = g; gG.fillRect(-CUBO / 2, -CUBO / 2, CUBO, CUBO);
    gG.shadowBlur = 0; gG.strokeStyle = '#555'; gG.lineWidth = 2; gG.strokeRect(-CUBO / 2 + 1, -CUBO / 2 + 1, CUBO - 2, CUBO - 2);
  }
  gG.restore(); gG.restore();
}

/* ---------- OSCURIDAD + LINTERNA ---------- */
function dibujarOscuridad() {
  gO.globalCompositeOperation = 'source-over';
  gO.clearRect(0, 0, W, H);
  // La capa negra solo se aplica durante la partida. Antes tapaba el fondo del menú.
  if (estado === 'jugando') {
    gO.fillStyle = 'rgba(0,0,0,.985)'; gO.fillRect(0, 0, W, H);
    const fl = 1 + Math.sin(tf / 3) * .03 + (Math.random() < .03 ? -.25 : 0);
    const R = RADIO * fl, cx = W / 2, cy = H / 2;
    gO.globalCompositeOperation = 'destination-out';
    const g = gO.createRadialGradient(cx, cy, 8, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    gO.fillStyle = g; gO.beginPath(); gO.arc(cx, cy, R, 0, 7); gO.fill();
    gO.globalCompositeOperation = 'source-over';
    const g2 = gO.createRadialGradient(cx, cy, 0, cx, cy, R);
    g2.addColorStop(0, 'rgba(255,200,120,.12)'); g2.addColorStop(1, 'rgba(255,150,60,0)');
    gO.fillStyle = g2; gO.beginPath(); gO.arc(cx, cy, R, 0, 7); gO.fill();
  }
  if (estado === 'jugando' && acecho && acecho.on) {
    const a = acecho, sx = W / 2 + (a.x - px) * ZOOM, sy = H / 2 + (a.y - py) * ZOOM, d = Math.hypot(a.x - px, a.y - py);
    let al = Math.max(0, 1 - d / 300) * (.25 + .6 * a.pr) * (Math.random() < .08 ? .2 : 1);   // asoma y parpadea
    if (a.peligro) {
      al = Math.min(1, al * 1.8 + .15);
      const v = gO.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .8);       // viñeta roja de peligro
      v.addColorStop(0, 'rgba(120,0,0,0)'); v.addColorStop(1, `rgba(150,0,0,${.25 + Math.sin(tf / 6) * .12})`);
      gO.fillStyle = v; gO.fillRect(0, 0, W, H);
    }
    gO.globalCompositeOperation = 'screen'; gO.globalAlpha = al;
    if (ok(a.img)) {
      const m = (110 + 70 * a.pr) * ZOOM / Math.max(a.img.width, a.img.height), w = a.img.width * m, h = a.img.height * m;
      gO.drawImage(a.img, sx - w / 2, sy - h / 2, w, h);
    } else {                                                                              // sin imagen: ojos rojos
      gO.fillStyle = '#f00'; gO.beginPath(); gO.arc(sx - 9, sy, 4, 0, 7); gO.arc(sx + 9, sy, 4, 0, 7); gO.fill();
    }
    gO.globalAlpha = 1; gO.globalCompositeOperation = 'source-over';
  }
}

/* ---------- CRIATURA QUE ACECHA ---------- */
function progreso() {
  const d0 = Math.hypot(meta[0] - inicio[0], meta[1] - inicio[1]);
  return Math.max(0, Math.min(1, 1 - Math.hypot(px - meta[0], py - meta[1]) / d0));
}
function latido(v) {
  if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = 55; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .25);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + .3);
}
function acechar(dt) {
  const u = rastro[rastro.length - 1], d = Math.hypot(px - u.x, py - u.y);
  if (d > 5) { largo += d; rastro.push({x: px, y: py, s: largo}); }   // migas de pan: la criatura sigue tu camino
  const a = acecho, pr = a.pr = progreso();
  if (pr < .25) { a.on = false; return; }                            // al inicio estás a salvo
  if (!a.peligro) { if (pr >= .8) a.peligro = true; else a.gap = 650 - 410 * (pr - .25) / .55; }  // se acerca poco a poco
  if (a.peligro) a.gap = Math.max(0, a.gap - VEL * .22 * dt);        // cerca del final: te alcanza si te quedas atrás
  const st = largo - a.gap;
  if (st <= 0) { a.on = false; return; }
  while (a.j < rastro.length - 2 && rastro[a.j + 1].s <= st) a.j++;
  const p = rastro[a.j], q = rastro[a.j + 1] || p, k = Math.max(0, Math.min(1, (st - p.s) / ((q.s - p.s) || 1)));
  a.x = p.x + (q.x - p.x) * k; a.y = p.y + (q.y - p.y) * k; a.on = true;
  const dist = Math.hypot(px - a.x, py - a.y);
  a.lat -= dt; if (a.lat <= 0) { latido(Math.max(.15, 1 - dist / 400)); a.lat = .35 + Math.min(1, dist / 400) * .9; }
  if (a.peligro && dist < CUBO) perder();
}

function bucle(t) {
  const dt = Math.min((t - ultimo) / 1000 || 0, .05); ultimo = t; tf++;
  if (estado === 'jugando') {
    let dx = (teclas.KeyD ? 1 : 0) - (teclas.KeyA ? 1 : 0), dy = (teclas.KeyS ? 1 : 0) - (teclas.KeyW ? 1 : 0);
    if (dx || dy) { const l = Math.hypot(dx, dy); px += dx / l * VEL * dt; py += dy / l * VEL * dt; }
    if (choca(px, py)) perder();
    else if (Math.hypot(px - meta[0], py - meta[1]) < P / 2) ganar();
    else acechar(dt);
  }
  dibujarFondo(); dibujarJuego(); dibujarOscuridad();
  $('luz').style.display = estado === 'jugando' ? 'none' : 'block';
  requestAnimationFrame(bucle);
}
resize(); generar(); requestAnimationFrame(bucle);
