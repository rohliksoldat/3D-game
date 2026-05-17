import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const WORLD_SIZE = 15;
const WALL_HEIGHT = 6;
const ENEMY_SPEED = 1.6;
const ENEMY_DAMAGE = 12;
const ENEMY_HIT_DISTANCE = 1.6;
const ENEMY_SPAWN_INTERVAL = 2.2;
const MAX_ENEMIES = 12;
const PLAYER_SPEED = 35;
const PLAYER_HEIGHT = 1.7;
const JUMP_VELOCITY = 8;
const GRAVITY = 22;
const MUZZLE_FLASH_MS = 60;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec7ea);
scene.fog = new THREE.Fog(0x9ec7ea, 10, 40);

const SETTINGS_KEY = 'fps3d.settings';
const defaultSettings = { fov: 75, sensitivity: 1.0, volume: 0.5 };
let settings = { ...defaultSettings };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  settings = { ...defaultSettings, ...saved };
} catch (e) {
  console.warn('Settings load failed', e);
}

const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, PLAYER_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -WORLD_SIZE;
sun.shadow.camera.right = WORLD_SIZE;
sun.shadow.camera.top = WORLD_SIZE;
sun.shadow.camera.bottom = -WORLD_SIZE;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0005;
scene.add(sun);

function makeNoiseTexture(size, baseRGB, variation, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * variation;
    img.data[i * 4 + 0] = Math.max(0, Math.min(255, baseRGB[0] + n));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, baseRGB[1] + n));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, baseRGB[2] + n));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

function makeGrassTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a7a3a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const shade = 40 + Math.floor(Math.random() * 60);
    const g = 90 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${shade}, ${g}, ${shade - 20})`;
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD_SIZE, WORLD_SIZE);
  tex.anisotropy = 8;
  return tex;
}

function makeBrickTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a2a26';
  ctx.fillRect(0, 0, size, size);
  const brickW = 64, brickH = 28;
  for (let row = 0; row < size / brickH; row++) {
    const offset = (row % 2) * (brickW / 2);
    for (let col = -1; col < size / brickW + 1; col++) {
      const x = col * brickW + offset + 2;
      const y = row * brickH + 2;
      const r = 140 + Math.floor(Math.random() * 40);
      const g = 60 + Math.floor(Math.random() * 25);
      const b = 50 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, brickW - 4, brickH - 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeWoodTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 2) {
    const shade = 80 + Math.floor(Math.random() * 40);
    ctx.strokeStyle = `rgba(${shade + 20}, ${shade - 20}, ${shade - 40}, 0.6)`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.bezierCurveTo(size / 3, i + (Math.random() - 0.5) * 4, 2 * size / 3, i + (Math.random() - 0.5) * 4, size, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const groundTex = makeGrassTexture();
const brickTex = makeBrickTexture();
const woodTex = makeWoodTexture();
const concreteTex = makeNoiseTexture(128, [150, 150, 155], 50, 4);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const obstacleBoxes = [];

// Arena walls
const wallThickness = 1;
const wallY = WALL_HEIGHT / 2;
const wallConfigs = [
  { x: 0, z: -WORLD_SIZE, w: WORLD_SIZE * 2 + wallThickness, d: wallThickness },
  { x: 0, z:  WORLD_SIZE, w: WORLD_SIZE * 2 + wallThickness, d: wallThickness },
  { x: -WORLD_SIZE, z: 0, w: wallThickness, d: WORLD_SIZE * 2 + wallThickness },
  { x:  WORLD_SIZE, z: 0, w: wallThickness, d: WORLD_SIZE * 2 + wallThickness },
];
for (const c of wallConfigs) {
  const mat = new THREE.MeshStandardMaterial({ map: brickTex.clone(), roughness: 0.9 });
  mat.map.repeat.set(c.w / 2, WALL_HEIGHT / 2);
  mat.map.needsUpdate = true;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(c.w, WALL_HEIGHT, c.d), mat);
  wall.position.set(c.x, wallY, c.z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
  obstacleBoxes.push(new THREE.Box3().setFromObject(wall));
}

const obstacleTextures = [brickTex, woodTex, concreteTex];

function addObstacle(x, z, w, h, d, texture) {
  const mat = new THREE.MeshStandardMaterial({
    map: texture.clone(),
    roughness: 0.85,
  });
  mat.map.repeat.set(Math.max(1, w / 2), Math.max(1, h / 2));
  mat.map.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
}
for (let i = 0; i < 5; i++) {
  const x = (Math.random() - 0.5) * (WORLD_SIZE * 1.6);
  const z = (Math.random() - 0.5) * (WORLD_SIZE * 1.6);
  if (Math.hypot(x, z) < 4) continue;
  const w = 1.2 + Math.random() * 2.2;
  const h = 1.5 + Math.random() * 3;
  const d = 1.2 + Math.random() * 2.2;
  const tex = obstacleTextures[Math.floor(Math.random() * obstacleTextures.length)];
  addObstacle(x, z, w, h, d, tex);
}

const controls = new PointerLockControls(camera, renderer.domElement);
if ('pointerSpeed' in controls) controls.pointerSpeed = settings.sensitivity;
scene.add(controls.getObject());

// Web Audio: synthesized SFX so no asset files are needed.
let audioCtx = null;
let masterGain = null;
function ensureAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = settings.volume;
  masterGain.connect(audioCtx.destination);
}
function setVolume(v) {
  settings.volume = v;
  if (masterGain) masterGain.gain.value = v;
}
function playTone({ type = 'square', freqStart, freqEnd, duration, gain = 0.3 }) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + duration);
}
function sfxShoot() { playTone({ type: 'square', freqStart: 380, freqEnd: 60, duration: 0.09, gain: 0.25 }); }
function sfxHit()   { playTone({ type: 'sawtooth', freqStart: 900, freqEnd: 1500, duration: 0.06, gain: 0.2 }); }
function sfxHurt()  { playTone({ type: 'sawtooth', freqStart: 220, freqEnd: 90, duration: 0.18, gain: 0.35 }); }

const gun = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.15, 0.15, 0.6),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
gunBody.position.set(0.25, -0.2, -0.4);
gun.add(gunBody);
const gunBarrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x111111 })
);
gunBarrel.rotation.x = Math.PI / 2;
gunBarrel.position.set(0.25, -0.2, -0.75);
gun.add(gunBarrel);
const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffee66 })
);
muzzle.position.set(0.25, -0.2, -0.95);
muzzle.visible = false;
gun.add(muzzle);
camera.add(gun);

const enemies = [];
const enemyGeometry = new THREE.SphereGeometry(0.6, 16, 16);
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xd23030, emissive: 0x551111 });

function spawnEnemy() {
  if (enemies.length >= MAX_ENEMIES || state.gameOver || !state.running) return;
  let x = 0, z = 0, ok = false;
  for (let tries = 0; tries < 10 && !ok; tries++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 7 + Math.random() * (WORLD_SIZE - 8);
    x = Math.cos(angle) * dist;
    z = Math.sin(angle) * dist;
    if (!enemyCollidesAt(x, 0.6, z)) ok = true;
  }
  if (!ok) return;
  const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial.clone());
  mesh.position.set(x, 0.6, z);
  mesh.castShadow = true;
  scene.add(mesh);
  enemies.push({ mesh, health: 1 });
}

const bullets = [];
const bulletGeometry = new THREE.SphereGeometry(0.06, 8, 8);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffd24a });
const raycaster = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();

function shoot() {
  if (!state.running || state.gameOver) return;

  controls.getDirection(tmpDir);
  raycaster.set(camera.getWorldPosition(new THREE.Vector3()), tmpDir);

  const enemyMeshes = enemies.map(e => e.mesh);
  const hits = raycaster.intersectObjects(enemyMeshes, false);
  if (hits.length > 0) {
    const hit = hits[0];
    const idx = enemies.findIndex(e => e.mesh === hit.object);
    if (idx !== -1) {
      const enemy = enemies[idx];
      scene.remove(enemy.mesh);
      enemy.mesh.geometry = null;
      enemies.splice(idx, 1);
      state.score += 10;
      sfxHit();
      updateHud();
    }
  }

  const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
  bullet.position.copy(camera.getWorldPosition(new THREE.Vector3()));
  bullet.userData.velocity = tmpDir.clone().multiplyScalar(80);
  bullet.userData.life = 1.0;
  scene.add(bullet);
  bullets.push(bullet);

  muzzle.visible = true;
  setTimeout(() => { muzzle.visible = false; }, MUZZLE_FLASH_MS);
  sfxShoot();
}

const state = {
  running: false,
  gameOver: false,
  score: 0,
  health: 100,
  spawnTimer: 0,
};

const keys = { forward: false, backward: false, left: false, right: false, jump: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let canJump = false;

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.forward = true; break;
    case 'KeyS': case 'ArrowDown': keys.backward = true; break;
    case 'KeyA': case 'ArrowLeft': keys.left = true; break;
    case 'KeyD': case 'ArrowRight': keys.right = true; break;
    case 'Space':
      if (state.running && canJump) { velocity.y = JUMP_VELOCITY; canJump = false; }
      break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.forward = false; break;
    case 'KeyS': case 'ArrowDown': keys.backward = false; break;
    case 'KeyA': case 'ArrowLeft': keys.left = false; break;
    case 'KeyD': case 'ArrowRight': keys.right = false; break;
  }
});

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0 && controls.isLocked) shoot();
});

const menuEl = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const gameOverEl = document.getElementById('gameOver');
const scoreEl = document.getElementById('score');
const healthEl = document.getElementById('health');
const enemiesEl = document.getElementById('enemies');

function updateHud() {
  scoreEl.textContent = state.score;
  healthEl.textContent = Math.max(0, Math.round(state.health));
  enemiesEl.textContent = enemies.length;
}

function tryStart() {
  ensureAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (state.gameOver) resetGame();
  try {
    const result = controls.lock();
    if (result && typeof result.catch === 'function') {
      result.catch((err) => {
        console.warn('Pointer lock failed:', err);
        startBtn.textContent = 'Klikni znovu pro start';
      });
    }
  } catch (err) {
    console.warn('Pointer lock threw:', err);
  }
}

const settingsEl = document.getElementById('settings');
const settingsBtn = document.getElementById('settingsBtn');
const settingsBack = document.getElementById('settingsBack');
const fovInput = document.getElementById('fovInput');
const sensInput = document.getElementById('sensInput');
const volInput = document.getElementById('volInput');
const fovValue = document.getElementById('fovValue');
const sensValue = document.getElementById('sensValue');
const volValue = document.getElementById('volValue');

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch (e) { /* ignore */ }
}

function syncSettingsUI() {
  fovInput.value = settings.fov;
  sensInput.value = settings.sensitivity;
  volInput.value = settings.volume;
  fovValue.textContent = `${Math.round(settings.fov)}°`;
  sensValue.textContent = settings.sensitivity.toFixed(2);
  volValue.textContent = `${Math.round(settings.volume * 100)}%`;
}
syncSettingsUI();

fovInput.addEventListener('input', () => {
  settings.fov = Number(fovInput.value);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  fovValue.textContent = `${Math.round(settings.fov)}°`;
  saveSettings();
});
sensInput.addEventListener('input', () => {
  settings.sensitivity = Number(sensInput.value);
  if ('pointerSpeed' in controls) controls.pointerSpeed = settings.sensitivity;
  sensValue.textContent = settings.sensitivity.toFixed(2);
  saveSettings();
});
volInput.addEventListener('input', () => {
  ensureAudio();
  setVolume(Number(volInput.value));
  volValue.textContent = `${Math.round(settings.volume * 100)}%`;
  saveSettings();
});

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuEl.classList.add('hidden');
  settingsEl.classList.remove('hidden');
});
settingsBack.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
});

startBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  tryStart();
});

menuEl.addEventListener('click', (e) => {
  if (e.target === menuEl) tryStart();
});

document.addEventListener('keydown', (e) => {
  if ((e.code === 'Enter' || e.code === 'Space') && !state.running && !menuEl.classList.contains('hidden')) {
    e.preventDefault();
    tryStart();
  }
});

document.addEventListener('pointerlockerror', () => {
  console.warn('pointerlockerror fired — prohlížeč odmítl pointer lock.');
  startBtn.textContent = 'Klikni znovu (lock odmítnut)';
});

controls.addEventListener('lock', () => {
  menuEl.classList.add('hidden');
  state.running = true;
  startBtn.textContent = 'Hrát';
});
controls.addEventListener('unlock', () => {
  menuEl.classList.remove('hidden');
  state.running = false;
  startBtn.textContent = state.gameOver ? 'Hrát znovu' : 'Pokračovat';
});

function resetGame() {
  for (const e of enemies) scene.remove(e.mesh);
  enemies.length = 0;
  for (const b of bullets) scene.remove(b);
  bullets.length = 0;
  state.score = 0;
  state.health = 100;
  state.gameOver = false;
  state.spawnTimer = 0;
  gameOverEl.classList.add('hidden');
  startBtn.textContent = 'Hrát';
  controls.getObject().position.set(0, PLAYER_HEIGHT, 0);
  velocity.set(0, 0, 0);
  updateHud();
}

function endGame() {
  state.gameOver = true;
  state.running = false;
  gameOverEl.textContent = `Konec hry! Tvé skóre: ${state.score}`;
  gameOverEl.classList.remove('hidden');
  controls.unlock();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const playerBox = new THREE.Box3();
const playerSize = new THREE.Vector3(0.6, PLAYER_HEIGHT, 0.6);
const tmpCenter = new THREE.Vector3();

function collidesWithObstacle(pos) {
  tmpCenter.set(pos.x, pos.y - PLAYER_HEIGHT / 2, pos.z);
  playerBox.setFromCenterAndSize(tmpCenter, playerSize);
  for (const box of obstacleBoxes) {
    if (box.intersectsBox(playerBox)) return true;
  }
  return false;
}

const enemyBox = new THREE.Box3();
const enemySize = new THREE.Vector3(1.2, 1.2, 1.2);

function enemyCollidesAt(x, y, z) {
  tmpCenter.set(x, y, z);
  enemyBox.setFromCenterAndSize(tmpCenter, enemySize);
  for (const box of obstacleBoxes) {
    if (box.intersectsBox(enemyBox)) return true;
  }
  return false;
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.running && !state.gameOver) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= GRAVITY * delta;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const moveDir = new THREE.Vector3();
    if (keys.forward) moveDir.add(forward);
    if (keys.backward) moveDir.sub(forward);
    if (keys.right) moveDir.add(right);
    if (keys.left) moveDir.sub(right);
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      velocity.x += moveDir.x * PLAYER_SPEED * delta;
      velocity.z += moveDir.z * PLAYER_SPEED * delta;
    }

    const obj = controls.getObject();

    const moveX = velocity.x * delta;
    obj.position.x += moveX;
    if (collidesWithObstacle(obj.position)) {
      obj.position.x -= moveX;
      velocity.x = 0;
    }

    const moveZ = velocity.z * delta;
    obj.position.z += moveZ;
    if (collidesWithObstacle(obj.position)) {
      obj.position.z -= moveZ;
      velocity.z = 0;
    }

    obj.position.y += velocity.y * delta;
    if (obj.position.y < PLAYER_HEIGHT) {
      obj.position.y = PLAYER_HEIGHT;
      velocity.y = 0;
      canJump = true;
    }

    state.spawnTimer += delta;
    if (state.spawnTimer >= ENEMY_SPAWN_INTERVAL) {
      state.spawnTimer = 0;
      spawnEnemy();
    }

    const playerPos = obj.position;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const ep = enemy.mesh.position;
      const toPlayer = new THREE.Vector3().subVectors(playerPos, ep);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 0.001) {
        toPlayer.normalize();
        const dx = toPlayer.x * ENEMY_SPEED * delta;
        const dz = toPlayer.z * ENEMY_SPEED * delta;
        if (!enemyCollidesAt(ep.x + dx, ep.y, ep.z)) ep.x += dx;
        if (!enemyCollidesAt(ep.x, ep.y, ep.z + dz)) ep.z += dz;
      }
      if (dist < ENEMY_HIT_DISTANCE) {
        const before = state.health;
        state.health -= ENEMY_DAMAGE * delta * 2;
        if (Math.floor(before / 10) !== Math.floor(state.health / 10)) sfxHurt();
        if (state.health <= 0) {
          updateHud();
          endGame();
          break;
        }
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.position.addScaledVector(b.userData.velocity, delta);
      b.userData.life -= delta;
      if (b.userData.life <= 0) {
        scene.remove(b);
        bullets.splice(i, 1);
      }
    }

    updateHud();
  }

  renderer.render(scene, camera);
}

updateHud();
animate();
