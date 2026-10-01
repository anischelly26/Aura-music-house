import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { materials, textTexture } from "./materials.js";
import { furnish } from "./details.js";
import { rooms, seeded, projectSeed } from "./layout.js";
export class Architecture {
  constructor(scene) {
    this.scene = scene;
    this.m = materials();
    this.walls = [];
    this.roomLights = [];
    this.furniture = [{minX:-.9,maxX:.9,minZ:14.6,maxZ:23.4},{minX:-24,maxX:-20,minZ:-6.3,maxZ:-1.5},{minX:-2.5,maxX:2.5,minZ:1.4,maxZ:4.2,legacyLounge:true},{minX:-4.5,maxX:3.2,minZ:4.5,maxZ:6.7,legacyLounge:true},{minX:1.1,maxX:7.9,minZ:-5.3,maxZ:-3.3},{minX:17,maxX:25,minZ:-5,maxZ:3}];
    this.furniture.push(
      {minX:-23.55,maxX:-21.05,minZ:-1.05,maxZ:.2}, // piano bench, including rotation and body clearance
      {minX:-22.35,maxX:-17.65,minZ:15.5,maxZ:17.5}, // idea desk
      {minX:-21.5,maxX:-18.5,minZ:19.5,maxZ:21.7}, // idea seat
      {minX:19.15,maxX:23.25,minZ:21.1,maxZ:22.9}, // recording desk
      {minX:-26.35,maxX:-13.65,minZ:-18.95,maxZ:-17.05}, // arrangement bench
      {minX:-.95,maxX:.95,minZ:-18.9,maxZ:-16.9}, // listening chair
      {minX:13.15,maxX:18.85,minZ:-18.05,maxZ:-15.95}, // terrace seat
      {minX:-15.4,maxX:-12.6,minZ:1.65,maxZ:4.35} // synth pedestal
    );
    this.interactive = [];
    this.doors = [];
    this.roomGroups = new Map();
    this.mixObjects = new Map();
    this.consoleFaders = [];
    this.pads = [];
    this.screens = [];
    this.buildShell();
    for (const r of rooms) {
      const g = new THREE.Group();
      g.name = r.id;
      g.position.set(r.x, 0, r.z);
      scene.add(g);
      this.roomGroups.set(r.id, g);
      this.roomLight(g, r);
      this.roomName(g, r);
      this.buildRoom(g, r);
      furnish(this, g, r);
    }
    this.buildLandscape();
    this.contact(-22, -2, 7, 7, this.scene);
    this.contact(0, 3, 9, 6, this.scene);
    this.contact(4.5, -4.3, 8, 3, this.scene);
    this.contact(21, -1, 9, 9, this.scene);
    this.batchStatic();
  }
  box(w, h, d, x, y, z, mat, parent = this.scene, solid = false) {
    const geo =
      mat === this.m.fabric
        ? new RoundedBoxGeometry(w, h, d, 3, Math.min(0.1, w / 8, h / 5, d / 8))
        : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (solid) {
      const p = new THREE.Vector3();
      mesh.getWorldPosition(p);
      this.walls.push({
        minX: p.x - w / 2 - 0.34,
        maxX: p.x + w / 2 + 0.34,
        minZ: p.z - d / 2 - 0.34,
        maxZ: p.z + d / 2 + 0.34,
      });
    }
    return mesh;
  }
  mesh(geo, mat, x, y, z, parent = this.scene) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  action(object, data) {
    object.userData.action = data;
    this.interactive.push(object);
    return object;
  }
  contact(x, z, w, d, parent) {
    if (!this.contactMaterial) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d"),
        grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      grad.addColorStop(0, "#10130ec0");
      grad.addColorStop(0.65, "#10130e45");
      grad.addColorStop(1, "#10130e00");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      this.contactMaterial = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
    }
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      this.contactMaterial,
    );
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.035, z);
    parent.add(p);
  }
  batchStatic() {
    this.scene.updateMatrixWorld(true);
    const moving = new Set([
      ...this.entrance,
      ...this.doors.flatMap((d) => d.panels),
      ...this.interactive,
    ]);
    const batches = new Map();
    this.scene.traverse((o) => {
      if (
        !o.isMesh ||
        moving.has(o) ||
        o.material.transparent ||
        o.material.isShaderMaterial ||
        Array.isArray(o.material)
      )
        return;
      let parent = o.parent,
        room = "shell";
      while (parent) {
        if (parent === this.installation || parent === this.memoryGroup || parent === this.livingSeating) return;
        if (this.roomGroups.has(parent.name)) room = parent.name;
        parent = parent.parent;
      }
      const key =
        room +
        "|" +
        o.material.uuid +
        "|" +
        o.castShadow +
        "|" +
        o.receiveShadow;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(o);
    });
    for (const objects of batches.values()) {
      if (objects.length < 3) continue;
      const geometries = objects.map((o) => {
        const g = o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        return g;
      });
      const merged = mergeGeometries(geometries);
      if (!merged) {
        geometries.forEach((g) => g.dispose());
        continue;
      }
      const mesh = new THREE.Mesh(merged, objects[0].material);
      mesh.castShadow = objects[0].castShadow;
      mesh.receiveShadow = objects[0].receiveShadow;
      this.scene.add(mesh);
      for (const o of objects) {
        o.parent.remove(o);
        o.geometry.dispose();
      }
      geometries.forEach((g) => g.dispose());
    }
  }
  sign(text, x, y, z, width = 5, sub = "", parent = this.scene, rotation = 0) {
    const tex = textTexture(text, { sub });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
      }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    parent.add(mesh);
    return mesh;
  }
  buildShell() {
    const m = this.m;
    this.box(65, 0.65, 65, 0, -0.7, 0, m.dark);
    this.box(62, 0.2, 62, 0, -0.1, 0, m.floor);
    this.box(6, 0.18, 9, 0, -0.08, 34, m.floor);
    this.box(70, 0.1, 70, 0, -0.85, 0, m.water); // reflective perimeter pool
    for (const x of [-9, 9])
      for (const z of [-20, 0, 20]) {
        const half = z === 0 ? 9 : 11;
        for (const side of [-1, 1])
          this.box(
            0.35,
            6.4,
            half - 2,
            x,
            3.2,
            z + (side * (half + 2)) / 2,
            m.wall,
            this.scene,
            true,
          );
        this.box(0.45, 1.5, 4.4, x, 5.65, z, m.wall);
        this.portal(x, z, "x");
      }
    for (const z of [-9, 9])
      for (const x of [-20, 0, 20]) {
        const half = x === 0 ? 9 : 11;
        for (const side of [-1, 1])
          this.box(
            half - 2,
            6.4,
            0.35,
            x + (side * (half + 2)) / 2,
            3.2,
            z,
            m.wall,
            this.scene,
            true,
          );
        this.box(4.4, 1.5, 0.45, x, 5.65, z, m.wall);
        this.portal(x, z, "z");
      }
    // Deep structural fins frame the outside glass, with one generous entrance.
    for (const x of [-31, 31]) {
      this.box(0.3, 6.4, 62, x, 3.2, 0, m.glass);
      for (let z = -31; z <= 31; z += 7.75)
        this.box(0.35, 6.4, 0.5, x, 3.2, z, m.wall);
      this.walls.push({ minX: x - 0.4, maxX: x + 0.4, minZ: -31, maxZ: 31 });
    }
    this.box(62, 6.4, 0.25, 0, 3.2, -31, m.glass);
    this.walls.push({ minX: -31, maxX: 31, minZ: -31.4, maxZ: -30.6 });
    for (const x of [-31, -24, -17, -9, 9, 17, 24, 31])
      this.box(0.5, 6.4, 0.4, x, 3.2, -31, m.wall);
    for (const side of [-1, 1]) {
      this.box(28, 6.4, 0.3, side * 17, 3.2, 31, m.wall, this.scene, true);
      this.box(
        2.65,
        4.7,
        0.15,
        side * 1.35,
        2.35,
        31,
        m.black,
      ).userData.entranceSide = side;
    }
    this.box(6, 1.7, 0.5, 0, 5.55, 31, m.wall);
    this.sign("A U R A", 0, 5.25, 31.29, 5, "THE MUSIC HOUSE");
    this.entrance = this.scene.children.filter((o) => o.userData.entranceSide);
    this.box(6, 0.08, 0.06, 0, 0.025, 31, m.light);
    // Individual roofs, skylights and subtle practical lighting.
    for (const r of rooms) {
      if (r.id === "terrace") continue;
      const w = r.col === 1 ? 18 : 22,
        d = r.row === 1 ? 18 : 22;
      const y = r.id === "living" ? 7.5 : 6.4;
      const sw = r.id === "living" ? 11 : 7,
        sd = r.id === "living" ? 11 : 6;
      for (const side of [-1, 1]) {
        this.box(
          (w - sw) / 2,
          0.22,
          d,
          r.x + (side * (w + sw)) / 4,
          y,
          r.z,
          m.ceiling,
        );
        this.box(
          sw,
          0.22,
          (d - sd) / 2,
          r.x,
          y,
          r.z + (side * (d + sd)) / 4,
          m.ceiling,
        );
        this.box(
          0.075,
          0.12,
          sd + 0.1,
          r.x + (side * sw) / 2,
          y - 0.1,
          r.z,
          m.bronze,
        );
        this.box(
          sw,
          0.12,
          0.075,
          r.x,
          y - 0.1,
          r.z + (side * sd) / 2,
          m.bronze,
        );
      }
      const skylight = this.box(sw, 0.02, sd, r.x, y - 0.08, r.z, m.glass);
      skylight.castShadow = false;
      for (const sx of [-1, 1])
        this.box(
          w - 0.8,
          0.04,
          0.08,
          r.x,
          y - 0.3,
          r.z + sx * (d / 2 - 0.6),
          m.light,
        );
    }
    // Living-room roof is held by strong, exposed columns and elevated beams.
    for (const x of [-7.6, 7.6])
      for (const z of [-7.6, 7.6]) {
        this.box(0.52, 7.5, 0.52, x, 3.75, z, m.wall);
        this.box(0.8, 0.1, 0.8, x, 0.03, z, m.bronze);
      }
  }
  portal(x, z, axis) {
    const m = this.m,
      g = new THREE.Group();
    g.position.set(x, 0, z);
    if (axis === "x") g.rotation.y = Math.PI / 2;
    this.scene.add(g);
    const left = this.box(0.055, 4.7, 0.14, -2.15, 2.35, 0, m.bronze, g),
      right = this.box(0.055, 4.7, 0.14, 2.15, 2.35, 0, m.bronze, g);
    this.box(4.35, 0.07, 0.13, 0, 4.7, 0, m.bronze, g);
    const doorMat = m.glass.clone();
    doorMat.opacity = 0.3;
    const panels = [-1, 1].map((side) => {
      const panel = this.box(
        2.08,
        4.64,
        0.045,
        side * 1.04,
        2.32,
        0,
        doorMat,
        g,
      );
      panel.userData.side = side;
      return panel;
    });
    this.doors.push({ group: g, panels, x, z, open: 0 });
    this.box(4.2, 0.035, 0.045, 0, 0.02, -0.3, m.light, g);
  }
  roomLight(g, r) {
    const m = this.m;
    const light = new THREE.PointLight(
      r.accent,
      r.id === "living" ? 48 : 32,
      23,
      2,
    );
    light.position.set(0, 5.2, 0);
    g.add(light);
    this.roomLights.push(light);
    this.box(
      r.col === 1 ? 8 : 11,
      0.018,
      0.02,
      0,
      0.025,
      r.row === 1 ? -8.1 : -10.1,
      m.light,
      g,
    );
  }
  roomName(g, r) {
    if (r.id === "terrace") return;
    this.sign(
      r.name.toUpperCase(),
      r.col === 1 ? 0 : -5,
      4.6,
      -(r.row === 1 ? 8.72 : 10.72),
      r.id === "living" ? 5.8 : 6.5,
      r.eyebrow,
      g,
    );
  }
  pedestal(x, z, g, w = 2, h = 0.7) {
    this.box(w, h, w, x, h / 2, z, this.m.wall, g);
    this.box(w + 0.04, 0.04, w + 0.04, x, h + 0.02, z, this.m.bronze, g);
  }
  artFrame(g, x, y, z, w, h, action, rotation = 0) {
    const frame = new THREE.Group();
    frame.position.set(x, y, z);
    frame.rotation.y = rotation;
    g.add(frame);
    this.box(w + 0.13, h + 0.13, 0.09, 0, 0, 0, this.m.bronze, frame);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const art = this.mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture }),
      0,
      0,
      0.055,
      frame,
    );
    if (action) this.action(art, action);
    return { canvas, texture, art, frame };
  }
  buildRoom(g, r) {
    const m = this.m;
    if (r.id === "gallery") {
      this.galleryArt = this.artFrame(
        g,
        -5.3,
        2.9,
        -2,
        3.8,
        3.8,
        { type: "projects" },
        Math.PI / 2,
      );
      this.sign(
        "A collection of unfinished futures",
        0,
        3.9,
        8.65,
        7,
        "WALK TOWARD A WORK. OR BEGIN ONE.",
        g,
        Math.PI,
      );
      const blank = this.artFrame(
        g,
        5.25,
        2.8,
        2,
        3.2,
        3.6,
        { type: "new" },
        -Math.PI / 2,
      );
      const c = blank.canvas.getContext("2d");
      c.fillStyle = "#252c28";
      c.fillRect(0, 0, 512, 512);
      c.strokeStyle = "#bca787";
      c.lineWidth = 1;
      c.strokeRect(58, 58, 396, 396);
      c.fillStyle = "#c8b89b";
      c.font = "300 54px Arial";
      c.textAlign = "center";
      c.fillText("+", 256, 228);
      c.font = "15px Arial";
      c.fillText("NEW CREATION", 256, 282);
      blank.texture.needsUpdate = true;
      this.box(1, 0.6, 8, 0, 0.3, -1, m.fabric, g);
      this.memoryGroup = new THREE.Group();
      g.add(this.memoryGroup);
      const memorySign = this.sign(
        "MUSICAL MEMORY",
        -5.7,
        2,
        -7.9,
        3,
        "KEEP A VERSION. KEEP A MOMENT.",
        g,
      );
      this.action(memorySign, { type: "memory" });
      for (let i = 0; i < 7; i++)
        this.box(0.012, 5, 0.012, -7.8 + i * 0.28, 2.5, 4, m.bronze, g);
    } else if (r.id === "instrument") {
      this.piano(g, -2, -2);
      this.pedestal(6, 3, g, 2, 1.1);
      const synth = this.action(
        this.box(2.2, 0.2, 1.2, 6, 1.3, 3, m.black, g),
        { type: "instrument", instrument: "lead" },
      );
      for (let i = 0; i < 10; i++)
        this.mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12),
          m.metal,
          5.2 + i * 0.17,
          1.46,
          2.7,
          g,
        );
      this.sign("ANALOG CURRENT", 6, 2.1, 3, 2.8, "SUBTRACTIVE SYNTHESIS", g);
      this.pedestal(-6, 4, g, 1.9, 1);
      const bass = this.action(
        this.mesh(
          new THREE.TorusGeometry(0.7, 0.07, 12, 70),
          m.bronze,
          -6,
          2.3,
          4,
          g,
        ),
        { type: "instrument", instrument: "bass" },
      );
      bass.rotation.y = 0.3;
      this.sign(
        "SUB ARCHITECTURE",
        -6,
        1.5,
        4.95,
        2.7,
        "SINE + FILTERED SAW",
        g,
      );
      this.pedestal(6, -5, g, 1.9, 0.7);
      this.action(
        this.mesh(
          new THREE.IcosahedronGeometry(0.65, 1),
          m.glass,
          6,
          1.9,
          -5,
          g,
        ),
        { type: "instrument", instrument: "pad" },
      );
      this.sign("MIDNIGHT GLASS", 6, 1.2, -3.9, 2.6, "DETUNED ATMOSPHERE", g);
      this.pianoWall = this.screen(
        g,
        -9.65,
        2.8,
        -1,
        8.8,
        3.4,
        "piano",
        Math.PI / 2,
      );
      this.action(this.pianoWall.mesh, { type: "tool", room: "instrument" });
      this.box(6, 0.02, 5, -2, 0.025, -2, m.rug, g);
    } else if (r.id === "rhythm") {
      this.pedestal(1, -1, g, 7, 0.45);
      this.mesh(
        new THREE.CylinderGeometry(3.6, 3.6, 0.12, 72),
        m.black,
        1,
        0.54,
        -1,
        g,
      );
      for (let ring = 0; ring < 3; ring++)
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2,
            rad = 1.5 + ring * 0.75,
            mat = new THREE.MeshStandardMaterial({
              color: "#786b55",
              emissive: "#9b7650",
              emissiveIntensity: 0.03,
              roughness: 0.5,
            });
          const pad = this.mesh(
            new THREE.CylinderGeometry(0.14, 0.17, 0.065, 16),
            mat,
            1 + Math.sin(angle) * rad,
            0.64,
            -1 + Math.cos(angle) * rad,
            g,
          );
          this.action(pad, {
            type: "step",
            step: i,
            pitch: [36, 38, 42][ring],
          });
          this.pads.push({ mesh: pad, step: i, pitch: [36, 38, 42][ring] });
        }
      const plinth = this.action(
        this.box(1.6, 1.4, 1.1, -5, 0.7, 4, m.wood, g),
        { type: "tool", room: "rhythm" },
      );
      this.sign(
        "PATTERN / PULSE",
        -5,
        2.2,
        4.6,
        3.7,
        "16 STEPS. THREE VOICES. YOUR RHYTHM.",
        g,
      );
      for (let i = 0; i < 20; i++)
        this.box(0.12, 4.8, 0.08, -9.6, 2.4, -7.5 + i * 0.73, m.wood, g);
      this.rhythmWall = this.screen(
        g,
        10.65,
        2.5,
        0,
        8.4,
        2.4,
        "drums",
        -Math.PI / 2,
      );
      this.action(this.rhythmWall.mesh, { type: "tool", room: "rhythm" });
    } else if (r.id === "living") {
      this.box(10, 0.02, 10, 0, 0.02, 1.7, m.rug, g);
      const seating=new THREE.Group();g.add(seating);this.livingSeating=seating;
      this.box(6.6, 0.55, 1.3, -0.6, 0.38, 5.4, m.fabric, seating);
      this.box(6.8, 0.5, 0.35, -0.6, 0.87, 5.95, m.fabric, seating);
      this.box(1.4, 0.55, 4.5, -4.5, 0.38, 3.8, m.fabric, seating);
      this.box(0.35, 0.5, 4.7, -5, 0.87, 3.8, m.fabric, seating);
      this.box(4.5, 0.12, 2.3, 0, 0.53, 2.8, m.wood, seating);
      for (const x of [-1.8, 1.8])
        this.box(0.07, 0.47, 1.8, x, 0.235, 2.8, m.bronze, seating);
      // The console is a real entry point to the silent game, beside the shared mixer.
      this.box(3.9,.12,.85,-1.4,.7,-3.4,m.wood,g);
      for(const x of [-3,.2])this.box(.1,.63,.7,x,.32,-3.4,m.bronze,g);
      this.action(this.box(.75,.12,.46,-.15,.82,-3.25,m.black,g),{type:'game'});
      const gameFrame=this.box(3.45,1.99,.12,-1.5,2.05,-3.5,m.black,g);this.action(gameFrame,{type:'game'});
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');ctx.fillStyle='#18382b';ctx.fillRect(0,0,960,540);ctx.fillStyle='#e0cda6';ctx.font='42px Georgia';ctx.textAlign='center';ctx.fillText('Sundown Rally',480,260);ctx.font='22px Arial';ctx.fillText('PLAY & LISTEN',480,310);
      this.gameTexture=new THREE.CanvasTexture(canvas);this.gameTexture.colorSpace=THREE.SRGBColorSpace;
      this.action(this.mesh(new THREE.PlaneGeometry(3.3,1.856),new THREE.MeshBasicMaterial({map:this.gameTexture,toneMapped:false}),-1.5,2.05,-3.429,g),{type:'game'});
      this.furniture.push({minX:-3.7,maxX:.9,minZ:-4.2,maxZ:-2.6,asset:'Living-room console'});
      this.livingConsole = this.action(
        this.box(6, 0.22, 1.5, 4.5, 1.03, -4.3, m.wood, g),
        { type: "tool", room: "living" },
      );
      for (const x of [2.1, 6.9])
        this.box(0.12, 0.85, 1.2, x, 0.44, -4.3, m.bronze, g);
      for (let i = 0; i < 12; i++) {
        this.box(0.34, 0.012, 1.06, 1.7 + i * 0.48, 1.153, -4.3, m.black, g);
        this.consoleFaders.push(
          this.action(
            this.box(
              0.12,
              0.045,
              0.14,
              1.7 + i * 0.48,
              1.18,
              -4.05,
              m.metal,
              g,
            ),
            { type: "channel", index: i },
          ),
        );
      }
      this.mixWall = this.screen(
        g,
        8.72,
        2.75,
        -4.9,
        6,
        2.5,
        "mixer",
        -Math.PI / 2,
      );
      this.action(this.mixWall.mesh, { type: "tool", room: "living" });
      for (const x of [-6.4, 6.4]) this.speaker(g, x, -6.4, 2.8);
      this.installation = new THREE.Group();
      g.add(this.installation);
      for (let i = 0; i < 3; i++) {
        const ring = this.mesh(
          new THREE.TorusGeometry(2.4 - i * 0.42, 0.018, 8, 96),
          m.bronze,
          0,
          3.4 + i * 0.17,
          0,
          this.installation,
        );
        ring.rotation.set(Math.PI / 2 + i * 0.42, i * 0.7, 0.3);
        this.box(0.01, 3.7, 0.01, (i - 1) * 1.2, 5.8, 0.2, m.metal, g);
      }
      this.lens = this.action(
        this.mesh(
          new THREE.IcosahedronGeometry(0.26, 2),
          new THREE.MeshStandardMaterial({
            color: "#d0b98d",
            emissive: "#c7aa7e",
            emissiveIntensity: 0.4,
            metalness: 0.4,
            roughness: 0.2,
          }),
          4.6,
          1.1,
          -3,
          g,
        ),
        { type: "lens" },
      );
      this.pedestal(4.6, -3, g, 0.9, 0.65);
      this.sign(
        "PRODUCER LENS",
        4.6,
        1.9,
        -3,
        2.4,
        "LOCAL MEASUREMENTS. TRANSPARENT RULES.",
        g,
      );
    } else if (r.id === "arrange") {
      this.arrangementWall = this.screen(
        g,
        -10.72,
        3,
        -0.4,
        17,
        3.5,
        "timeline",
        Math.PI / 2,
      );
      this.action(this.arrangementWall.mesh, { type: "tool", room: "arrange" });
      this.box(12, 0.12, 1.2, 0, 0.8, 2, m.wood, g);
      for (let i = 0; i < 4; i++)
        this.box(0.13, 0.72, 0.9, -4.5 + i * 3, 0.36, 2, m.bronze, g);
      for (let i = 0; i < 12; i++) {
        this.box(0.08, 5, 0.08, 9.8, 2.5, -9.2 + i * 1.55, m.bronze, g);
        this.box(0.04, 0.018, 0.8, 9.75, 0.03, -9.2 + i * 1.55, m.light, g);
      }
    } else if (r.id === "idea") {
      this.box(10, 0.02, 8, 0, 0.02, 0, m.rug, g);
      this.box(4, 0.12, 1.3, 0, 0.95, -3.5, m.wood, g);
      for(const x of [-1.7,1.7])for(const z of [-3.95,-3.05])this.box(.09,.89,.09,x,.445,z,m.bronze,g);
      this.action(this.box(2.4, 0.1, 0.6, -0.5, 1.07, -3.4, m.black, g), {
        type: "tool",
        room: "idea",
      });
      for (let i = 0; i < 14; i++)
        this.box(0.145, 0.03, 0.35, -1.55 + i * 0.155, 1.135, -3.2, m.ivory, g);
      this.microphone(g, 2, -2.8);
      const coachTablet=this.action(this.box(.68,.05,.5,1.1,1.06,-3.4,m.bronze,g),{type:'coach'});
      this.sign('LEARN',1.1,1.15,-3.35,.55,'MUSIC COACH',g);
      this.box(2.3, 0.6, 1.4, 0, 0.35, 0.6, m.fabric, g);
      this.ideaArt = this.artFrame(
        g,
        -9.8,
        2.8,
        0,
        5,
        3,
        { type: "tool", room: "idea" },
        Math.PI / 2,
      );
      this.sign(
        "A ROOM FOR A FEELING",
        0,
        3.6,
        -10.7,
        7,
        "CAPTURE FIRST. DECIDE LATER.",
        g,
      );
      for (let i = 0; i < 18; i++)
        this.box(0.07, 4, 0.06, 9.8, 2, -8.5 + i * 0.9, m.wood, g);
    } else if (r.id === "record") {
      this.box(10, 5.4, 0.08, 0, 2.7, -2, m.glass, g);
      this.box(10, 0.1, 0.18, 0, 0, -2, m.bronze, g);
      this.microphone(g, 0, -5.4);
      this.action(this.box(3.4, 0.15, 1.1, 1.2, 1.1, 2, m.wood, g), {
        type: "tool",
        room: "record",
      });
      for(const x of [-.2,2.6])for(const z of [1.6,2.4])this.box(.1,1.025,.1,x,.5125,z,m.bronze,g);
      this.recordingScreen = this.screen(
        g,
        1.2,
        1.8,
        1.3,
        2.6,
        1.15,
        "recording",
        0,
      );
      this.action(this.recordingScreen.mesh, { type: "tool", room: "record" });
      for (let i = 0; i < 8; i++) {
        this.box(0.58, 3.1, 0.18, -9.8, 2.6, -8 + i * 2.3, m.fabric, g);
        this.box(0.58, 3.1, 0.18, 9.8, 2.6, -8 + i * 2.3, m.fabric, g);
      }
      this.box(4, 0.025, 4, 0, 0.02, -5.4, m.rug, g);
    } else if (r.id === "master") {
      this.speaker(g, -4.2, -5.8, 3.8);
      this.speaker(g, 4.2, -5.8, 3.8);
      this.box(6, 0.02, 6, 0, 0.02, -1, m.rug, g);
      this.box(1.2, 0.5, 1.1, 0, 0.4, 2, m.fabric, g);
      this.box(1.2, 0.8, 0.25, 0, 0.85, 2.6, m.fabric, g);
      this.masterScreen = this.screen(g, 0, 2.6, -10.7, 6.5, 2.4, "master");
      this.action(this.masterScreen.mesh, { type: "tool", room: "master" });
      this.action(
        this.mesh(
          new THREE.CylinderGeometry(0.6, 0.6, 0.07, 48),
          m.bronze,
          0,
          0.7,
          -2,
          g,
        ),
        { type: "tool", room: "master" },
      );
      this.mesh(new THREE.CylinderGeometry(.07,.11,.66,16),m.bronze,0,.33,-2,g);
      this.mesh(new THREE.CylinderGeometry(.36,.4,.06,24),m.bronze,0,.03,-2,g);
    } else if (r.id === "terrace") {
      this.box(20, 0.15, 21, 0, -0.08, 0, m.floor, g);
      this.box(14, 0.05, 4, 0, 0.015, -7.5, m.water, g);
      this.box(22, 0.12, 0.2, 0, 4.9, 7, m.wall, g);
      for (const x of [-9.5, 9.5]) this.box(0.2, 5, 0.2, x, 2.5, 7, m.wall, g);
      this.box(5, 0.7, 1.4, -4, 0.35, 3, m.wood, g);
      this.pedestal(3, -3, g, 2.4, 0.8);
      this.exportSculpture = this.action(
        this.mesh(
          new THREE.TorusKnotGeometry(0.75, 0.14, 96, 12),
          m.bronze.clone(),
          3,
          2.2,
          -3,
          g,
        ),
        { type: "tool", room: "terrace" },
      );
      this.sign(
        "A SOUND THAT NOW EXISTS",
        3,
        3.5,
        -3,
        5,
        "EXPORT YOUR PIECE",
        g,
      );
      this.sign(
        "THE EXPORT TERRACE",
        0,
        4.2,
        8.75,
        7,
        "WHAT BEGAN AS AN IDEA CAN LEAVE AS MUSIC.",
        g,
        Math.PI,
      );
    }
  }
  piano(g, x, z) {
    const m = this.m,
      piano = new THREE.Group();
    piano.position.set(x, 0, z);
    piano.rotation.y = -0.2;
    g.add(piano);
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, -0.2);
    shape.lineTo(1.6, -0.2);
    shape.bezierCurveTo(2.1, -1.7, 1.7, -3.5, 0.7, -3.8);
    shape.bezierCurveTo(-0.6, -3.9, -1.65, -2.4, -1.6, -0.2);
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.32,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.04,
        bevelThickness: 0.04,
      }),
      m.black,
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 1.45;
    piano.add(body);
    this.action(body, { type: "instrument", instrument: "keys" });
    this.box(3.2, 0.18, 0.65, 0, 1.2, 0.18, m.black, piano);
    const whitePitches=Array.from({length:88},(_,i)=>i+21).filter(p=>![1,3,6,8,10].includes(p%12));
    const keyWidth=3.04/whitePitches.length;
    for(const [i,pitch] of whitePitches.entries()) {
      const x=-1.52+(i+.5)*keyWidth;
      const key=this.box(keyWidth-.003,.05,.46,x,1.315,.25,m.ivory,piano);
      this.action(key,{type:"note",pitch});
      if(pitch<108 && [0,2,5,7,9].includes(pitch%12)){
        const black=this.box(keyWidth*.6,.075,.27,x+keyWidth/2,1.35,.12,m.black,piano);
        this.action(black,{type:"note",pitch:pitch+1});
      }
    }
    for (const [lx, lz] of [
      [-1.25, 0.25],
      [1.25, 0.25],
      [0.5, -3.15],
    ])
      this.box(0.14, 1.05, 0.14, lx, 0.525, lz, m.black, piano);
    const lid = this.box(3.3, 0.08, 2.9, 0, 1.9, -1.9, m.black, piano);
    lid.rotation.z = -0.22;
    this.box(0.045, 0.8, 0.045, 1.15, 1.65, -2.6, m.bronze, piano);
    this.box(1.8, 0.12, 0.68, 0, 0.64, 1.6, m.fabric, piano);
    for (const lx of [-0.72, 0.72])
      this.box(0.08, 0.56, 0.08, lx, 0.3, 1.6, m.bronze, piano);
    this.sign(
      "FELT CIRCUITS",
      0,
      1.2,
      .525,
      .75,
      "",
      piano,
    );
  }
  speaker(g, x, z, h) {
    const m = this.m;
    this.box(1.18, h, 0.95, x, h / 2, z, m.dark, g);
    for (const [y, rad] of [
      [h * 0.27, 0.37],
      [h * 0.57, 0.24],
      [h * 0.83, 0.12],
    ]) {
      const s = this.mesh(
        new THREE.CylinderGeometry(rad, rad, 0.04, 40),
        m.black,
        x,
        y,
        z + 0.5,
        g,
      );
      s.rotation.x = Math.PI / 2;
      const cap = this.mesh(
        new THREE.SphereGeometry(rad * 0.34, 16, 8),
        m.metal,
        x,
        y,
        z + 0.54,
        g,
      );
      cap.scale.z = 0.3;
    }
    this.box(1.23, 0.06, 1, x, 0.05, z, m.bronze, g);
  }
  microphone(g, x, z) {
    const m = this.m;
    this.mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.6, 10),
      m.black,
      x,
      0.8,
      z,
      g,
    );
    const base = this.mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.03, 24),
      m.black,
      x,
      0.015,
      z,
      g,
    );
    const mic = this.action(
      this.mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.32, 20),
        m.metal,
        x,
        1.76,
        z,
        g,
      ),
      { type: "tool", room: g.name === "record" ? "record" : "idea" },
    );
    const shield = this.mesh(
      new THREE.TorusGeometry(0.28, 0.025, 8, 36),
      m.black,
      x,
      1.75,
      z + 0.3,
      g,
    );
    for (let i = 0; i < 7; i++)
      this.box(0.43, 0.005, 0.005, x, 1.57 + i * 0.05, z + 0.3, m.dark, g);
  }
  screen(g, x, y, z, w, h, type, rotation = 0) {
    const c = document.createElement("canvas");
    c.width = type === "timeline" ? 1536 : 1024;
    c.height = 512;
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    g.add(group);
    this.box(w + 0.18, h + 0.18, 0.08, 0, 0, -0.03, this.m.bronze, group);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.position.z = 0.025;
    group.add(mesh);
    const screen = { canvas: c, texture, mesh, type };
    this.screens.push(screen);
    return screen;
  }
  buildLandscape() {
    const m = this.m;
    const ground = this.box(
      700,
      1,
      700,
      0,
      -2.1,
      0,
      new THREE.MeshStandardMaterial({ color: "#a49b87", roughness: 1 }),
    );
    ground.receiveShadow = false;
    const random = seeded(103);
    for (let i = 0; i < 25; i++) {
      const geo = new THREE.SphereGeometry(1, 28, 12);
      const dune = this.mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: i % 2 ? "#b1a38d" : "#979584",
          roughness: 1,
        }),
        Math.cos(i) * 140,
        -7,
        Math.sin(i) * 150,
      );
      dune.scale.set(40 + random() * 60, 7 + random() * 19, 35 + random() * 45);
      dune.castShadow = false;
    }
    const skyGeo = new THREE.SphereGeometry(400, 32, 16),
      skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          top: { value: new THREE.Color("#66797b") },
          bottom: { value: new THREE.Color("#e3d3b5") },
        },
        vertexShader:
          "varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec3 v; uniform vec3 top; uniform vec3 bottom; void main(){float f=clamp(normalize(v).y*.8+.25,0.,1.);gl_FragColor=vec4(mix(bottom,top,f),1.);}",
      });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }
  updateProject(p, memories = []) {
    this.project = p;
    const random = seeded(projectSeed(p)),
      c = this.galleryArt.canvas,
      ctx = c.getContext("2d");
    ctx.fillStyle = "#1c2521";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#b9a079";
    for (let i = 0; i < 32; i++) {
      ctx.globalAlpha = 0.15 + random() * 0.4;
      ctx.lineWidth = 0.4 + random() * 3;
      ctx.beginPath();
      const cy = 256 + (random() - 0.5) * 130;
      ctx.ellipse(
        256,
        cy,
        80 + random() * 120,
        80 + random() * 110,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e2d7c4";
    ctx.font = "22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.name.slice(0, 35), 256, 446);
    ctx.font = "12px Arial";
    ctx.fillStyle = "#a9aa96";
    ctx.fillText(p.bpm + " BPM / " + p.tracks.length + " voices", 256, 472);
    this.galleryArt.texture.needsUpdate = true;
    if (this.ideaArt) {
      const ctx = this.ideaArt.canvas.getContext("2d");
      ctx.fillStyle = "#3c3730";
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = "#c8b598";
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(256, 256, 20 + i * 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#e5d7bd";
      ctx.font = "15px Arial";
      ctx.textAlign = "center";
      ctx.fillText("BEGIN WITH A FEELING", 256, 440);
      this.ideaArt.texture.needsUpdate = true;
    }
    const alive = new Set(p.tracks.map((t) => t.id));
    for (const [id, o] of this.mixObjects)
      if (!alive.has(id)) {
        o.parent.remove(o);
        o.geometry.dispose();
        o.material.dispose();
        this.interactive = this.interactive.filter((x) => x !== o);
        this.mixObjects.delete(id);
      }
    for (const [i, t] of p.tracks.entries())
      if (!this.mixObjects.has(t.id)) {
        const o = this.mesh(
          t.instrument === "bass" ? new THREE.CylinderGeometry(.3,.3,.65,16) : t.instrument === "drums" ? new THREE.OctahedronGeometry(.34) : ["pad","strings","choir"].includes(t.instrument) ? new THREE.TorusGeometry(.28,.09,8,24) : t.instrument === "audio" ? new THREE.BoxGeometry(.42,.25,.25) : new THREE.IcosahedronGeometry(.28,1),
          new THREE.MeshStandardMaterial({
            color: t.color,
            emissive: t.color,
            emissiveIntensity: 0.05,
            metalness: 0.45,
            roughness: 0.25,
          }),
          t.pan * 3.5,
          2.2,
          -0.1,
          this.installation,
        );
        this.action(o, { type: "track", id: t.id });
        this.mixObjects.set(t.id, o);
      }
    const old = new Set(this.memoryGroup.children);
    this.interactive = this.interactive.filter((o) => !old.has(o));
    for (const obj of old) {
      this.memoryGroup.remove(obj);
      obj.geometry?.dispose();
      if (obj.userData.action) obj.material?.dispose();
    }
    for (const [i, mem] of memories.slice(0, 5).entries()) {
      const o = this.mesh(
        new THREE.OctahedronGeometry(0.22 + i * 0.025),
        this.m.bronze.clone(),
        -6.7 + i * 0.55,
        0.94,
        -7.6,
        this.memoryGroup,
      );
      this.action(o, { type: "memory", id: mem.id });
      this.box(
        0.4,
        0.55,
        0.4,
        -6.7 + i * 0.55,
        0.275,
        -7.6,
        this.m.wall,
        this.memoryGroup,
      );
    }
  }
  updateAudio(metrics, beat, playing) {
    this.consoleFaders.forEach((knob, i) => {
      const track = this.project?.tracks[i];
      knob.visible = !!track;
      if (track) {
        knob.position.z = -4.65 + track.gain * 0.7;
        knob.userData.action = { type: "track", id: track.id };
      }
    });
    for (const [id, o] of this.mixObjects) {
      const t = this.project?.tracks.find((t) => t.id === id);
      if (!t) continue;
      const level = metrics.tracks.get(id)?.rms || 0,
        centroid = metrics.tracks.get(id)?.centroid || 0;
      const notes = t.clips.flatMap((c) => c.notes),
        register = notes.length
          ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length
          : 48;
      const y =
        playing && centroid > 0
          ? 1.4 + Math.min(2.4, Math.max(0, Math.log2(centroid / 60) / 6) * 2.4)
          : 1.6 + ((register - 36) / 48) * 1.6;
      o.position.set(t.pan * 3.4, y, -1 - t.reverb * 2.2);
      const s = playing ? 0.6 + Math.min(2.2, level * 14) : 0.8;
      o.scale.setScalar(s);
      o.material.emissiveIntensity = 0.03 + Math.min(0.35, level * 3);
      o.visible = !t.mute;
    }
    const t = this.project?.tracks.find((t) => t.instrument === "drums"),
      cl =
        t?.clips.find((c) => beat >= c.start && beat < c.start + c.length) ||
        t?.clips[0];
    for (const pad of this.pads) {
      const on = cl?.notes.some(
        (n) => n.pitch === pad.pitch && Math.abs(n.start - pad.step / 4) < 0.05,
      );
      const pulse = playing && on && Math.floor((beat % 4) * 4) === pad.step;
      pad.mesh.material.color.set(on ? "#b79b74" : "#514d40");
      pad.mesh.material.emissiveIntensity = pulse ? 1.5 : on ? 0.16 : 0.025;
    }
    if (this.installation && !this.reduced)
      this.installation.rotation.y = playing ? Math.sin(beat / 16) * 0.045 : 0;
  }
  updateDoors(position, dt) {
    for (const d of this.doors) {
      const target =
        Math.hypot(position.x - d.x, position.z - d.z) < 4.5 ? 1 : 0;
      d.open += (target - d.open) * Math.min(1, dt * 3);
      for (const p of d.panels)
        p.position.x = p.userData.side * (1.04 + d.open * 1.98);
    }
    const open = position.z < 33.3 ? 1 : 0;
    for (const p of this.entrance)
      p.position.x +=
        (p.userData.entranceSide * (1.35 + open * 2.65) - p.position.x) *
        Math.min(1, dt * 2.5);
  }
  canWalk(x, z) {
    if (x < -30.5 || x > 30.5 || z < -30.5 || z > 35.7) return false;
    if (z > 31.1 && Math.abs(x) > 2.55) return false;
    return ![...this.walls,...this.furniture].some(
      (b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ,
    );
  }
  updateScreens(project, metrics, recording) {
    for (const s of this.screens) {
      const c = s.canvas,
        ctx = c.getContext("2d"),
        w = c.width,
        h = c.height;
      ctx.fillStyle = "#1d2521";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#526355";
      ctx.fillStyle = "#d2c5a9";
      ctx.font = "24px Arial";
      ctx.fillText(
        s.type === "timeline"
          ? "THE ARRANGEMENT"
          : s.type === "piano"
            ? "THE NOTES"
            : s.type === "mixer"
              ? "THE WHOLE PIECE"
              : s.type === "master"
                ? "REFERENCE LISTENING"
                : s.type === "recording"
                  ? "A HUMAN SIGNAL"
                  : "PATTERN / PULSE",
        32,
        46,
      );
      ctx.font = "13px Arial";
      ctx.fillStyle = "#7e8e7b";
      ctx.fillText(project.name, 32, 75);
      if (s.type === "timeline") {
        const max = project.bars * 4;
        project.tracks.slice(0, 8).forEach((t, i) => {
          const y = 110 + i * 46;
          ctx.fillStyle = "#7e8e7b";
          ctx.fillText(t.name.slice(0, 22), 32, y + 22);
          for (const cl of t.clips) {
            ctx.fillStyle = t.color + "88";
            ctx.fillRect(
              190 + (cl.start / max) * (w - 230),
              y,
              (cl.length / max) * (w - 230) - 4,
              35,
            );
            ctx.fillStyle = t.color;
            for (const n of cl.notes)
              ctx.fillRect(
                194 + ((cl.start + n.start) / max) * (w - 230),
                y + 20 + (n.pitch % 12),
                Math.max(2, (n.duration / max) * (w - 230) - 3),
                2,
              );
          }
        });
      } else if (s.type === "piano") {
        const t =
            project.tracks.find((t) => t.instrument === "keys") ||
            project.tracks.find(
              (t) => t.instrument !== "drums" && t.instrument !== "audio",
            ),
          cl = t?.clips[0];
        for (let y = 0; y < 24; y++) {
          ctx.strokeStyle = "#314238";
          ctx.beginPath();
          ctx.moveTo(32, 105 + y * 15);
          ctx.lineTo(w - 32, 105 + y * 15);
          ctx.stroke();
        }
        for (let x = 0; x < 17; x++) {
          ctx.beginPath();
          ctx.moveTo(32 + (x * (w - 64)) / 16, 105);
          ctx.lineTo(32 + (x * (w - 64)) / 16, 465);
          ctx.stroke();
        }
        for (const n of cl?.notes || []) {
          ctx.fillStyle = "#bdac88";
          ctx.fillRect(
            34 + (n.start / cl.length) * (w - 68),
            110 + (84 - n.pitch) * 15,
            Math.max(5, (n.duration / cl.length) * (w - 68) - 5),
            10,
          );
        }
      } else if (s.type === "drums") {
        const cl = project.tracks.find((t) => t.instrument === "drums")
          ?.clips[0];
        [36, 38, 42].forEach((pitch, r) => {
          ctx.fillStyle = "#aaa68b";
          ctx.fillText(["KICK", "SNARE", "HI-HAT"][r], 32, 160 + r * 100);
          for (let i = 0; i < 16; i++) {
            const on = cl?.notes.some(
              (n) => n.pitch === pitch && Math.abs(n.start - i / 4) < 0.05,
            );
            ctx.fillStyle = on ? "#bdac88" : "#364238";
            ctx.fillRect(
              140 + (i * (w - 180)) / 16,
              115 + r * 100,
              (w - 180) / 16 - 9,
              62,
            );
          }
        });
      } else if (s.type === "mixer") {
        const ts = project.tracks.slice(0, 12);
        ts.forEach((t, i) => {
          const x = 38 + (i * (w - 76)) / Math.max(6, ts.length);
          ctx.fillStyle = "#3a463b";
          ctx.fillRect(x, 135, 38, 260);
          ctx.fillStyle = t.color;
          ctx.fillRect(
            x,
            395 - 240 * (metrics.tracks.get(t.id)?.peak || 0),
            5,
            240 * (metrics.tracks.get(t.id)?.peak || 0),
          );
          ctx.fillStyle = "#cabfa7";
          ctx.fillRect(x + 13, 365 - t.gain * 200, 23, 9);
          ctx.font = "12px Arial";
          ctx.fillText(t.name.slice(0, 8), x - 4, 430);
        });
      } else if (s.type === "master") {
        ctx.font = "60px Arial";
        ctx.fillStyle = "#c7b795";
        ctx.fillText(
          metrics.peak > 0
            ? (20 * Math.log10(metrics.peak)).toFixed(1) + " dBFS"
            : "−∞ dBFS",
          50,
          210,
        );
        ctx.font = "16px Arial";
        ctx.fillText(
          "SAMPLE PEAK / " +
            (metrics.rms > 0
              ? (20 * Math.log10(metrics.rms)).toFixed(1)
              : "−∞") +
            " RMS dBFS",
          50,
          256,
        );
        ctx.fillStyle = "#7e8e7b";
        ctx.fillText(
          "No room coloration. No loudness or true-peak claim.",
          50,
          325,
        );
      } else if (s.type === "recording") {
        ctx.font = "18px Arial";
        ctx.fillText(
          recording?.active
            ? "RECORDING / " + recording.seconds + " s"
            : "READY WHEN YOU ARE",
          32,
          125,
        );
        const data = recording?.wave || new Float32Array(0);
        ctx.strokeStyle = "#b7b897";
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = 32 + (i / data.length) * (w - 64),
            y = 270 + data[i] * 160;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      s.texture.needsUpdate = true;
    }
  }
}
