
import { GoogleGenAI } from "@google/genai";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API Key is missing");
        return null;
    }
    return new GoogleGenAI({ apiKey });
};

export const generateImageDescription = async (prompt: string): Promise<string> => {
    const ai = getClient();
    if (!ai) return "A placeholder image";

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Describe a scene for a video background based on this idea: "${prompt}". Keep it visual and concise (under 30 words).`,
        });
        return response.text || prompt;
    } catch (e) {
        console.error("Gemini Text Gen Error:", e);
        return prompt;
    }
};

export const generateImage = async (prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" = "1:1"): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio
                }
            }
        });
        
        if (response.candidates?.[0]?.content?.parts) {
             for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64 = part.inlineData.data;
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    return `data:${mimeType};base64,${base64}`;
                }
             }
        }
        return null;
    } catch (e) {
        console.error("Gemini Image Gen Error:", e);
        return null;
    }
};

export const removeBackground = async (base64Data: string, mimeType: string): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    // Remove data URL prefix if present
    const cleanBase64 = base64Data.split(',')[1] || base64Data;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: cleanBase64,
                            mimeType: mimeType
                        }
                    },
                    { text: "Remove the background from this image. Return only the main subject on a transparent background. Maintain high quality." }
                ]
            }
        });

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (e) {
        console.error("Gemini Remove BG Error:", e);
        return null;
    }
};

export const generateVideo = async (prompt: string, aspectRatio: "16:9" | "9:16" = "16:9"): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: aspectRatio
            }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) return null;

        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Veo Video Gen Error:", e);
        return null;
    }
};

export const generateAssetUrl = async (prompt: string, type: 'image' | 'text'): Promise<string> => {
    if (type === 'text') {
        const ai = getClient();
        if (!ai) return "New Text Layer";
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Generate a short, catchy 3-5 word title for a video about: "${prompt}"`,
            });
            const text = response.text;
            return text ? text.replace(/"/g, '').trim() : "New Text Layer";
        } catch (e) {
            return "New Text Layer";
        }
    }
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1280/720`;
};
