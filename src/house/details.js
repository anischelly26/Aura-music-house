import * as THREE from 'three';
import { seeded } from './layout.js';

/** Composed, low-poly objects; static geometry is merged by room/material. */
export function furnish(a, g, r) {
  const m = a.m, random = seeded(r.number * 451);
  const box = (...v) => a.box(...v, g);
  const mesh = (geo, mat, x,y,z) => a.mesh(geo,mat,x,y,z,g);
  const cable = points => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve,18,.022,5,false),m.black,0,0,0);
  };
  const plant = (x,z,h=2) => {
    mesh(new THREE.CylinderGeometry(.35,.28,.55,12),m.ivory,x,.28,z);
    mesh(new THREE.CylinderGeometry(.04,.06,h,7),m.wood,x,.5+h/2,z);
    for(let i=0;i<12;i++) {
      const angle=i*2.4, y=.7+random()*h;
      const leaf=mesh(new THREE.SphereGeometry(1,8,6),m.leaf,x+Math.sin(angle)*.3,y,z+Math.cos(angle)*.3);
      leaf.scale.set(.15,.48,.08); leaf.rotation.z=Math.sin(angle)*.8; leaf.rotation.y=angle;
    }
    a.contact(x,z,1.8,1.8,g);
  };
  const lamp = (x,z) => {
    mesh(new THREE.CylinderGeometry(.38,.42,.08,16),m.bronze,x,.06,z);
    mesh(new THREE.CylinderGeometry(.025,.025,2.3,8),m.bronze,x,1.2,z);
    mesh(new THREE.CylinderGeometry(.3,.55,.55,20,1,true),m.fabric,x,2.4,z);
    mesh(new THREE.SphereGeometry(.08,8,6),m.light,x,2.25,z);
  };
  const bookshelf = (x,z) => {
    box(3.4,2.5,.5,x,1.3,z,m.wood);
    for(let row=0;row<3;row++) {
      box(3.25,.04,.6,x,.65+row*.68,z+.07,m.bronze);
      for(let i=0;i<13;i++) {
        const h=.32+random()*.23, w=.08+random()*.1;
        box(w,h,.32,x-1.4+i*.225,.69+row*.68+h/2,z+.25,[m.dark,m.rug,m.ivory,m.wood][i%4]);
      }
    }
  };
  const rack = (x,z) => {
    box(1.2,1.55,.65,x,.78,z,m.wood);
    for(let row=0;row<5;row++) {
      box(1.08,.23,.06,x,.25+row*.26,z+.36,m.dark);
      for(let j=0;j<6;j++) {
        const knob=mesh(new THREE.CylinderGeometry(.033,.033,.03,8),m.metal,x-.4+j*.15,.25+row*.26,z+.41);
        knob.rotation.x=Math.PI/2;
      }
      box(.08,.025,.02,x+.42,.3+row*.26,z+.405,m.light);
    }
  };
  // Tactile room perimeter, wainscot, and rhythm of acoustic timber slats.
  for(const z of [-8.68,8.68]) {
    box(17.3,.1,.12,0,.12,z,m.wood);
    if(r.id!=='terrace') box(12.8,.08,.08,0,3.9,z,m.bronze);
  }
  if(['instrument','record','master','living','rhythm'].includes(r.id)) {
    const side=r.id==='rhythm'?8.72:-8.72;
    for(let i=0;i<34;i++) box(.12,3.2,.075,side,2.2,-8+i*.13,m.wood);
    for(let i=0;i<6;i++) box(.18,2.4,.45,side+(side>0?-.15:.15),1.5,4.6+i*.48,m.fabric);
  }
  if(r.id==='gallery') {plant(-7,26-r.z,2.5);lamp(7,6);bookshelf(-5,8.3);}
  if(r.id==='instrument') {
    plant(-7,6.8,2.4); lamp(6.5,-6.2);rack(6.2,5.7);
    // Pedal board, microphone pair, and curved floor leads beside the grand.
    box(1.2,.11,.38,-2,.14,1.2,m.black);
    for(let i=0;i<3;i++) box(.14,.045,.24,-2.35+i*.34,.21,1.15,m.bronze);
    for(const x of [-5,-3.4]) {
      mesh(new THREE.CylinderGeometry(.017,.017,2,7),m.metal,x,1,-4.6);
      const mic=mesh(new THREE.CylinderGeometry(.05,.05,.3,8),m.black,x,2,-4.6);mic.rotation.z=.75;
      cable([[x,.05,-4.6],[x-1,.06,-5.2],[4,.06,-6],[6,.08,5.7]]);
    }
    bookshelf(3.8,8.3);
  }
  if(r.id==='living') {
    plant(-7,-6,2.8);lamp(-6,5);bookshelf(-5,8.3); rack(7,-6.7);
    // A functioning studio's visual context: records, turntable, cups, headphones.
    box(2.8,.15,.95,-6.2,1,-6.2,m.wood);
    box(1.2,.1,.7,-6.2,1.12,-6.2,m.dark);
    mesh(new THREE.CylinderGeometry(.29,.29,.025,32),m.black,-6.4,1.2,-6.2);
    mesh(new THREE.CylinderGeometry(.09,.09,.028,20),m.ivory,-6.4,1.22,-6.2);
    cable([[-5.75,1.24,-6.45],[-5.9,1.24,-6.3],[-6.2,1.24,-6.16]]);
    for(let i=0;i<8;i++) box(.07,.62,.63,-7+i*.085,1.4,-6.05,i%2?m.rug:m.ivory);
    const phones=mesh(new THREE.TorusGeometry(.18,.04,8,20,Math.PI),m.black,3.6,1.05,-3.65);phones.rotation.x=Math.PI/2;
  }
  if(r.id==='record') {
    rack(-6,6);lamp(6.7,6.5);plant(7,-6,2.4);
    for(let i=0;i<10;i++) {
      box(.55,.4+random()*.5,.3,-6.7+i*.53,2.8,8.55,m.wood);
      box(.5,.3+random()*.3,.32,-6.7+i*.53,3.65,8.53,m.dark);
    }
    cable([[0,.04,-4],[1,.06,-3.2],[4,.04,-4],[6,.06,2],[5,.08,6]]);
  }
  if(r.id==='rhythm') {plant(7,6.5,2.5);lamp(-6,-6);rack(-6.7,6.5);bookshelf(4,8.3);}
  if(r.id==='arrange') {plant(7,-6.5,2.4);lamp(6.4,6.5);rack(-5.5,6.5);bookshelf(2,8.3);}
  if(r.id==='idea') {plant(-7,-6,2);lamp(6,6);bookshelf(4,8.3);}
  if(r.id==='master') {lamp(-6,6.5);lamp(6,6.5);plant(-7,-6.5,2.5);rack(7,1);}
  if(r.id==='terrace') {
    for(const x of [-7,7]) plant(x,6,2.7);
    for(let i=0;i<5;i++) box(1.4,.06,16,-6+i*3,.04,0,m.wood);
  }
}
