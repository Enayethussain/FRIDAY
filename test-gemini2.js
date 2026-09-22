import { GoogleGenAI } from '@google/genai';
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('No API key'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });
const result = await ai.models.generateContent({
  model: 'gemini-3.6-flash',
  contents: 'Hello',
});
console.log(result.text);
