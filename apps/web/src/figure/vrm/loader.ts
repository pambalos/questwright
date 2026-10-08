import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { idbGet, idbSet } from '@/lib/idb-storage';

const bytes = new Map<string, Promise<ArrayBuffer>>();

/** Raw file contents, fetched once per URL and shared by every viewer. */
function fetchBytes(url: string, onProgress?: (f: number) => void): Promise<ArrayBuffer> {
  let p = bytes.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`Could not load ${url} (${res.status})`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) onProgress?.(got / total);
      }
      const out = new Uint8Array(got);
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.length;
      }
      return out.buffer;
    })();
    bytes.set(url, p);
    p.catch(() => bytes.delete(url));
  }
  return p;
}

const customKey = (characterId: string) => `vrm:${characterId}`;

export async function saveCustomModel(characterId: string, file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  await parse(buf); // reject files that are not VRM before saving
  await idbSet(customKey(characterId), buf);
  bytes.delete(customKey(characterId));
}

async function parse(buf: ArrayBuffer): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(buf, '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error('That file is not a VRM character.');
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => {
    o.frustumCulled = false;
    if ((o as { isMesh?: boolean }).isMesh) {
      o.castShadow = true;
    }
  });
  return vrm;
}

/** A fresh VRM instance for one viewer. Built-in models load by URL; custom ones come from this browser's storage. */
export async function loadVrm(source: { url: string } | { characterId: string }, onProgress?: (f: number) => void): Promise<VRM> {
  if ('url' in source) return parse(await fetchBytes(source.url, onProgress));
  const key = customKey(source.characterId);
  let p = bytes.get(key);
  if (!p) {
    p = idbGet<ArrayBuffer>(key).then((b) => {
      if (!b) throw new Error('No custom model saved for this character.');
      return b;
    });
    bytes.set(key, p);
    p.catch(() => bytes.delete(key));
  }
  return parse(await p);
}
