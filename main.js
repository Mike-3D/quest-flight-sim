import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/webxr/VRButton.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x84c9fa);
scene.fog = new THREE.FogExp2(0x84c9fa, 0.0008);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 4500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, {
  optionalFeatures: ['local-floor', 'bounded-floor']
}));

scene.add(new THREE.HemisphereLight(0xd8edff, 0x637849, 2.1));
const sun = new THREE.DirectionalLight(0xfff2d4, 2.0);
sun.position.set(-200, 400, -250);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(12000, 12000),
  new THREE.MeshLambertMaterial({ color: 0x6fba68 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -12;
scene.add(ground);

const stripeMat = new THREE.MeshLambertMaterial({ color: 0x9bd48b });
for (let i = -12; i <= 12; i++) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 2500), stripeMat);
  line.position.set(i * 110, -11.85, -550);
  scene.add(line);
}
const hillMat = new THREE.MeshLambertMaterial({ color: 0x527b56, flatShading: true });
const hillGeometry = new THREE.ConeGeometry(1, 1, 5);
for (let i = 0; i < 55; i++) {
  const angle = i * 2.39996;
  const radius = 320 + (i % 11) * 90;
  const height = 55 + (i * 37) % 160;
  const hill = new THREE.Mesh(hillGeometry, hillMat);
  hill.scale.set(65 + (i % 4) * 22, height, 65 + (i % 4) * 22);
  hill.position.set(Math.cos(angle) * radius, -12 + height / 2, Math.sin(angle) * radius - 700);
  scene.add(hill);
}

const plane = new THREE.Group();
scene.add(plane);
const cockpit = new THREE.Group();
plane.add(cockpit);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x263d50, roughness: 0.65, metalness: 0.15 });
const brightMat = new THREE.MeshStandardMaterial({ color: 0xeff2e5, roughness: 0.7 });
function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  cockpit.add(mesh);
  return mesh;
}
// Cockpit follows the virtual aircraft, while WebXR head tracking remains independent.
part(new THREE.BoxGeometry(1.4, 0.32, 1.4), bodyMat, 0, -0.78, -0.85);
part(new THREE.BoxGeometry(0.09, 0.6, 2.3), brightMat, -0.84, -0.33, -1.05);
part(new THREE.BoxGeometry(0.09, 0.6, 2.3), brightMat, 0.84, -0.33, -1.05);
part(new THREE.BoxGeometry(1.65, 0.08, 0.08), brightMat, 0, -0.03, -1.83);
const nose = part(new THREE.ConeGeometry(0.45, 1.8, 6), brightMat, 0, -0.54, -2.45);
nose.rotation.x = -Math.PI / 2;
const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffd97d });
part(new THREE.BoxGeometry(0.035, 0.25, 0.03), reticleMat, 0, 0.02, -2.0);
part(new THREE.BoxGeometry(0.30, 0.035, 0.03), reticleMat, 0, 0.02, -2.0);

const flightEl = document.getElementById('flight');
const inputEl = document.getElementById('input');
const messageEl = document.getElementById('message');
const hud = document.getElementById('hud');
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyR') reset();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.getElementById('reset').addEventListener('click', reset);

let speed = 28;
let yaw = 0, pitch = 0, roll = 0;
let lastStatus = '';
function reset() {
  plane.position.set(0, 80, 180);
  plane.rotation.set(0, 0, 0);
  speed = 28; yaw = 0; pitch = 0; roll = 0;
  lastStatus = '';
}
reset();

// The player starts with head at eye-level in the cockpit.
// In VR the headset's pose remains controlled by WebXR.
const cameraRig = new THREE.Group();
plane.add(cameraRig);
cameraRig.position.set(0, 0.9, 0.25);
cameraRig.add(camera);
camera.position.set(0, 0, 0);
camera.rotation.set(0, 0, 0);

function axisValue(gamepad, preferred, fallback) {
  const a = gamepad.axes;
  const i = a.length > preferred ? preferred : fallback;
  const raw = a[i] ?? 0;
  return Math.abs(raw) < 0.16 ? 0 : Math.sign(raw) * (Math.abs(raw) - 0.16) / 0.84;
}
let resetWasDown = false;
function getControls() {
  let steerX = 0, steerY = 0, throttle = 0, controllers = 0, resetDown = false;
  const session = renderer.xr.getSession();
  if (session) {
    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const hand = src.handedness;
      const x = axisValue(src.gamepad, 2, 0);
      const y = axisValue(src.gamepad, 3, 1);
      if (hand === 'right') { steerX = x; steerY = y; controllers++; }
      if (hand === 'left') { throttle = -y; controllers++; }
      if (src.gamepad.buttons[4]?.pressed || src.gamepad.buttons[5]?.pressed) resetDown = true;
    }
  }
  if (keys.has('ArrowLeft') || keys.has('KeyA')) steerX = -1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) steerX = 1;
  if (keys.has('ArrowUp') || (keys.has('KeyW') && !keys.has('ShiftLeft'))) steerY = -1;
  if (keys.has('ArrowDown') || (keys.has('KeyS') && !keys.has('ShiftLeft'))) steerY = 1;
  if (keys.has('ShiftLeft') && keys.has('KeyW')) throttle = 1;
  if (keys.has('ShiftLeft') && keys.has('KeyS')) throttle = -1;
  if (resetDown && !resetWasDown) reset();
  resetWasDown = resetDown;
  return { steerX, steerY, throttle, controllers };
}
const forward = new THREE.Vector3();
let lastTime = null;
let hudTimer = 0;
renderer.setAnimationLoop((time) => {
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  const controls = getControls();
  speed = THREE.MathUtils.clamp(speed + controls.throttle * dt * 18, 8, 85);
  yaw -= controls.steerX * dt * 0.82;
  pitch = THREE.MathUtils.clamp(pitch - controls.steerY * dt * 0.57, -0.8, 0.8);
  roll = THREE.MathUtils.damp(roll, -controls.steerX * 0.38, 3, dt);
  plane.rotation.order = 'YXZ';
  plane.rotation.set(pitch, yaw, roll);
  forward.set(0, 0, -1).applyQuaternion(plane.quaternion);
  plane.position.addScaledVector(forward, speed * dt);
  if (plane.position.y < 3) {
    plane.position.y = 3;
    pitch = Math.max(pitch, 0.08);
    lastStatus = 'Низкая высота — автоматическая коррекция';
  } else {
    lastStatus = '';
  }
  // Tether world origin to avoid precision issues during lengthy flights.
  if (Math.abs(plane.position.x) > 2500 || Math.abs(plane.position.z) > 2500) {
    plane.position.x *= 0.2; plane.position.z *= 0.2;
  }
  hudTimer += dt;
  if (hudTimer > 0.18) {
    hudTimer = 0;
    flightEl.textContent = `Скорость: ${speed.toFixed(0)} м/с · Высота: ${(plane.position.y + 12).toFixed(0)} м`;
    inputEl.textContent = `Контроллеры: ${controls.controllers} · Правый: ${controls.steerX.toFixed(1)}, ${controls.steerY.toFixed(1)} · Левый: ${controls.throttle.toFixed(1)}`;
    messageEl.textContent = lastStatus;
  }
  renderer.render(scene, camera);
});
renderer.xr.addEventListener('sessionstart', () => { lastTime = null; hud.classList.add('hidden'); document.getElementById('reset').style.display='none'; });
renderer.xr.addEventListener('sessionend', () => { lastTime = null; hud.classList.remove('hidden'); document.getElementById('reset').style.display=''; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
