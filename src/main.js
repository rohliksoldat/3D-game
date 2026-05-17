import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const WORLD_SIZE = 100;
const ENEMY_SPEED = 1.6;
const ENEMY_DAMAGE = 12;
const ENEMY_HIT_DISTANCE = 1.6;
const ENEMY_SPAWN_INTERVAL = 2.2;
const MAX_ENEMIES = 18;
const PLAYER_SPEED = 35;
const PLAYER_HEIGHT = 1.7;
const JUMP_VELOCITY = 8;
const GRAVITY = 22;
const MUZZLE_FLASH_MS = 60;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b6e8);
scene.fog = new THREE.Fog(0x87b6e8, 30, 120);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, PLAYER_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(40, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
  new THREE.MeshStandardMaterial({ color: 0x4a7a3a })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(WORLD_SIZE * 2, 60, 0x000000, 0x000000);
grid.material.opacity = 0.12;
grid.material.transparent = true;
scene.add(grid);

const obstacleBoxes = [];
function addObstacle(x, z, w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
}
for (let i = 0; i < 16; i++) {
  const x = (Math.random() - 0.5) * WORLD_SIZE * 1.4;
  const z = (Math.random() - 0.5) * WORLD_SIZE * 1.4;
  if (Math.hypot(x, z) < 8) continue;
  const w = 2 + Math.random() * 4;
  const h = 2 + Math.random() * 5;
  const d = 2 + Math.random() * 4;
  addObstacle(x, z, w, h, d, new THREE.Color().setHSL(Math.random() * 0.1 + 0.05, 0.3, 0.45).getHex());
}

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

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
  const angle = Math.random() * Math.PI * 2;
  const dist = 30 + Math.random() * 30;
  const x = Math.cos(angle) * dist;
  const z = Math.sin(angle) * dist;
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
      if (canJump) { velocity.y = JUMP_VELOCITY; canJump = false; }
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

startBtn.addEventListener('click', () => {
  if (state.gameOver) resetGame();
  controls.lock();
});

controls.addEventListener('lock', () => {
  menuEl.classList.add('hidden');
  state.running = true;
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

function collidesWithObstacle(pos) {
  playerBox.setFromCenterAndSize(
    new THREE.Vector3(pos.x, pos.y - PLAYER_HEIGHT / 2, pos.z),
    playerSize
  );
  for (const box of obstacleBoxes) {
    if (box.intersectsBox(playerBox)) return true;
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

    direction.z = Number(keys.forward) - Number(keys.backward);
    direction.x = Number(keys.right) - Number(keys.left);
    direction.normalize();

    if (keys.forward || keys.backward) velocity.z -= direction.z * PLAYER_SPEED * delta;
    if (keys.left || keys.right) velocity.x -= direction.x * PLAYER_SPEED * delta;

    const obj = controls.getObject();
    const prev = obj.position.clone();

    controls.moveRight(-velocity.x * delta);
    if (collidesWithObstacle(obj.position)) obj.position.x = prev.x;

    const afterX = obj.position.clone();
    controls.moveForward(-velocity.z * delta);
    if (collidesWithObstacle(obj.position)) obj.position.z = afterX.z;

    obj.position.y += velocity.y * delta;
    if (obj.position.y < PLAYER_HEIGHT) {
      obj.position.y = PLAYER_HEIGHT;
      velocity.y = 0;
      canJump = true;
    }

    const halfWorld = WORLD_SIZE - 1;
    obj.position.x = Math.max(-halfWorld, Math.min(halfWorld, obj.position.x));
    obj.position.z = Math.max(-halfWorld, Math.min(halfWorld, obj.position.z));

    state.spawnTimer += delta;
    if (state.spawnTimer >= ENEMY_SPAWN_INTERVAL) {
      state.spawnTimer = 0;
      spawnEnemy();
    }

    const playerPos = obj.position;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.mesh.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 0.001) {
        toPlayer.normalize();
        enemy.mesh.position.x += toPlayer.x * ENEMY_SPEED * delta;
        enemy.mesh.position.z += toPlayer.z * ENEMY_SPEED * delta;
      }
      if (dist < ENEMY_HIT_DISTANCE) {
        state.health -= ENEMY_DAMAGE * delta * 2;
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
