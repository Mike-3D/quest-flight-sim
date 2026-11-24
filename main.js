import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/webxr/VRButton.js';

import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x84c9fa);
scene.fog = new THREE.FogExp2(0x84c9fa, 0.0008);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 4500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, {
  optionalFeatures: ['local-floor', 'bounded-floor']
}));

scene.add(new THREE.HemisphereLight(0xd8edff, 0x637849, 2.1));
const sun = new THREE.DirectionalLight(0xfff2d4, 2.0);
sun.position.set(-200, 400, -250);
scene.add(sun);

// Continuous procedural terrain, sampled consistently for geometry and clearance.
function hash(x,z) { const n=Math.sin(x*127.1+z*311.7)*43758.5453; return n-Math.floor(n); }
function noise(x,z) {
  const ix=Math.floor(x), iz=Math.floor(z); let u=x-ix,v=z-iz;
  u=u*u*(3-2*u); v=v*v*(3-2*v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
function terrainHeight(x,z) {
  const hills=65*noise(x/260,z/260)+18*noise(x/95,z/95);
  const mountain= Math.pow(noise(x/700+8,z/700+4),2)*300;
  const blend=THREE.MathUtils.smoothstep(Math.hypot(x,z-180),140,420);
  const raw=-12+blend*(hills+mountain+180*Math.exp(-((x-330)**2+(z+550)**2)/180000));
  const riverX=420+180*Math.sin(z/430)+70*Math.sin(z/170);
  const valley=1-THREE.MathUtils.smoothstep(Math.abs(x-riverX),12,160);
  return THREE.MathUtils.lerp(raw,-15,valley);
}
const terrainMat=new THREE.MeshLambertMaterial({vertexColors:true});
 // World-space procedural farmland; no additional textures or geometry.
terrainMat.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTerrainWorld;
float landHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float landNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);
}
`).replace('#include <color_fragment>', `#include <color_fragment>
vec2 p=vTerrainWorld.xz;
vec2 q=mat2(0.94,-0.342,0.342,0.94)*p;
q+=vec2(landNoise(p/310.0),landNoise(p/290.0+17.0))*35.0;
vec2 cell=q/vec2(145.0,105.0);
vec2 id=floor(cell), uv=fract(cell);
float r=landHash(id);
vec3 pasture=mix(vec3(0.72,0.91,0.56),vec3(1.15,1.08,0.66),r);
pasture=mix(pasture,vec3(0.66,0.48,0.25),smoothstep(0.77,0.93,r));
vec2 edge=min(uv,1.0-uv)*vec2(145.0,105.0);
float d=min(edge.x,edge.y);
float border=smoothstep(0.6,2.4+fwidth(d),d);
float farm=1.0-smoothstep(35.0,100.0,vTerrainWorld.y);
float rows=sin(q.y*2.0)*0.5+0.5;
float rowDetail=(1.0-smoothstep(0.3,1.5,fwidth(q.y)))*0.12;
vec3 fieldColor=pasture*(0.94+rows*rowDetail);
fieldColor=mix(vec3(0.54,0.65,0.38),fieldColor,border);
float detail=(landNoise(p*0.65)-0.5)*0.22*(1.0-smoothstep(0.4,2.0,length(fwidth(p))));
diffuseColor.rgb*=mix(vec3(1.0),fieldColor,farm)*(1.0+detail);
float riverX=420.0+180.0*sin(p.y/430.0)+70.0*sin(p.y/170.0);
float rd=abs(p.x-riverX);
float water=1.0-smoothstep(10.0,15.0+fwidth(rd),rd);
float bank=1.0-smoothstep(15.0,23.0+fwidth(rd),rd);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.34,0.30,0.19),bank);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.045,0.24,0.34),water);
float roadX=-190.0+95.0*sin(p.y/380.0)+40.0*sin(p.y/145.0);
float roadDist=abs(p.x-roadX);
float road=1.0-smoothstep(3.0,4.5+fwidth(roadDist),roadDist);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.16,0.16,0.15),road*(1.0-water));
float dash=(1.0-smoothstep(0.12,0.35+fwidth(roadDist),roadDist))*step(0.5,fract(p.y/12.0));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.65),dash*road*(1.0-water));
`);
};

const terrainSize=600, segments=40, chunks=new Map();
const green=new THREE.Color(0x659b49), light=new THREE.Color(0x9bb86a), rock=new THREE.Color(0x8b8977);
function makeChunk(cx,cz) {
  const g=new THREE.PlaneGeometry(terrainSize,terrainSize,segments,segments);
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position, colors=new Float32Array(p.count*3), c=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)+cx*terrainSize,z=p.getZ(i)+cz*terrainSize,h=terrainHeight(x,z);
    p.setY(i,h);
    const field=noise(x/180+12,z/180+7);
    c.copy(green).lerp(light,field).lerp(rock,THREE.MathUtils.smoothstep(h,55,120));
    c.toArray(colors,i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,terrainMat);m.position.set(cx*terrainSize,0,cz*terrainSize);scene.add(m);return m;
}
let lastChunk='';
function updateTerrain(x,z){
  const cx=Math.round(x/terrainSize),cz=Math.round(z/terrainSize),center=cx+','+cz;
  if(center===lastChunk)return;lastChunk=center;
  const needed=new Set();
  for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
    const k=(cx+i)+','+(cz+j);needed.add(k);
    if(!chunks.has(k))chunks.set(k,makeChunk(cx+i,cz+j));
  }
  for(const [k,m] of chunks)if(!needed.has(k)){scene.remove(m);m.geometry.dispose();chunks.delete(k);}
}
updateTerrain(0,180);
// Small grass airstrip in the flat starting valley.
const runway=new THREE.Mesh(new THREE.PlaneGeometry(22,260),new THREE.MeshLambertMaterial({color:0x526d39,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));
runway.rotation.x=-Math.PI/2;runway.position.set(0,-11.65,100);scene.add(runway);

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
let modelStatus = 'Загрузка кабины…';
// GLB is authored facing +Z. Rotate to match the aircraft's -Z flight axis.
const importedCockpit = new THREE.Group();
importedCockpit.rotation.y = Math.PI;
// Align the left pilot's eye point with the camera rig.
importedCockpit.position.set(0.235, 0.38, 0.27);
new GLTFLoader().load('./assets/models/Cockpit_01.glb', gltf => {
  importedCockpit.add(gltf.scene);
  // Exterior uses exactly the same authored coordinate system and transform.
  new GLTFLoader().load('./assets/models/Exterior_01.glb', exterior => {
    importedCockpit.add(exterior.scene);
    modelStatus = 'Кабина и экстерьер GLB загружены';
  }, undefined, error => {
    console.error('Exterior load failed', error);
    modelStatus = 'Кабина загружена · ошибка экстерьера';
  });
  // The supplied shell and seats contain one half only. Mirror those pieces.
  for (const name of ['Cockpit', 'Chair01', 'Chair02']) {
    const original = gltf.scene.getObjectByName(name);
    if (!original) continue;
    const mirror = new THREE.Group();
    mirror.scale.x = -1;
    mirror.add(original.clone(true));
    gltf.scene.add(mirror);
  }
  plane.add(importedCockpit);
  cockpit.visible = false;
  modelStatus = 'Кабина GLB загружена';
}, undefined, error => {
  console.error('Cockpit load failed', error);
  modelStatus = 'Ошибка загрузки GLB — резервная кабина';
});
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyR') reset();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.getElementById('reset').addEventListener('click', reset);

let speed = 32;
let power = 0.55, climbAngle = 0;
let rollRate=0, pitchRate=0;
const mass=550, wingArea=12, gravity=9.81;
let yaw = 0, pitch = 0, roll = 0;
let lastStatus = '';
function reset() {
  plane.position.set(0, 150, 180);
  plane.rotation.set(0, 0, 0);
  speed = 32; power=0.55; climbAngle=0; rollRate=0; pitchRate=0; yaw = 0; pitch = 0.065; roll = 0;
  plane.rotation.set(pitch,yaw,roll,'YXZ');
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
const localFlow=new THREE.Vector3(), inverseAttitude=new THREE.Quaternion();
const bodyUp=new THREE.Vector3(), turnAxis=new THREE.Vector3(0,1,0);
const attitudeEuler=new THREE.Euler(0,0,0,'YXZ');
function angleOfAttack(){
  localFlow.set(-Math.sin(yaw)*Math.cos(climbAngle),Math.sin(climbAngle),-Math.cos(yaw)*Math.cos(climbAngle));
  localFlow.applyQuaternion(inverseAttitude.copy(plane.quaternion).invert());
  return Math.atan2(-localFlow.y,-localFlow.z);
}
let lastTime = null;
let hudTimer = 0;
renderer.setAnimationLoop((time) => {
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  const controls = getControls();
  power=THREE.MathUtils.clamp(power+controls.throttle*dt*0.35,0,1);
  // Neutral controls remove pilot moments, not aircraft attitude.
  const authority=THREE.MathUtils.clamp((speed/32)**2,0.15,2.2);
  const alphaNow=angleOfAttack();
  const rollAccel=-controls.steerX*2.0*authority-2.8*authority*rollRate-0.025*Math.sin(roll);
  const pitchAccel=controls.steerY*0.85*authority-2.5*authority*pitchRate-0.65*authority*(alphaNow-0.065);
  rollRate+=rollAccel*dt;
  pitchRate+=pitchAccel*dt;
  // Apply pilot rotation around aircraft body axes, not world axes.
  plane.rotateX(pitchRate*dt);
  plane.rotateZ(rollRate*dt);
  attitudeEuler.setFromQuaternion(plane.quaternion,'YXZ');
  roll=attitudeEuler.z;
  pitch=attitudeEuler.x;
  const alpha=angleOfAttack();
  const stall=1-0.65*THREE.MathUtils.smoothstep(Math.abs(alpha),0.24,0.48);
  const cl=THREE.MathUtils.clamp(0.32+4.5*alpha,-0.9,1.45)*stall;
  const q=0.5*1.225*speed*speed;
  const lift=q*wingArea*cl;
  const drag=q*wingArea*(0.035+0.065*cl*cl+0.12*(1-stall));
  const thrust=power*1500;
  speed=THREE.MathUtils.clamp(speed+(thrust*Math.cos(alpha)-drag-mass*gravity*Math.sin(climbAngle))/mass*dt,8,75);
  // Resolve lift along the banked aircraft's up direction relative to flight path.
  bodyUp.set(0,1,0).applyQuaternion(plane.quaternion);
  const verticalLift=bodyUp.y*Math.cos(climbAngle)+Math.sin(climbAngle)*(bodyUp.x*Math.sin(yaw)+bodyUp.z*Math.cos(yaw));
  const lateralLift=-bodyUp.x*Math.cos(yaw)+bodyUp.z*Math.sin(yaw);
  const turnRate=lift*lateralLift/(mass*Math.max(speed*Math.cos(climbAngle),8));
  climbAngle=THREE.MathUtils.clamp(climbAngle+(lift*verticalLift+thrust*Math.sin(alpha)-mass*gravity*Math.cos(climbAngle))/(mass*Math.max(speed,8))*dt,-1.2,1.2);
  yaw+=turnRate*dt;
  plane.rotateOnWorldAxis(turnAxis,turnRate*dt);
  forward.set(-Math.sin(yaw)*Math.cos(climbAngle),Math.sin(climbAngle),-Math.cos(yaw)*Math.cos(climbAngle));
  plane.position.addScaledVector(forward,speed*dt);
  const minimumY = terrainHeight(plane.position.x, plane.position.z) + 15;
  if (plane.position.y < minimumY) {
    plane.position.y = minimumY;
    if(pitch<0.10) plane.rotateOnWorldAxis(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),Math.min(0.10-pitch,dt*0.5));
    pitchRate=Math.max(pitchRate,0);
    climbAngle=Math.max(climbAngle,0);
    lastStatus = 'Низкая высота — автоматическая коррекция';
  } else {
    lastStatus = '';
  }
  updateTerrain(plane.position.x, plane.position.z);
  hudTimer += dt;
  if (hudTimer > 0.18) {
    hudTimer = 0;
    flightEl.textContent = `Скорость: ${(speed*3.6).toFixed(0)} км/ч · Газ: ${(power*100).toFixed(0)}% · Высота над землёй: ${(plane.position.y-terrainHeight(plane.position.x,plane.position.z)).toFixed(0)} м`;
    inputEl.textContent = `Контроллеры: ${controls.controllers} · Правый: ${controls.steerX.toFixed(1)}, ${controls.steerY.toFixed(1)} · Левый: ${controls.throttle.toFixed(1)}`;
    messageEl.textContent = ['Рельеф v0.6.2: '+chunks.size+' чанков', modelStatus, lastStatus].filter(Boolean).join(' · ');
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
