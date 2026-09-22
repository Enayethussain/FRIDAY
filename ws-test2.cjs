const { GoogleGenAI } = require('@google/genai');
async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: "AIzaSy%InvalidKey" });
    const session = await ai.live.connect({ model: 'gemini-3.1-flash-live-preview' });
    console.log("Connected successfully");
    session.disconnect();
  } catch (e) {
    console.log("CAUGHT ERROR:", e.stack);
  }
}
run();
