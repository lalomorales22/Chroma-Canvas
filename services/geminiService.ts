import { GoogleGenAI } from '@google/genai';

/**
 * Gemini provider layer. All model ids live here; the API key comes from
 * Settings (localStorage) first, then a build-time .env.local fallback.
 * Functions throw AiError with human-readable messages — the UI toasts them.
 */

export const MODELS = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-2.5-flash-image',
  video: 'veo-3.1-fast-generate-preview',
} as const;

const KEY_STORAGE = 'chromacanvas.gemini-key';

export class AiError extends Error {}

export const getApiKey = (): string => {
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored) return stored;
  } catch {
    /* storage unavailable */
  }
  return process.env.API_KEY || '';
};

export const setApiKey = (key: string): void => {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
};

export const hasApiKey = (): boolean => getApiKey().length > 0;

const getClient = (): GoogleGenAI => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiError('No Gemini API key set. Add one in Settings (gear icon, top right).');
  }
  return new GoogleGenAI({ apiKey });
};

const friendly = (e: unknown, context: string): AiError => {
  if (e instanceof AiError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/API key not valid|API_KEY_INVALID|401/i.test(msg)) {
    return new AiError('Your Gemini API key looks invalid — double-check it in Settings.');
  }
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg)) {
    return new AiError('Gemini quota exceeded — wait a bit or check your plan/billing.');
  }
  if (/safety|blocked/i.test(msg)) {
    return new AiError('The prompt was blocked by safety filters — try rephrasing it.');
  }
  if (/billed users|paid|billing/i.test(msg)) {
    return new AiError('Video generation needs an API key from a paid Google AI project.');
  }
  console.error(`${context}:`, e);
  return new AiError(`${context} failed: ${msg.slice(0, 140)}`);
};

export const testApiKey = async (key: string): Promise<void> => {
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    await ai.models.generateContent({ model: MODELS.text, contents: 'Say "ok".' });
  } catch (e) {
    throw friendly(e, 'Key test');
  }
};

export const generateImage = async (
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' = '16:9',
): Promise<string> => {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: MODELS.image,
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio } },
    });
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
    throw new AiError('Gemini returned no image — try a different prompt.');
  } catch (e) {
    throw friendly(e, 'Image generation');
  }
};

/** Edit an existing image with a natural-language instruction (inpaint/restyle). */
export const editImage = async (
  base64Data: string,
  mimeType: string,
  instruction: string,
): Promise<string> => {
  const ai = getClient();
  const cleanBase64 = base64Data.split(',')[1] || base64Data;
  try {
    const response = await ai.models.generateContent({
      model: MODELS.image,
      contents: {
        parts: [{ inlineData: { data: cleanBase64, mimeType } }, { text: instruction }],
      },
    });
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
    throw new AiError('Gemini returned no edited image — try a different instruction.');
  } catch (e) {
    throw friendly(e, 'Image edit');
  }
};

export const removeBackground = (base64Data: string, mimeType: string): Promise<string> =>
  editImage(
    base64Data,
    mimeType,
    'Remove the background from this image. Return only the main subject on a transparent background. Maintain high quality.',
  );

export const generateVideo = async (
  prompt: string,
  aspectRatio: '16:9' | '9:16' = '16:9',
  onProgress?: (message: string) => void,
): Promise<string> => {
  const ai = getClient();
  try {
    let operation = await ai.models.generateVideos({
      model: MODELS.video,
      prompt,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio },
    });

    let polls = 0;
    while (!operation.done) {
      polls += 1;
      onProgress?.(`Rendering video… (${polls * 5}s)`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new AiError('Veo finished but returned no video — the prompt may have been filtered.');
    }
    onProgress?.('Downloading video…');
    const response = await fetch(`${downloadLink}&key=${getApiKey()}`);
    if (!response.ok) throw new AiError(`Video download failed (HTTP ${response.status}).`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    throw friendly(e, 'Video generation');
  }
};

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

/** Experimental: transcribe clip audio into timed caption segments. */
export const transcribeToCaptions = async (
  base64Audio: string,
  mimeType: string,
): Promise<CaptionSegment[]> => {
  const ai = getClient();
  const cleanBase64 = base64Audio.split(',')[1] || base64Audio;
  try {
    const response = await ai.models.generateContent({
      model: MODELS.text,
      contents: {
        parts: [
          { inlineData: { data: cleanBase64, mimeType } },
          {
            text: 'Transcribe this audio into caption segments. Return ONLY a JSON array like [{"start": 0.0, "end": 2.5, "text": "..."}] with times in seconds. Keep each segment under 8 words.',
          },
        ],
      },
      config: { responseMimeType: 'application/json' },
    });
    const raw = response.text ?? '[]';
    const parsed = JSON.parse(raw) as CaptionSegment[];
    if (!Array.isArray(parsed)) throw new AiError('Transcription returned unexpected data.');
    return parsed
      .filter((s) => typeof s.start === 'number' && typeof s.end === 'number' && s.text)
      .map((s) => ({ start: Math.max(0, s.start), end: Math.max(s.start + 0.5, s.end), text: s.text }));
  } catch (e) {
    throw friendly(e, 'Caption generation');
  }
};

export const generateTitleText = async (prompt: string): Promise<string> => {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: MODELS.text,
      contents: `Generate a short, catchy 3-5 word title for a video about: "${prompt}"`,
    });
    const text = response.text;
    return text ? text.replace(/"/g, '').trim() : 'New Text Layer';
  } catch (e) {
    throw friendly(e, 'Title generation');
  }
};
