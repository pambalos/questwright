import type { ArtStyle, Look } from '@questwright/engine';
import * as THREE from 'three';
import { RARITY_COLOR, type Feature, type WeaponKind } from './gear';
import { tone } from './look';

const FAR = 4.4;
const NEAR = 1.7;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Camera aim height: the face when close, the middle of the body when far. */
const aimY = (d: number) => 1.6 - clamp((d - NEAR) / (FAR - NEAR), 0, 1) * 0.65;

type Anim = (t: number, dt: number) => void;

/**
 * A rotatable, zoomable 3D character built from look traits and sheet gear.
 * Shapes are simple stand-ins arranged on a fixed skeleton; generated models
 * would attach to the same points.
 */
export class Viewer3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private root: THREE.Group | null = null;
  private parts = new Map<string, THREE.Object3D>();
  private anims: Anim[] = [];
  private sig = '';
  private lit: THREE.Object3D | null = null;
  private goal = { yaw: 0.45, pitch: 0.06, dist: FAR };
  private view = { ...this.goal };
  private raf = 0;
  private last = performance.now();
  private calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  onMode?: (portrait: boolean) => void;
  onUsed?: () => void;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '3D character. Drag or use the arrow keys to rotate; scroll, pinch, or plus and minus to zoom.');

    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a1c10, 1.4));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.4);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.2, near: 0.5, far: 10 });
    key.shadow.bias = -0.0015;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb0ff, 1.6);
    rim.position.set(-2, 2.5, -3);
    this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.ShadowMaterial({ opacity: 0.5 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 0.86, 72), new THREE.MeshBasicMaterial({ color: 0xd6a443, transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.scene.add(ring);

    this.bindControls();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.root) disposeTree(this.root);
    this.renderer.dispose();
  }

  setMode(portrait: boolean) {
    this.goal.dist = portrait ? NEAR : FAR;
    this.onMode?.(portrait);
  }

  reset() {
    this.goal.yaw = 0.45;
    this.goal.pitch = 0.06;
    this.setMode(false);
  }

  setCharacter(id: string, look: Look, features: Feature[], style: ArtStyle) {
    const sig = JSON.stringify([id, look, features, style]);
    if (sig === this.sig) return;
    const sameCharacter = this.sig.startsWith(JSON.stringify([id]).slice(0, -1));
    this.sig = sig;
    if (this.root) {
      this.scene.remove(this.root);
      disposeTree(this.root);
    }
    this.parts.clear();
    this.anims = [];
    this.lit = null;
    this.root = new THREE.Group();
    build(this, look, features, style);
    this.root.scale.setScalar(look.build);
    this.scene.add(this.root);
    if (!sameCharacter) {
      this.goal.yaw = this.view.yaw = 0.45;
      this.goal.pitch = this.view.pitch = 0.06;
    }
  }

  highlight(key: string | null) {
    if (this.lit) this.lit.traverse(restoreEmissive);
    this.lit = (key && this.parts.get(key)) || null;
    this.lit?.traverse((n) => {
      const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m?.emissive) return;
      n.userData.e0 ??= m.emissive.clone();
      n.userData.i0 ??= m.emissiveIntensity;
      m.emissive.set(0xffc96b);
      m.emissiveIntensity = 0.6;
    });
  }

  /* ---- internals used by build() ---- */
  group(key: string | null, at: [number, number, number] = [0, 0, 0]) {
    const g = new THREE.Group();
    g.position.set(...at);
    this.root!.add(g);
    if (key) this.parts.set(key, g);
    return g;
  }
  /** Names a part that lives outside the root group (such as on the head) for hover highlighting. */
  register(key: string, o: THREE.Object3D) {
    this.parts.set(key, o);
  }
  get rootGroup() {
    return this.root!;
  }
  animate(a: Anim) {
    if (!this.calm) this.anims.push(a);
  }

  private bindControls() {
    const cv = this.canvas;
    const used = () => this.onUsed?.();
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      used();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.goal.yaw -= dx * 0.012;
        this.goal.pitch = clamp(this.goal.pitch + dy * 0.006, -0.25, 0.75);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoom(this.goal.dist * (this.pinch / d));
        this.pinch = d;
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        used();
        this.zoom(this.goal.dist * (1 + e.deltaY * 0.0012));
      },
      { passive: false },
    );
    cv.addEventListener('dblclick', () => this.reset());
    cv.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft') this.goal.yaw += 0.2;
      else if (k === 'ArrowRight') this.goal.yaw -= 0.2;
      else if (k === 'ArrowUp') this.goal.pitch = clamp(this.goal.pitch + 0.1, -0.25, 0.75);
      else if (k === 'ArrowDown') this.goal.pitch = clamp(this.goal.pitch - 0.1, -0.25, 0.75);
      else if (k === '+' || k === '=') this.zoom(this.goal.dist * 0.85);
      else if (k === '-') this.zoom(this.goal.dist * 1.18);
      else return;
      e.preventDefault();
      used();
    });
  }

  private zoom(d: number) {
    this.goal.dist = clamp(d, 0.7, 6);
    this.onMode?.(this.goal.dist < 2.3);
  }

  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.canvas.isConnected || !this.root) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? 0;
    const h = parent?.clientHeight ?? 0;
    const pr = this.renderer.getPixelRatio();
    if (w && h && (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr))) {
      this.renderer.setSize(w, h, false);
      this.cam.aspect = w / h;
      this.cam.updateProjectionMatrix();
    }
    const f = this.calm ? 1 : 1 - Math.pow(0.0005, dt);
    this.view.yaw += (this.goal.yaw - this.view.yaw) * f;
    this.view.pitch += (this.goal.pitch - this.view.pitch) * f;
    this.view.dist += (this.goal.dist - this.view.dist) * f;
    const y = aimY(this.view.dist);
    const cp = Math.cos(this.view.pitch);
    this.cam.position.set(Math.sin(this.view.yaw) * cp * this.view.dist, y + Math.sin(this.view.pitch) * this.view.dist, Math.cos(this.view.yaw) * cp * this.view.dist);
    this.cam.lookAt(0, y, 0);
    const t = now / 1000;
    for (const a of this.anims) a(t, dt);
    this.renderer.render(this.scene, this.cam);
  }
}

function restoreEmissive(n: THREE.Object3D) {
  const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
  if (m?.emissive && n.userData.e0) {
    m.emissive.copy(n.userData.e0 as THREE.Color);
    m.emissiveIntensity = n.userData.i0 as number;
  }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((n) => {
    const mesh = n as THREE.Mesh;
    mesh.geometry?.dispose();
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
}

/* ------------------------------------------------------------------ */

function build(v: Viewer3D, look: Look, features: Feature[], style: ArtStyle) {
  const col = (hex: string, f = 1) => new THREE.Color(tone(hex, style, f));
  const M = (hex: string, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: col(hex), roughness: 0.78, metalness: 0, flatShading: true, ...o });
  const glow = (hex: string, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex), emissiveIntensity: 1.2, roughness: 0.4, ...o });
  const C = (a: number, b: number, h: number, s = 10, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(a, b, h, s, 1, open, ts, tl);
  const S = (r: number, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
  const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0], parent?: THREE.Object3D) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(...p);
    o.rotation.set(...r);
    o.castShadow = true;
    (parent ?? v.rootGroup).add(o);
    return o;
  };
  const has = <K extends Feature['type']>(type: K) => features.filter((f): f is Extract<Feature, { type: K }> => f.type === type);
  const one = <K extends Feature['type']>(type: K) => has(type)[0];
  const rarity = (r?: string) => RARITY_COLOR[(r as keyof typeof RARITY_COLOR) ?? 'common'] ?? RARITY_COLOR.common;

  const skin = M(look.skin, { flatShading: false, roughness: 0.6 });
  const cloth = M(look.cloth);
  const hairM = M(look.hairColor);
  const dark = M('#15110d');
  const leather = M('#6b4528');
  const steel = M('#c3cad3', { metalness: 0.75, roughness: 0.3, flatShading: false });
  const gold = M('#d6a443', { metalness: 0.65, roughness: 0.35 });
  const gloves = one('gloves');
  const bootsF = one('boots');

  const body = v.group(null);
  const head = new THREE.Group();
  head.position.set(0, 1.64, 0);
  v.rootGroup.add(head);
  const long = look.outfit === 'robe' || look.outfit === 'cloak';
  const hand = { x: long ? 0.33 : 0.315, y: long ? 0.82 : 0.76 };
  const beltY = 0.95;
  const beltR = long ? 0.265 : 0.25;

  if (long) {
    const robe = mk(C(0.19, 0.4, 1.3, 14), cloth, [0, 0.78, 0], undefined, body);
    robe.scale.z = 0.8;
    const feetM = bootsF ? steel : M('#3a2a20');
    const feet = v.group(bootsF?.key ?? null);
    for (const x of [-1, 1]) mk(S(0.06), feetM, [x * 0.08, 0.04, 0.1], undefined, feet).scale.set(1, 0.6, 1.5);
    for (const x of [-1, 1]) {
      mk(S(0.08), cloth, [x * 0.22, 1.38, 0], undefined, body);
      mk(C(0.06, 0.11, 0.52, 8), cloth, [x * 0.29, 1.1, 0], [0, 0, x * 0.15], body);
    }
    if (look.outfit === 'robe') {
      const sash = mk(new THREE.TorusGeometry(0.265, 0.018, 6, 24), M(look.accent), [0, 0.98, 0], [Math.PI / 2, 0, 0], body);
      sash.scale.set(1, 0.8, 1);
    }
  } else {
    const pants = M('#3d3a36');
    const bootsM = bootsF ? steel : M('#3b2617');
    const feet = v.group(bootsF?.key ?? null);
    for (const x of [-1, 1]) {
      mk(C(0.075, 0.065, 0.62), pants, [x * 0.1, 0.62, 0], undefined, body);
      mk(C(0.08, 0.086, 0.3), bootsM, [x * 0.1, 0.17, 0], undefined, feet);
      mk(B(0.13, 0.07, 0.24), bootsM, [x * 0.1, 0.035, 0.04], undefined, feet);
    }
    const torsoH = look.outfit === 'coat' ? 1.0 : 0.72;
    const t = mk(C(0.2, look.outfit === 'coat' ? 0.31 : 0.27, torsoH, 12), cloth, [0, 1.46 - torsoH / 2, 0], undefined, body);
    t.scale.z = 0.75;
    for (const x of [-1, 1]) {
      mk(S(0.085), cloth, [x * 0.24, 1.4, 0], undefined, body);
      mk(C(0.06, 0.055, 0.34, 8), cloth, [x * 0.28, 1.22, 0], [0, 0, x * 0.12], body);
      mk(C(0.052, 0.045, 0.3, 8), cloth, [x * 0.31, 0.93, 0.02], [-0.1, 0, x * 0.04], body);
    }
  }
  const handG = v.group(gloves?.key ?? null);
  for (const x of [-1, 1]) mk(S(0.05), gloves ? leather : skin, [x * hand.x, hand.y, 0.03], undefined, handG);

  if (look.outfit === 'cloak' || one('cape')) {
    const cape = one('cape');
    const capeG = v.group(cape?.key ?? null);
    mk(C(0.21, 0.47, 1.3, 16, true, Math.PI * 0.5, Math.PI), M(cape ? look.accent : look.cloth, { side: THREE.DoubleSide }), [0, 0.76, -0.02], undefined, capeG);
  }
  const armor = one('armor');
  if (armor || look.outfit === 'armor') {
    const g = v.group(armor?.key ?? null);
    const plate = mk(C(0.215, 0.24, 0.42, 12), steel, [0, 1.22, 0], undefined, g);
    plate.scale.z = 0.8;
    for (const x of [-1, 1]) mk(S(0.1, 10, 8), steel, [x * 0.25, 1.42, 0], undefined, g).scale.set(1.1, 0.7, 1);
    if (armor) mk(new THREE.TorusGeometry(0.17, 0.008, 6, 24), glow(rarity(armor.rarity), { emissiveIntensity: 0.4 }), [0, 1.37, 0.03], [Math.PI / 2 + 0.3, 0, 0], g);
  }
  const pack = one('pack');
  if (pack) {
    const g = v.group(pack.key, [0, 1.15, -0.2]);
    mk(B(0.32, 0.4, 0.16), leather, [0, 0, 0], undefined, g);
    mk(C(0.06, 0.06, 0.36, 8), M('#8a7f6a'), [0, 0.24, 0], [0, 0, Math.PI / 2], g);
  }

  // Head.
  mk(C(0.05, 0.055, 0.1, 8), skin, [0, 1.49, 0], undefined, body);
  const hd = mk(S(0.13, 16, 12), skin, [0, 0, 0], undefined, head);
  hd.scale.set(1, 1.15, 1.02);
  for (const x of [-1, 1]) {
    mk(S(0.017, 8, 6), dark, [x * 0.045, 0.02, 0.118], undefined, head);
    mk(S(0.03, 8, 6), skin, [x * 0.13, 0, 0], undefined, head);
    mk(B(0.045, 0.008, 0.008), M(look.hairColor), [x * 0.047, 0.055, 0.122], [0, 0, -x * 0.1], head);
  }
  mk(new THREE.ConeGeometry(0.016, 0.045, 6), skin, [0, -0.01, 0.138], [Math.PI / 2, 0, 0], head);
  mk(B(0.045, 0.007, 0.01), M('#6b3a2c'), [0, -0.055, 0.123], undefined, head);
  if (one('scar')) mk(B(0.006, 0.075, 0.006), M('#b8372b', { flatShading: false }), [0.07, -0.01, 0.122], [0, 0.5, 0.7], head);

  const cap = (thetaLen: number) => new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * thetaLen);
  switch (look.hair) {
    case 'spiky':
      mk(cap(0.55), hairM, [0, 0.045, -0.012], undefined, head).scale.set(1.02, 1.1, 1.05);
      for (const [x, y, z, rx, rz] of [[0, 0.19, 0, 0, 0], [0.06, 0.17, 0.02, 0, -0.6], [-0.06, 0.17, 0.02, 0, 0.6], [0.03, 0.16, -0.07, -0.5, -0.3], [-0.04, 0.16, -0.07, -0.5, 0.3], [0.1, 0.13, -0.03, 0, -1], [-0.1, 0.13, -0.03, 0, 1], [0, 0.15, 0.08, 0.6, 0]] as const)
        mk(new THREE.ConeGeometry(0.035, 0.1, 5), hairM, [x, y, z], [rx, 0, rz], head);
      break;
    case 'long':
      mk(cap(0.5), hairM, [0, 0.04, -0.012], undefined, head).scale.set(1.02, 1.05, 1.05);
      for (const x of [-1, 1]) mk(B(0.04, 0.27, 0.08), hairM, [x * 0.135, -0.1, 0.02], [0, 0, x * 0.06], head);
      mk(B(0.22, 0.28, 0.05), hairM, [0, -0.08, -0.11], undefined, head);
      break;
    case 'bald':
      for (const x of [-1, 1]) mk(S(0.04, 8, 6), hairM, [x * 0.12, 0.02, -0.03], undefined, head).scale.set(0.6, 1, 1.2);
      break;
    case 'hood': {
      const hood = mk(new THREE.SphereGeometry(0.185, 16, 12, Math.PI, Math.PI, 0, Math.PI * 0.78), M(look.cloth, { side: THREE.DoubleSide }), [0, 0.02, -0.01], undefined, head);
      hood.scale.set(1, 1.12, 1.05);
      break;
    }
    default:
      mk(cap(0.5), hairM, [0, 0.045, -0.012], undefined, head).scale.set(1.02, 1.08, 1.05);
  }
  const helm = one('helm');
  if (helm) {
    const g = new THREE.Group();
    head.add(g);
    mk(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), steel, [0, 0.03, 0], undefined, g).scale.set(1.05, 1.1, 1.08);
    mk(B(0.02, 0.1, 0.02), steel, [0, -0.02, 0.15], undefined, g);
    mk(new THREE.TorusGeometry(0.155, 0.008, 6, 28), glow(rarity(helm.rarity), { emissiveIntensity: 0.4 }), [0, 0.03, 0], [Math.PI / 2, 0, 0], g);
    v.register(helm.key, g);
  }

  // Gear from the sheet.
  if (one('belt') && look.outfit !== 'robe') {
    const b = mk(C(beltR + 0.006, beltR + 0.008, 0.06, 16, true), M('#6b4528', { side: THREE.DoubleSide }), [0, beltY, 0], undefined, body);
    b.scale.z = 0.75;
    mk(B(0.05, 0.05, 0.02), gold, [0, beltY, beltR * 0.75 + 0.012], undefined, body);
  }
  const pouch = one('pouch');
  if (pouch) {
    const g = v.group(pouch.key, [long ? 0.24 : -0.23, beltY - 0.06, 0.1]);
    mk(S(0.045, 10, 8), leather, [0, 0, 0], undefined, g).scale.set(1, 1.2, 0.8);
    mk(new THREE.TorusGeometry(0.025, 0.006, 5, 12), gold, [0, 0.045, 0], [Math.PI / 2, 0, 0], g);
  }
  const potions = one('potions');
  if (potions) {
    const g = v.group(potions.key, [-0.1, beltY - 0.08, beltR * 0.75 + 0.03]);
    for (let i = 0; i < Math.min(potions.count, 3); i++) {
      mk(S(0.03, 10, 8), glow('#c23a2e', { emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }), [i * 0.065, 0, 0], undefined, g);
      mk(C(0.011, 0.011, 0.03, 6), M('#cfd6dc'), [i * 0.065, 0.04, 0], undefined, g);
    }
  }
  for (const s of has('sheathed')) {
    const g = v.group(s.key, [0.24, beltY - 0.02, 0.09]);
    g.rotation.z = 0.35;
    const len = s.kind === 'sword' ? 0.5 : 0.26;
    mk(B(0.045, len, 0.025), M('#3a2516'), [0, -len / 2, 0], undefined, g);
    mk(B(0.11, 0.018, 0.03), s.rarity && s.rarity !== 'common' ? glow(rarity(s.rarity), { emissiveIntensity: 0.5 }) : steel, [0, 0.01, 0], undefined, g);
    mk(C(0.014, 0.014, 0.09, 6), leather, [0, 0.065, 0], undefined, g);
    mk(S(0.02, 8, 6), steel, [0, 0.115, 0], undefined, g);
  }
  const trinket = one('trinket');
  if (trinket) mk(S(0.025, 10, 8), glow(rarity(trinket.rarity), { emissiveIntensity: 0.4 }), [0, 0, 0], undefined, v.group(trinket.key, [-0.17, beltY - 0.05, 0.18]));
  const mantle = one('mantle');
  if (mantle) {
    const g = v.group(mantle.key, [0, 1.4, 0]);
    const fur = M('#9b968f', { side: THREE.DoubleSide });
    mk(C(0.2, 0.34, 0.2, 9, true), fur, [0, 0, 0], undefined, g).scale.z = 0.8;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      mk(new THREE.ConeGeometry(0.03, 0.08, 4), fur, [Math.sin(a) * 0.33, -0.13, Math.cos(a) * 0.26], [Math.PI, 0, 0], g);
    }
    const w = new THREE.Group();
    w.position.set(0.24, 0.12, 0.02);
    g.add(w);
    mk(B(0.11, 0.08, 0.1), fur, [0, 0, 0], undefined, w);
    mk(new THREE.ConeGeometry(0.04, 0.1, 4), fur, [0, -0.01, 0.09], [Math.PI / 2, 0, 0], w);
  }
  const amulet = one('amulet');
  const trophy = one('trophy');
  if (amulet || trophy) {
    const g = v.group((amulet ?? trophy)!.key, [0, 1.44, 0.02]);
    const cord = mk(new THREE.TorusGeometry(0.085, 0.004, 6, 24), amulet ? gold : leather, [0, 0, 0], [Math.PI / 2 + 0.45, 0, 0], g);
    cord.castShadow = false;
    if (amulet) mk(S(0.022, 10, 8), glow(rarity(amulet.rarity), { emissiveIntensity: 0.6 }), [0, -0.05, 0.08], undefined, g);
    else [-0.03, 0, 0.03].forEach((x, i) => mk(new THREE.ConeGeometry(0.009, 0.04, 5), M('#f1eadb'), [x, -0.04 - (i === 1 ? 0.008 : 0), 0.075], [Math.PI, 0, 0], g));
  }
  const sigil = one('sigil');
  if (sigil) {
    const g = v.group(sigil.key, [0, 1.22, 0.22]);
    const o = mk(new THREE.OctahedronGeometry(0.04), glow('#f6d27a', { emissiveIntensity: 0.9 }), [0, 0, 0], undefined, g);
    g.add(new THREE.PointLight(0xffe7a3, 0.5, 0.6));
    v.animate((t) => (o.rotation.y = t * 1.2));
  }
  if (one('tattoo')) mk(B(0.012, 0.08, 0.004), M('#2b4a7a'), [-0.3, 1.0, 0.05], [0, 0, 0.1], body);

  const weapon = one('weapon');
  if (weapon) {
    const g = v.group(weapon.key, [hand.x, hand.y, 0.05]);
    weapon3d(g, weapon.kind, rarity(weapon.rarity), { mk, M, glow, C, S, B, steel, leather });
  }
  const shield = one('shield');
  if (shield) {
    const g = v.group(shield.key, [-0.42, 1.0, 0.06]);
    g.rotation.y = -0.25;
    mk(C(0.2, 0.2, 0.03, 18), M(look.accent, { metalness: 0.3 }), [0, 0, 0], [0, 0, Math.PI / 2], g).scale.set(1, 1, 1.25);
    mk(C(0.05, 0.05, 0.04, 12), shield.rarity && shield.rarity !== 'common' ? glow(rarity(shield.rarity), { emissiveIntensity: 0.5 }) : steel, [-0.02, 0, 0], [0, 0, Math.PI / 2], g);
  }
  for (const r of has('ring')) {
    const g = v.group(r.key, [hand.x, hand.y - 0.02, 0.03]);
    const c = r.rarity && r.rarity !== 'common' ? rarity(r.rarity) : '#ff8a2a';
    mk(new THREE.TorusGeometry(0.024, 0.008, 8, 16), glow(c, { emissiveIntensity: 1 }), [0, 0, 0], [Math.PI / 2, 0, 0], g);
    const l = new THREE.PointLight(new THREE.Color(c), 0.9, 0.8);
    g.add(l);
    v.animate((t) => (l.intensity = 0.7 + Math.sin(t * 3) * 0.3));
  }
  const particles = (color: number, at: { x: number; y: number }, n: number) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const seed: number[] = [];
    for (let i = 0; i < n; i++) {
      seed.push(Math.random());
      pos.set([at.x + (Math.random() - 0.5) * 0.08, at.y + Math.random() * 0.3, 0.03 + (Math.random() - 0.5) * 0.08], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    v.rootGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.03, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    v.animate((t, dt) => {
      for (let i = 0; i < n; i++) {
        let y = pos[i * 3 + 1]! + dt * (0.18 + seed[i]! * 0.2);
        if (y > at.y + 0.35) y = at.y;
        pos[i * 3 + 1] = y;
        pos[i * 3] = pos[i * 3]! + Math.sin(t * 4 + i) * 0.0006;
      }
      geo.attributes.position!.needsUpdate = true;
    });
  };
  if (one('embers')) particles(0xffb054, { x: -hand.x, y: hand.y }, 16);
  if (one('frost')) particles(0xbfe6ff, { x: hand.x, y: hand.y }, 12);
  const ward = one('ward');
  if (ward && !shield) {
    const g = v.group(ward.key, [-0.47, 1.0, 0.06]);
    g.rotation.y = -0.25;
    const mat = glow('#ff8a2a', { transparent: true, opacity: 0.32, side: THREE.DoubleSide, emissiveIntensity: 0.8, depthWrite: false });
    mk(C(0.21, 0.21, 0.012, 6), mat, [0, 0, 0], [0, 0, Math.PI / 2], g).castShadow = false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(C(0.21, 0.21, 0.012, 6)), new THREE.LineBasicMaterial({ color: 0xffa24a }));
    edges.rotation.z = Math.PI / 2;
    g.add(edges);
    g.add(new THREE.PointLight(0xff8a2a, 0.6, 0.9));
    v.animate((t) => (mat.opacity = 0.24 + Math.sin(t * 2.4) * 0.1));
  }
  const healing = one('glow');
  if (healing) {
    const g = v.group(healing.key);
    for (const x of [-1, 1]) {
      const at = new THREE.Group();
      at.position.set(x * hand.x, hand.y, 0.04);
      g.add(at);
      mk(S(0.035), glow('#fff1b8'), [0, 0, 0], undefined, at);
      const halo = mk(S(0.085, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), [0, 0, 0], undefined, at);
      halo.castShadow = false;
      at.add(new THREE.PointLight(0xfff1b8, 0.7, 0.7));
      v.animate((t) => halo.scale.setScalar(1 + Math.sin(t * 2 + x) * 0.15));
    }
  }
  v.animate((t) => {
    const b = 1 + Math.sin(t * 1.4) * 0.006;
    body.scale.set(1, b, 1);
    head.position.y = 1.64 + (b - 1) * 1.6;
    head.rotation.y = Math.sin(t * 0.5) * 0.08;
  });
}

interface Kit {
  mk: (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r?: [number, number, number], parent?: THREE.Object3D) => THREE.Mesh;
  M: (hex: string, o?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  glow: (hex: string, o?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  C: (a: number, b: number, h: number, s?: number) => THREE.CylinderGeometry;
  S: (r: number, w?: number, h?: number) => THREE.SphereGeometry;
  B: (x: number, y: number, z: number) => THREE.BoxGeometry;
  steel: THREE.Material;
  leather: THREE.Material;
}

function weapon3d(g: THREE.Group, kind: WeaponKind, edge: string, k: Kit) {
  const fancy = edge !== RARITY_COLOR.common;
  const blade = fancy ? k.glow(edge, { emissiveIntensity: 0.35, metalness: 0.6 }) : k.steel;
  const wood = k.M('#6b4a2a');
  switch (kind) {
    case 'sword':
      g.rotation.z = -0.15;
      k.mk(k.B(0.035, 0.7, 0.01), blade, [0, 0.4, 0], undefined, g);
      k.mk(k.B(0.14, 0.02, 0.03), k.steel, [0, 0.05, 0], undefined, g);
      k.mk(k.C(0.014, 0.014, 0.1, 6), k.leather, [0, -0.01, 0], undefined, g);
      break;
    case 'dagger':
      g.rotation.z = -0.2;
      k.mk(k.B(0.03, 0.22, 0.008), blade, [0, 0.16, 0], undefined, g);
      k.mk(k.B(0.08, 0.016, 0.025), k.steel, [0, 0.04, 0], undefined, g);
      break;
    case 'staff':
      k.mk(k.C(0.016, 0.016, 1.7, 8), wood, [0, 0.05, 0], undefined, g);
      k.mk(k.S(0.05), k.glow(fancy ? edge : '#9fd3ff'), [0, 0.92, 0], undefined, g);
      break;
    case 'axe':
      k.mk(k.C(0.016, 0.016, 0.8, 8), wood, [0, 0.25, 0], undefined, g);
      k.mk(k.B(0.16, 0.14, 0.015), blade, [0.07, 0.58, 0], undefined, g);
      break;
    case 'bow': {
      const bow = k.mk(new THREE.TorusGeometry(0.5, 0.012, 6, 24, Math.PI * 0.8), wood, [-0.25, 0, 0], [0, 0, -Math.PI * 0.4], g);
      bow.castShadow = true;
      break;
    }
    case 'mace':
      k.mk(k.C(0.016, 0.016, 0.6, 8), wood, [0, 0.2, 0], undefined, g);
      k.mk(new THREE.DodecahedronGeometry(0.07), blade, [0, 0.52, 0], undefined, g);
      break;
    default:
      k.mk(k.S(0.05), k.glow(fancy ? edge : '#9fd3ff'), [0, 0.12, 0.04], undefined, g);
  }
}
