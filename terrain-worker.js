// Background DEM decoding, mesh sampling and aerial image mosaics.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t;
const near=new Map(),far=new Map();
function sample(d,u,v){const x=clamp(u*d.w-.5,0,d.w-1),y=clamp(v*d.h-.5,0,d.h-1),a=Math.floor(x),b=Math.floor(y),c=Math.min(a+1,d.w-1),e=Math.min(b+1,d.h-1);return lerp(lerp(d.values[b*d.w+a],d.values[b*d.w+c],x-a),lerp(d.values[e*d.w+a],d.values[e*d.w+c],x-a),y-b);}
function shared(map,x,y){const ix=Math.round(x),iy=Math.round(y),xs=Math.abs(x-ix)<1e-7?[ix-1,ix]:[Math.floor(x)],ys=Math.abs(y-iy)<1e-7?[iy-1,iy]:[Math.floor(y)];let sum=0,n=0;for(const a of xs)for(const b of ys){const d=map.get(a+','+b);if(d){sum+=sample(d,x-a,y-b);n++;}}return n?sum/n:null;}
const fs=(x,y)=>shared(far,x/4,y/4);
function border(x,y,b,n){if(!b)return null;const vertical=Math.abs(x-b.x0)<1e-7||Math.abs(x-b.x1)<1e-7,horizontal=Math.abs(y-b.y0)<1e-7||Math.abs(y-b.y1)<1e-7;if(!vertical&&!horizontal)return null;const sub=n/4,k=Math.floor((vertical?y:x)*sub+1e-7),f=(vertical?y:x)*sub-k,a=vertical?fs(x,k/sub):fs(k/sub,y),c=vertical?fs(x,(k+1)/sub):fs((k+1)/sub,y);return a===null||c===null?a??c:lerp(a,c,clamp(f,0,1));}
const jobs=new Map();
self.onmessage=async({data:m})=>{
 if(m.type==='cancel'){jobs.get(m.id)?.abort();return;}
 if(m.type==='drop'){(m.far?far:near).delete(m.key);return;}
 if(m.type==='store'){(m.far?far:near).set(m.key,m.dem);return;}
 const ac=new AbortController();jobs.set(m.id,ac);
 try{
 if(m.type==='decode'){
  const bmp=m.bitmap,cv=new OffscreenCanvas(bmp.width,bmp.height),ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(bmp,0,0);bmp.close();
  const rgba=ctx.getImageData(0,0,cv.width,cv.height).data,values=new Float32Array(cv.width*cv.height);let min=Infinity,max=-Infinity;
  for(let i=0;i<values.length;i++){const h=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;values[i]=h;min=Math.min(min,h);max=Math.max(max,h);}
  self.postMessage({id:m.id,dem:{w:cv.width,h:cv.height,values},min,max},[values.buffer]);
 }else if(m.type==='mesh'){
  const {x,y,n,bounds,ground}=m,heights=new Float32Array((n+1)**2),d=near.get(x+','+y);
  for(let i=0;i<heights.length;i++){const u=i%(n+1)/n,v=Math.floor(i/(n+1))/n,edge=u===0||u===1||v===0||v===1;heights[i]=m.far?(fs((x+u)*4,(y+v)*4)??ground):edge?(border(x+u,y+v,bounds,n)??shared(near,x+u,y+v)??ground):d?sample(d,u,v):ground;}
  let indices=null;if(m.far){const idx=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++){const tx=x*4+(i+.5)*4/n,ty=y*4+(j+.5)*4/n;if(bounds&&tx>=bounds.x0&&tx<bounds.x1&&ty>=bounds.y0&&ty<bounds.y1)continue;const a=j*(n+1)+i,c=a+n+1;idx.push(a,c,a+1,c,c+1,a+1);}indices=new Uint16Array(idx);}
  const transfer=[heights.buffer];if(indices)transfer.push(indices.buffer);self.postMessage({id:m.id,heights,indices},transfer);
 }else if(m.type==='photo'){
  const cv=new OffscreenCanvas(256*m.factor,256*m.factor),ctx=cv.getContext('2d');
  for(let dy=0;dy<m.factor;dy++)for(let dx=0;dx<m.factor;dx++){
   const url='https://basemaps.linz.govt.nz/v1/tiles/aerial/3857/'+m.level+'/'+(m.x*m.factor+dx)+'/'+(m.y*m.factor+dy)+'.png?api='+encodeURIComponent(m.key);
   const res=await fetch(url,{signal:ac.signal});if(!res.ok)throw Error('Tile HTTP '+res.status);
   const bmp=await createImageBitmap(await res.blob());ctx.drawImage(bmp,dx*256,dy*256,256,256);bmp.close();
  }
  // Raw RGBA preserves normal THREE texture orientation and color management.
  const rgba=ctx.getImageData(0,0,cv.width,cv.height).data;self.postMessage({id:m.id,rgba,w:cv.width,h:cv.height},[rgba.buffer]);
 }
 }catch(e){self.postMessage({id:m.id,error:String(e.message||e)});}finally{jobs.delete(m.id);}
};