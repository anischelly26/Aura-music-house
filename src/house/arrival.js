import * as THREE from 'three';

const smooth = t => t * t * (3 - 2 * t);

/** A live camera passage through the same architecture used by the studio. */
export class Arrival {
  constructor(house, short = false) {
    this.house = house;
    this.duration = short ? 3200 : 8200;
    this.started = performance.now();
    this.path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(10, 3.4, 43), new THREE.Vector3(4, 2.6, 39),
      new THREE.Vector3(0, 1.85, 34), new THREE.Vector3(0, 1.72, 29),
      new THREE.Vector3(0, 1.72, 24),
    ]);
    this.group = new THREE.Group();
    house.scene.add(this.group);
    const points = [];
    for (let i = 0; i < 180; i++) {
      const t = i / 179;
      points.push(new THREE.Vector3((t - .5) * 13, 2.2 + Math.sin(t * 42) * Math.exp(-Math.abs(t - .5) * 3) * .6, 33));
    }
    this.wave = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color: '#e1c58f', transparent: true, opacity: 0}));
    this.group.add(this.wave);
    const positions = new Float32Array(270 * 3);
    for (let i = 0; i < 270; i++) {
      positions[i * 3] = Math.sin(i * 13.7) * 8;
      positions[i * 3 + 1] = 1.4 + (i % 33) / 10;
      positions[i * 3 + 2] = 31 + Math.cos(i * 3.4) * 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({color:'#e9d9b5', size:.028, transparent:true, opacity:0, depthWrite:false}));
    this.group.add(this.dust);
    this.overlay = document.createElement('div');
    this.overlay.className = 'cinematicArrival';
    this.overlay.innerHTML = '<div class="arrivalVeil"></div><div class="cinematicMark"><span>AURA</span><small>A HOUSE FOR YOUR MUSIC</small></div><button class="skipCinematic">Skip arrival <kbd>Esc</kbd></button>';
    document.body.append(this.overlay);
    this.overlay.querySelector('button').onclick = () => this.finish();
    this.key = e => {if (e.code === 'Escape') this.finish();};
    addEventListener('keydown', this.key);
    document.body.classList.add('houseMoving');
  }
  update(time) {
    if (this.done) return;
    const t = Math.min(1, (time - this.started) / this.duration);
    const h = this.house;
    h.camera.position.copy(this.path.getPoint(smooth(t)));
    h.lookAt(0, 1.9 + (1 - t) * .25, 20);
    const fade = Math.sin(Math.PI * Math.min(1, t * 1.4));
    this.wave.material.opacity = Math.max(0, fade * .8 * (1 - smooth(Math.max(0, (t - .5) * 2))));
    this.wave.position.z = -t * 4;
    this.dust.material.opacity = Math.max(0, fade * .5);
    this.dust.rotation.y = t * .15;
    this.overlay.querySelector('.arrivalVeil').style.opacity = Math.max(0, 1 - t * 5);
    this.overlay.querySelector('.cinematicMark').style.opacity = Math.max(0, Math.min(1, (t - .12) * 7, (.75 - t) * 7));
    if (t >= 1) this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.key);
    this.overlay.remove();
    this.group.traverse(o => {o.geometry?.dispose(); o.material?.dispose();});
    this.group.removeFromParent();
    this.house.camera.position.set(0, 1.72, 24);
    this.house.lookAt(0, 2, 10);
    this.house.setRoom('gallery');
    this.house.arrival = null;
    document.body.classList.remove('houseMoving');
  }
}
