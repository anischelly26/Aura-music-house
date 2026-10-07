import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { pit, roomAt } from "./layout.js";

/** Only converted, locally hosted model assets are accepted. No arbitrary uploads execute. */
export class ModelAssets {
  constructor(house) {
    this.house = house;
    this.a = house.architecture;
    this.loaded = [];
    this.errors = [];
    this.groups = [];
  }
  /** Nearest things first: the lounge you are walking toward, then the rooms beyond it. */
  async load() {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (!window.AURA_ASSETS) return url;
      const key = url.match(/assets\/models\/[^?#]+/)?.[0];
      return window.AURA_ASSETS[key] || url;
    });
    const loader = new GLTFLoader(manager);
    const packs = ["the-interior-14-is-spacious", "loft2-free-interior", "japroom-14-otaku", "chairs-and-window-set-game-ready", "modern-house-villa-game-ready-4k"];
    // Sequential decode keeps memory and GPU upload spikes bounded during the arrival.
    for (const pack of packs) {
      try {
        const key = "assets/models/" + pack + ".glb", embedded = window.AURA_ASSETS?.[key];
        let asset;
        if (embedded) {
          const raw = atob(embedded.split(",")[1]), bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          asset = await loader.parseAsync(bytes.buffer, "assets/models/");
        } else asset = await loader.loadAsync(key);
        const anisotropy = Math.min(4, this.house.renderer.capabilities.getMaxAnisotropy());
        asset.scene.traverse((m) => {
          if (!m.isMesh) return;
          m.castShadow = m.receiveShadow = true;
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            mat.side = THREE.FrontSide;
            if (mat.map) mat.map.anisotropy = anisotropy;
          }
        });
        this.install(pack, asset.scene);
        this.loaded.push(pack);
        this.house.renderer.shadowMap.needsUpdate = true;
        // Yield between packs so the frame rate never stalls on a decode.
        await new Promise((resolve) => setTimeout(resolve, 60));
      } catch (e) {
        this.errors.push({ pack, message: e.message });
        console.warn("AURA model unavailable:", pack, e.message);
      }
    }
    document.dispatchEvent(new CustomEvent("aura-models-ready", { detail: { loaded: this.loaded, errors: this.errors } }));
    return this.loaded;
  }
  placement(source, names, x, z, { scale = 1, rotation = 0, y = 0, solid = true, label = "Furniture", room = null } = {}) {
    const group = new THREE.Group();
    group.name = label;
    source.traverse((m) => { if (m.isMesh && (!names || names.includes(m.name))) group.add(m.clone()); });
    const original = new THREE.Box3().setFromObject(group), center = original.getCenter(new THREE.Vector3());
    for (const m of group.children) m.position.set(-center.x, -original.min.y, -center.z);
    group.scale.setScalar(scale);
    group.rotation.y = rotation;
    group.position.set(x, y, z);
    this.a.scene.add(group);
    group.updateMatrixWorld(true);
    if (solid)
      for (const m of group.children) {
        const bounds = new THREE.Box3().setFromObject(m);
        if (bounds.max.y - bounds.min.y < 0.08 || bounds.max.y - y < 0.18) continue;
        this.a.furniture.push({ minX: bounds.min.x - 0.26, maxX: bounds.max.x + 0.26, minZ: bounds.min.z - 0.26, maxZ: bounds.max.z + 0.26, asset: label });
      }
    this.groups.push(group);
    const home = room || roomAt(x, z).id;
    if (home !== "outside") { this.a.roomExtras.get(home).push(group); group.visible = this.a.roomGroups.get(home).visible; }
    return group;
  }
  /** An unseen volume over part of a model, so one mesh can offer several places to sit. */
  seat(label, room, x, y, z, w, d, { eye, yaw, exit, pitch }) {
    const a = this.a, proxy = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set(x, y, z);
    a.scene.add(proxy);
    const entry = { id: room + ":" + label + ":" + x, label, room, yaw, pitch, eye: new THREE.Vector3(...eye), exit: { x: exit[0], z: exit[1] } };
    a.seats.push(entry);
    a.usable(proxy, { verb: "SIT", label, range: 3.6, run: () => a.world?.sit(entry) });
    a.roomExtras.get(room).push(proxy);
    proxy.visible = a.roomGroups.get(room).visible;
    return entry;
  }
  install(pack, source) {
    const a = this.a;
    if (pack === "the-interior-14-is-spacious") {
      // The low L-shaped sofa is built into the corner of the sunken lounge.
      const size = 3.84 * 1.4, cx = pit.minX + 0.05 + size / 2, cz = pit.maxZ - 0.05 - size / 2, band = 0.9 * 1.4, floor = -pit.depth;
      this.placement(source, ["node_0"], cx, cz, { scale: 1.4, rotation: Math.PI, y: floor, solid: false, label: "Lounge sofa" });
      const south = pit.maxZ - 0.05 - band, west = pit.minX + 0.05 + band, east = cx + size / 2;
      a.furniture.push({ minX: pit.minX, maxX: east + 0.24, minZ: south - 0.22, maxZ: pit.maxZ }, { minX: pit.minX, maxX: west + 0.22, minZ: cz - size / 2 - 0.24, maxZ: pit.maxZ });
      a.sofa = { south, west, east, floor };
      const eyeY = floor + 1.2;
      this.seat("SOFA", "living", 0.1, floor + 0.62, south + band / 2, 3.2, band - 0.3, { eye: [0.1, eyeY, south + band * 0.52], yaw: 0, pitch: -0.12, exit: [0.1, south - 0.55] });
      this.seat("SOFA CORNER", "living", west - band / 2, floor + 0.62, 2.3, band - 0.3, 2.6, { eye: [west - band * 0.52, eyeY, 2.3], yaw: -Math.PI / 2, pitch: -0.1, exit: [west + 0.5, 1.2] });
    } else if (pack === "loft2-free-interior") {
      // A place to wait your turn, outside the vocal booth.
      this.placement(source, null, 14.2, 14.4, { scale: 1.15, rotation: Math.PI / 2, label: "Green room" });
      // Two of its armchairs furnish the living room corners.
      // The model's front is +z; a seat's yaw is the model's rotation plus half a turn. This one faces the lounge.
      this.placement(source, ["node_0006"], -6.05, -4.2, { scale: 1.2, rotation: 0.7, label: "Listening chair" });
      this.seat("LISTENING CHAIR", "living", -6.05, 0.55, -4.2, 0.9, 0.9, { eye: [-6.05, 1.16, -4.2], yaw: 0.7 - Math.PI, pitch: -0.08, exit: [-4.95, -2.9] });
      this.placement(source, ["node_0007"], 5.9, 5.7, { scale: 1.2, rotation: 1.9, label: "Reading chair" });
      this.seat("READING CHAIR", "living", 5.9, 0.55, 5.7, 0.9, 0.9, { eye: [5.9, 1.16, 5.7], yaw: -1.2, pitch: -0.08, exit: [4.9, 5] });
    } else if (pack === "japroom-14-otaku") {
      this.placement(source, ["node_0002"], 8.32, 5.1, { y: 0.5, rotation: -Math.PI / 2, solid: false, label: "Old television" });
      this.placement(source, ["node_0012"], 8.3, 7.25, { rotation: -Math.PI / 2, label: "Game shelf" });
    } else if (pack === "chairs-and-window-set-game-ready") {
      this.placement(source, null, -30.2, 26.4, { rotation: Math.PI / 2, label: "Lab window seat" });
    } else if (pack === "modern-house-villa-game-ready-4k") {
      this.placement(source, null, 92, -46, { y: -1.4, rotation: -Math.PI / 2, solid: false, label: "Neighbouring villa", room: "outside" });
      // A scale model of a house, on a plinth by the front door.
      const g = a.roomGroups.get("gallery");
      a.box(2.4, 0.78, 1.9, 4.8, 0.39, 5.4, a.m.concrete, g);
      this.placement(source, null, 4.8, 25.4, { scale: 0.1, y: 0.78, solid: false, label: "Scale model" });
      a.furniture.push({ minX: 3.3, maxX: 6.3, minZ: 24.15, maxZ: 26.65, asset: "Model plinth" });
      a.contact(4.8, 5.4, 3.6, 3.2, g);
    }
  }
}
