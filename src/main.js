import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

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
const VR_SPEED = 3.0;
const VR_SNAP_ANGLE = Math.PI / 6;
const VR_STICK_DEADZONE = 0.2;

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

// Player rig: holds camera (and VR controllers). Locomotion moves the rig;
// in VR the headset drives the camera's local pose, in desktop we set it.
const playerRig = new THREE.Group();
scene.add(playerRig);
playerRig.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

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
// camera is already parented to playerRig; PointerLockControls only rotates it.

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

// Desktop gun: attached to camera, offset to lower-right of view.
function buildGun(offset) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  body.position.set(0, 0, -0.2);
  g.add(body);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.55);
  g.add(barrel);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffee66 })
  );
  flash.position.set(0, 0, -0.75);
  flash.visible = false;
  g.add(flash);
  if (offset) g.position.copy(offset);
  return { group: g, flash };
}

const desktopGun = buildGun(new THREE.Vector3(0.25, -0.2, -0.2));
camera.add(desktopGun.group);
const muzzle = desktopGun.flash;

// VR controllers (right = primary shooter, left = movement).
const controllerR = renderer.xr.getController(0);
const controllerL = renderer.xr.getController(1);
playerRig.add(controllerR);
playerRig.add(controllerL);
const vrGunR = buildGun(null);
const vrGunL = buildGun(null);
controllerR.add(vrGunR.group);
controllerL.add(vrGunL.group);

function flashMuzzle(flash) {
  flash.visible = true;
  setTimeout(() => { flash.visible = false; }, MUZZLE_FLASH_MS);
}

const tmpOrigin = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
function shootFromController(controller, flash) {
  controller.getWorldPosition(tmpOrigin);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.getWorldQuaternion(tmpQuat));
  shoot(tmpOrigin, dir);
  flashMuzzle(flash);
}
controllerR.addEventListener('selectstart', () => {
  if (state.gameOver) { resetGame(); state.running = true; return; }
  shootFromController(controllerR, vrGunR.flash);
});
controllerL.addEventListener('selectstart', () => {
  if (state.gameOver) { resetGame(); state.running = true; return; }
  shootFromController(controllerL, vrGunL.flash);
});

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

function shoot(origin, dir) {
  if (!state.running || state.gameOver) return;

  raycaster.set(origin, dir);

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
  bullet.position.copy(origin);
  bullet.userData.velocity = dir.clone().multiplyScalar(80);
  bullet.userData.life = 1.0;
  scene.add(bullet);
  bullets.push(bullet);

  sfxShoot();
}

function shootFromCamera() {
  camera.getWorldDirection(tmpDir);
  shoot(camera.getWorldPosition(tmpOrigin), tmpDir);
  flashMuzzle(muzzle);
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
  if (e.button === 0 && controls.isLocked) shootFromCamera();
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
  playerRig.position.set(0, 0, 0);
  playerRig.rotation.set(0, 0, 0);
  camera.position.set(0, PLAYER_HEIGHT, 0);
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

function collidesAtXZ(x, z) {
  tmpCenter.set(x, PLAYER_HEIGHT / 2, z);
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
const tmpPlayer = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();

function updateDesktop(delta) {
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;
  velocity.y -= GRAVITY * delta;

  camera.getWorldDirection(tmpForward);
  tmpForward.y = 0;
  if (tmpForward.lengthSq() > 0) tmpForward.normalize();
  tmpRight.set(-tmpForward.z, 0, tmpForward.x);

  tmpMove.set(0, 0, 0);
  if (keys.forward) tmpMove.add(tmpForward);
  if (keys.backward) tmpMove.sub(tmpForward);
  if (keys.right) tmpMove.add(tmpRight);
  if (keys.left) tmpMove.sub(tmpRight);
  if (tmpMove.lengthSq() > 0) {
    tmpMove.normalize();
    velocity.x += tmpMove.x * PLAYER_SPEED * delta;
    velocity.z += tmpMove.z * PLAYER_SPEED * delta;
  }

  const moveX = velocity.x * delta;
  playerRig.position.x += moveX;
  if (collidesAtXZ(playerRig.position.x, playerRig.position.z)) {
    playerRig.position.x -= moveX;
    velocity.x = 0;
  }
  const moveZ = velocity.z * delta;
  playerRig.position.z += moveZ;
  if (collidesAtXZ(playerRig.position.x, playerRig.position.z)) {
    playerRig.position.z -= moveZ;
    velocity.z = 0;
  }

  camera.position.y += velocity.y * delta;
  if (camera.position.y < PLAYER_HEIGHT) {
    camera.position.y = PLAYER_HEIGHT;
    velocity.y = 0;
    canJump = true;
  }
}

let snapReady = true;
function snapTurn(angle) {
  camera.getWorldPosition(tmpPlayer);
  const dx = playerRig.position.x - tmpPlayer.x;
  const dz = playerRig.position.z - tmpPlayer.z;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  playerRig.position.x = tmpPlayer.x + dx * cos - dz * sin;
  playerRig.position.z = tmpPlayer.z + dx * sin + dz * cos;
  playerRig.rotation.y += angle;
}

function updateVR(delta) {
  const session = renderer.xr.getSession();
  if (!session) return;
  let mx = 0, mz = 0, turn = 0;
  for (const src of session.inputSources) {
    if (!src.gamepad) continue;
    const axes = src.gamepad.axes;
    const ax = axes.length >= 4 ? axes[2] : axes[0];
    const ay = axes.length >= 4 ? axes[3] : axes[1];
    if (src.handedness === 'left') {
      if (Math.abs(ax) > VR_STICK_DEADZONE) mx += ax;
      if (Math.abs(ay) > VR_STICK_DEADZONE) mz += ay;
    } else if (src.handedness === 'right') {
      if (Math.abs(ax) > VR_STICK_DEADZONE) turn = ax;
    }
  }

  if (mx !== 0 || mz !== 0) {
    camera.getWorldDirection(tmpForward);
    tmpForward.y = 0;
    if (tmpForward.lengthSq() > 0) tmpForward.normalize();
    tmpRight.set(-tmpForward.z, 0, tmpForward.x);
    tmpMove.set(0, 0, 0);
    tmpMove.addScaledVector(tmpForward, -mz);
    tmpMove.addScaledVector(tmpRight, mx);
    if (tmpMove.lengthSq() > 0) {
      tmpMove.normalize().multiplyScalar(VR_SPEED * delta);
      camera.getWorldPosition(tmpPlayer);
      if (!collidesAtXZ(tmpPlayer.x + tmpMove.x, tmpPlayer.z)) playerRig.position.x += tmpMove.x;
      if (!collidesAtXZ(tmpPlayer.x, tmpPlayer.z + tmpMove.z)) playerRig.position.z += tmpMove.z;
    }
  }

  if (Math.abs(turn) > 0.7) {
    if (snapReady) {
      snapTurn(turn > 0 ? -VR_SNAP_ANGLE : VR_SNAP_ANGLE);
      snapReady = false;
    }
  } else {
    snapReady = true;
  }
}

function updateGameLogic(delta) {
  state.spawnTimer += delta;
  if (state.spawnTimer >= ENEMY_SPAWN_INTERVAL) {
    state.spawnTimer = 0;
    spawnEnemy();
  }

  camera.getWorldPosition(tmpPlayer);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const ep = enemy.mesh.position;
    const toPlayer = new THREE.Vector3(tmpPlayer.x - ep.x, 0, tmpPlayer.z - ep.z);
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

// In-headset HUD: a small canvas plane attached to the camera (DOM HUD is invisible in VR).
const vrHudCanvas = document.createElement('canvas');
vrHudCanvas.width = 512;
vrHudCanvas.height = 128;
const vrHudCtx = vrHudCanvas.getContext('2d');
const vrHudTex = new THREE.CanvasTexture(vrHudCanvas);
const vrHud = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 0.125),
  new THREE.MeshBasicMaterial({ map: vrHudTex, transparent: true, depthTest: false })
);
vrHud.position.set(0, -0.32, -1);
vrHud.renderOrder = 999;
vrHud.visible = false;
camera.add(vrHud);

let vrHudLast = '';
function updateVRHud() {
  vrHud.visible = renderer.xr.isPresenting;
  if (!vrHud.visible) return;
  const text = state.gameOver
    ? `KONEC - skore ${state.score} - spoust = restart`
    : `Skore ${state.score}    Zivoty ${Math.max(0, Math.round(state.health))}    Nepratele ${enemies.length}`;
  if (text === vrHudLast) return;
  vrHudLast = text;
  vrHudCtx.clearRect(0, 0, 512, 128);
  vrHudCtx.fillStyle = 'rgba(0,0,0,0.55)';
  vrHudCtx.fillRect(0, 0, 512, 128);
  vrHudCtx.fillStyle = '#ffffff';
  vrHudCtx.font = 'bold 28px sans-serif';
  vrHudCtx.textAlign = 'center';
  vrHudCtx.textBaseline = 'middle';
  vrHudCtx.fillText(text, 256, 64);
  vrHudTex.needsUpdate = true;
}

renderer.xr.addEventListener('sessionstart', () => {
  ensureAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  menuEl.classList.add('hidden');
  if (typeof settingsEl !== 'undefined') settingsEl.classList.add('hidden');
  desktopGun.group.visible = false;
  resetGame();
  state.running = true;
});
renderer.xr.addEventListener('sessionend', () => {
  state.running = false;
  desktopGun.group.visible = true;
  menuEl.classList.remove('hidden');
  vrHud.visible = false;
});

function render() {
  const delta = Math.min(clock.getDelta(), 0.05);
  if (state.running && !state.gameOver) {
    if (renderer.xr.isPresenting) updateVR(delta);
    else updateDesktop(delta);
    updateGameLogic(delta);
  }
  updateVRHud();
  renderer.render(scene, camera);
}

updateHud();
renderer.setAnimationLoop(render);
