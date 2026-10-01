/** Converts the supplied FBX files into bounded, texture-linked GLBs. Originals are untouched. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
globalThis.window={URL:globalThis.URL,innerWidth:1000,innerHeight:800};
globalThis.FileReader=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();} async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onloadend?.();}};
THREE.TextureLoader.prototype.load=function(url){const t=new THREE.Texture();t.userData.url=url;return t;};
const input='artifacts/model-source',output='assets/models';await fs.mkdir(output,{recursive:true});await fs.mkdir('artifacts/raw-textures',{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,16);
const all=[];
const selections={
 'japroom-14-otaku':['node_0002','node_0012'],
 'loft2-free-interior':['node_0001','node_0006','node_0005','node_0007','Cube002','Plane010','node_0008','Cube005'],
 'the-interior-14-is-spacious':['node_0','Cube001','Plane014'],
};
for(const dir of await fs.readdir(input)){
 const source=path.join(input,dir,'source'),file=(await fs.readdir(source)).find(x=>x.endsWith('.fbx'));
 const bytes=await fs.readFile(path.join(source,file));const obj=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');obj.updateMatrixWorld(true);
 const meshes=[];obj.traverse(x=>{if(x.isMesh)meshes.push(x);});
 const group=new THREE.Group();group.name=dir;const maps=new Map();
 for(const m of meshes){
  if(selections[dir]&&!selections[dir].includes(m.name))continue;
  if(['Sphere','Sphere001'].includes(m.name)&&m.geometry.attributes.position.count===1440)continue;
  if(dir.startsWith('chairs')&&m.name==='Plane')continue;
  const geo=m.geometry.clone().applyMatrix4(m.matrixWorld).scale(.01,.01,.01);const sourceMats=Array.isArray(m.material)?m.material:[m.material];const mats=[];
  for(const v of sourceMats){
   const info={};for(const key of ['map','normalMap','emissiveMap','aoMap']){const t=v[key];if(!t?.userData.url)continue;
    try{let b;if(t.userData.url.startsWith('blob:')||t.userData.url.startsWith('data:'))b=Buffer.from(await(await fetch(t.userData.url)).arrayBuffer());else b=await fs.readFile(path.join(input,dir,'textures',t.userData.url.split(/[\\/]/).at(-1)));
     const id=hash(b);await fs.writeFile('artifacts/raw-textures/'+id,b);info[key]={id,flipY:t.flipY,repeat:t.repeat.toArray(),offset:t.offset.toArray()};
    }catch(e){console.warn(dir,v.name,key,e.message);}
   }
   // Two packs have disconnected FBX texture links; use their supplied PBR atlases.
   if(!info.map&&(dir.startsWith('chairs')||dir.startsWith('modern'))){
    const prefix=dir.startsWith('chairs')?'Asset':v.name;
    const candidates=dir.startsWith('chairs')?{map:'Asset_C.tga.png',normalMap:'Asset_N.tga.png',aoMap:'Asset_AO.tga.png'}:{map:prefix+'_Base_Color.png',normalMap:prefix+'_Normal_OpenGL.png',aoMap:prefix+'_Mixed_AO.png'};
    for(const [key,name]of Object.entries(candidates)){try{const b=await fs.readFile(path.join(input,dir,'textures',name)),id=hash(b);await fs.writeFile('artifacts/raw-textures/'+id,b);info[key]={id,flipY:true,repeat:[1,1],offset:[0,0]};}catch{}}
   }
   const pbr=new THREE.MeshStandardMaterial({name:v.name,color:Object.keys(info).includes('map')?'#ffffff':v.color,roughness:.78,metalness:/metal|GARAGE/i.test(v.name)?.18:0,side:THREE.DoubleSide});pbr.userData.auraMaps=info;mats.push(pbr);maps.set(v.name,info);
  }
  const mesh=new THREE.Mesh(geo,Array.isArray(m.material)?mats:mats[0]);mesh.name=m.name;group.add(mesh);
 }
 const glb=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});const buf=Buffer.from(glb),jsonLength=buf.readUInt32LE(12),json=JSON.parse(buf.subarray(20,20+jsonLength).toString());const binStart=20+jsonLength,bin=buf.subarray(binStart+8);json.images=[];json.textures=[];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];json.extensionsUsed=['KHR_texture_transform'];
 const images=new Map();for(const material of json.materials){const info=material.extras?.auraMaps||{};for(const [key,t]of Object.entries(info)){
  // Flip occurs during preprocessing to match Three's FBX convention.
  const id=t.id+(t.flipY?'-flip':'');if(!images.has(id)){images.set(id,json.textures.length);json.images.push({uri:'textures/'+id+'.webp'});json.textures.push({source:json.images.length-1,sampler:0});}
  const ref={index:images.get(id)};if(t.repeat.some(x=>x!==1)||t.offset.some(x=>x!==0))ref.extensions={KHR_texture_transform:{scale:t.repeat,offset:t.offset}};
  if(key==='map')material.pbrMetallicRoughness.baseColorTexture=ref;else if(key==='normalMap')material.normalTexture={...ref,scale:.55};else if(key==='aoMap')material.occlusionTexture=ref;else if(key==='emissiveMap'){material.emissiveTexture=ref;material.emissiveFactor=[.05,.05,.05];}
 }delete material.extras;}
 const writeGlb=async(j,b,file)=>{let text=Buffer.from(JSON.stringify(j));let padding=(4-text.length%4)%4;text=Buffer.concat([text,Buffer.alloc(padding,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+8+b.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(b.length,0);bh.writeUInt32LE(0x004e4942,4);await fs.writeFile(file,Buffer.concat([header,text,bh,b]));};
 await writeGlb(json,bin,path.join(output,dir+'.glb'));all.push({pack:dir,meshes:group.children.map((m,i)=>({name:m.name,index:i,bounds:new THREE.Box3().setFromObject(m),triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3})),textures:[...images.keys()]});
 console.log(dir,group.children.length,'meshes',Math.round(glb.byteLength/1024),'KB');
}
await fs.writeFile('artifacts/converted-inventory.json',JSON.stringify(all,null,2));
