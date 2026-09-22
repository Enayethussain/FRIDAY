import { GoogleGenAI, Modality } from '@google/genai';
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('No API key'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });
const session = await ai.live.connect({
  model: 'gemini-3.1-flash-live-preview',
  config: { responseModalities: [Modality.AUDIO] },
  callbacks: {
    onopen: () => console.log('Open'),
    onmessage: (m) => console.log('Message', JSON.stringify(m).substring(0,100)),
    onerror: (e) => console.error('Error', e),
    onclose: (e) => console.log('Close Event:', e)
  }
});
setTimeout(() => { session.close(); process.exit(0); }, 5000);
