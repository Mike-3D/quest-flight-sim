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
let geoKey='';
try{geoKey=localStorage.getItem('linzKey')||'';}catch{}
const geoEnabled=!!geoKey;
if(geoEnabled){scene.fog.density=0.00048;camera.far=5400;camera.updateProjectionMatrix();}
const geoZoom=14, geoN=2**geoZoom, geoLat=-43.045, geoLon=171.632;
const geoX=(geoLon+180)/360*geoN;
const geoY=(1-Math.asinh(Math.tan(geoLat*Math.PI/180))/Math.PI)/2*geoN;
const geoSize=40075016.686*Math.cos(geoLat*Math.PI/180)/geoN;
const geoTiles=new Map();
let geoSpawnPending=geoEnabled;
let geoGround=0, geoActive=0, geoFailed=0, detailActive=0, geoError='';
function geoHeight(x,z){
  const tx=geoX+x/geoSize,ty=geoY+(z-180)/geoSize;
  const tile=geoTiles.get(Math.floor(tx)+','+Math.floor(ty));
  return tile?.dem?sampleDEM(tile.dem,tx-Math.floor(tx),ty-Math.floor(ty)):geoGround;
}
function terrainHeight(x,z) {
  if(geoEnabled)return geoHeight(x,z);
  const hills=52*noise(x/260,z/260)+15*noise(x/95,z/95);
  const mountain= Math.pow(noise(x/700+8,z/700+4),2)*220;
  const blend=THREE.MathUtils.smoothstep(Math.hypot(x,z-180),140,420);
  const raw=-12+blend*(hills+mountain+125*Math.exp(-((x-330)**2+(z+550)**2)/180000));
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
  if(geoEnabled){updateGeo(x,z);return;}
  const cx=Math.round(x/terrainSize),cz=Math.round(z/terrainSize),center=cx+','+cz;
  if(center===lastChunk)return;lastChunk=center;
  const needed=new Set();
  for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
    const k=(cx+i)+','+(cz+j);needed.add(k);
    if(!chunks.has(k))chunks.set(k,makeChunk(cx+i,cz+j));
  }
  for(const [k,m] of chunks)if(!needed.has(k)){scene.remove(m);m.geometry.dispose();chunks.delete(k);}
}
// In online mode use the same projection for imagery, mesh and collision heights.
const geoMat=new THREE.MeshBasicMaterial({color:0x718e57});
function sampleDEM(d,u,v){
  const x=THREE.MathUtils.clamp(u*d.w-0.5,0,d.w-1),y=THREE.MathUtils.clamp(v*d.h-0.5,0,d.h-1);
  const a=Math.floor(x),b=Math.floor(y),c=Math.min(a+1,d.w-1),e=Math.min(b+1,d.h-1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(d.values[b*d.w+a],d.values[b*d.w+c],x-a),THREE.MathUtils.lerp(d.values[e*d.w+a],d.values[e*d.w+c],x-a),y-b);
}
// Shared edge samples: every tile touching a vertex uses exactly the same height.
function sharedGeoHeight(tx,ty){
  const ix=Math.round(tx),iy=Math.round(ty);
  const xs=Math.abs(tx-ix)<1e-6?[ix-1,ix]:[Math.floor(tx)];
  const ys=Math.abs(ty-iy)<1e-6?[iy-1,iy]:[Math.floor(ty)];
  let sum=0,count=0;
  for(const x of xs)for(const y of ys){
    const d=geoTiles.get(x+','+y)?.dem;
    if(d){sum+=sampleDEM(d,tx-x,ty-y);count++;}
  }
  return count?sum/count:geoGround;
}
function rebuildGeoMesh(t){
  const p=t.mesh.geometry.attributes.position;
  // PlaneGeometry's regular 49 x 49 grid, north to south.
  const n=t.mesh.geometry.parameters.widthSegments;
  for(let i=0;i<p.count;i++){
    const u=(i%(n+1))/n,v=Math.floor(i/(n+1))/n;
    const edge=u===0||u===1||v===0||v===1;
    p.setY(i,edge?sharedGeoHeight(t.x+u,t.y+v):t.dem?sampleDEM(t.dem,u,v):geoGround);
  }
  p.needsUpdate=true;t.mesh.geometry.computeBoundingSphere();
}
function refreshGeoNeighbors(x,y){
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    const t=geoTiles.get((x+dx)+','+(y+dy));if(t)rebuildGeoMesh(t);
  }
}
async function tileImage(url,signal){
  const res=await fetch(url,{signal});if(!res.ok)throw Error('Tile HTTP '+res.status);
  return createImageBitmap(await res.blob(),{colorSpaceConversion:'none'});
}
function geoSummary(){
  const tiles=[...geoTiles.values()], dem=tiles.filter(t=>t.dem), photo=tiles.filter(t=>t.photo), hd=tiles.filter(t=>t.detail==='ready');
  let lo=Infinity,hi=-Infinity;
  for(const t of dem){lo=Math.min(lo,t.min);hi=Math.max(hi,t.max);}
  return 'DEM '+dem.length+'/'+tiles.length+' '+(dem.length?Math.round(lo)+'..'+Math.round(hi)+'m':'--')+' | IMG '+photo.length+' HD '+hd.length;
}
async function upgradePhoto(t){
  detailActive++;t.detail='loading';
  const cv=document.createElement('canvas');cv.width=cv.height=1024;
  const ctx=cv.getContext('2d');
  try{
    // 16 z16 child photos stitched over the existing z14 geometry.
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){
      const bmp=await tileImage('https://basemaps.linz.govt.nz/v1/tiles/aerial/3857/16/'+(t.x*4+dx)+'/'+(t.y*4+dy)+'.png?api='+encodeURIComponent(geoKey),t.abort.signal);
      ctx.drawImage(bmp,dx*256,dy*256,256,256);bmp.close();
    }
    if(geoTiles.get(t.id)!==t)return;
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    if(t.mesh.material!==geoMat){t.mesh.material.map?.dispose();t.mesh.material.dispose();}
    t.mesh.material=new THREE.MeshBasicMaterial({map:tex});t.detail='ready';
  }catch(e){t.detail='failed';if(!t.abort.signal.aborted)geoError='HD: '+e.message;}finally{detailActive--;}
}
async function loadGeo(t){
  geoActive++;t.state='loading';
  const path=geoZoom+'/'+t.x+'/'+t.y+'.png';
  const results=await Promise.allSettled([
    tileImage('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+path,t.abort.signal),
    tileImage('https://basemaps.linz.govt.nz/v1/tiles/aerial/3857/'+path+'?api='+encodeURIComponent(geoKey),t.abort.signal)
  ]);
  try{
    if(!geoTiles.has(t.id)||geoTiles.get(t.id)!==t){for(const r of results)if(r.status==='fulfilled')r.value.close();return;}
    if(results[0].status==='fulfilled'){
      const bmp=results[0].value, cv=document.createElement('canvas');cv.width=bmp.width;cv.height=bmp.height;
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(bmp,0,0);bmp.close();
      const rgba=ctx.getImageData(0,0,cv.width,cv.height).data, values=new Float32Array(cv.width*cv.height);
      for(let i=0;i<values.length;i++)values[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;
      t.dem={w:cv.width,h:cv.height,values};
      t.min=Infinity;t.max=-Infinity;for(const h of values){t.min=Math.min(t.min,h);t.max=Math.max(t.max,h);}
      refreshGeoNeighbors(t.x,t.y);
      if(t.x===Math.floor(geoX)&&t.y===Math.floor(geoY)){
        geoGround=geoHeight(0,180);
        if(geoSpawnPending){geoSpawnPending=false;reset();}
      }
    }
    if(results[1].status==='fulfilled'){
      const bmp=results[1].value, cv=document.createElement('canvas');cv.width=bmp.width;cv.height=bmp.height;cv.getContext('2d').drawImage(bmp,0,0);bmp.close();
      const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
      t.mesh.material=new THREE.MeshBasicMaterial({map:tex});t.photo=true;
    }
    if(t.x===Math.floor(geoX)&&t.y===Math.floor(geoY)&&geoSpawnPending){geoSpawnPending=false;reset();}
    t.state=results.every(r=>r.status==='fulfilled')?'ready':'partial';if(t.state==='partial'){geoFailed++;geoError=results.map((r,i)=>r.status==='rejected'?(i===0?'DEM: ':'IMG: ')+r.reason.message:'').filter(Boolean).join(' / ');}
  }catch{t.state='partial';geoFailed++;if(t.x===Math.floor(geoX)&&t.y===Math.floor(geoY)&&geoSpawnPending){geoSpawnPending=false;reset();}}finally{geoActive--;}
}
function updateGeo(x,z){
  const cx=Math.floor(geoX+x/geoSize),cy=Math.floor(geoY+(z-180)/geoSize),need=new Set();
  const changed=[];
  for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++){
    const tx=cx+dx,ty=cy+dy,id=tx+','+ty;need.add(id);
    if(!geoTiles.has(id)){
      const g=new THREE.PlaneGeometry(geoSize,geoSize,48,48);g.rotateX(-Math.PI/2);
      const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,geoGround);
      const mesh=new THREE.Mesh(g,geoMat);mesh.position.set((tx+0.5-geoX)*geoSize,0,(ty+0.5-geoY)*geoSize+180);scene.add(mesh);
      geoTiles.set(id,{id,x:tx,y:ty,mesh,state:'queued',abort:new AbortController()});changed.push([tx,ty]);
    }
  }
  for(const [id,t] of geoTiles)if(!need.has(id)){t.abort.abort();scene.remove(t.mesh);t.mesh.geometry.dispose();if(t.mesh.material!==geoMat){t.mesh.material.map?.dispose();t.mesh.material.dispose();}geoTiles.delete(id);changed.push([t.x,t.y]);}
  for(const [tx,ty] of changed)refreshGeoNeighbors(tx,ty);
  const queue=[...geoTiles.values()].filter(t=>t.state==='queued').sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy));
  while(geoActive<3&&queue.length)loadGeo(queue.shift());
  if(detailActive<1){const near=[...geoTiles.values()].filter(t=>t.photo&&!t.detail&&Math.abs(t.x-cx)<=1&&Math.abs(t.y-cy)<=1).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy));if(near.length)upgradePhoto(near[0]);}
}
if(geoEnabled)updateGeo(0,180);else updateTerrain(0,180);
// Small grass airstrip in the flat starting valley.
const runway=new THREE.Mesh(new THREE.PlaneGeometry(22,260),new THREE.MeshLambertMaterial({color:0x526d39,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));
runway.rotation.x=-Math.PI/2;runway.position.set(0,-11.65,100);if(!geoEnabled)scene.add(runway);

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

// SI units, body axes: +X right, +Y up, -Z forward.
let speed=38, power=0.34, lastStatus='', alpha=0, beta=0;
const mass=550, gravity=9.81;
// P92 Flight Manual (2008), sections 1.3, 1.4, 4.4, 5.1.2.6.
const p92={wingArea:13.02, span:9.3, chord:1.4, tailArea:1.97, maxPower:73500, propDiameter:1.73, maxMass:600};
let rudder=0, loadFactor=1;
const velocity=new THREE.Vector3(), omega=new THREE.Vector3();
const inertia=new THREE.Vector3(2000,2200,1450);
const force=new THREE.Vector3(), torque=new THREE.Vector3();
const flow=new THREE.Vector3(), surfaceVelocity=new THREE.Vector3();
const surfaceForce=new THREE.Vector3(), moment=new THREE.Vector3();
const worldForce=new THREE.Vector3(), inverseAttitude=new THREE.Quaternion();
const deltaQ=new THREE.Quaternion(), spinAxis=new THREE.Vector3();
const angularMomentum=new THREE.Vector3(), gyro=new THREE.Vector3();
const surfaces=[
  {r:new THREE.Vector3(-2.325,0,0.12),area:p92.wingArea/2,kind:'left'},
  {r:new THREE.Vector3( 2.325,0,0.12),area:p92.wingArea/2,kind:'right'},
  {r:new THREE.Vector3(0,0.15,3.0),area:p92.tailArea,kind:'tail'},
  {r:new THREE.Vector3(0,0.65,3.0),area:1.25,kind:'fin'}
];
const previousPosition=new THREE.Vector3(), currentPosition=new THREE.Vector3();
const previousAttitude=new THREE.Quaternion(), currentAttitude=new THREE.Quaternion();
let accumulator=0, frameMs=0, physicsMs=0, peakFrameMs=0;
let frameCount=0, frameElapsed=0, fps=0, peakWindow=0;
function reset(){
  plane.position.set(0,geoEnabled?geoHeight(0,180)+450:150,180);
  const startYaw=geoEnabled?0.85:0;
  plane.rotation.set(0.046,startYaw,0,'YXZ');
  velocity.set(-38*Math.sin(startYaw),0,-38*Math.cos(startYaw));omega.set(0,0,0);
  speed=38;power=0.34;alpha=0.046;beta=0;rudder=0;loadFactor=1;lastStatus='';
  previousPosition.copy(plane.position);currentPosition.copy(plane.position);
  previousAttitude.copy(plane.quaternion);currentAttitude.copy(plane.quaternion);
  accumulator=0;
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
 // Aircraft-fixed diagnostic display, independent of headset orientation.
const statsCanvas=document.createElement('canvas');
statsCanvas.width=768;statsCanvas.height=512;
const statsCtx=statsCanvas.getContext('2d');
const statsTexture=new THREE.CanvasTexture(statsCanvas);
statsTexture.colorSpace=THREE.SRGBColorSpace;
statsTexture.generateMipmaps=false;
statsTexture.minFilter=THREE.LinearFilter;
const statsPanel=new THREE.Mesh(new THREE.PlaneGeometry(0.28,0.187),new THREE.MeshBasicMaterial({map:statsTexture,side:THREE.DoubleSide,toneMapped:false,depthTest:false,depthWrite:false}));
statsPanel.renderOrder=1000;
statsPanel.position.set(0.39,0.75,-0.09);
statsPanel.rotation.y=-0.48;
statsPanel.rotation.x=-0.10;
plane.add(statsPanel);
function drawStats(){
  const ctx=statsCtx;
  ctx.fillStyle='#101c23';ctx.fillRect(0,0,768,512);
  ctx.strokeStyle='#477d83';ctx.lineWidth=5;ctx.strokeRect(5,5,758,502);
  ctx.fillStyle='#8ddbd1';ctx.font='bold 35px monospace';ctx.fillText('FLIGHT DATA  v0.9.4',32,54);
  const rows=[
    ['TAS',(speed*3.6).toFixed(0)+' km/h'],
    ['AGL',(plane.position.y-terrainHeight(plane.position.x,plane.position.z)).toFixed(0)+' m'],
    ['V/S',(velocity.y>=0?'+':'')+velocity.y.toFixed(1)+' m/s'],
    ['POWER',(power*100).toFixed(0)+' %'],
    ['AoA',(alpha*180/Math.PI).toFixed(1)+' deg'],
    ['SLIP',(beta*180/Math.PI).toFixed(1)+' deg / '+loadFactor.toFixed(2)+' G']
  ];
  ctx.font='35px monospace';
  rows.forEach(([label,value],i)=>{
    const y=105+i*48;ctx.fillStyle='#8da8ac';ctx.textAlign='left';ctx.fillText(label,32,y);
    ctx.fillStyle='#e2f8ed';ctx.textAlign='right';ctx.fillText(value,736,y);
  });
  ctx.textAlign='left';ctx.font='25px monospace';ctx.fillStyle=lastStatus?'#ffba64':'#8ddbd1';
  ctx.fillText('FPS '+fps.toFixed(0)+' | FRAME '+frameMs.toFixed(1)+' ms',32,420);
  ctx.fillText('PHYS '+physicsMs.toFixed(2)+' | MAX '+peakFrameMs.toFixed(1)+' ms',32,453);
  ctx.fillText(lastStatus?'GROUND ASSIST':geoEnabled?geoSummary():'6DOF / INTERPOLATED',32,487);
  statsTexture.needsUpdate=true;
}
drawStats();


function axisValue(gamepad, preferred, fallback) {
  const a = gamepad.axes;
  const i = a.length > preferred ? preferred : fallback;
  const raw = a[i] ?? 0;
  return Math.abs(raw) < 0.16 ? 0 : Math.sign(raw) * (Math.abs(raw) - 0.16) / 0.84;
}
let resetWasDown = false;
function getControls() {
  let steerX = 0, steerY = 0, throttle = 0, rudderInput=0, controllers = 0, resetDown = false;
  const session = renderer.xr.getSession();
  if (session) {
    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const hand = src.handedness;
      const x = axisValue(src.gamepad, 2, 0);
      const y = axisValue(src.gamepad, 3, 1);
      if (hand === 'right') { steerX = x; steerY = y; controllers++; }
      if (hand === 'left') { throttle = -y; rudderInput=x; controllers++; }
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
  if(keys.has('KeyQ'))rudderInput=-1;
  if(keys.has('KeyE'))rudderInput=1;
  return { steerX, steerY, throttle, rudderInput, controllers };
}
// Each aerodynamic surface sees its own local airspeed, including rotation.
function physicsStep(dt,controls){
  power=THREE.MathUtils.clamp(power+controls.throttle*dt*0.35,0,1);
  inverseAttitude.copy(plane.quaternion).invert();
  flow.copy(velocity).applyQuaternion(inverseAttitude);
  alpha=Math.atan2(-flow.y,-flow.z);
  beta=Math.atan2(flow.x,Math.hypot(flow.y,flow.z));
  // Propeller thrust always follows the aircraft longitudinal axis.
  const rho=1.225*Math.exp(-Math.max(0,plane.position.y+12)/10000);
  const shaftPower=power*p92.maxPower*rho/1.225;
  const diskArea=Math.PI*(p92.propDiameter/2)**2;
  // Approximate propeller momentum theory, finite static thrust, power-limited in flight.
  const axial=Math.max(0,-flow.z), usefulPower=shaftPower*0.72;
  let induced=0;
  if(usefulPower>0){
    let lo=0,hi=Math.cbrt(usefulPower/(2*rho*diskArea));
    for(let i=0;i<12;i++){const m=(lo+hi)/2;if(2*rho*diskArea*m*(axial+m)**2>usefulPower)hi=m;else lo=m;}
    induced=(lo+hi)/2;
  }
  const thrust=2*rho*diskArea*induced*(axial+induced);
  rudder=THREE.MathUtils.damp(rudder,controls.rudderInput,5,dt);
  force.set(0,0,-thrust);torque.set(0,0,0);
  for(const s of surfaces){
    surfaceVelocity.crossVectors(omega,s.r).add(flow);
    const fin=s.kind==='fin', tail=s.kind==='tail';
    const u=-surfaceVelocity.z, v=fin?surfaceVelocity.x:-surfaceVelocity.y;
    const v2=u*u+v*v;
    if(v2<0.01)continue;
    const a=Math.atan2(v,u);
    let incidence=0, slope=5.0, maxCl=1.60;
    if(tail){incidence=-0.080-controls.steerY*0.18;slope=3.5;maxCl=1.1;}
    else if(fin){slope=3.0;maxCl=1.1;incidence=-rudder*0.18;}
    else incidence=0.060+(s.kind==='left'?1:-1)*controls.steerX*0.09;
    const effective=a+incidence;
    const separated=THREE.MathUtils.smoothstep(Math.abs(effective),tail||fin?0.25:0.32,0.58);
    const cl=THREE.MathUtils.clamp(slope*effective,-maxCl,maxCl)*(1-0.75*separated);
    const cd=0.012+0.055*cl*cl+0.7*separated;
    const q=0.5*rho*v2*s.area, inv=1/Math.sqrt(v2);
    // Lift perpendicular to the local flow; drag opposite it.
    if(fin)surfaceForce.set((-cl*u-cd*v)*q*inv,0,(cl*v+cd*u)*q*inv);
    else surfaceForce.set(0,(cl*u+cd*v)*q*inv,(-cl*v+cd*u)*q*inv);
    force.add(surfaceForce);
    torque.add(moment.crossVectors(s.r,surfaceForce));
  }
  // Fuselage drag and lateral resistance. No artificial heading lock.
  force.x-=0.5*rho*2.1*flow.x*Math.abs(flow.x);
  force.y-=0.5*rho*0.8*flow.y*Math.abs(flow.y);
  force.z-=0.5*rho*0.24*flow.z*Math.abs(flow.z);
  // Modest additional damping for unresolved airframe geometry.
  const damping=Math.min(2.5,flow.length()/32);
  torque.x-=250*damping*omega.x;
  torque.y-=1500*damping*omega.y;
  torque.z-=180*damping*omega.z;
  angularMomentum.copy(omega).multiply(inertia);
  gyro.crossVectors(omega,angularMomentum);
  torque.sub(gyro).divide(inertia);
  omega.addScaledVector(torque,dt);
  const rate=omega.length();
  if(rate>1e-8){
    spinAxis.copy(omega).multiplyScalar(1/rate);
    deltaQ.setFromAxisAngle(spinAxis,rate*dt);
    plane.quaternion.multiply(deltaQ).normalize();
  }
  loadFactor=force.y/(mass*gravity);
  worldForce.copy(force).applyQuaternion(plane.quaternion);
  worldForce.y-=mass*gravity;
  velocity.addScaledVector(worldForce,dt/mass);
  plane.position.addScaledVector(velocity,dt);
  speed=velocity.length();
  // Temporary terrain protection, not a landing/contact model.
  const minimumY=terrainHeight(plane.position.x,plane.position.z)+15;
  if(plane.position.y<minimumY){
    plane.position.y=minimumY;
    if(velocity.y<0)velocity.y=0;
    lastStatus='Защита от земли';
  }else lastStatus='';
}
let lastTime=null,hudTimer=0;
const physicsDt=1/120;
renderer.setAnimationLoop((time)=>{
  const rawDt=lastTime===null?0:Math.max(0,(time-lastTime)/1000);
  const dt=Math.min(rawDt,0.05);
  lastTime=time;
  if(rawDt>0){
    frameMs=frameMs?frameMs*0.9+rawDt*100:rawDt*1000;
    frameCount++;frameElapsed+=rawDt;peakWindow=Math.max(peakWindow,rawDt*1000);
    if(frameElapsed>=0.5){fps=frameCount/frameElapsed;peakFrameMs=peakWindow;frameCount=0;frameElapsed=0;peakWindow=0;}
  }
  // Restore the authoritative physics state before sampling inputs or stepping.
  plane.position.copy(currentPosition);plane.quaternion.copy(currentAttitude);
  const controls=getControls();
  if(!geoSpawnPending)accumulator+=dt;
  const startPhysics=performance.now();
  while(accumulator>=physicsDt){
    previousPosition.copy(currentPosition);previousAttitude.copy(currentAttitude);
    physicsStep(physicsDt,controls);
    currentPosition.copy(plane.position);currentAttitude.copy(plane.quaternion);
    accumulator-=physicsDt;
  }
  physicsMs=physicsMs*0.9+(performance.now()-startPhysics)*0.1;
  // Render an interpolated pose only; physics never integrates this pose.
  const blend=THREE.MathUtils.clamp(accumulator/physicsDt,0,1);
  plane.position.lerpVectors(previousPosition,currentPosition,blend);
  plane.quaternion.slerpQuaternions(previousAttitude,currentAttitude,blend);
  updateTerrain(plane.position.x, plane.position.z);
  hudTimer += dt;
  if (hudTimer > 0.18) {
    hudTimer = 0;
    drawStats();
    flightEl.textContent = `Скорость: ${(speed*3.6).toFixed(0)} км/ч · Газ: ${(power*100).toFixed(0)}% · AoA: ${(alpha*180/Math.PI).toFixed(1)}° · Slip: ${(beta*180/Math.PI).toFixed(1)}° · Высота над землёй: ${(plane.position.y-terrainHeight(plane.position.x,plane.position.z)).toFixed(0)} м`;
    inputEl.textContent = `Контроллеры: ${controls.controllers} · Правый: ${controls.steerX.toFixed(1)}, ${controls.steerY.toFixed(1)} · Левый: ${controls.throttle.toFixed(1)}`;
    messageEl.textContent = [geoEnabled?geoSummary()+' · '+geoError:'Физика 6DOF v0.9.4: '+chunks.size+' чанков', modelStatus, lastStatus].filter(Boolean).join(' · ');
  }
  renderer.render(scene, camera);
});
renderer.xr.addEventListener('sessionstart', () => { lastTime = null; accumulator=0; previousPosition.copy(currentPosition); previousAttitude.copy(currentAttitude); hud.classList.add('hidden'); document.getElementById('reset').style.display='none'; });
renderer.xr.addEventListener('sessionend', () => { lastTime = null; accumulator=0; previousPosition.copy(currentPosition); previousAttitude.copy(currentAttitude); hud.classList.remove('hidden'); document.getElementById('reset').style.display=''; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
