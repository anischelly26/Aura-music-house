import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Only converted, locally hosted model assets are accepted. No arbitrary uploads execute. */
export class ModelAssets {
  constructor(house){this.house=house;this.a=house.architecture;this.loaded=[];this.errors=[];this.groups=[];}
  async load(){
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{
      if(!window.AURA_ASSETS)return url;const key=url.match(/assets\/models\/[^?#]+/)?.[0];return window.AURA_ASSETS[key]||url;
    });const loader=new GLTFLoader(manager);
    const packs=['the-interior-14-is-spacious','japroom-14-otaku','loft2-free-interior','chairs-and-window-set-game-ready','modern-house-villa-game-ready-4k'];
    // Sequential decode keeps memory and GPU upload spikes bounded during arrival.
    for(const pack of packs){try{
      const key='assets/models/'+pack+'.glb',embedded=window.AURA_ASSETS?.[key];let asset;
      if(embedded){const raw=atob(embedded.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));asset=await loader.parseAsync(bytes.buffer,'assets/models/');}
      else asset=await loader.loadAsync(key);
      const source=asset.scene;source.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;const materials=Array.isArray(m.material)?m.material:[m.material];for(const mat of materials){mat.side=THREE.FrontSide;if(mat.map)mat.map.anisotropy=Math.min(4,this.house.renderer.capabilities.getMaxAnisotropy());}}});
      this.install(pack,source);this.loaded.push(pack);this.house.renderer.shadowMap.needsUpdate=true;
    }catch(e){this.errors.push({pack,message:e.message});console.warn('AURA model unavailable:',pack,e.message);}}
    document.dispatchEvent(new CustomEvent('aura-models-ready',{detail:{loaded:this.loaded,errors:this.errors}}));return this.loaded;
  }
  placement(source,names,x,z,{scale=1,rotation=0,y=0,solid=true,label='Furniture'}={}){
    const group=new THREE.Group();group.name=label;
    source.traverse(m=>{if(m.isMesh&&(!names||names.includes(m.name))){const clone=m.clone();group.add(clone);}});
    const original=new THREE.Box3().setFromObject(group),center=original.getCenter(new THREE.Vector3());for(const m of group.children)m.position.set(-center.x,-original.min.y,-center.z);
    group.scale.setScalar(scale);group.rotation.y=rotation;group.position.set(x,y,z);this.a.scene.add(group);group.updateMatrixWorld(true);
    if(solid)for(const m of group.children){const bounds=new THREE.Box3().setFromObject(m);if(bounds.max.y-bounds.min.y<.08||bounds.max.y<.18)continue;this.a.furniture.push({minX:bounds.min.x-.32,maxX:bounds.max.x+.32,minZ:bounds.min.z-.32,maxZ:bounds.max.z+.32,asset:label});}
    this.groups.push(group);return group;
  }
  install(pack,source){
    if(pack==='the-interior-14-is-spacious'){
      this.placement(source,null,-1.0,4.2,{scale:1.5,label:'Listening lounge'});
      this.a.livingSeating.visible=false;this.a.furniture=this.a.furniture.filter(b=>!b.legacyLounge);
    }else if(pack==='japroom-14-otaku'){
      this.placement(source,['node_0012'],6.8,3.1,{rotation:-Math.PI/2,label:'Gaming library'});
      this.placement(source,['node_0002'],6.4,6.1,{y:.95,rotation:-Math.PI/3,label:'Retro television'});
      const g=this.a.roomGroups.get('living');this.a.box(1.3,.1,.95,6.4,.9,6.1,this.a.m.wood,g);for(const x of [5.95,6.85])this.a.box(.08,.84,.8,x,.42,6.1,this.a.m.bronze,g);
      this.a.furniture.push({minX:5.4,maxX:7.4,minZ:5.2,maxZ:7.0,asset:'TV cabinet'});
      this.a.sign('TAKE A BREAK',6.4,2.8,6.1,2,'YOUR MUSIC. A LITTLE PLAY.',g,-Math.PI/3);
    }else if(pack==='loft2-free-interior'){
      this.placement(source,null,25.3,25.5,{scale:1.15,rotation:Math.PI,label:'Recording listening corner'});
    }else if(pack==='chairs-and-window-set-game-ready'){
      this.placement(source,null,-30.25,15,{rotation:Math.PI/2,label:'Idea-room reading nook'});
    }else if(pack==='modern-house-villa-game-ready-4k'){
      this.placement(source,null,52,-25,{y:-1.6,rotation:-Math.PI/2,solid:false,label:'Neighboring villa'});
      this.placement(source,null,5.5,16.5,{scale:.12,y:.86,solid:false,label:'Villa study'});
      const g=this.a.roomGroups.get('gallery');this.a.box(2.8,.14,2.2,5.5,.78,-3.5,this.a.m.wood,g);for(const x of [4.4,6.6])this.a.box(.09,.7,1.8,x,.35,-3.5,this.a.m.bronze,g);
      this.a.furniture.push({minX:3.8,maxX:7.2,minZ:14.9,maxZ:18.1,asset:'Villa display'});
    }
  }
}
