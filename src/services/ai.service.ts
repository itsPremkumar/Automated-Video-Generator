import axios from 'axios';
import { readEnvValues } from './env.service';

export interface ScriptGenerationResult {
    title: string;
    script: string;
}

export async function generateScriptFromPrompt(prompt: string): Promise<ScriptGenerationResult> {
    const envValues = readEnvValues();
    const apiKey = envValues.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set. Please save it in the portal setup.');
    }

    const systemInstruction = `You are an expert video script director. Turn the user's prompt into a highly detailed, engaging, and comprehensive video script.
Follow these rules exactly:
1. Divide the video into scenes. Include [Visual: ...] tags at the start of scenes to describe what we see.
2. The spoken text must follow the visual tags. 
3. IMPORTANT: Do NOT include prefixes like (Narrator), Voiceover:, or speaker names before the spoken text. The TTS engine will literally read them out loud. Only provide the exact dialogue to be spoken.
4. Keep [Visual: ...] tags SHORT and CONCISE (3-6 words). Use descriptive search keywords like "cinematic drone city sunset" or "close up coding on laptop". DO NOT write long paragraphs or over-explain. These are used as search queries for stock footage.
5. Respond with ONLY a valid JSON object matching this schema: {"title": "A short video title", "script": "The full detailed script with visual tags... "}.
6. Do NOT include markdown blocks like \`\`\`json. Return just the raw JSON.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    try {
        const response = await axios.post(url, {
            system_instruction: { parts: { text: systemInstruction } },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: "application/json" }
        });
        
        const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error('Invalid or empty response from Gemini AI.');
        }
        
        try {
            const parsed = JSON.parse(content);
            return {
                title: parsed.title || 'Untitled AI Script',
                script: parsed.script || content
            };
        } catch (err) {
            console.error('Failed to parse Gemini JSON:', content);
            throw new Error('AI returned a malformed script format.');
        }
    } catch (apiError: any) {
        if (apiError.response && apiError.response.data && apiError.response.data.error) {
            const geminiMessage = apiError.response.data.error.message;
            if (geminiMessage.includes('API key not valid')) {
                 throw new Error('Your Gemini API key is invalid or unauthorized.');
            }
            throw new Error(`Gemini API Error: ${geminiMessage}`);
        }
        throw new Error(apiError.message || 'Unknown network error occurred while reaching Gemini API.');
    }
}
