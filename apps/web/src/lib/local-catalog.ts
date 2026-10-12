/**
 * Local image models: what can be installed, and the runtime that runs them
 * (stable-diffusion.cpp). Shared by the settings page and the server. Every
 * download is a public, ungated file; sizes are checked after download.
 */

export interface LocalFile {
  /** What the file is to the runtime: it decides the command-line flag. */
  role: 'model' | 'diffusion' | 'vae' | 'clip_l' | 'clip_g' | 't5xxl' | 'llm';
  url: string;
  /** Name on disk, inside the model's folder. */
  name: string;
  bytes: number;
}

export interface LocalModel {
  id: string;
  name: string;
  family: string;
  blurb: string;
  /** Which of the app's art styles it does best, best first. */
  goodAt: string[];
  license: string;
  commercial: boolean;
  /** Roughly the graphics memory it wants, in GB. */
  vram: number;
  files: LocalFile[];
  defaults: { steps: number; cfg: number; sampler: string; width: number; height: number; scheduler?: string };
  /** Extra runtime flags it needs. */
  extraArgs?: string[];
  /** Reads only a short prompt well (CLIP text encoders). */
  shortPrompt: boolean;
  /** How an earlier painting steers a new one: as a reference to edit from, or as the starting image. */
  reference: 'edit' | 'img2img';
  negative?: string;
}

export interface RuntimeBuild {
  id: 'cuda' | 'vulkan' | 'cpu';
  label: string;
  url: string;
  bytes: number;
  /** Extra archives unpacked into the same folder (e.g. CUDA runtime libraries). */
  extras?: { url: string; bytes: number }[];
}

const REL = 'https://github.com/leejet/stable-diffusion.cpp/releases/download/master-959-d637cfb';
const hf = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`;

export const RUNTIME = {
  name: 'stable-diffusion.cpp',
  version: 'master-959',
  exe: 'sd-cli.exe',
  builds: [
    {
      id: 'cuda',
      label: 'NVIDIA (CUDA)',
      url: `${REL}/sd-master-d637cfb-bin-win-cuda12-x64.zip`,
      bytes: 338_008_962,
      extras: [{ url: `${REL}/cudart-sd-bin-win-cu12-x64.zip`, bytes: 563_452_046 }],
    },
    { id: 'vulkan', label: 'Any graphics card (Vulkan)', url: `${REL}/sd-master-d637cfb-bin-win-vulkan-x64.zip`, bytes: 30_139_117 },
    { id: 'cpu', label: 'Processor only (slow)', url: `${REL}/sd-master-d637cfb-bin-win-cpu-x64.zip`, bytes: 17_558_769 },
  ] as RuntimeBuild[],
};

/* Shared component files: models that use the same file share one copy on disk. */
const FLUX_AE: LocalFile = { role: 'vae', url: hf('Comfy-Org/z_image_turbo', 'split_files/vae/ae.safetensors'), name: 'ae.safetensors', bytes: 335_304_388 };
const T5_Q8: LocalFile = { role: 't5xxl', url: hf('city96/t5-v1_1-xxl-encoder-gguf', 't5-v1_1-xxl-encoder-Q8_0.gguf'), name: 't5-v1_1-xxl-encoder-Q8_0.gguf', bytes: 5_061_584_064 };
const NEGATIVE = 'text, watermark, signature, logo, frame, border, blurry, lowres, deformed hands, extra limbs, jpeg artifacts';

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    family: '6B · Tongyi',
    blurb: 'The best all-rounder for 8 GB cards: sharp, detailed and fast (8 steps). Leans realistic, so the painted styles suit it best.',
    goodAt: ['painted', 'grim', 'watercolor'],
    license: 'Apache 2.0',
    commercial: true,
    vram: 8,
    files: [
      { role: 'diffusion', url: hf('leejet/Z-Image-Turbo-GGUF', 'z_image_turbo-Q4_K.gguf'), name: 'z_image_turbo-Q4_K.gguf', bytes: 3_864_250_304 },
      FLUX_AE,
      { role: 'llm', url: hf('unsloth/Qwen3-4B-Instruct-2507-GGUF', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'), name: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', bytes: 2_497_281_120 },
    ],
    defaults: { steps: 8, cfg: 1, sampler: 'euler', width: 1024, height: 1024 },
    extraArgs: ['--diffusion-fa', '--offload-to-cpu'],
    shortPrompt: false,
    reference: 'img2img',
  },
  {
    id: 'flux2-klein-4b',
    name: 'FLUX.2 klein',
    family: '4B · Black Forest Labs',
    blurb: 'Small and quick (4 steps), and the best local model at keeping a character the same: it repaints from their approved portrait.',
    goodAt: ['painted', 'anime', 'ink'],
    license: 'Apache 2.0',
    commercial: true,
    vram: 7,
    files: [
      { role: 'diffusion', url: hf('leejet/FLUX.2-klein-4B-GGUF', 'flux-2-klein-4b-Q8_0.gguf'), name: 'flux-2-klein-4b-Q8_0.gguf', bytes: 4_300_629_440 },
      { role: 'vae', url: hf('Comfy-Org/flux2-klein-4B', 'split_files/vae/flux2-vae.safetensors'), name: 'flux2-vae.safetensors', bytes: 336_211_292 },
      { role: 'llm', url: hf('unsloth/Qwen3-4B-GGUF', 'Qwen3-4B-Q4_K_M.gguf'), name: 'Qwen3-4B-Q4_K_M.gguf', bytes: 2_497_281_312 },
    ],
    defaults: { steps: 4, cfg: 1, sampler: 'euler', width: 1024, height: 1024 },
    extraArgs: ['--diffusion-fa', '--offload-to-cpu'],
    shortPrompt: false,
    reference: 'edit',
  },
  {
    id: 'dreamshaper-xl-lightning',
    name: 'DreamShaper XL Lightning',
    family: 'SDXL fine-tune',
    blurb: 'A favourite for fantasy illustration: rich colour, strong character art, one file. Reads short prompts only.',
    goodAt: ['painted', 'anime', 'cartoon', 'grim'],
    license: 'OpenRAIL++',
    commercial: true,
    vram: 7,
    files: [{ role: 'model', url: hf('Lykon/dreamshaper-xl-lightning', 'DreamShaperXL_Lightning.safetensors'), name: 'DreamShaperXL_Lightning.safetensors', bytes: 6_939_220_250 }],
    defaults: { steps: 6, cfg: 2, sampler: 'dpm++2m', scheduler: 'karras', width: 832, height: 1216 },
    negative: NEGATIVE,
    shortPrompt: true,
    reference: 'img2img',
  },
  {
    id: 'chroma1-hd',
    name: 'Chroma1-HD',
    family: '8.9B · FLUX-based',
    blurb: 'Wide artistic range with real negative prompts: good at ink, watercolour and moody oils. Slower (26 steps).',
    goodAt: ['ink', 'watercolor', 'painted', 'grim'],
    license: 'Apache 2.0',
    commercial: true,
    vram: 8,
    files: [{ role: 'diffusion', url: hf('silveroxides/Chroma-GGUF', 'Chroma1-HD/Chroma1-HD-Q4_0.gguf'), name: 'Chroma1-HD-Q4_0.gguf', bytes: 5_432_053_920 }, FLUX_AE, T5_Q8],
    defaults: { steps: 26, cfg: 4, sampler: 'euler', width: 1024, height: 1024 },
    extraArgs: ['--model-args', 'chroma_use_dit_mask=false', '--clip-on-cpu', '--diffusion-fa'],
    negative: NEGATIVE,
    shortPrompt: false,
    reference: 'img2img',
  },
  {
    id: 'flux1-schnell',
    name: 'FLUX.1 schnell',
    family: '12B · Black Forest Labs',
    blurb: 'The classic open FLUX: clean composition and good anatomy in 4 steps. Bigger download; shares its text encoder with Chroma.',
    goodAt: ['painted', 'cartoon', 'anime'],
    license: 'Apache 2.0',
    commercial: true,
    vram: 8,
    files: [
      { role: 'diffusion', url: hf('leejet/FLUX.1-schnell-gguf', 'flux1-schnell-q4_k.gguf'), name: 'flux1-schnell-q4_k.gguf', bytes: 6_884_606_880 },
      FLUX_AE,
      { role: 'clip_l', url: hf('comfyanonymous/flux_text_encoders', 'clip_l.safetensors'), name: 'clip_l.safetensors', bytes: 246_144_152 },
      T5_Q8,
    ],
    defaults: { steps: 4, cfg: 1, sampler: 'euler', width: 1024, height: 1024 },
    extraArgs: ['--clip-on-cpu', '--diffusion-fa'],
    shortPrompt: false,
    reference: 'img2img',
  },
  {
    id: 'qwen-image',
    name: 'Qwen-Image',
    family: '20B · Qwen',
    blurb: 'The strongest open model here, with excellent detail across every style. Needs a 16 GB card, or a lot of patience.',
    goodAt: ['painted', 'ink', 'watercolor', 'anime', 'cartoon', 'grim'],
    license: 'Apache 2.0',
    commercial: true,
    vram: 16,
    files: [
      { role: 'diffusion', url: hf('QuantStack/Qwen-Image-GGUF', 'Qwen_Image-Q4_K_M.gguf'), name: 'Qwen_Image-Q4_K_M.gguf', bytes: 13_065_746_976 },
      { role: 'vae', url: hf('Comfy-Org/Qwen-Image_ComfyUI', 'split_files/vae/qwen_image_vae.safetensors'), name: 'qwen_image_vae.safetensors', bytes: 253_806_246 },
      { role: 'llm', url: hf('mradermacher/Qwen2.5-VL-7B-Instruct-GGUF', 'Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf'), name: 'Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf', bytes: 4_683_072_512 },
    ],
    defaults: { steps: 20, cfg: 2.5, sampler: 'euler', width: 1024, height: 1024 },
    extraArgs: ['--flow-shift', '3', '--offload-to-cpu', '--diffusion-fa'],
    shortPrompt: false,
    reference: 'img2img',
  },
];

export const localModel = (id: string | undefined) => LOCAL_MODELS.find((m) => m.id === id);
export const modelBytes = (m: LocalModel) => m.files.reduce((n, f) => n + f.bytes, 0);
export const gb = (bytes: number) => (bytes < 1024 ** 3 ? `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB` : `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB`);

/** What the server reports about local painting. */
export interface LocalStatus {
  /** Local models run only where the app's server runs on the author's computer. */
  available: boolean;
  dir: string;
  runtime: { installed: boolean; build?: RuntimeBuild['id']; version?: string };
  gpu: { name: string; vramGB: number } | null;
  freeGB: number | null;
  models: Record<string, { installed: boolean; bytesOnDisk: number }>;
  /** Installs in progress (or failed), by model id or 'runtime'. */
  jobs: Record<string, { done: number; total: number; error?: string; file?: string }>;
  /** A painting running now. */
  busy: boolean;
}
