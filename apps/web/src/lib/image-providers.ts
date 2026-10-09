/** The image services Questwright can paint with. Shared by the settings page and the server. */

export type ImageProvider = 'gemini' | 'openai' | 'flux';
export type ImageQuality = 'final' | 'draft';

export interface ProviderInfo {
  id: ImageProvider;
  label: string;
  company: string;
  blurb: string;
  /** Model per quality; the server can override them with QW_IMAGE_MODEL_<ID>_<QUALITY>. */
  models: Record<ImageQuality, string>;
  /** Estimated US dollars per image. */
  cost: Record<ImageQuality, number>;
  /** Most reference images one request may carry. */
  maxRefs: number;
  /** Environment variable the server reads the key from. */
  env: string;
  keyHint: string;
  keyUrl: string;
}

export const PROVIDERS: Record<ImageProvider, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Nano Banana Pro',
    company: 'Google Gemini',
    blurb: 'Best at keeping a character and a house style consistent across paintings.',
    models: { final: 'gemini-3-pro-image', draft: 'gemini-3.1-flash-image' },
    cost: { final: 0.134, draft: 0.067 },
    maxRefs: 8,
    env: 'GEMINI_API_KEY',
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    id: 'openai',
    label: 'GPT Image',
    company: 'OpenAI',
    blurb: 'Top image quality and transparent backgrounds; a bit dearer at full quality.',
    models: { final: 'gpt-image-2.5-sunburst', draft: 'gpt-image-2.5-sunburst' },
    cost: { final: 0.17, draft: 0.04 },
    maxRefs: 8,
    env: 'OPENAI_API_KEY',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  flux: {
    id: 'flux',
    label: 'FLUX.2 pro',
    company: 'Black Forest Labs',
    blurb: 'The cheapest good painter, with up to 8 references. Slower to come back.',
    models: { final: 'flux-2-pro', draft: 'flux-2-pro' },
    cost: { final: 0.06, draft: 0.03 },
    maxRefs: 8,
    env: 'BFL_API_KEY',
    keyHint: 'bfl_… or a key id',
    keyUrl: 'https://dashboard.bfl.ai/',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ImageProvider[];
