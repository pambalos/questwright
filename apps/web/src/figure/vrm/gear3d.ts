import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { ArtStyle, Look } from '@questwright/engine';
import * as THREE from 'three';
import { RARITY_COLOR, type Feature, type GearMaterial, type WeaponKind } from '../gear';
import { tone } from '../look';

export type Anim = (t: number, dt: number) => void;

export interface Rigged {
  parts: Map<string, THREE.Object3D>;
  anims: Anim[];
  /** Everything added to the model, removed on dispose. */
  added: THREE.Object3D[];
}

/* ---------- materials ---------- */

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.28 });
const darkSteel = () => new THREE.MeshStandardMaterial({ color: 0x6d737c, metalness: 1, roughness: 0.4 });
const gold = () => new THREE.MeshStandardMaterial({ color: 0xd6a443, metalness: 1, roughness: 0.32 });
const leather = () => new THREE.MeshStandardMaterial({ color: 0x5a3a22, metalness: 0, roughness: 0.75 });
const wood = () => new THREE.MeshStandardMaterial({ color: 0x5b3b22, metalness: 0, roughness: 0.65 });
const glowMat = (hex: string, intensity = 3) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex), emissiveIntensity: intensity, roughness: 0.2, toneMapped: false });

const rarityHex = (r?: string) => RARITY_COLOR[(r as keyof typeof RARITY_COLOR) ?? 'common'] ?? RARITY_COLOR.common;
const special = (r?: string) => !!r && r !== 'common';

/** The surface for a piece of armour, from what its name says it is made of. */
function surface(m: GearMaterial | undefined, fallback: GearMaterial, cloth: string): THREE.Material {
  switch (m ?? fallback) {
    case 'obsidian':
      // Volcanic glass: near black, glossy, with a faint violet sheen where the light catches it.
      return new THREE.MeshPhysicalMaterial({ color: 0x121019, metalness: 0.05, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x5a3d8a), envMapIntensity: 1.6 });
    case 'iron':
      return new THREE.MeshStandardMaterial({ color: 0x5f6066, metalness: 0.9, roughness: 0.55 });
    case 'gold':
      return gold();
    case 'silver':
      return new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.18 });
    case 'bronze':
      return new THREE.MeshStandardMaterial({ color: 0xa8703a, metalness: 1, roughness: 0.38 });
    case 'leather':
      return leather();
    case 'cloth':
      return new THREE.MeshStandardMaterial({ color: new THREE.Color(cloth), roughness: 0.92 });
    case 'bone':
      return new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.6 });
    case 'wood':
      return wood();
    case 'crystal':
      return new THREE.MeshPhysicalMaterial({ color: 0xbfe4ff, metalness: 0, roughness: 0.05, transmission: 0.6, thickness: 0.05, clearcoat: 1 });
    default:
      return steel();
  }
}

/** Edge trim: glowing on rare gear, otherwise a contrasting metal. */
function trim(m: GearMaterial | undefined, rarity?: string): THREE.Material {
  if (special(rarity)) return glowMat(rarityHex(rarity), 1.6);
  if (m === 'obsidian') return new THREE.MeshStandardMaterial({ color: 0x2a2433, metalness: 0.8, roughness: 0.3 });
  if (m === 'leather' || m === 'cloth') return new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.5 });
  return gold();
}

let softDot: THREE.Texture | null = null;
/** A soft round sprite for particles and glows. */
function dot(): THREE.Texture {
  if (softDot) return softDot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(c);
  return softDot;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...at);
  m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

/* ---------- weapons ---------- */

function bladeShape(len: number, width: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(-width / 2, len * 0.82);
  s.quadraticCurveTo(-width / 2, len * 0.93, 0, len);
  s.quadraticCurveTo(width / 2, len * 0.93, width / 2, len * 0.82);
  s.lineTo(width / 2, 0);
  s.closePath();
  return s;
}

function blade(len: number, width: number, rarity?: string): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(bladeShape(len, width), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -0.002);
  g.add(mesh(geo, steel()));
  // Fuller groove and, on better gear, a glowing edge rune.
  g.add(mesh(new THREE.BoxGeometry(width * 0.18, len * 0.7, 0.012), darkSteel(), [0, len * 0.42, 0]));
  if (special(rarity)) g.add(mesh(new THREE.BoxGeometry(width * 0.08, len * 0.62, 0.014), glowMat(rarityHex(rarity), 1.6), [0, len * 0.42, 0]));
  return g;
}

function hilt(gripLen: number, guardW: number, rarity?: string): THREE.Group {
  const g = new THREE.Group();
  const guard = mesh(new THREE.TorusGeometry(guardW / 2, 0.009, 8, 24, Math.PI), gold(), [0, 0, 0], [0, 0, Math.PI]);
  guard.scale.set(1, 0.35, 1);
  g.add(guard);
  g.add(mesh(new THREE.BoxGeometry(guardW * 0.3, 0.02, 0.03), gold(), [0, 0, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.013, 0.015, gripLen, 12), leather(), [0, -gripLen / 2, 0]));
  for (let i = 1; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(0.015, 0.0025, 6, 16), darkSteel(), [0, (-gripLen * i) / 5, 0], [Math.PI / 2, 0, 0]));
  g.add(mesh(new THREE.SphereGeometry(0.022, 16, 12), gold(), [0, -gripLen - 0.015, 0]));
  if (special(rarity)) g.add(mesh(new THREE.OctahedronGeometry(0.012), glowMat(rarityHex(rarity), 3), [0, -gripLen - 0.015, 0.018]));
  return g;
}

/** A weapon with its grip at the origin and the business end along +Y. */
export function weapon(kind: WeaponKind, rarity?: string): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'sword': {
      const b = blade(0.78, 0.055, rarity);
      g.add(b, hilt(0.17, 0.2, rarity));
      break;
    }
    case 'dagger': {
      g.add(blade(0.26, 0.04, rarity), hilt(0.09, 0.1, rarity));
      break;
    }
    case 'staff': {
      const pts = [0, 0.02, 0.022, 0.018, 0.02, 0.024, 0].map((r, i) => new THREE.Vector2(r, -0.5 + i * 0.27));
      g.add(mesh(new THREE.LatheGeometry(pts, 12), wood()));
      for (let i = 0; i < 3; i++) {
        const claw = mesh(new THREE.ConeGeometry(0.012, 0.16, 6), gold(), [Math.cos((i * Math.PI * 2) / 3) * 0.04, 1.2, Math.sin((i * Math.PI * 2) / 3) * 0.04]);
        claw.lookAt(0, 1.4, 0);
        claw.rotateX(Math.PI / 2);
        g.add(claw);
      }
      const crystal = mesh(new THREE.OctahedronGeometry(0.05), glowMat(special(rarity) ? rarityHex(rarity) : '#7fd0ff', 2.2), [0, 1.3, 0]);
      crystal.scale.set(0.8, 1.4, 0.8);
      g.add(crystal);
      break;
    }
    case 'axe': {
      g.add(mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.8, 10), wood(), [0, 0.25, 0]));
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.2, -0.04, 0.2, -0.14);
      s.quadraticCurveTo(0.12, -0.08, 0, -0.1);
      s.closePath();
      const head = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 2 }), steel(), [0.01, 0.66, -0.006]);
      g.add(head);
      if (special(rarity)) g.add(mesh(new THREE.BoxGeometry(0.01, 0.12, 0.02), glowMat(rarityHex(rarity)), [0.2, 0.58, 0]));
      break;
    }
    case 'hammer': {
      g.add(mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.62, 10), wood(), [0, 0.2, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.17, 0.08, 0.08), darkSteel(), [0, 0.52, 0]));
      for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.012, 0.09, 0.09), steel(), [x * 0.09, 0.52, 0]));
      if (special(rarity)) g.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.085), glowMat(rarityHex(rarity)), [0, 0.565, 0]));
      break;
    }
    case 'spear': {
      g.add(mesh(new THREE.CylinderGeometry(0.013, 0.015, 1.5, 10), wood(), [0, 0.35, 0]));
      const tip = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), steel(), [0, 1.18, 0]);
      tip.scale.set(1, 1, 0.35);
      g.add(tip, mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.05, 10), leather(), [0, 1.07, 0]));
      break;
    }
    case 'mace': {
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.55, 10), leather(), [0, 0.2, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), darkSteel(), [0, 0.5, 0]));
      for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.012, 0.09, 0.05), steel(), [Math.cos((i * Math.PI) / 3) * 0.05, 0.5, Math.sin((i * Math.PI) / 3) * 0.05], [0, -(i * Math.PI) / 3, 0]));
      break;
    }
    case 'bow': {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0, 0, 0.28), new THREE.Vector3(0, 0.55, 0));
      g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.012, 8), wood()));
      const string = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0, 0.55, 0)]);
      g.add(new THREE.Line(string, new THREE.LineBasicMaterial({ color: 0xe8e4d6 })));
      break;
    }
    default: {
      const orb = mesh(new THREE.SphereGeometry(0.045, 24, 16), glowMat(special(rarity) ? rarityHex(rarity) : '#9fd3ff', 2.4), [0, 0.12, 0]);
      g.add(orb);
      for (let i = 0; i < 2; i++) g.add(mesh(new THREE.TorusGeometry(0.075 + i * 0.02, 0.003, 6, 40), gold(), [0, 0.12, 0], [Math.PI / 2 + i * 0.6, i * 0.8, 0]));
    }
  }
  return g;
}

function shield(look: Look, style: ArtStyle, rarity?: string): THREE.Group {
  const s = new THREE.Shape();
  s.moveTo(-0.2, 0.22);
  s.lineTo(0.2, 0.22);
  s.lineTo(0.2, 0.02);
  s.quadraticCurveTo(0.18, -0.2, 0, -0.3);
  s.quadraticCurveTo(-0.18, -0.2, -0.2, 0.02);
  s.closePath();
  const g = new THREE.Group();
  const face = new THREE.MeshStandardMaterial({ color: new THREE.Color(tone(look.accent, style, 0.8)), metalness: 0.2, roughness: 0.55 });
  g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 3 }), face));
  const rim = new THREE.Shape(s.getPoints(24));
  const hole = new THREE.Path(s.getPoints(24).map((p) => p.clone().multiplyScalar(0.86)));
  rim.holes.push(hole);
  g.add(mesh(new THREE.ExtrudeGeometry(rim, { depth: 0.04, bevelEnabled: false }), special(rarity) ? gold() : steel(), [0, 0, -0.005]));
  g.add(mesh(new THREE.SphereGeometry(0.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), special(rarity) ? glowMat(rarityHex(rarity), 1.6) : steel(), [0, 0, 0.035], [Math.PI / 2, 0, 0]));
  return g;
}

function helm(rarity: string | undefined, material: GearMaterial | undefined, cloth: string): THREE.Group {
  const g = new THREE.Group();
  const shell = surface(material, 'steel', cloth);
  const edge = trim(material, rarity);
  const dome = mesh(new THREE.SphereGeometry(0.135, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), shell);
  dome.scale.set(1, 1.05, 1.12);
  g.add(dome);
  g.add(mesh(new THREE.TorusGeometry(0.137, 0.008, 8, 48), special(rarity) ? glowMat(rarityHex(rarity), 2) : edge, [0, 0.0, 0], [Math.PI / 2, 0, 0]));
  if (material && material !== 'steel') {
    // A closed war helm: cheek guards, a nose guard and a ridge, no plume.
    for (const x of [-1, 1]) {
      const cheek = mesh(new THREE.SphereGeometry(0.135, 16, 10, x > 0 ? 0 : Math.PI * 1.55, Math.PI * 0.45, Math.PI * 0.5, Math.PI * 0.32), shell);
      cheek.scale.set(1.02, 1.05, 1.14);
      g.add(cheek);
    }
    g.add(mesh(new THREE.BoxGeometry(0.022, 0.1, 0.02), shell, [0, -0.03, 0.15]));
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.03, 0.27), edge, [0, 0.135, 0]));
    return g;
  }
  // Riveted band and a swept plume.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.006, 8, 6), gold(), [Math.cos(a) * 0.14, 0.012, Math.sin(a) * 0.151]));
  }
  const plume = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0x9a2222, roughness: 0.9 });
  for (let i = 0; i < 7; i++) {
    const f = mesh(new THREE.ConeGeometry(0.018, 0.12, 6), red, [0, 0.14 + Math.sin(i * 0.4) * 0.02, 0.06 - i * 0.03], [-0.9 - i * 0.12, 0, 0]);
    plume.add(f);
  }
  g.add(plume, mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.04, 10), gold(), [0, 0.135, 0.06]));
  return g;
}

/* ---------- rigging gear to the skeleton ---------- */

const v = new THREE.Vector3();

/**
 * Attaches what the sheet says to the character's normalized skeleton, so it
 * moves with the pose. Positions are in metres relative to each bone, scaled by
 * the model's height.
 */
export interface Body {
  height: number;
  /** Distance from the head bone to the top of the hair. */
  headTop: number;
  barefoot: boolean;
}

export function rigGear(vrm: VRM, features: Feature[], look: Look, style: ArtStyle, body: Body): Rigged {
  const height = body.height;
  const parts = new Map<string, THREE.Object3D>();
  const anims: Anim[] = [];
  const added: THREE.Object3D[] = [];
  const k = height / 1.6;
  const bone = (name: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(name);
  const attach = (name: VRMHumanBoneName, obj: THREE.Object3D, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], key?: string) => {
    const b = bone(name) ?? bone('hips');
    if (!b) return obj;
    obj.position.set(at[0] * k, at[1] * k, at[2] * k);
    obj.rotation.set(...rot);
    obj.scale.multiplyScalar(k);
    b.add(obj);
    added.push(obj);
    if (key) parts.set(key, obj);
    return obj;
  };
  const has = <K extends Feature['type']>(type: K) => features.filter((f): f is Extract<Feature, { type: K }> => f.type === type);
  const one = <K extends Feature['type']>(type: K) => has(type)[0];

  const w = one('weapon');
  if (w) attach('rightHand', weapon(w.kind, w.rarity), [-0.07, -0.02, 0.0], w.kind === 'bow' ? [0, 0, 0] : [Math.PI / 2 - 0.35, 0, 0], w.key);

  for (const s of has('sheathed')) {
    const g = new THREE.Group();
    const len = s.kind === 'sword' ? 0.78 : 0.26;
    const scab = mesh(new THREE.BoxGeometry(0.07, len, 0.03), leather(), [0, len / 2, 0]);
    g.add(scab, mesh(new THREE.BoxGeometry(0.075, 0.04, 0.035), gold(), [0, len - 0.02, 0]), mesh(new THREE.BoxGeometry(0.075, 0.03, 0.035), gold(), [0, 0.015, 0]));
    const h = hilt(s.kind === 'sword' ? 0.17 : 0.09, s.kind === 'sword' ? 0.2 : 0.1, s.rarity);
    h.rotation.z = Math.PI;
    h.position.y = -0.005;
    g.add(h);
    g.rotation.z = Math.PI;
    const holder = new THREE.Group();
    holder.add(g);
    attach('hips', holder, [0.15, 0.02, 0.03], [0.25, 0, -0.35], s.key);
  }

  if (one('belt')) {
    const belt = mesh(new THREE.TorusGeometry(0.155, 0.018, 8, 48), leather(), [0, 0, 0], [Math.PI / 2, 0, 0]);
    belt.scale.set(1, 0.78, 0.6);
    const g = new THREE.Group();
    g.add(belt, mesh(new THREE.BoxGeometry(0.045, 0.04, 0.012), gold(), [0, 0, 0.125]));
    attach('hips', g, [0, 0.04, 0.0]);
  }
  const pouch = one('pouch');
  if (pouch) {
    const g = new THREE.Group();
    const bag = mesh(new THREE.SphereGeometry(0.045, 16, 12), leather());
    bag.scale.set(1, 1.15, 0.7);
    g.add(bag, mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 16), gold(), [0, 0.045, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 16), gold(), [0.01 * i - 0.01, 0.065 + i * 0.004, 0.005], [Math.PI / 2.4, 0, 0]));
    attach('hips', g, [-0.15, -0.03, 0.07], [0, 0, 0], pouch.key);
  }
  const potions = one('potions');
  if (potions) {
    const g = new THREE.Group();
    for (let i = 0; i < Math.min(potions.count, 3); i++) {
      const bottle = new THREE.Group();
      bottle.add(mesh(new THREE.SphereGeometry(0.024, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xc23a2e, emissive: 0x6a0e08, emissiveIntensity: 0.6, roughness: 0.1, transmission: 0.3, thickness: 0.02 })));
      bottle.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.2 }), [0, 0.03, 0]));
      bottle.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 10), wood(), [0, 0.05, 0]));
      bottle.position.x = i * 0.055;
      g.add(bottle);
    }
    attach('hips', g, [-0.05, -0.05, 0.12], [0, 0, 0], potions.key);
  }
  const trinket = one('trinket');
  if (trinket) attach('hips', mesh(new THREE.OctahedronGeometry(0.025), glowMat(rarityHex(trinket.rarity), 1.5)), [0.1, -0.06, 0.12], [0, 0, 0], trinket.key);

  const sh = one('shield');
  if (sh) attach('leftLowerArm', shield(look, style, sh.rarity), [0.12, 0.07, 0.0], [-Math.PI / 2, 0, Math.PI / 2], sh.key);

  const ward = one('ward');
  if (ward && !sh) {
    const g = new THREE.Group();
    const hex = new THREE.CylinderGeometry(0.17, 0.17, 0.004, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const face = new THREE.Mesh(hex, mat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(hex), new THREE.LineBasicMaterial({ color: 0xffb060, toneMapped: false }));
    g.add(face, edges);
    for (let r = 0.06; r < 0.16; r += 0.05) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(r, r, 0.004, 6)), new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, toneMapped: false })));
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color: 0xff9a40, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    flare.scale.setScalar(0.32);
    g.add(flare);
    attach('leftLowerArm', g, [0.12, 0.09, 0.0], [0, 0, 0], ward.key);
    anims.push((t) => {
      mat.opacity = 0.12 + Math.sin(t * 2.4) * 0.05;
      g.rotation.y = t * 0.4;
    });
  }

  /* Measurements of this body, in the same units as `attach` positions (a 1.6 m figure). */
  vrm.scene.updateMatrixWorld(true);
  const at = (name: VRMHumanBoneName) => {
    const b = bone(name);
    return b ? b.getWorldPosition(new THREE.Vector3()) : null;
  };
  const span = (a: VRMHumanBoneName, b: VRMHumanBoneName, fallback: number) => {
    const p = at(a);
    const q = at(b);
    return p && q ? p.distanceTo(q) / k : fallback;
  };
  const shoulders = span('leftUpperArm', 'rightUpperArm', 0.34);
  const hipsW = span('leftUpperLeg', 'rightUpperLeg', 0.2);
  const thigh = span('leftUpperLeg', 'leftLowerLeg', 0.4);
  const shin = span('leftLowerLeg', 'leftFoot', 0.38);
  const forearm = span('leftLowerArm', 'leftHand', 0.24);
  const torsoBone: VRMHumanBoneName = bone('upperChest') ? 'upperChest' : 'chest';
  const torsoTop = span(torsoBone, 'neck', 0.12);
  const torsoDrop = span(torsoBone, 'hips', 0.3);
  const cloth = tone(look.cloth, style, 0.8);
  const side = (s: 'left' | 'right') => (s === 'left' ? 1 : -1);
  /** Keeps a mesh's own offset and turn when attached (attach sets the outer transform). */
  const wrap = (o: THREE.Object3D) => new THREE.Group().add(o);

  const hm = one('helm');
  if (hm) {
    // Fit the helm over the hair: anime heads are large relative to the body.
    const h = helm(hm.rarity, hm.material, cloth);
    const r = body.headTop * 0.56;
    h.scale.setScalar(r / 0.135 / k);
    attach('head', h, [0, (body.headTop * 0.52) / k, -0.015], [-0.12, 0, 0], hm.key);
  }
  const hood = one('hood');
  if (hood && !hm) {
    // A cloth hood: a loose shell over the back and top of the head. The sphere's gap (phi 0.25π to 0.75π) faces +z, the face.
    const r = body.headTop * 0.58;
    const shell = mesh(new THREE.SphereGeometry(r / k, 28, 18, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.72), surface(hood.material, 'cloth', cloth));
    (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    shell.scale.set(1, 1.08, 1.12);
    attach('head', wrap(shell), [0, (body.headTop * 0.42) / k, -0.02], [-0.15, 0, 0], hood.key);
  }

  const ar = one('armor');
  if (ar) {
    // A breastplate shaped around this torso: wider at the chest, narrower at the waist, flatter front to back.
    const shell = surface(ar.material, 'steel', cloth);
    const edge = trim(ar.material, ar.rarity);
    const g = new THREE.Group();
    const r = shoulders * 0.56;
    const top = torsoTop * 0.62;
    const bottom = -torsoDrop * 0.8;
    const profile = [
      [r * 0.78, bottom],
      [r * 0.86, bottom * 0.55],
      [r * 1.0, bottom * 0.1],
      [r * 1.04, top * 0.35],
      [r * 0.9, top * 0.85],
      [r * 0.58, top],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const plate = mesh(new THREE.LatheGeometry(profile, 36), shell);
    plate.scale.set(1, 1, 0.78);
    g.add(plate);
    // Banded lower plates and a raised centre ridge.
    for (const y of [bottom * 0.55, bottom * 0.2]) {
      const band = mesh(new THREE.TorusGeometry(r * 0.94, 0.006, 6, 48), edge, [0, y, 0], [Math.PI / 2, 0, 0]);
      band.scale.set(1, 0.74, 1);
      g.add(band);
    }
    g.add(mesh(new THREE.BoxGeometry(0.014, (top - bottom) * 0.8, 0.02), edge, [0, (top + bottom) / 2, r * 0.74]));
    const gorget = mesh(new THREE.TorusGeometry(r * 0.52, 0.018, 8, 32), shell, [0, top, 0], [Math.PI / 2, 0, 0]);
    gorget.scale.set(1, 0.8, 1);
    g.add(gorget);
    // Pauldrons over the shoulder joints.
    for (const x of [-1, 1]) {
      const p = mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell, [x * shoulders * 0.5, top * 0.55, 0], [0, 0, -x * 0.45]);
      p.scale.set(1.15, 0.7, 1.15);
      g.add(p);
      g.add(mesh(new THREE.TorusGeometry(0.08, 0.005, 6, 32), edge, [x * shoulders * 0.5, top * 0.55, 0], [Math.PI / 2, -x * 0.45, 0]));
    }
    attach(torsoBone, g, [0, 0, 0], [0, 0, 0], ar.key);
    // Tassets hanging from the waist.
    const tassets = new THREE.Group();
    for (const x of [-1, 0, 1]) {
      const t = mesh(new THREE.BoxGeometry(hipsW * 0.5, 0.11, 0.012), shell, [x * hipsW * 0.45, -0.02, r * 0.66], [0.12, x * 0.35, 0]);
      tassets.add(t);
    }
    attach('hips', tassets, [0, 0, 0], [0, 0, 0]);
  }
  const pd = one('pauldrons');
  if (pd && !ar) {
    const g = new THREE.Group();
    for (const x of [-1, 1]) {
      const p = mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), surface(pd.material, 'steel', cloth), [x * shoulders * 0.5, torsoTop * 0.3, 0], [0, 0, -x * 0.45]);
      p.scale.set(1.15, 0.7, 1.15);
      g.add(p);
    }
    attach(torsoBone, g, [0, 0, 0], [0, 0, 0], pd.key);
  }

  const gl = one('gloves');
  if (gl) {
    const shell = surface(gl.material, 'leather', cloth);
    for (const s of ['left', 'right'] as const) {
      const x = side(s);
      // Gauntlet: a flared cuff at the wrist and a plate over the back of the hand.
      const cuff = mesh(new THREE.CylinderGeometry(0.036, 0.046, forearm * 0.35, 16), shell, [x * forearm * 0.82, 0, 0], [0, 0, x * Math.PI / 2]);
      attach(`${s}LowerArm`, wrap(cuff), [0, 0, 0], [0, 0, 0], s === 'left' ? gl.key : undefined);
      const back = mesh(new THREE.BoxGeometry(0.085, 0.03, 0.07), shell, [x * 0.045, 0.004, 0]);
      attach(`${s}Hand`, wrap(back), [0, 0, 0]);
    }
  }
  const br = one('bracers');
  if (br && !gl) {
    const shell = surface(br.material, 'leather', cloth);
    for (const s of ['left', 'right'] as const) {
      const x = side(s);
      attach(`${s}LowerArm`, wrap(mesh(new THREE.CylinderGeometry(0.042, 0.038, forearm * 0.5, 16), shell, [x * forearm * 0.6, 0, 0], [0, 0, x * Math.PI / 2])), [0, 0, 0], [0, 0, 0], s === 'left' ? br.key : undefined);
    }
  }
  const gr = one('greaves');
  if (gr) {
    const shell = surface(gr.material, 'steel', cloth);
    const edge = trim(gr.material, gr.rarity);
    const thighR = hipsW * 0.5;
    for (const s of ['left', 'right'] as const) {
      // Cuisse over the thigh, a knee cop, and a greave down the shin.
      const cuisse = mesh(new THREE.CylinderGeometry(thighR, thighR * 0.82, thigh * 0.72, 18), shell, [0, -thigh * 0.42, 0.004]);
      cuisse.scale.set(1, 1, 0.92);
      attach(`${s}UpperLeg`, wrap(cuisse), [0, 0, 0], [0, 0, 0], s === 'left' ? gr.key : undefined);
      const knee = mesh(new THREE.SphereGeometry(thighR * 0.72, 16, 12), shell, [0, 0, thighR * 0.38]);
      knee.scale.set(1, 0.9, 0.7);
      attach(`${s}LowerLeg`, wrap(knee), [0, 0, 0]);
      attach(`${s}LowerLeg`, wrap(mesh(new THREE.TorusGeometry(thighR * 0.8, 0.006, 6, 24), edge, [0, -shin * 0.1, 0.004], [Math.PI / 2, 0, 0])), [0, 0, 0]);
      const greave = mesh(new THREE.CylinderGeometry(thighR * 0.72, thighR * 0.6, shin * 0.62, 18), shell, [0, -shin * 0.42, 0.006]);
      greave.scale.set(1, 1, 0.95);
      attach(`${s}LowerLeg`, wrap(greave), [0, 0, 0]);
    }
  }
  const bt = one('boots');
  if (bt) {
    const shell = surface(bt.material, 'leather', cloth);
    for (const s of ['left', 'right'] as const) {
      attach(`${s}LowerLeg`, wrap(mesh(new THREE.CylinderGeometry(0.058, 0.054, shin * 0.36, 16), shell, [0, -shin * 0.8, 0.006])), [0, 0, 0], [0, 0, 0], s === 'left' ? bt.key : undefined);
      const foot = new THREE.Group();
      const sole = mesh(new THREE.BoxGeometry(0.1, 0.09, 0.23), shell, [0, -0.03, 0.05]);
      const toe = mesh(new THREE.SphereGeometry(0.055, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, [0, -0.06, 0.16], [Math.PI / 2, 0, 0]);
      toe.scale.set(1, 0.9, 0.7);
      foot.add(sole, toe);
      attach(`${s}Foot`, foot, [0, 0, 0]);
    }
  }

  if (body.barefoot && !one('boots')) {
    const boot = new THREE.MeshStandardMaterial({ color: 0x3b2617, roughness: 0.7 });
    for (const side of ['left', 'right'] as const) {
      attach(`${side}LowerLeg`, mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.2, 16), boot, [0, -0.25, 0.005]), [0, 0, 0]);
      const foot = new THREE.Group();
      const sole = mesh(new THREE.BoxGeometry(0.085, 0.05, 0.2), boot, [0, -0.025, 0.04]);
      const toe = mesh(new THREE.SphereGeometry(0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), boot, [0, -0.04, 0.13], [Math.PI / 2, 0, 0]);
      toe.scale.set(1, 0.9, 0.7);
      foot.add(sole, toe, mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 20), gold(), [0, 0.03, 0], [Math.PI / 2, 0, 0]));
      attach(`${side}Foot`, foot, [0, 0, 0]);
    }
  }
  const cape = one('cape') ?? (look.outfit === 'cloak' ? { type: 'cape' as const, key: '__cloak' } : undefined);
  if (cape) {
    const geo = new THREE.PlaneGeometry(0.46, 1.0, 10, 20);
    geo.translate(0, -0.5, 0);
    const base = geo.attributes.position!.array.slice() as Float32Array;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tone(look.accent, style, 0.7)), roughness: 0.85, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    attach('upperChest', m, [0, 0.1, -0.13], [0.12, 0, 0], cape.key);
    anims.push((t) => {
      const pos = geo.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const y = base[i * 3 + 1]!;
        const x = base[i * 3]!;
        pos.setZ(i, Math.sin(t * 1.6 + y * 4 + x * 3) * 0.025 * -y - y * y * 0.12);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    });
  }
  const mantle = one('mantle');
  if (mantle) {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0x9b968f, roughness: 1 });
    const ring = mesh(new THREE.TorusGeometry(0.11, 0.035, 10, 32), fur, [0, 0.14, -0.005], [Math.PI / 2, 0, 0]);
    ring.scale.set(1.35, 0.95, 0.8);
    g.add(ring);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const tuft = mesh(new THREE.ConeGeometry(0.016, 0.06, 5), fur, [Math.cos(a) * 0.15, 0.11, Math.sin(a) * 0.1], [Math.PI, 0, 0]);
      g.add(tuft);
    }
    const head = new THREE.Group();
    head.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), fur), mesh(new THREE.ConeGeometry(0.03, 0.08, 6), fur, [0, -0.01, 0.06], [Math.PI / 2, 0, 0]));
    for (const x of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.015, 0.04, 5), fur, [x * 0.025, 0.05, -0.01]));
    head.position.set(0.14, 0.17, 0.03);
    g.add(head);
    attach('upperChest', g, [0, 0, 0], [0, 0, 0], mantle.key);
  }
  const pack = one('pack');
  if (pack) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.26, 0.32, 0.13), leather()), mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x8a7f6a, roughness: 0.9 }), [0, 0.2, 0], [0, 0, Math.PI / 2]));
    attach('upperChest', g, [0, -0.05, -0.17], [0, 0, 0], pack.key);
  }
  const amulet = one('amulet');
  const trophy = one('trophy');
  if (amulet || trophy) {
    const g = new THREE.Group();
    const cord = mesh(new THREE.TorusGeometry(0.07, 0.003, 6, 40, Math.PI), amulet ? gold() : leather(), [0, 0.02, 0], [Math.PI * 0.62, 0, Math.PI]);
    g.add(cord);
    if (amulet) g.add(mesh(new THREE.OctahedronGeometry(0.018), glowMat(rarityHex(amulet.rarity), 2), [0, -0.05, 0.03]));
    else for (const x of [-0.025, 0, 0.025]) g.add(mesh(new THREE.ConeGeometry(0.007, 0.035, 6), new THREE.MeshStandardMaterial({ color: 0xf1eadb, roughness: 0.5 }), [x, -0.045 - (x === 0 ? 0.008 : 0), 0.035], [Math.PI, 0, 0]));
    attach('upperChest', g, [0, 0.08, 0.09], [0, 0, 0], (amulet ?? trophy)!.key);
  }
  const sigil = one('sigil');
  if (sigil) {
    const g = new THREE.Group();
    const gem = mesh(new THREE.OctahedronGeometry(0.03), glowMat('#ffd27a', 3));
    gem.scale.set(0.7, 1.1, 0.7);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color: 0xffe0a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.18);
    g.add(gem, halo);
    attach('chest', g, [0, 0.02, 0.17], [0, 0, 0], sigil.key);
    anims.push((t) => {
      gem.rotation.y = t * 1.2;
      g.position.y = (0.02 + Math.sin(t * 2) * 0.008) * k;
    });
  }
  for (const r of has('ring')) {
    const g = new THREE.Group();
    const c = special(r.rarity) ? rarityHex(r.rarity) : '#ff8a2a';
    g.add(mesh(new THREE.TorusGeometry(0.011, 0.003, 8, 20), gold(), [0, 0, 0], [0, Math.PI / 2, 0]), mesh(new THREE.OctahedronGeometry(0.006), glowMat(c, 4), [0, 0.012, 0]));
    attach('rightHand', g, [-0.06, 0.0, 0.02], [0, 0, 0], r.key);
  }

  /* Effects that follow the hands in world space. */
  const handWorld = (name: VRMHumanBoneName, out: THREE.Vector3) => {
    const b = bone(name);
    if (b) b.getWorldPosition(out);
    return out;
  };
  const sparks = (color: number, hand: VRMHumanBoneName, n: number, rise: number) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const life = new Float32Array(n).map(() => Math.random());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.035 * k, map: dot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    vrm.scene.add(pts);
    added.push(pts);
    const origin = new THREE.Vector3();
    const offsets = Array.from({ length: n }, () => new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08));
    anims.push((t, dt) => {
      handWorld(hand, origin);
      vrm.scene.worldToLocal(origin);
      for (let i = 0; i < n; i++) {
        life[i] = (life[i]! + dt * (0.5 + (i % 5) * 0.08)) % 1;
        const o = offsets[i]!;
        pos[i * 3] = origin.x + o.x + Math.sin(t * 3 + i) * 0.01;
        pos[i * 3 + 1] = origin.y + life[i]! * rise * k;
        pos[i * 3 + 2] = origin.z + o.z;
      }
      geo.attributes.position!.needsUpdate = true;
    });
  };
  if (one('embers')) sparks(0xffa040, 'leftHand', 26, 0.4);
  if (one('frost')) sparks(0xbfe6ff, 'rightHand', 18, 0.25);
  const heal = one('glow');
  if (heal) {
    const g = new THREE.Group();
    for (const hand of ['leftHand', 'rightHand'] as const) {
      const orb = new THREE.Group();
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot(), color: 0xfff1b8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(0.16 * k);
      const core = mesh(new THREE.SphereGeometry(0.018 * k, 12, 10), glowMat('#fffbe6', 4));
      orb.add(s, core);
      g.add(orb);
      anims.push((t) => {
        handWorld(hand, v);
        vrm.scene.worldToLocal(v);
        orb.position.copy(v);
        s.scale.setScalar((0.15 + Math.sin(t * 2 + (hand === 'leftHand' ? 0 : 1)) * 0.03) * k);
      });
    }
    vrm.scene.add(g);
    added.push(g);
    parts.set(heal.key, g);
  }
  if (one('scar')) attach('head', mesh(new THREE.BoxGeometry(0.004, 0.035, 0.004), new THREE.MeshStandardMaterial({ color: 0xa8322a, roughness: 0.6 })), [0.035, 0.06, 0.085], [0, 0.3, 0.6]);

  return { parts, anims, added };
}

export function highlight(rig: Rigged | null, key: string | null) {
  if (!rig) return;
  for (const [k, obj] of rig.parts) {
    const on = k === key;
    obj.traverse((n) => {
      const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !('emissive' in m) || !m.emissive) return;
      if (n.userData.e0 === undefined) {
        n.userData.e0 = m.emissive.getHex();
        n.userData.i0 = m.emissiveIntensity;
      }
      if (on) {
        m.emissive.set(0xffc96b);
        m.emissiveIntensity = Math.max(0.7, n.userData.i0 as number);
      } else {
        m.emissive.setHex(n.userData.e0 as number);
        m.emissiveIntensity = n.userData.i0 as number;
      }
    });
  }
}
