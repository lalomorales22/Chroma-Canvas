import { AiError, generateImage as generateWithGemini, hasApiKey as hasGeminiKey } from './geminiService';
import { dataURLToBlob } from '../utils/media';

/**
 * Image generation providers for the Image Generator Studio.
 *
 * - pollinations: free, no API key (Flux-based, image.pollinations.ai)
 * - gemini:       Google Gemini image model (key from Settings)
 * - openai:       gpt-image-1 with DALL·E 3 fallback (OpenAI key from Settings)
 */

export type ImageProvider = 'pollinations' | 'gemini' | 'openai';

export type AspectRatio = '16:9' | '9:16';

const PROVIDER_STORAGE = 'chromacanvas.image-provider';
const OPENAI_KEY_STORAGE = 'chromacanvas.openai-key';

export const IMAGE_PROVIDERS: { id: ImageProvider; label: string; needsKey: boolean }[] = [
  { id: 'pollinations', label: 'Free (Pollinations)', needsKey: false },
  { id: 'gemini', label: 'Google Gemini', needsKey: true },
  { id: 'openai', label: 'OpenAI', needsKey: true },
];

export const getImageProvider = (): ImageProvider => {
  try {
    const stored = localStorage.getItem(PROVIDER_STORAGE) as ImageProvider | null;
    if (stored && IMAGE_PROVIDERS.some((p) => p.id === stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return 'pollinations';
};

export const setImageProvider = (provider: ImageProvider): void => {
  try {
    localStorage.setItem(PROVIDER_STORAGE, provider);
  } catch {
    /* storage unavailable */
  }
};

export const getOpenAiKey = (): string => {
  try {
    return localStorage.getItem(OPENAI_KEY_STORAGE) || '';
  } catch {
    return '';
  }
};

export const setOpenAiKey = (key: string): void => {
  try {
    if (key) localStorage.setItem(OPENAI_KEY_STORAGE, key);
    else localStorage.removeItem(OPENAI_KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
};

export const providerIsReady = (provider: ImageProvider): boolean => {
  if (provider === 'pollinations') return true;
  if (provider === 'gemini') return hasGeminiKey();
  return getOpenAiKey().length > 0;
};

// ---------------------------------------------------------------------------

const generateWithPollinations = async (prompt: string, aspect: AspectRatio): Promise<Blob> => {
  const [width, height] = aspect === '9:16' ? [768, 1344] : [1344, 768];
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new AiError(
      `Free image service returned an error (HTTP ${res.status}). It can be busy — try again in a moment.`,
    );
  }
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new AiError('Free image service returned no image — try rephrasing the prompt.');
  }
  return blob;
};

const openAiRequest = async (
  key: string,
  model: string,
  prompt: string,
  size: string,
): Promise<Blob> => {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      ...(model === 'dall-e-3' ? { response_format: 'b64_json' } : {}),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message: string = json?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new AiError('Your OpenAI API key looks invalid — check Settings.');
    if (res.status === 429) throw new AiError('OpenAI rate limit / quota hit — try again shortly.');
    throw new AiError(`OpenAI (${model}): ${message.slice(0, 160)}`);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new AiError('OpenAI returned no image data.');
  return dataURLToBlob(`data:image/png;base64,${b64}`);
};

const generateWithOpenAi = async (prompt: string, aspect: AspectRatio): Promise<Blob> => {
  const key = getOpenAiKey();
  if (!key) throw new AiError('No OpenAI API key set — add one in Settings.');
  try {
    // gpt-image-1 sizes: 1536x1024 landscape / 1024x1536 portrait
    return await openAiRequest(key, 'gpt-image-1', prompt, aspect === '9:16' ? '1024x1536' : '1536x1024');
  } catch (e) {
    // Some accounts don't have gpt-image-1 access yet — fall back to DALL·E 3.
    if (e instanceof AiError && /model|verif|access|does not exist/i.test(e.message)) {
      return openAiRequest(key, 'dall-e-3', prompt, aspect === '9:16' ? '1024x1792' : '1792x1024');
    }
    throw e;
  }
};

/** Generate an image with the given provider; returns a Blob ready to store. */
export const generateImageBlob = async (
  provider: ImageProvider,
  prompt: string,
  aspect: AspectRatio,
): Promise<Blob> => {
  switch (provider) {
    case 'pollinations':
      return generateWithPollinations(prompt, aspect);
    case 'openai':
      return generateWithOpenAi(prompt, aspect);
    case 'gemini': {
      const dataUrl = await generateWithGemini(prompt, aspect);
      return dataURLToBlob(dataUrl);
    }
  }
};
