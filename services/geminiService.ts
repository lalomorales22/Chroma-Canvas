
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
            model: 'gemini-2.5-flash',
            contents: `Describe a scene for a video background based on this idea: "${prompt}". Keep it visual and concise (under 30 words).`,
        });
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
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: prompt }]
            }
        });
        
        // Iterate through parts to find the image
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
                model: 'gemini-2.5-flash',
                contents: `Generate a short, catchy 3-5 word title for a video about: "${prompt}"`,
            });
            return response.text.replace(/"/g, '').trim();
        } catch (e) {
            return "New Text Layer";
        }
    }

    // Fallback for image if strict generation not used here, but we prefer generateImage now
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1280/720`;
};
