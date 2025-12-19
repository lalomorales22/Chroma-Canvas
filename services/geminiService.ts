
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
    if (!ai) return "A placeholder image due to missing API key";

    try {
        const response = await ai.models.generateContent({
            // Use gemini-3-flash-preview for basic text tasks like description generation
            model: 'gemini-3-flash-preview',
            contents: `Describe a scene for a video background based on this idea: "${prompt}". Keep it visual and concise (under 30 words).`,
        });
        // Access .text property directly as per guidelines
        return response.text || prompt;
    } catch (e) {
        console.error("Gemini Text Gen Error:", e);
        return prompt;
    }
};

export const generateImage = async (prompt: string): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const response = await ai.models.generateContent({
            // Use gemini-2.5-flash-image for general image generation
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: prompt }]
            }
        });
        
        // Iterate through all parts to find the image part, do not assume order
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

export const generateAssetUrl = async (prompt: string, type: 'image' | 'text'): Promise<string> => {
    if (type === 'text') {
        const ai = getClient();
        if (!ai) return "Sample Text Overlay";
        try {
            const response = await ai.models.generateContent({
                // Use gemini-3-flash-preview for basic text tasks
                model: 'gemini-3-flash-preview',
                contents: `Generate a short, catchy 3-5 word title for a video about: "${prompt}"`,
            });
            const text = response.text;
            return text ? text.replace(/"/g, '').trim() : "New Text Layer";
        } catch (e) {
            return "New Text Layer";
        }
    }

    // Fallback for image if strict generation not used here, but we prefer generateImage now
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1280/720`;
};
