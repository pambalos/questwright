import type { VRM } from '@pixiv/three-vrm';
import type { ArtStyle, Look } from '@questwright/engine';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Feature } from '../gear';
import { tone } from '../look';
import { highlight, rigGear, type Rigged } from './gear3d';
import { builtIn, CUSTOM } from './models';
import { loadVrm } from './loader';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export interface StageCharacter {
  id: string;
  /** Changes when the author replaces a custom model. */
  version?: number;
  model: string;
  look: Look;
  features: Feature[];
  style: ArtStyle;
}

/** Sets the model's hair and clothing colours from the character's look. */
function tint(vrm: VRM, model: string, look: Look, style: ArtStyle) {
  const spec = builtIn(model);
  if (!spec) return;
  const hair = new THREE.Color(tone(look.hairColor, style, 1.35));
  const cloth = new THREE.Color(tone(look.cloth, style, 1.25));
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (spec.hide?.test(mesh.name)) mesh.visible = false;
    for (const m of [mesh.material].flat() as (THREE.Material & { color?: THREE.Color; shadeColorFactor?: THREE.Color; userData: Record<string, unknown> })[]) {
      if (spec.hideMaterials?.test(m.name)) m.visible = false;
      const target = spec.hair.test(m.name) ? hair : spec.cloth.test(m.name) ? cloth : null;
      if (!target || !m.color) continue;
      m.userData.base ??= m.color.clone();
      m.color.copy(m.userData.base as THREE.Color).multiply(target);
      if (m.shadeColorFactor) {
        m.userData.shadeBase ??= m.shadeColorFactor.clone();
        m.shadeColorFactor.copy(m.userData.shadeBase as THREE.Color).multiply(target);
      }
    }
  });
}

/** Relaxed standing pose from the model's T-pose. */
function pose(vrm: VRM, t: number, calm: boolean) {
  const n = (b: Parameters<VRM['humanoid']['getNormalizedBoneNode']>[0]) => vrm.humanoid.getNormalizedBoneNode(b);
  const breath = calm ? 0 : Math.sin(t * 1.5);
  const sway = calm ? 0 : Math.sin(t * 0.55);
  n('leftUpperArm')?.rotation.set(0, 0, -1.2 + breath * 0.015);
  n('rightUpperArm')?.rotation.set(0, 0, 1.2 - breath * 0.015);
  n('leftLowerArm')?.rotation.set(0, -0.35, 0);
  n('rightLowerArm')?.rotation.set(0, 0.35, 0);
  n('leftHand')?.rotation.set(0, 0, -0.1);
  n('rightHand')?.rotation.set(0, 0, 0.1);
  for (const side of ['left', 'right'] as const)
    for (const f of ['Index', 'Middle', 'Ring', 'Little'] as const)
      for (const j of ['Proximal', 'Intermediate'] as const) n(`${side}${f}${j}`)?.rotation.set(0, 0, side === 'left' ? -0.5 : 0.5);
  n('spine')?.rotation.set(breath * 0.012, sway * 0.02, 0);
  n('chest')?.rotation.set(breath * 0.015, 0, 0);
  n('hips')?.rotation.set(0, sway * 0.03, sway * 0.012);
  n('leftUpperLeg')?.rotation.set(0, 0, 0.04);
  n('rightUpperLeg')?.rotation.set(0, 0, -0.04 - sway * 0.01);
  n('neck')?.rotation.set(0.04, sway * 0.04, 0);
}

function backdrop(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1b2036');
  grad.addColorStop(0.55, '#131628');
  grad.addColorStop(1, '#07080d');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function runeRing(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.translate(256, 256);
  g.strokeStyle = 'rgba(214,164,67,0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 236, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 214, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 48; i++) {
    g.rotate((Math.PI * 2) / 48);
    g.beginPath();
    g.moveTo(0, -222);
    g.lineTo(0, i % 4 === 0 ? -236 : -229);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The character stage: a VRM model posed and breathing, wearing the gear its
 * sheet describes, lit like a game's character screen. Rotate by dragging,
 * zoom by wheel or pinch; Portrait and Body presets.
 */
export class CharacterStage {
  readonly canvas: HTMLCanvasElement;
  onState?: (s: { loading: boolean; progress: number; error: string | null; portrait: boolean }) => void;
  onUsed?: () => void;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  private holder = new THREE.Group();
  private vrm: VRM | null = null;
  private modelKey = '';
  private rig: Rigged | null = null;
  private rigSig = '';
  private lit: string | null = null;
  private height = 1.6;
  private headY = 1.45;
  private headTop = 0.25;
  private goal = { yaw: 0.35, pitch: 0.05, dist: 1 };
  private view = { ...this.goal };
  private far = 4;
  private near = 1;
  private raf = 0;
  private last = performance.now();
  private calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private blinkAt = 2;
  private lookTarget = new THREE.Object3D();
  private dust: THREE.Points;
  private loadSeq = 0;
  private disposed = false;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Character model. Drag or use the arrow keys to rotate; scroll, pinch, or plus and minus to zoom.');

    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    this.scene.background = backdrop();
    this.scene.fog = new THREE.Fog(0x0b0d16, 5, 12);

    this.scene.add(new THREE.HemisphereLight(0xc9d4ff, 0x2a1c10, 0.7));
    const key = new THREE.DirectionalLight(0xffe6c8, 1.7);
    key.position.set(1.6, 3.2, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.2, near: 0.5, far: 8 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7aa2ff, 1.6);
    rim.position.set(-2, 2.2, -2.6);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffb070, 0.5);
    fill.position.set(-2, 0.6, 2);
    this.scene.add(fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: runeRing(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd38a }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    this.scene.add(ring);

    const n = 70;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 2 - 0.4], i * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.012, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust, this.holder, this.lookTarget);

    this.bindControls();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearModel();
    this.composer.dispose();
    this.renderer.dispose();
  }

  setMode(portrait: boolean) {
    this.goal.dist = portrait ? this.near : this.far;
    this.emit({});
  }

  reset() {
    this.goal.yaw = 0.35;
    this.goal.pitch = 0.05;
    this.setMode(false);
  }

  highlight(key: string | null) {
    this.lit = key;
    highlight(this.rig, key);
  }

  /** Shows a character; reloads the model only when it changes, re-rigs gear when the sheet changes. */
  async show(c: StageCharacter) {
    const key = c.model === CUSTOM ? `${CUSTOM}:${c.id}:${c.version ?? 0}` : c.model;
    if (key !== this.modelKey) {
      const seq = ++this.loadSeq;
      this.modelKey = key;
      this.emit({ loading: true, progress: 0, error: null });
      try {
        const spec = builtIn(c.model);
        const vrm = await loadVrm(spec ? { url: spec.url } : { characterId: c.id }, (f) => seq === this.loadSeq && this.emit({ loading: true, progress: f }));
        if (seq !== this.loadSeq || this.disposed) return;
        this.clearModel();
        this.vrm = vrm;
        this.holder.add(vrm.scene);
        pose(vrm, 0, true);
        vrm.update(0);
        this.measure();
        if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
        this.rigSig = '';
        this.goal.yaw = this.view.yaw = 0.35;
        this.view.dist = this.goal.dist = this.far;
        this.emit({ loading: false, progress: 1, error: null });
      } catch (e) {
        if (seq !== this.loadSeq) return;
        this.modelKey = '';
        this.emit({ loading: false, error: e instanceof Error ? e.message : 'The model could not be loaded.' });
        return;
      }
    }
    const vrm = this.vrm;
    if (!vrm) return;
    const sig = JSON.stringify([c.look, c.features, c.style]);
    if (sig === this.rigSig) return;
    this.rigSig = sig;
    tint(vrm, c.model, c.look, c.style);
    this.removeRig();
    this.rig = rigGear(vrm, c.features, c.look, c.style, { height: this.height, headTop: this.headTop, barefoot: !!builtIn(c.model)?.barefoot });
    if (this.lit) highlight(this.rig, this.lit);
  }

  private measure() {
    const vrm = this.vrm!;
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    const p = new THREE.Vector3();
    head?.getWorldPosition(p);
    const top = new THREE.Box3().setFromObject(vrm.scene).max.y;
    this.height = top;
    this.headTop = Math.max(0.12, top - p.y);
    this.headY = p.y + this.headTop * 0.45;
    const fit = (h: number) => h / 2 / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    this.far = fit(this.height * 1.15);
    this.near = fit(this.headTop * 2.6);
  }

  private removeRig() {
    if (!this.rig) return;
    for (const o of this.rig.added) {
      o.removeFromParent();
      o.traverse((n) => {
        const m = n as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
      });
    }
    this.rig = null;
  }

  private clearModel() {
    this.removeRig();
    if (!this.vrm) return;
    this.holder.remove(this.vrm.scene);
    this.vrm.scene.traverse((n) => {
      const m = n as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
    this.vrm = null;
  }

  private state = { loading: true, progress: 0, error: null as string | null, portrait: false };
  private emit(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch, portrait: this.goal.dist < (this.far + this.near) / 2 };
    this.onState?.(this.state);
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
        this.goal.yaw -= dx * 0.011;
        this.goal.pitch = clamp(this.goal.pitch + dy * 0.005, -0.2, 0.7);
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
      else if (k === 'ArrowUp') this.goal.pitch = clamp(this.goal.pitch + 0.1, -0.2, 0.7);
      else if (k === 'ArrowDown') this.goal.pitch = clamp(this.goal.pitch - 0.1, -0.2, 0.7);
      else if (k === '+' || k === '=') this.zoom(this.goal.dist * 0.85);
      else if (k === '-') this.zoom(this.goal.dist * 1.18);
      else return;
      e.preventDefault();
      used();
    });
  }

  private zoom(d: number) {
    this.goal.dist = clamp(d, this.near * 0.7, this.far * 1.4);
    this.emit({});
  }

  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.canvas.isConnected) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? 0;
    const h = parent?.clientHeight ?? 0;
    const pr = this.renderer.getPixelRatio();
    if (w && h && (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr))) {
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
      this.bloom.setSize(w, h);
      this.cam.aspect = w / h;
      this.cam.updateProjectionMatrix();
    }
    const f = this.calm ? 1 : 1 - Math.pow(0.0008, dt);
    this.view.yaw += (this.goal.yaw - this.view.yaw) * f;
    this.view.pitch += (this.goal.pitch - this.view.pitch) * f;
    this.view.dist += (this.goal.dist - this.view.dist) * f;
    const near = clamp((this.view.dist - this.near) / Math.max(0.01, this.far - this.near), 0, 1);
    const aimY = this.headY - 0.04 - near * (this.headY - this.height * 0.5);
    const cp = Math.cos(this.view.pitch);
    this.cam.position.set(Math.sin(this.view.yaw) * cp * this.view.dist, aimY + Math.sin(this.view.pitch) * this.view.dist, Math.cos(this.view.yaw) * cp * this.view.dist);
    this.cam.lookAt(0, aimY, 0);
    this.lookTarget.position.copy(this.cam.position);

    const t = now / 1000;
    const vrm = this.vrm;
    if (vrm) {
      pose(vrm, t, this.calm);
      const em = vrm.expressionManager;
      if (em) {
        const since = t - this.blinkAt;
        em.setValue('blink', since > 0 && since < 0.16 ? Math.sin((since / 0.16) * Math.PI) : 0);
        if (since > 0.16) this.blinkAt = t + 2 + Math.random() * 3.5;
        em.setValue('relaxed', 0.25);
      }
      for (const a of this.rig?.anims ?? []) a(t, dt);
      vrm.update(dt);
    }
    if (!this.calm) this.dust.rotation.y = t * 0.03;
    this.composer.render();
  }
}
