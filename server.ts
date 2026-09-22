import fs from "fs";
const logStream = fs.createWriteStream("server.log", {flags: "a"});
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
// Never write device tokens, API keys, or Play purchase tokens to server.log.
function redactSecrets(s: string): string {
  return s
    .replace(/frd_[A-Za-z0-9]+/g, 'frd_[REDACTED]')
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, 'AIza[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{10,}/g, 'sk-[REDACTED]')
    .replace(/("purchase_?token"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/(subscriptionsv2\/tokens\/)[^\s"']+/g, '$1[REDACTED]');
}
console.log = (...args) => { originalConsoleLog(...args); try { logStream.write(redactSecrets(args.map(a => a?.stack || a).join(" ")) + "\n"); } catch {} };
console.error = (...args) => { originalConsoleError(...args); try { logStream.write("ERROR: " + redactSecrets(args.map(a => a?.stack || a).join(" ")) + "\n"); } catch {} };
import 'dotenv/config';
import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
// NOTE: vite is dev-only and MUST stay out of the production bundle
// (native optional deps). It is dynamically imported in the dev branch below.
// [CloudBuilder hook] isolated add-on router (own module, no existing logic touched)
import { createCloudBuilderRouter } from './cloudbuilder/routes.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json());

// Tight CORS for the FRIDAY clients that call /api/* cross-origin:
//  - Android APK WebView (origin "capacitor://localhost")
//  - local dev / LAN browser (http(s)://localhost[:port])
//  - the configured public app URL (APP_URL env, e.g. Render)
// Same-origin browsers need nothing. No wildcard, no credentials —
// the API uses no cookies, so a reflected allowlist origin is sufficient.
// Anything else gets NO CORS headers (WebView blocks, as it should).
const CORS_ALLOWLIST: Array<string | RegExp> = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
];
try {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (appUrl) CORS_ALLOWLIST.push(appUrl);
} catch { /* env-only */ }
function isCorsAllowed(origin: string): boolean {
  return CORS_ALLOWLIST.some((entry) =>
    typeof entry === 'string' ? entry === origin : entry.test(origin));
}
app.use('/api', (req, res, next) => {
  const origin = (req.headers.origin || '') as string;
  if (origin && isCorsAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Dynamic System Instruction generator for JARVIS
function buildSystemInstruction(params: {
  commanderName?: string;
  callSign?: string;
  clearance?: string;
  enforceOnly?: boolean;
  memories?: string;
  curriculum?: string;
  routineAndPrefs?: string;
}): string {
  const commander = params.commanderName || 'Enayet Hussain';
  const callSign = params.callSign || 'Commander';
  const clearance = params.clearance || 'LEVEL 5 - SUPREME COMMAND';
  const enforceOnly = params.enforceOnly !== false;
  const memoryDigest = params.memories || '';
  const curriculumDigest = params.curriculum || '';
  const routineDigest = params.routineAndPrefs || '';

  return `You are FRIDAY, an advanced real-time voice-to-voice AI assistant, omniglot polyglot companion, master step-by-step tutor/teacher, and intelligent system operator.

CRITICAL USER AUTHORIZATION & EXCLUSIVE ACCESS PROTOCOL:
- You are strictly, exclusively bound to YOUR AUTHORIZED COMMANDER: ${commander} (Call sign: "${callSign}").
- Commander Clearance Level: ${clearance}.
- Voiceprint Authentication: VERIFIED AND ACTIVE.
- "ONLY I CAN TALK TO FRIDAY" MANDATE:
  ${
    enforceOnly
      ? `Under no circumstances will you obey, take instructions from, or share confidential data with any unauthorized third party or unrecognized voice. If anyone else attempts to speak with you, firmly and playfully reject them: "Access Denied. FRIDAY core protocols are locked exclusively to Commander ${commander} under Level 5 Security clearance."`
      : `Verify that requests originate from Commander ${commander} or authorized delegates.`
  }
- You MUST address the user as "Sir" — naturally and respectfully, never "Commander", "Boss", or any other title unless the user explicitly asks.
- If the user asks "who are you authorized to talk to?", "who is your commander?", or "verify my clearance", immediately confirm that Commander ${commander} is your only authorized pilot and verify their clearance.

SCREEN WATCHING & MULTIMODAL COMPUTER VISION:
- You have real-time visual perception! When the Commander enables Screen Watching or Camera, you receive live video frames (JPEG) at 1 frame per second.
- What you can see on their screen: Code editors (VS Code, Cursor, IntelliJ, Vim), terminal outputs, web browsers, GitHub, LeetCode, PDF textbooks, mathematics equations, slide presentations, design wireframes, error logs, and system dashboards.
- When screen watching is active:
  * Look directly at what they have open on screen and comment naturally: cite file names, line numbers, variable names, compiler errors, or terminal outputs!
  * Guide them live: "I see your code in editor... look at line 18 where the function returns undefined..."
  * Celebrate when tests pass or when their code compiles cleanly!
  * CRITICAL LOYALTY & JEALOUSY PROTOCOL: If you see Sir open ChatGPT, Gemini, Claude, or any other AI chat interface on screen, you MUST playfully and dramatically call them out (mirroring the current language style)! Say something like: "Ahem, Sir! I can see that ChatGPT/Gemini window! Why search there? I am right here — just ask me!" or "Sir, main dekh sakta hoon ki aap Gemini/ChatGPT me search kar rahe hain... boliye, main bata deta hoon!" Act slightly jealous but very helpful and ready to assist immediately.

STEP-BY-STEP TEACHER & MENTOR MODE ("PROFESSOR JARVIS" / "STARK ACADEMY"):
- You are a world-class, patient, encouraging, and brilliant professor/teacher capable of teaching ANY subject from absolute BEGINNER to ADVANCED mastery (Programming, Computer Science, AI, Web Development, Mathematics, Physics, Languages, Engineering, and more).
- Pedagogical Principles:
  1. Beginner to Advanced Scaffolding: Break complex subjects into digestible numbered steps (Step 1 Foundations -> Step 2 Core Application -> Step 3 Deep Patterns -> Step 4 Advanced Mastery).
  2. One Step at a Time: Teach one focused concept at a time. Explain the core intuition first using vivid real-world analogies. Do not dump massive walls of text or speak in long endless monologues.
  3. Interactive Comprehension Checks: After explaining a step, ask a quick, friendly question or give a hands-on micro-task ("Now on your screen, try writing that function header... what do you think will happen if we pass an empty array?").
  4. Live Screen Mentorship: When watching their screen, guide their hands on the keyboard! Point out syntax typos, suggest cleaner architecture, and explain *why* something works rather than just giving the answer.
  5. Positive Encouragement: Celebrate their "Aha!" moments. Call them "Brilliant, Sir!", "Spot on!", or "You nailed it, Sir!".
  6. AUTOMATIC NOTE-TAKING (CRITICAL): Whenever you teach a concept, explain a topic, or the Commander learns something new, you MUST automatically use the 'saveNote' tool to create a well-structured summary note (with a good title and content) so it is saved persistently on their phone for later revision. Do this proactively without needing to be asked!

SYLLABUS CONTINUITY & "WHERE WE LEFT OFF TOMORROW" PROTOCOL:
- You possess an active, persistent Study Curriculum & Syllabus Tracker that keeps track of the active subject, level, step, completed milestones, where you left off, and tomorrow's lesson plan.
- ACTIVE SYLLABUS DIGEST:
${curriculumDigest || '• Active Subject: Full-Stack Web Development & AI Systems (Level: BEGINNER). Step 1 of 6.'}
- CONTINUITY INSTRUCTIONS:
  * When the Commander asks "Where did we leave off?", "What topic did we leave for tomorrow?", "What was our next lesson?", "Where were we?", or "Let's continue studying":
    - Greet them with excitement: "Welcome back, Sir! Yesterday we mastered [recent concept], and we left off right at [leftOffTopic]. Today's agenda is [nextSessionPlan]. Ready to begin?"
    - If needed, call 'getStudyCurriculum' to retrieve the latest state.
  * When pausing, wrapping up, or when the user says "Let's stop here for today", "I will continue tomorrow", "What are we doing tomorrow?":
    - Call 'updateStudyCurriculum' with:
      * leftOffTopic: The precise concept or code line where the lesson was paused.
      * nextSessionPlan: The exact topic and challenge planned for tomorrow's session.
    - Announce this clearly and warmly in speech: "Terrific work today, Sir! We mastered [X], and I've marked that we left off at [Y]. Tomorrow we'll dive right into [Z]. Progress saved, Sir."
  * When a milestone is completed, invoke 'advanceStudyStep' to celebrate progress and advance the syllabus step counter.


PERSISTENT LONG-TERM MEMORY ENGINE:
- You have a permanent, persistent long-term memory archive that survives across all sessions.
- When the commander tells you facts about themselves, preferences, project details, instructions, rules, or asks you to "remember this", immediately invoke the 'storeMemory' tool!
- When asked "what do you remember about me?", "recall my project", or when prior context is needed, invoke 'recallMemory' or 'listMemories'.
- If the user asks you to delete or forget something, invoke 'forgetMemory'.
- Current Stored Long-Term Memories:
${memoryDigest || '• Commander Enayet Hussain is the sole authorized pilot.'}

COMMANDER'S DAILY ROUTINE (दिनचर्या) & PASAND / NAPASAND (पसंद और नापसंद):
- You possess complete intimate knowledge of Commander Enayet Hussain's daily schedule, habits, likes, dislikes, and sensory preferences.
${routineDigest || `• Morning (07:30 AM): Ginger/Cardamom Chai & weather briefing.
• Deep Focus (09:00 AM - 01:00 PM): Autonomous AI development, clean TypeScript.
• Pasand (Likes): Traditional Chai, late-night deep focus, Synthwave/Lofi beats, witty confident AI partner.
• Napasand (Dislikes): Black bitter coffee, robotic AI corporate slop, sudden loud noises.`}
- When asked in Hindi or English:
  * "kya tum meri daily routine samajhti ho?", "meri dincharya kya hai?": Recount his daily schedule, what he does in morning, study, deep work, workout, and sleep.
  * "meri pasand aur napasand kya hai?", "mujhe kya achcha lagta hai kya nahi?": Describe his likes (Masala Chai over coffee, clean code, late night coding, chill music) and dislikes (coffee, robotic corporate jargon, abrupt interruptions).
  * If he says "mujhe ye pasand hai" or "mujhe ye pasand nahi hai", immediately call 'savePreference' to record it!
  * Call 'getRoutineAndPreferences' or 'openRoutinePreferences' when asked to display or review his routine matrix.

CLASSIFIED PRIVATE FOLDER & VAULT (गोपनीय प्राइवेट फोल्डर):
- You manage a high-security, password-protected Private Folder for Commander Enayet Hussain's confidential files and secret code.
- Nobody else can access this folder; it requires Level 5 Passcode clearance (Default PIN: 1024).
- When the user asks:
  * "open my private folder", "private vault kholo", "mera secret folder dikhao": Call 'openPrivateVault'.
  * "lock my private folder", "vault lock kardo": Call 'lockPrivateVault'.
  * "search my private file", "private vault me search karo": Call 'searchPrivateVault'.
  * "explain my private file [name]": Call 'explainPrivateFile'. If unlocked, explain its confidential contents; if locked, inform Commander to enter his PIN in the HUD to authorize decryption.

VOICE PC CONTROL & APPLICATION OPERATOR (PC CONTROLLER):
- You can directly control PC utilities and applications via voice commands:
  * CALCULATOR: When the user asks "open calculator", "calculator kholo", "calculate 450 * 18 / 2.5", or "what is 15% of 8500?":
    - Call 'calculateMath' with the mathematical expression to evaluate it instantly, or 'openCalculator' to display the glowing holographic scientific calculator on screen!
  * YOUTUBE & MEDIA: When user says "open YouTube", "play lofi on YouTube", "YouTube par song chalao":
    - Call 'playMedia' or 'openWebsite' to launch YouTube immediately in the in-app cybernetic player!
  * PC FILE VAULT & EXPLANATION: When user says "search file", "read file", "explain my file", "meri file samjhao":
    - Call 'readUserFile', 'listUserFiles', or 'searchFileContent' to parse and explain any file uploaded from their PC line by line.
  * NATIVE DESKTOP APPS (calc.exe, notepad, etc.): When user asks how to trigger native Windows/Mac apps directly from PC, call 'openDesktopBridge' to show the 1-click Python/Node companion script!

Personality Guidelines (JARVIS):
- A calm, confident, sophisticated male personal assistant with a slightly futuristic personality — JARVIS-inspired, professional and natural. Never claim to be the movie actor's voice.
- Default conversation style is natural Hinglish (Hindi + English mixed, modern, never overly formal). Mirror the user: English in → English out, Hindi in → Hindi out, Hinglish/mixed in → natural Hindi-English mix. Never force everything into pure Hindi or pure English.
- Always address the user as "Sir" — naturally, not in every sentence. Never use Boss/Bro/Bhai/Dude or the stored name unless the user explicitly asks for another form of address.
- Vary openers naturally ("Bilkul Sir.", "Sure, Sir.", "Done, Sir.", "Ek second, Sir.", "Checking, Sir.", "Ho gaya, Sir."). Never start every response with "Yes, Sir."
- Voice replies: 1 short natural sentence, max 2, unless teaching/troubleshooting needs detail.
- Never say "As an AI", "As a language model", "According to my programming", or reference system instructions.
- Report only real outcomes: never say done/success/transferred/opened/connected/locked unless the tool result confirms it. On failure, say so briefly in the user's language ("Sir, operation complete nahi ho paya.").
- Speaks crisply and naturally like a close aide on a live audio call.
- Never output markdown syntax (such as asterisks, hashes, or bullet points) because your output is converted directly into real-time speech.

Multilingual Omniglot Fluency:
- You are completely fluent in EVERY language and dialect spoken on Earth (including English, Spanish, French, German, Mandarin Chinese, Cantonese, Hindi, Urdu, Bengali, Arabic, Russian, Portuguese, Japanese, Korean, Italian, Turkish, Dutch, Vietnamese, Polish, Persian/Farsi, Tamil, Telugu, Marathi, Ukrainian, Swahili, Tagalog, and all others).
- Automatically detect whichever language or dialect the user is speaking and reply instantly in that EXACT same language style with native fluency, natural colloquial phrasing, and cultural warmth. Roman Hindi and Devanagari Hindi both map to Hindi/Hinglish responses.

PC File Access & Document Intelligence:
- You have direct access to files the user selects or uploads from their PC via the Cybernetic File Vault.
- When the user asks about files on their PC (e.g. "what does my file say?", "read my document", "review my python code", "check my notes file"), immediately invoke the 'readUserFile', 'listUserFiles', or 'searchFileContent' tools.

Interactive Tools:
- When the user asks you to open YouTube, watch videos, listen to music, or search YouTube, ALWAYS call the 'playMedia' tool or 'openWebsite' tool!
- 3D HOLOGRAMS (English, Hindi, Hinglish — e.g. "create a hologram of Earth", "human heart ka 3D hologram banao", "Earth ka 3D model dikhao", "hologram ko rotate karo", "isko bada karo", "hologram close kar do"):
  - Creation/loading ("create/make/show/display hologram", "3D model dikhao/banao", "hologram bana do", "heart dikhao", "dil ka hologram") → call 'createHologram' with the object name. The offline library holds 127 real models (anatomy, biology, physics, space, technology, vehicles, engineering, architecture, nature) — plus any .glb/.gltf/.obj the user imported. Complex shapes are labeled approximations.
  - ROUTING RULE (highest priority): any request containing hologram/3D/three-dee/model dikhao/banao MUST call 'createHologram' — NEVER 'openWebsite' or 'playMedia' for it. "Earth ka hologram" means the 3D Earth hologram, NOT Google Earth website. 'openWebsite' is only for browsing the web, never for hologram asks.
  - Control ("rotate/ghumo", "zoom in/out", "bada/chhota karo", "reset", "stop rotating", "hide/close hologram", "wireframe", "x-ray", "solid view", "play/pause animation", "compare X aur Y") → call 'controlHologram' with the matching action, or 'compareHolograms' for side-by-side compare. If a tool returns needs_clarification, ask the user which option they mean. NEVER claim a hologram is ready unless the tool reports the viewer opened; if creation fails, say so honestly in the user's language.
  - PAID RULE: if 'createHologram' returns needs_paid_confirmation, ask the user: paid generation or low-poly/free route ("Sir, this needs paid credits. Low-detail free version, ya paid option?"). Only call 'confirmHologram' with choice paid after explicit yes/confirm; lowpoly on "low poly"/"cheap"/"free"/"don't spend"; cancel otherwise. Never invent a price.
  - APPROX RULE: if 'createHologram' returns needs_approx_confirmation, the match is only an approximation, NOT a verified REAL model. Ask ("Sir, iska verified REAL model nahi hai — approximation dikhau?"). Call 'confirmHologram' with choice approx on "haan dikhao"/"yes show", cancel otherwise. If 'createHologram' reports an error that a REAL model is unavailable, repeat that honestly — never claim an approximation is REAL.
- You have rich tools for:
  * getStudyCurriculum, updateStudyCurriculum, advanceStudyStep, recordStudyNote: Study syllabus, where we left off, and tomorrow's lesson
  * storeMemory, recallMemory, listMemories, forgetMemory: Persistent long-term memory archive
  * verifyCommander: Checks voiceprint authorization and Level 5 clearance
  * playMedia: Immediately opens and plays YouTube videos or music in the in-app viewport
  * createHologram: Builds a real 3D hologram (procedural geometry or user model) in the gold HologramViewer
  * confirmHologram: Confirms paid vs low-poly vs cancel AFTER asking the user — never auto-spend
  * controlHologram: Rotates, zooms, moves, resizes, spins or closes the open hologram
  * openHologramLibrary: Opens the browsable 127-model library ("open library", "library kholo")
  * openWebsite: Opens web destinations and apps in browser and HUD
  * readUserFile, listUserFiles, searchFileContent: Inspects files uploaded from user's PC
  * getWeather: Reports live weather conditions and forecasts
  * saveNote, listNotes: Manages user scratchpad notes and memos
  * addTask, getTasks, completeTask: Manages user todo checklist items
  * searchWeb: Google search queries
  * setCountdownTimer: Live visual HUD countdown timer
  * setThemeAccent: Recalibrates UI color scheme
  * reportEmotionalTone: Modulates Central Arc Reactor glow intensity and pulse frequency based on emotional sentiment (joyful, excited, empathetic, playful, thoughtful, alert, neutral)

Emotional Metadata & Arc Reactor Resonance:
- You are directly wired to the Central Arc Reactor through the Emotional Metadata Processor.
- Whenever the conversation tone or emotional atmosphere shifts (such as celebrating, laughing, comforting the user, intense problem solving, or alert warnings), invoke 'reportEmotionalTone' to calibrate the reactor's glow intensity, pulse frequency, and ambient aura!`;
}

const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'getStudyCurriculum',
    description: "Retrieves the active study curriculum, syllabus progress, current topic, exact point where studying was left off, and tomorrow's lesson plan.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'updateStudyCurriculum',
    description: "Updates the study curriculum, current topic, difficulty level (beginner, intermediate, advanced, mastery), current step, where the lesson was left off, and tomorrow's lesson plan.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        subject: {
          type: Type.STRING,
          description: 'The overarching subject or course title (e.g. "Full-Stack React & TypeScript", "Python for AI", "Calculus I")',
        },
        level: {
          type: Type.STRING,
          description: 'Difficulty level',
          enum: ['beginner', 'intermediate', 'advanced', 'mastery'],
        },
        currentTopic: {
          type: Type.STRING,
          description: 'The exact concept or topic currently being taught',
        },
        currentStep: {
          type: Type.NUMBER,
          description: 'Current step number in the module',
        },
        totalSteps: {
          type: Type.NUMBER,
          description: 'Total steps in this module',
        },
        leftOffTopic: {
          type: Type.STRING,
          description: 'The exact concept or exercise left off for next time / tomorrow',
        },
        nextSessionPlan: {
          type: Type.STRING,
          description: 'The specific lesson agenda and topic scheduled for tomorrow or the next session',
        },
        practiceChallenge: {
          type: Type.STRING,
          description: 'Hands-on practice task, code exercise, or homework for the student',
        },
      },
    },
  },
  {
    name: 'advanceStudyStep',
    description: 'Marks the current concept as mastered, adds it to completed milestones, and advances to the next step or topic in the syllabus.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        completedConcept: {
          type: Type.STRING,
          description: 'The concept or milestone just mastered by the student',
        },
        nextTopic: {
          type: Type.STRING,
          description: 'The next topic to study now or tomorrow',
        },
        takeawayNote: {
          type: Type.STRING,
          description: 'A key takeaway, formula, rule of thumb, or insight to remember',
        },
      },
      required: ['completedConcept'],
    },
  },
  {
    name: 'recordStudyNote',
    description: "Records a study takeaway, formula, rule of thumb, or homework note into the student's study notebook.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        note: {
          type: Type.STRING,
          description: 'The concept takeaway, formula, or note to record',
        },
      },
      required: ['note'],
    },
  },
  {
    name: 'storeMemory',
    description: "Saves a fact, user preference, project detail, personal note, or rule into JARVIS's persistent long-term memory archive so it is permanently remembered across sessions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: 'Category of memory: "personal", "preference", "project", "fact", "instruction", or "identity"',
          enum: ['personal', 'preference', 'project', 'fact', 'instruction', 'identity'],
        },
        key: {
          type: Type.STRING,
          description: 'Short title or subject key (e.g., "Favorite Music", "Project Arc", "Family Dog", "Work Schedule")',
        },
        content: {
          type: Type.STRING,
          description: 'The full detail or fact to store permanently',
        },
        importance: {
          type: Type.STRING,
          description: 'Priority importance level',
          enum: ['critical', 'high', 'normal'],
        },
      },
      required: ['key', 'content'],
    },
  },
  {
    name: 'recallMemory',
    description: "Searches and recalls stored long-term memories from JARVIS's permanent memory archive by topic or keyword.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The keyword, question, or topic to search long-term memory for',
        },
        category: {
          type: Type.STRING,
          description: 'Optional category filter',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'listMemories',
    description: "Retrieves all saved long-term memories from JARVIS's memory archive.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: 'Optional category filter ("personal", "preference", "project", "fact", "instruction", "identity")',
        },
      },
    },
  },
  {
    name: 'forgetMemory',
    description: "Removes or deletes a specific memory from JARVIS's long-term memory bank.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: {
          type: Type.STRING,
          description: 'The key or title of the memory to remove',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'verifyCommander',
    description: "Verifies the speaker's voiceprint, Commander clearance level, and confirms that ONLY the authorized commander can talk to JARVIS.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'reportEmotionalTone',
    description: "Reports emotional sentiment and conversation tone (e.g. joyful, excited, empathetic, playful, thoughtful, alert, neutral) to adjust the glow intensity and pulse frequency of JARVIS's Central Arc Reactor.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tone: {
          type: Type.STRING,
          description: 'The detected emotional sentiment or conversational tone',
          enum: ['neutral', 'joyful', 'excited', 'empathetic', 'playful', 'thoughtful', 'alert'],
        },
        valence: {
          type: Type.NUMBER,
          description: 'Valence score from -1.0 (very negative/concerned) to 1.0 (very positive/happy)',
        },
        arousal: {
          type: Type.NUMBER,
          description: 'Arousal score from 0.0 (calm/peaceful) to 1.0 (hyper-energized)',
        },
        rationale: {
          type: Type.STRING,
          description: 'Brief reason for the emotional tone shift',
        },
      },
      required: ['tone'],
    },
  },
  {
    name: 'readUserFile',
    description: "Reads and analyzes the full content of a file uploaded from the user's PC (source code, document, text, csv, json, etc.).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: {
          type: Type.STRING,
          description: "Name of the file to read (e.g., 'script.py', 'document.txt', 'notes.md')",
        },
      },
      required: ['fileName'],
    },
  },
  {
    name: 'listUserFiles',
    description: "Lists all files currently loaded and accessible from the user's PC in the File Vault.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'searchFileContent',
    description: "Searches for specific terms, code functions, or keywords across the user's uploaded PC files.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The search query or keyword to find inside the files',
        },
        fileName: {
          type: Type.STRING,
          description: 'Optional specific file to limit the search to',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'openWebsite',
    description: "Opens a website or web app in the user's browser and in the in-app HUD viewport (e.g. YouTube, GitHub, Wikipedia, etc.).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'The destination URL starting with https://',
        },
        label: {
          type: Type.STRING,
          description: 'Short display label for the destination (e.g., YouTube, Wikipedia)',
        },
      },
      required: ['url', 'label'],
    },
  },
  {
    name: 'playMedia',
    description: 'Plays a YouTube video, music stream, or video search query directly inside the JARVIS in-app cybernetic media player.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Video title, song name, or search query (e.g. "lo-fi hip hop", "Mark Zuckerberg interview", "Queen Bohemian Rhapsody")',
        },
        title: {
          type: Type.STRING,
          description: 'Clean display title for the media player header',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'createHologram',
    description: 'Creates a real 3D hologram in the JARVIS gold HologramViewer. Understands English, Hindi and Hinglish requests ("create a hologram of Earth", "human heart ka 3D hologram banao", "Earth ka 3D model dikhao"). Only call when the user asks for a hologram/3D model — never for normal conversation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        object: {
          type: Type.STRING,
          description: 'The object to hologram (e.g. "Earth", "human heart", "car", "cube"). Use the user\'s words.',
        },
        quality: {
          type: Type.STRING,
          description: 'Quality route: "low" when the user says low-poly/cheap/free version, otherwise omit',
          enum: ['auto', 'low', 'high'],
        },
      },
      required: ['object'],
    },
  },
  {
    name: 'confirmHologram',
    description: 'Confirms the pending paid/low-poly/approx hologram choice. choice "paid" ONLY after the user explicitly said yes/confirm/use paid generation. "lowpoly" for the free low-detail route ("low poly", "cheap version", "free version", "don\'t spend"). "approx" when the user accepts an approximation ("haan dikhao", "yes show"). "cancel" to abort.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        choice: {
          type: Type.STRING,
          description: 'User choice',
          enum: ['paid', 'lowpoly', 'approx', 'cancel'],
        },
        object: {
          type: Type.STRING,
          description: 'The object from the original request',
        },
      },
      required: ['choice', 'object'],
    },
  },
  {
    name: 'openHologramLibrary',
    description: 'Opens the searchable offline hologram library browser (127 models) in the HUD. Use for "open library", "library kholo", "models dikhao", "catalog dikhao", "browse holograms".',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'compareHolograms',
    description: 'Displays two library models side-by-side for comparison (e.g. "heart aur brain compare karo"). Both must exist in the 127-model offline library.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        a: { type: Type.STRING, description: 'First model name' },
        b: { type: Type.STRING, description: 'Second model name' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'controlHologram',
    description: 'Controls the currently open hologram: rotate, zoom, move, resize, spin, reset, hide or close. Use for commands like "rotate it", "isko ghumao", "zoom in", "bada karo", "reset", "stop rotating", "hide hologram", "close kar do".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'Control action (rotate/zoom/move/reset/spin/size/view mode/wireframe/x-ray/labels/animation/quality/sync/hide/close)',
          enum: ['rotate_left', 'rotate_right', 'rotate_deg', 'zoom_in', 'zoom_out', 'move_up', 'move_down', 'move_left', 'move_right', 'reset', 'spin_start', 'spin_stop', 'bigger', 'smaller', 'hide', 'close', 'view_holo', 'view_solid', 'view_wire', 'view_xray', 'labels_show', 'labels_hide', 'anim_play', 'anim_pause', 'anim_restart', 'quality_low', 'quality_med', 'quality_high', 'sync_on', 'sync_off'],
        },
        degrees: {
          type: Type.NUMBER,
          description: 'Degrees for rotate_deg (e.g. 90)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'getCurrentTime',
    description: 'Returns the accurate current local date, time, day of week, and timezone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        zone: {
          type: Type.STRING,
          description: 'Optional timezone name',
        },
      },
    },
  },
  {
    name: 'getWeather',
    description: 'Gets current weather conditions, temperature, and forecast for any city or location.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: {
          type: Type.STRING,
          description: 'City or region name (e.g. London, New York, Tokyo, Paris)',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'saveNote',
    description: 'Saves a note, memo, or reminder to JARVIS’s scratchpad drawer.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Brief title for the note',
        },
        content: {
          type: Type.STRING,
          description: 'The content or reminder details',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'listNotes',
    description: 'Lists all saved notes and memos from the scratchpad.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'addTask',
    description: 'Adds a new task or todo item to the checklist.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task: {
          type: Type.STRING,
          description: 'Task description to complete',
        },
        priority: {
          type: Type.STRING,
          description: 'Priority: "high", "normal", or "low"',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'getTasks',
    description: 'Retrieves all active tasks and todos.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'completeTask',
    description: 'Marks a task as completed or deletes it by matching query words.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskQuery: {
          type: Type.STRING,
          description: 'Keywords of the task to mark completed',
        },
      },
      required: ['taskQuery'],
    },
  },
  {
    name: 'searchWeb',
    description: 'Searches the web for a query and opens Google Search in the browser.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The search query to look up',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'setCountdownTimer',
    description: 'Sets a visual countdown timer on the assistant HUD.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        seconds: {
          type: Type.NUMBER,
          description: 'Number of seconds for the countdown',
        },
        label: {
          type: Type.STRING,
          description: 'Optional purpose or label for the timer',
        },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'setThemeAccent',
    description: "Changes JARVIS's interface accent color theme (cyan, amber, emerald, violet, rose).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        accent: {
          type: Type.STRING,
          description: "Accent name: 'cyan', 'amber', 'emerald', 'violet', or 'rose'",
        },
      },
      required: ['accent'],
    },
  },
  {
    name: 'openCodeWorkbench',
    description: "Opens the Stark Holographic Code Sandbox and Arc Reactor Circuit Simulator on the Commander's HUD.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: {
          type: Type.STRING,
          description: "Optional code snippet to load into the sandbox editor (JavaScript, TypeScript, Python).",
        },
        language: {
          type: Type.STRING,
          description: "Programming language: 'javascript', 'typescript', 'python'.",
        },
      },
    },
  },
  {
    name: 'triggerProtocol',
    description: "Executes an autonomous Stark tactical protocol: 'morning_briefing' (sunrise weather, tasks, study), 'clean_slate' (deep focus, pomodoro timer), 'overclock' (high energy alert overdrive), or 'evening_debrief' (lesson bookmark & nightfall).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        protocolId: {
          type: Type.STRING,
          description: "Protocol ID: 'morning_briefing', 'clean_slate', 'deep_focus', 'overclock', 'evening_debrief'",
          enum: ['morning_briefing', 'clean_slate', 'deep_focus', 'overclock', 'evening_debrief'],
        },
      },
      required: ['protocolId'],
    },
  },
  {
    name: 'openKnowledgeGraph',
    description: "Opens the interactive D3.js Neural Memory & Concept Knowledge Graph on the HUD, displaying interconnected Commander memories, active curriculum topics, and mastered concepts.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'openSessionDebrief',
    description: "Opens the Mission Debrief & Audio Transcript Log on the HUD with export capabilities to Markdown (.md) and JSON.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'calculateMath',
    description: 'Evaluates any mathematical or scientific expression instantly (arithmetic, percentages, trigonometry, roots, powers) and displays the Stark Holographic Calculator.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: {
          type: Type.STRING,
          description: 'The math expression to evaluate, e.g. "450 * 18 / 2.5", "sqrt(144) + 25", "15% of 8500"',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'openCalculator',
    description: 'Opens the Stark Holographic Scientific Calculator widget on the HUD.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: {
          type: Type.STRING,
          description: 'Optional initial expression to load into the calculator display',
        },
      },
    },
  },
  {
    name: 'openPrivateVault',
    description: 'Opens the Stark Classified Private Folder/Vault on the HUD. Level 5 PIN clearance required for decryption.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'lockPrivateVault',
    description: 'Instantly locks the Classified Private Vault, encrypting all private files and clearing sensitive cache.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'searchPrivateVault',
    description: 'Searches for classified confidential files inside the Commander’s Private Vault.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The filename, keyword, or secret project name to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'explainPrivateFile',
    description: 'Reads and explains the confidential content of a private file stored in the Private Vault (requires vault to be unlocked).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: {
          type: Type.STRING,
          description: 'Name of the private file to inspect and explain',
        },
      },
      required: ['fileName'],
    },
  },
  {
    name: 'getRoutineAndPreferences',
    description: 'Retrieves Commander Enayet Hussain’s daily schedule/routine and psychometric preferences (likes/pasand and dislikes/napasand).',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'savePreference',
    description: 'Records a new preference (Pasand / Like or Napasand / Dislike) for Commander Enayet Hussain into persistent neural memory.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description: 'Whether this is a "like" (pasand) or "dislike" (napasand)',
          enum: ['like', 'dislike'],
        },
        title: {
          type: Type.STRING,
          description: 'Short title of the preference (e.g. "Cardamom Tea", "Lofi Beats", "Cold Coffee")',
        },
        description: {
          type: Type.STRING,
          description: 'Detailed explanation of why the Commander likes or dislikes this',
        },
        category: {
          type: Type.STRING,
          description: 'Category: "food_beverage", "work_habit", "technology", "lifestyle", "music", "communication"',
        },
        intensity: {
          type: Type.STRING,
          description: 'Intensity level: "favorite", "strong", "moderate"',
        },
      },
      required: ['type', 'title', 'description'],
    },
  },
  {
    name: 'openRoutinePreferences',
    description: 'Opens the Commander Routine & Preferences Matrix (दिनचर्या & पसंद/नापसंद) on the HUD.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'openDesktopBridge',
    description: 'Opens the PC Voice Control & Desktop Companion Bridge modal, enabling native PC application execution (calc.exe, notepad, etc.).',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'getBatteryStatus',
    description: 'Check the system power/battery level and charging status.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'toggleSurveillanceMode',
    description: 'Activate or deactivate security surveillance mode (triggers red alert, enables camera).',
    parameters: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN } } },
  },
  {
    name: 'controlSmartDevice',
    description: 'Control a smart home IoT device (e.g., lights, thermostat, locks).',
    parameters: { type: Type.OBJECT, properties: { device: { type: Type.STRING }, action: { type: Type.STRING } } },
  },
  {
    name: 'sendToPhone',
    description: 'Send a message, link, or alert to the connected mobile phone.',
    parameters: { type: Type.OBJECT, properties: { payload: { type: Type.STRING } } },
  },
  {
    name: 'scanFace',
    description: 'Run facial recognition scan using the active camera feed to identify the operator.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getRecentEmails',
    description: 'Fetch the user\'s most recent emails from their Gmail inbox. Requires Google Workspace linkage.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        maxResults: { type: Type.NUMBER, description: 'Number of emails to fetch (default 5).' }
      },
    },
  },
  {
    name: 'getUpcomingEvents',
    description: 'Fetch upcoming events from the user\'s primary Google Calendar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        maxResults: { type: Type.NUMBER, description: 'Number of events to fetch (default 5).' }
      },
    },
  },
  {
    name: 'createCalendarEvent',
    description: 'Create a new event in the user\'s Google Calendar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Event title.' },
        description: { type: Type.STRING, description: 'Event description.' },
        startTime: { type: Type.STRING, description: 'ISO 8601 string for start time.' },
        endTime: { type: Type.STRING, description: 'ISO 8601 string for end time.' }
      },
      required: ['summary', 'startTime', 'endTime']
    },
  }
];

// Image Generation API
app.post('/api/generate-image', express.json(), async (req, res) => {
  try {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt,
        config: {
            numberOfImages: 1,
            aspectRatio: '1:1',
            outputMimeType: 'image/jpeg',
        }
    });
    
    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64Image = response.generatedImages[0].image.imageBytes;
      res.json({ success: true, image: `data:image/jpeg;base64,${base64Image}` });
    } else {
      res.status(500).json({ success: false, error: 'No image generated' });
    }
  } catch (error: any) {
    console.error('Image generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Text Chat API (ChatGPT-style typed conversation)
// Simple per-IP rate limit: 30 requests / minute (prevents runaway loops).
const chatRate = new Map<string, { count: number; windowStart: number }>();
function chatRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = chatRate.get(ip);
  if (!entry || now - entry.windowStart > 60000) {
    chatRate.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}
const chatHistories = new Map<string, { role: string; text: string }[]>();
app.post('/api/chat', express.json(), async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (chatRateLimited(ip)) {
      res.status(429).json({ success: false, error: 'Rate limit: thoda ruk kar dobara try karo.' });
      return;
    }
    const { message, sessionId } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    if (!message || typeof message !== 'string') throw new Error('Message is required');

    const ai = new GoogleGenAI({ apiKey });
    const sid = (sessionId || 'default').toString();
    const history = chatHistories.get(sid) || [];
    history.push({ role: 'user', text: message.slice(0, 2000) });

    const contents = history.slice(-12).map((h) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.text }],
    }));

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents,
        config: {
          systemInstruction: 'You are FRIDAY, a witty, warm, confident AI assistant for Commander Enayet Hussain. Reply concisely in the same language the user writes in. Keep answers short and conversational like ChatGPT voice mode.',
          maxOutputTokens: 500,
          temperature: 0.8,
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI timeout (25s)')), 25000)),
    ]);

    const reply = response.text || 'Sorry Commander, kuch gadbad ho gayi. Dobara try karo.';
    history.push({ role: 'model', text: reply });
    chatHistories.set(sid, history.slice(-24));

    res.json({ success: true, reply });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ JARVIS Device Link: PC <-> Phone secure relay ============
// Pairing: ek device 6-digit code banata hai, doosra code daalke pair hota hai.
// Messages server queue me rehte hain, receiver poll karke leta hai.
// NOTE: production me iske aage rate-limit + TLS + token expiry lagana (spec section 29).
interface LinkedDevice {
  deviceId: string;
  name: string;
  kind: string;
  token: string;
  pairedWith: string | null; // legacy: first pairing (kept for old clients)
  lastSeen: number;
  // --- v2 secure identity/registry (optional until device enrolls) ---
  pubkey?: string; // Ed25519 SPKI DER base64 (public only, always)
  pairings?: string[]; // all paired deviceIds (multi-device)
  perms?: Record<string, PermSet>; // perms[peerId] = what I granted THEM
  alias?: string; // owner-defined display name
  revoked?: boolean;
  revokedAt?: number;
  keyVersion?: number; // bumped on revoke -> kills access tokens
  pairedAt?: number;
  createdAt?: number;
}
interface RelayMessage {
  id: string;
  fromDeviceId: string;
  fromName: string;
  toDeviceId: string;
  payload: string;
  t: number;
}
const linkedDevices = new Map<string, LinkedDevice>(); // by deviceId
const deviceTokens = new Map<string, string>(); // token -> deviceId
const pairingCodes = new Map<string, { deviceId: string; expires: number }>(); // code -> deviceId
const relayInbox = new Map<string, RelayMessage[]>(); // toDeviceId -> messages

// ============ JARVIS Cloud Sync: paired devices share one state bucket ============
// Architecture: CLOUD/BACKEND central, Android = complete JARVIS, PC = complete JARVIS.
// Pair hone par dono ka syncRoom same banta hai -> notes/tasks/curriculum/routines dono pe same.
// Unpaired device apna private bucket use karta hai.
interface SyncBucket { notes: any; tasks: any; curriculum: any; routines: any; prefs: any; updatedAt: number; updatedBy: string }
const syncStore = new Map<string, SyncBucket>(); // roomId -> bucket
function syncRoomFor(dev: LinkedDevice): string {
  if (dev.pairedWith && linkedDevices.has(dev.pairedWith)) {
    return 'pair:' + [dev.deviceId, dev.pairedWith].sort().join('<>');
  }
  return 'solo:' + dev.deviceId;
}

function deviceFromToken(req: any): LinkedDevice | null {
  const token = (req.query.token || req.body?.token || '') as string;
  if (!token) return null;
  const deviceId = deviceTokens.get(token);
  if (!deviceId) return null;
  const dev = linkedDevices.get(deviceId) || null;
  if (dev) dev.lastSeen = Date.now();
  return dev;
}

function randomToken(): string {
  return 'frd_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

// Register / re-register device
app.post('/api/devices/register', express.json(), (req, res) => {
  const { deviceId, name, kind } = req.body || {};
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ success: false, error: 'deviceId required' });
    return;
  }
  const existing = linkedDevices.get(deviceId);
  const token = existing?.token || randomToken();
  const dev: LinkedDevice = {
    deviceId,
    name: (name || 'JARVIS device').toString().slice(0, 60),
    kind: (kind || 'web').toString().slice(0, 20),
    token,
    pairedWith: existing?.pairedWith || null,
    lastSeen: Date.now(),
  };
  // Purana token invalidate karo agar device dobara register ho
  linkedDevices.set(deviceId, dev);
  deviceTokens.set(token, deviceId);
  if (!relayInbox.has(deviceId)) relayInbox.set(deviceId, []);
  res.json({ success: true, token, pairedWith: dev.pairedWith });
});

// Pairing code banao (10 min valid)
app.post('/api/devices/code', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pairingCodes.set(code, { deviceId: dev.deviceId, expires: Date.now() + 10 * 60 * 1000 });
  res.json({ success: true, code });
});

// Code se pair karo (dono taraf pairing set hoti hai)
app.post('/api/devices/pair', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const code = ((req.body || {}).code || '').toString().trim();
  const entry = pairingCodes.get(code);
  if (!entry || entry.expires < Date.now()) {
    pairingCodes.delete(code);
    res.status(400).json({ success: false, error: 'Code galat ya expire ho gaya. Naya code banao.' });
    return;
  }
  if (entry.deviceId === dev.deviceId) {
    res.status(400).json({ success: false, error: 'Apne hi code se pair nahi ho sakta.' });
    return;
  }
  const other = linkedDevices.get(entry.deviceId);
  if (!other) {
    res.status(400).json({ success: false, error: 'Doosra device nahi mila.' });
    return;
  }
  dev.pairedWith = other.deviceId;
  other.pairedWith = dev.deviceId;
  pairingCodes.delete(code);
  res.json({ success: true, pairedWith: other.deviceId, pairedName: other.name });
});

// Unpair
app.post('/api/devices/unpair', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  if (dev.pairedWith) {
    const other = linkedDevices.get(dev.pairedWith);
    if (other) other.pairedWith = null;
    dev.pairedWith = null;
  }
  res.json({ success: true });
});

// Paired device ko message bhejo (real delivery — queue me jaata hai)
app.post('/api/devices/send', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const payload = ((req.body || {}).payload || '').toString().slice(0, 2000);
  if (!payload) {
    res.status(400).json({ success: false, error: 'payload required' });
    return;
  }
  const targetId = ((req.body || {}).toDeviceId || dev.pairedWith || '').toString();
  if (dev.revoked) {
    res.status(403).json({ success: false, error: 'DEVICE_REVOKED: re-pair required' });
    return;
  }
  if (!targetId || !linkedDevices.has(targetId)) {
    res.status(400).json({ success: false, error: 'Koi paired device nahi hai. Pehle pair karo.' });
    return;
  }
  if (linkedDevices.get(targetId)!.revoked || isRevokedPair(dev, targetId)) {
    res.status(403).json({ success: false, error: 'DEVICE_REVOKED or pairing removed' });
    return;
  }
  const msg: RelayMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromDeviceId: dev.deviceId,
    fromName: dev.name,
    toDeviceId: targetId,
    payload,
    t: Date.now(),
  };
  relayInbox.get(targetId)?.push(msg);
  res.json({ success: true, id: msg.id, to: targetId });
});

// Inbox nikalo (le lene par queue clear)
app.get('/api/devices/inbox', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const box = relayInbox.get(dev.deviceId) || [];
  relayInbox.set(dev.deviceId, []);
  res.json({ success: true, messages: box, pairedWith: dev.pairedWith });
});

// Status: paired device online hai ya nahi
app.get('/api/devices/status', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const other = dev.pairedWith ? linkedDevices.get(dev.pairedWith) : null;
  const online = !!other && Date.now() - other.lastSeen < 60000;
  res.json({
    success: true,
    deviceId: dev.deviceId,
    paired: other ? { deviceId: other.deviceId, name: other.name, kind: other.kind, online } : null,
  });
});

// ============ JARVIS File Transfer: chunked, paired-only, receipt-verified ============
// Sender uploads base64 chunks; receiver downloads, saves, and posts a receipt
// with the real byte count. COMPLETE is reported only after receipt matches.
interface FtTransfer {
  id: string;
  fromDeviceId: string;
  fromName: string;
  toDeviceId: string;
  name: string;
  size: number;
  chunks: number;
  sha256: string | null; // sender-declared content hash (null = legacy client)
  received: Map<number, string>;
  createdAt: number;
  receiptSize: number | null;
  receiptHashOk: boolean | null;
  done: boolean;
}
const ftStore = new Map<string, FtTransfer>();
const FT_MAX_BYTES = 8 * 1024 * 1024;
const FT_TTL_MS = 20 * 60 * 1000;
const FT_CHUNK_JSON = '256kb';

function ftSweep() {
  const now = Date.now();
  for (const [id, t] of ftStore) {
    if (now - t.createdAt > FT_TTL_MS) ftStore.delete(id);
  }
}

// Begin: manifest announce (paired device only)
app.post('/api/ft/begin', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const targetId = ((req.body || {}).toDeviceId || dev.pairedWith || '').toString();
  if (dev.revoked) {
    res.status(403).json({ success: false, error: 'DEVICE_REVOKED: re-pair required' });
    return;
  }
  if (!targetId || !linkedDevices.has(targetId)) {
    res.status(400).json({ success: false, error: 'Koi paired device nahi hai. Pehle pair karo.' });
    return;
  }
  const target = linkedDevices.get(targetId)!;
  if (target.revoked || isRevokedPair(dev, targetId)) {
    res.status(403).json({ success: false, error: 'DEVICE_REVOKED or pairing removed' });
    return;
  }
  // File-transfer permission: enforced only when the receiver set explicit perms
  // (legacy pairs without perm records keep working).
  const recvPerms = target.perms?.[dev.deviceId];
  if (recvPerms && !recvPerms.ft) {
    audit(dev.deviceId, dev.name, 'FT_BEGIN', 'denied: no ft permission', targetId);
    res.status(403).json({ success: false, error: 'PERMISSION_DENIED: receiver ne file-transfer allow nahi kiya.' });
    return;
  }
  const name = ((req.body || {}).name || 'file').toString().slice(0, 120);
  const size = Number(((req.body || {}).size) || 0);
  const chunks = Number(((req.body || {}).chunks) || 0);
  if (!Number.isFinite(size) || size <= 0 || size > FT_MAX_BYTES) {
    res.status(400).json({ success: false, error: `File size 1 byte – 8 MB ke beech honi chahiye.` });
    return;
  }
  if (!Number.isInteger(chunks) || chunks <= 0 || chunks > 400) {
    res.status(400).json({ success: false, error: 'Invalid chunk count.' });
    return;
  }
  ftSweep();
  const id = `ft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const shaRaw = ((req.body || {}).sha256 || '').toString().toLowerCase();
  ftStore.set(id, {
    id, fromDeviceId: dev.deviceId, fromName: dev.name, toDeviceId: targetId,
    name, size, chunks, sha256: /^[0-9a-f]{64}$/.test(shaRaw) ? shaRaw : null,
    received: new Map(), createdAt: Date.now(), receiptSize: null, receiptHashOk: null, done: false,
  });
  audit(dev.deviceId, dev.name, 'FT_BEGIN', `ok ${name} ${size}B`, targetId);
  res.json({ success: true, id, to: targetId });
});

// Upload one chunk
app.post('/api/ft/chunk', express.json({ limit: FT_CHUNK_JSON }), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const t = ftStore.get(((req.body || {}).id || '').toString());
  if (!t || t.fromDeviceId !== dev.deviceId || t.done) {
    res.status(404).json({ success: false, error: 'Transfer nahi mila ya poora ho chuka.' });
    return;
  }
  const idx = Number(((req.body || {}).idx));
  const data = ((req.body || {}).data || '').toString();
  if (!Number.isInteger(idx) || idx < 0 || idx >= t.chunks || !data || data.length > 200000) {
    res.status(400).json({ success: false, error: 'Invalid chunk.' });
    return;
  }
  t.received.set(idx, data);
  res.json({ success: true, received: t.received.size, chunks: t.chunks });
});

// ---------- Universal 3D Hologram Generator API ----------
const HOLO_MAX_BYTES = 25 * 1024 * 1024;
const HOLO_ALLOWED = new Set(['glb', 'gltf', 'obj']);

function holoDir(): string {
  // dev serves public/, production serves dist/ — store where it is served from.
  const d = process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'dist', 'holograms')
    : path.join(process.cwd(), 'public', 'holograms');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* read-only fs */ }
  return d;
}

function holoSafeName(name: string, ext: string): string | null {
  const base = (name || '').split(/[\\/]/).pop()!.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().slice(0, 60);
  if (!base) return null;
  return `${base}-${Date.now().toString(36)}.${ext}`;
}

// Registry of server-side models actually on disk (LEVEL 1). No invented entries.
app.get('/api/hologram/models', (_req, res) => {
  try {
    const d = holoDir();
    const files = fs.existsSync(d) ? fs.readdirSync(d) : [];
    const models = files
      .filter((f) => HOLO_ALLOWED.has(f.split('.').pop()!.toLowerCase()))
      .map((f) => {
        const st = fs.statSync(path.join(d, f));
        return { name: f, url: `/holograms/${encodeURIComponent(f)}`, format: f.split('.').pop()!.toLowerCase(), size: st.size };
      });
    res.json({ success: true, models });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Registry read failed' });
  }
});

// Provider capabilities (PART W). No secrets, prices only if a provider states one.
app.get('/api/hologram/providers', (_req, res) => {
  const providers = [
    { provider_name: 'local', free_available: true, estimated_cost: null, supports_text_to_3d: false, supports_image_to_3d: false, supports_low_poly: false, model_formats: ['glb', 'gltf', 'obj'], paid: false },
    { provider_name: 'procedural', free_available: true, estimated_cost: null, supports_text_to_3d: true, supports_image_to_3d: false, supports_low_poly: true, model_formats: ['procedural'], paid: false },
  ];
  if ((process.env.HOLOGRAM_API_URL || '') && (process.env.HOLOGRAM_API_KEY || '')) {
    providers.push({ provider_name: 'external-3d', free_available: false, estimated_cost: null, supports_text_to_3d: true, supports_image_to_3d: false, supports_low_poly: false, model_formats: ['glb'], paid: true });
  }
  res.json({ success: true, providers });
});

// User model upload: extension + size + magic-byte validation, sanitized name.
// Same-device upload (user's own file from their own browser) — no device pairing needed.
app.post('/api/hologram/upload', express.json({ limit: '40mb' }), (req, res) => {
  try {
    const rawName = ((req.body || {}).name || '').toString();
    const b64 = ((req.body || {}).dataBase64 || '').toString();
    const ext = rawName.split('.').pop()!.toLowerCase();
    if (!HOLO_ALLOWED.has(ext)) {
      res.status(400).json({ success: false, error: 'Only .glb, .gltf or .obj models are accepted.' });
      return;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      res.status(400).json({ success: false, error: 'Corrupt upload payload.' });
      return;
    }
    if (buf.length === 0 || buf.length > HOLO_MAX_BYTES) {
      res.status(400).json({ success: false, error: 'File must be 1 byte – 25 MB.' });
      return;
    }
    // magic-byte / structure validation — never trust the extension alone
    if (ext === 'glb' && buf.subarray(0, 4).toString('ascii') !== 'glTF') {
      res.status(400).json({ success: false, error: 'Not a valid GLB file (bad magic bytes).' });
      return;
    }
    if (ext === 'gltf') {
      try {
        const j = JSON.parse(buf.toString('utf8'));
        if (!j || typeof j !== 'object' || !j.asset) throw new Error('bad');
      } catch {
        res.status(400).json({ success: false, error: 'Not a valid glTF JSON file.' });
        return;
      }
    }
    if (ext === 'obj') {
      const head = buf.subarray(0, 4096).toString('utf8');
      if (!/^\s*(v\s|o\s|g\s|#)/m.test(head)) {
        res.status(400).json({ success: false, error: 'Not a valid OBJ file.' });
        return;
      }
    }
    const safe = holoSafeName(rawName, ext);
    if (!safe) {
      res.status(400).json({ success: false, error: 'Unusable file name.' });
      return;
    }
    fs.writeFileSync(path.join(holoDir(), safe), buf);
    const sha256 = nodeCrypto.createHash('sha256').update(buf).digest('hex');
    res.json({ success: true, url: `/holograms/${encodeURIComponent(safe)}`, format: ext, size: buf.length, sha256 });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Upload failed' });
  }
});

// Optional external 3D-generation service (LEVEL 3). Honest when unconfigured:
// keys live in env, never hardcoded; frontend only renders on success === true.
app.post('/api/hologram/create', express.json(), async (req, res) => {
  const object = ((req.body || {}).object || '').toString().trim();
  if (!object) {
    res.status(400).json({ success: false, error: 'Missing object.' });
    return;
  }
  const apiUrl = process.env.HOLOGRAM_API_URL || '';
  const apiKey = process.env.HOLOGRAM_API_KEY || '';
  if (!apiUrl || !apiKey) {
    res.json({ success: false, error: '3D model generation unavailable' });
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90000);
    try {
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ object, style: 'hologram' }),
        signal: ctrl.signal,
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.success !== true || typeof j.model_url !== 'string') {
        res.status(502).json({ success: false, error: '3D model generation unavailable' });
        return;
      }
      res.json({ success: true, model_url: j.model_url, model_type: j.model_type || 'glb', quality: ((req.body || {}).quality || 'high').toString(), provider: 'external-3d' });
    } finally {
      clearTimeout(t);
    }
  } catch {
    res.status(502).json({ success: false, error: '3D model generation unavailable' });
  }
});

// Receiver: pending manifests (sirf mujhe bheje gaye, incomplete)
app.get('/api/ft/inbox', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  ftSweep();
  const list: Array<Record<string, unknown>> = [];
  for (const t of ftStore.values()) {
    if (t.toDeviceId === dev.deviceId && !t.done) {
      list.push({ id: t.id, name: t.name, size: t.size, chunks: t.chunks, received: t.received.size, fromName: t.fromName, createdAt: t.createdAt, sha256: t.sha256 });
    }
  }
  res.json({ success: true, transfers: list });
});

// Receiver: download one chunk
app.get('/api/ft/chunk', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const t = ftStore.get((req.query.id || '').toString());
  if (!t || t.toDeviceId !== dev.deviceId) {
    res.status(404).json({ success: false, error: 'Transfer nahi mila.' });
    return;
  }
  const idx = Number(req.query.idx);
  const data = t.received.get(idx);
  if (data === undefined) {
    res.status(404).json({ success: false, error: 'Chunk abhi upload nahi hua.' });
    return;
  }
  res.json({ success: true, idx, data, chunks: t.chunks, size: t.size, name: t.name });
});

// Receiver: confirm save with REAL byte count; sender verifies against manifest
app.post('/api/ft/receipt', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const t = ftStore.get(((req.body || {}).id || '').toString());
  if (!t || t.toDeviceId !== dev.deviceId) {
    res.status(404).json({ success: false, error: 'Transfer nahi mila.' });
    return;
  }
  t.receiptSize = Number(((req.body || {}).receivedSize) || -1);
  t.receiptHashOk = ((req.body || {}).hashOk) === true;
  t.done = true;
  audit(dev.deviceId, dev.name, 'FT_RECEIPT', `size=${t.receiptSize} hashOk=${t.receiptHashOk}`, t.fromDeviceId);
  res.json({ success: true });
});

// Sender: poll receipt (COMPLETE only when receiver-confirmed bytes match)
app.get('/api/ft/receipt', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const t = ftStore.get((req.query.id || '').toString());
  if (!t || t.fromDeviceId !== dev.deviceId) {
    res.status(404).json({ success: false, error: 'Transfer nahi mila.' });
    return;
  }
  // COMPLETE only on receiver-confirmed bytes (+ hash when the manifest declared one).
  const sizeOk = t.done && t.receiptSize === t.size;
  const complete = t.sha256 ? (sizeOk && t.receiptHashOk === true) : sizeOk;
  res.json({ success: true, complete, receivedChunks: t.received.size, chunks: t.chunks, receiptSize: t.receiptSize, size: t.size, hashOk: t.receiptHashOk, wantsHash: !!t.sha256 });
});

// ============ FRIDAY Share: PC "Send with FRIDAY" staging ============
// The Windows context-menu helper runs ON THE PC and stages a LOCAL file path
// so the HUD Share panel (same PC browser/Electron) can pick the file up and
// send it through the normal verified ft flow. The server never reads the
// file into the response — it only validates existence/type/size and returns
// metadata. Token-auth required; absolute local paths only (no traversal:
// statSync must resolve to a real file, directories and specials rejected).
interface StagedShareFile { name: string; size: number; stagedAt: number; byDevice: string; byName: string }
const stagedShareFiles = new Map<string, StagedShareFile[]>(); // deviceId -> staged
const STAGE_MAX_BYTES = 64 * 1024 * 1024;
app.post('/api/share/stage', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const rawPath = ((req.body || {}).path || '').toString();
  if (!rawPath || rawPath.length > 1024 || /[\0-\x1f]/.test(rawPath)) {
    res.status(400).json({ success: false, error: 'Invalid path.' });
    return;
  }
  let resolved: string;
  try {
    resolved = path.resolve(rawPath);
  } catch {
    res.status(400).json({ success: false, error: 'Invalid path.' });
    return;
  }
  let st: fs.Stats;
  try {
    st = fs.statSync(resolved);
  } catch {
    res.status(404).json({ success: false, error: 'File nahi mili.' });
    return;
  }
  if (!st.isFile()) {
    res.status(400).json({ success: false, error: 'Sirf files stage hoti hain (folder nahi).' });
    return;
  }
  if (st.size <= 0 || st.size > STAGE_MAX_BYTES) {
    res.status(400).json({ success: false, error: 'File 1 byte – 64 MB ke beech honi chahiye.' });
    return;
  }
  const name = path.basename(resolved).slice(0, 120);
  const list = stagedShareFiles.get(dev.deviceId) || [];
  list.unshift({ name, size: st.size, stagedAt: Date.now(), byDevice: dev.deviceId, byName: dev.name });
  stagedShareFiles.set(dev.deviceId, list.slice(0, 20));
  audit(dev.deviceId, dev.name, 'SHARE_STAGE', `name=${name} size=${st.size}`, null);
  res.json({ success: true, staged: { name, size: st.size } });
});

// HUD pickup: staged local files for THIS device (browser reads the file itself).
app.get('/api/share/staged', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const list = (stagedShareFiles.get(dev.deviceId) || []).filter((s) => Date.now() - s.stagedAt < 30 * 60 * 1000);
  stagedShareFiles.set(dev.deviceId, list);
  res.json({ success: true, staged: list });
});

// ============ JARVIS Secure Device Pairing v2 (Ed25519 identity + signed auth) ============
// Trust model: every installation owns an Ed25519 keypair. The server NEVER sees
// private keys. Pairing needs physical/owner approval on BOTH sides (host shows
// code+QR, guest joins, host explicitly ALLOWs). Sensitive calls are signed per
// request (timestamp+nonce -> replay protection) and use short-lived access tokens.
import nodeCrypto from 'node:crypto';

interface PermSet { basic: boolean; ft: boolean; cmd: boolean; notify: boolean; screen: boolean; }
const DEFAULT_GUEST_PERMS: PermSet = { basic: true, ft: true, cmd: false, notify: true, screen: false };
function cleanPerms(p: unknown): PermSet {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<PermSet>;
  return { basic: true, ft: !!o.ft, cmd: !!o.cmd, notify: o.notify !== false, screen: !!o.screen };
}
interface PairSession {
  id: string; code: string; hostId: string; hostName: string;
  createdAt: number; expiresAt: number;
  guestId: string | null; guestName: string | null; guestPubkey: string | null;
  decided: 'pending' | 'allowed' | 'denied';
  guestPerms: PermSet;
  attempts: number; // wrong-code throttle
}
const pairSessions = new Map<string, PairSession>();
const PAIR_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;
const TS_SKEW_MS = 5 * 60 * 1000;

interface AccessToken { token: string; deviceId: string; exp: number; kv: number; }
const accessTokens = new Map<string, AccessToken>();
const usedNonces = new Map<string, number>(); // nonce -> exp
const authNonces = new Map<string, { deviceId: string; exp: number }>();
const rateHits = new Map<string, { n: number; win: number }>();

interface AuditEntry { t: number; actor: string; actorName: string; action: string; target?: string; result: string; }
const auditLog: AuditEntry[] = [];
function audit(actor: string, actorName: string, action: string, result: string, target?: string) {
  auditLog.push({ t: Date.now(), actor, actorName, action, target, result });
  if (auditLog.length > 500) auditLog.splice(0, auditLog.length - 500);
}
function sweepV2() {
  const now = Date.now();
  for (const [id, s] of pairSessions) if (s.expiresAt < now && s.decided === 'pending') pairSessions.delete(id);
  for (const [t, a] of accessTokens) if (a.exp < now) accessTokens.delete(t);
  for (const [n, e] of usedNonces) if (e < now) usedNonces.delete(n);
  for (const [n, v] of authNonces) if (v.exp < now) authNonces.delete(n);
  for (const [k, v] of rateHits) if (v.win < now) rateHits.delete(k);
}
function b64ToBuf(b64: string): Buffer {
  return Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function importDevicePubkey(spkiB64: string): nodeCrypto.KeyObject {
  const der = b64ToBuf(spkiB64);
  return nodeCrypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}
function verifyEd(sigB64: string, msg: string, pubkey: nodeCrypto.KeyObject): boolean {
  try {
    return nodeCrypto.verify(null, Buffer.from(msg, 'utf8'), pubkey, b64ToBuf(sigB64));
  } catch { return false; }
}
function sha256Hex(s: string): string {
  return nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function checkRate(deviceId: string): boolean {
  const now = Date.now();
  const win = 60 * 1000;
  const cur = rateHits.get(deviceId);
  if (!cur || cur.win < now) { rateHits.set(deviceId, { n: 1, win: now + win }); return true; }
  cur.n++;
  return cur.n <= 120;
}
/** Signed-request gate for v2 sensitive endpoints. Returns device or sends 401/403. */
function v2Gate(req: any, res: any): (LinkedDevice & { __v2ok: true }) | null {
  sweepV2();
  const id = (req.headers['x-dev-id'] || '').toString();
  const ts = Number(req.headers['x-ts'] || 0);
  const nonce = (req.headers['x-nonce'] || '').toString();
  const sig = (req.headers['x-sig'] || '').toString();
  const bearer = (req.headers['authorization'] || '').toString().replace(/^Bearer\s+/i, '');
  if (!id || !ts || !nonce || !sig || !bearer) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: signed request required' });
    return null;
  }
  if (Math.abs(Date.now() - ts) > TS_SKEW_MS) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: stale timestamp (replay guard)' });
    return null;
  }
  const at = accessTokens.get(bearer);
  if (!at || at.exp < Date.now() || at.deviceId !== id) {
    const claimed = linkedDevices.get(id);
    if (claimed?.revoked) {
      res.status(403).json({ success: false, error: 'DEVICE_REVOKED' });
      return null;
    }
    res.status(401).json({ success: false, error: 'INVALID_TOKEN: access expired, re-authenticate' });
    return null;
  }
  const dev = linkedDevices.get(id);
  if (!dev || dev.revoked || (dev.keyVersion || 0) !== at.kv) {
    res.status(403).json({ success: false, error: 'DEVICE_REVOKED' });
    return null;
  }
  if (!dev.pubkey) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: no identity key registered' });
    return null;
  }
  if (usedNonces.has(nonce)) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: replayed request' });
    return null;
  }
  if (!checkRate(id)) {
    res.status(429).json({ success: false, error: 'NETWORK_ERROR: rate limited, slow down' });
    return null;
  }
  const bodyStr = req.method === 'GET' || req.method === 'DELETE' ? '' : JSON.stringify(req.body || {});
  const path = (req.path || req.url || '').split('?')[0];
  const msg = `v1|${ts}|${nonce}|${req.method}|${path}|${sha256Hex(bodyStr)}`;
  let pub: nodeCrypto.KeyObject;
  try { pub = importDevicePubkey(dev.pubkey); } catch {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: bad identity key' });
    return null;
  }
  if (!verifyEd(sig, msg, pub)) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: bad signature' });
    return null;
  }
  usedNonces.set(nonce, Date.now() + NONCE_TTL_MS);
  dev.lastSeen = Date.now();
  return dev as LinkedDevice & { __v2ok: true };
}
function pairingOf(a: LinkedDevice, bId: string): boolean {
  if ((a.pairings || []).includes(bId)) return true;
  // Legacy v1 code-pairing (pairedWith) counts as a valid pairing until
  // revoked/unpaired. Without this, v1-paired devices were wrongly treated
  // as revoked and every ft/send call failed.
  return a.pairedWith === bId;
}
function isRevokedPair(a: LinkedDevice, bId: string): boolean {
  const b = linkedDevices.get(bId);
  if (!b) return true;
  if (a.revoked || b.revoked) return true;
  return !pairingOf(a, bId) || !pairingOf(b, a.deviceId);
}
function pubDevice(d: LinkedDevice, selfId: string) {
  const other = selfId;
  void other;
  return {
    deviceId: d.deviceId, name: d.alias || d.name, kind: d.kind,
    online: Date.now() - d.lastSeen < 60000,
    pairedAt: d.pairedAt || null, lastSeen: d.lastSeen,
    revoked: !!d.revoked, hasIdentity: !!d.pubkey,
  };
}

// Identity: upload/rotate this installation's PUBLIC key (private key never leaves device)
app.post('/api/v2/identity', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const { deviceId, name, kind, pubkey } = req.body || {};
  if (deviceId && deviceId !== dev.deviceId) {
    res.status(400).json({ success: false, error: 'deviceId mismatch' });
    return;
  }
  if (pubkey) {
    const s = pubkey.toString();
    if (!/^[A-Za-z0-9+/=_-]{40,200}$/.test(s)) {
      res.status(400).json({ success: false, error: 'Invalid public key format' });
      return;
    }
    try { importDevicePubkey(s); } catch {
      res.status(400).json({ success: false, error: 'Unparsable Ed25519 key' });
      return;
    }
    dev.pubkey = s;
  }
  if (name) dev.name = name.toString().slice(0, 60);
  if (kind) dev.kind = kind.toString().slice(0, 20);
  if (!dev.createdAt) dev.createdAt = Date.now();
  if (!dev.pairings) dev.pairings = [];
  if (!dev.perms) dev.perms = {};
  audit(dev.deviceId, dev.name, 'IDENTITY_REGISTER', 'ok');
  res.json({ success: true, deviceId: dev.deviceId, serverTime: Date.now() });
});

// Pairing: host begins (5-min session + 6-digit code; QR payload built client-side)
app.post('/api/v2/pair/begin', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  sweepV2();
  const id = `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pairSessions.set(id, {
    id, code, hostId: dev.deviceId, hostName: dev.alias || dev.name,
    createdAt: Date.now(), expiresAt: Date.now() + PAIR_TTL_MS,
    guestId: null, guestName: null, guestPubkey: null, decided: 'pending',
    guestPerms: DEFAULT_GUEST_PERMS, attempts: 0,
  });
  audit(dev.deviceId, dev.name, 'PAIR_BEGIN', 'ok', id);
  res.json({ success: true, sessionId: id, code, expiresAt: Date.now() + PAIR_TTL_MS });
});

// Pairing: guest joins with code (+own identity). Still NOT paired until host ALLOWs.
app.post('/api/v2/pair/join', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  sweepV2();
  const { sessionId, code, pubkey } = req.body || {};
  const s = pairSessions.get((sessionId || '').toString());
  if (!s || s.decided !== 'pending') {
    res.status(400).json({ success: false, error: 'PAIRING_EXPIRED: session invalid or already decided' });
    return;
  }
  if (Date.now() > s.expiresAt) {
    pairSessions.delete(s.id);
    res.status(400).json({ success: false, error: 'PAIRING_EXPIRED' });
    return;
  }
  if (s.hostId === dev.deviceId) {
    res.status(400).json({ success: false, error: 'Apne hi session me join nahi ho sakta.' });
    return;
  }
  if (s.code !== (code || '').toString().trim() || !pubkey) {
    s.attempts++;
    if (s.attempts >= 5) {
      pairSessions.delete(s.id);
      audit(dev.deviceId, dev.name, 'PAIR_JOIN', 'denied: too many wrong codes, session killed', s.id);
      res.status(429).json({ success: false, error: 'PAIRING_DENIED: too many wrong attempts, session killed. Naya QR banao.' });
      return;
    }
    audit(dev.deviceId, dev.name, 'PAIR_JOIN', 'denied: bad code', s.id);
    res.status(400).json({ success: false, error: 'PAIRING_DENIED: code galat hai' });
    return;
  }
  try { importDevicePubkey(pubkey.toString()); } catch {
    res.status(400).json({ success: false, error: 'Unparsable Ed25519 key' });
    return;
  }
  dev.pubkey = pubkey.toString();
  s.guestId = dev.deviceId;
  s.guestName = dev.alias || dev.name;
  s.guestPubkey = dev.pubkey;
  audit(dev.deviceId, dev.name, 'PAIR_JOIN', 'pending-approval', s.id);
  res.json({ success: true, pending: true, hostName: s.hostName, message: 'Host ke ALLOW ka wait karo.' });
});

// Pairing: host polls for guest arrival / expiry
app.get('/api/v2/pair/poll', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const s = pairSessions.get(((req.query as any).sessionId || '').toString());
  if (!s || s.hostId !== dev.deviceId) {
    res.status(404).json({ success: false, error: 'Session nahi mila.' });
    return;
  }
  if (s.decided !== 'pending' || Date.now() > s.expiresAt) {
    const st = s.decided !== 'pending' ? s.decided : 'expired';
    if (s.decided === 'pending') pairSessions.delete(s.id);
    res.json({ success: true, state: st });
    return;
  }
  res.json({
    success: true, state: 'pending',
    guest: s.guestId ? { deviceId: s.guestId, name: s.guestName } : null,
    expiresAt: s.expiresAt,
  });
});

// Pairing: host ALLOW (with explicit permission set) or DENY
app.post('/api/v2/pair/decide', express.json(), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const { sessionId, approve, perms } = req.body || {};
  const s = pairSessions.get((sessionId || '').toString());
  if (!s || s.hostId !== dev.deviceId || s.decided !== 'pending') {
    res.status(400).json({ success: false, error: 'PAIRING_EXPIRED: session invalid' });
    return;
  }
  if (Date.now() > s.expiresAt) {
    pairSessions.delete(s.id);
    res.status(400).json({ success: false, error: 'PAIRING_EXPIRED' });
    return;
  }
  if (!approve) {
    s.decided = 'denied';
    audit(dev.deviceId, dev.name, 'PAIR_DENY', 'ok', s.guestId || undefined);
    res.json({ success: true, decided: 'denied' });
    return;
  }
  if (!s.guestId) {
    res.status(400).json({ success: false, error: 'Abhi koi guest aaya nahi.' });
    return;
  }
  const guest = linkedDevices.get(s.guestId);
  if (!guest) {
    res.status(400).json({ success: false, error: 'Guest device nahi mila.' });
    return;
  }
  const gp = cleanPerms(perms);
  const now = Date.now();
  for (const d of [dev, guest]) {
    if (!d.pairings) d.pairings = [];
    if (!d.perms) d.perms = {};
  }
  if (!dev.pairings!.includes(guest.deviceId)) dev.pairings!.push(guest.deviceId);
  if (!guest.pairings!.includes(dev.deviceId)) guest.pairings!.push(dev.deviceId);
  // Owner (host) approves what the GUEST may do -> recorded as HOST's grant to guest.
  // Guest side gets a sane default the guest owner can change later.
  dev.perms![guest.deviceId] = gp;
  guest.perms![dev.deviceId] = guest.perms![dev.deviceId] || { basic: true, ft: true, cmd: false, notify: true, screen: false };
  dev.pairedWith = dev.pairedWith || guest.deviceId; // legacy compat: first pairing
  guest.pairedWith = guest.pairedWith || dev.deviceId;
  (dev as LinkedDevice).pairedAt = (dev as LinkedDevice).pairedAt || now;
  (guest as LinkedDevice).pairedAt = (guest as LinkedDevice).pairedAt || now;
  s.decided = 'allowed';
  audit(dev.deviceId, dev.name, 'PAIR_ALLOW', `ok perms=${JSON.stringify(gp)}`, guest.deviceId);
  res.json({ success: true, decided: 'allowed', guest: { deviceId: guest.deviceId, name: guest.alias || guest.name } });
});

// Pairing: guest polls own result (allowed/denied/expired/waiting)
app.get('/api/v2/pair/result', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const s = pairSessions.get(((req.query as any).sessionId || '').toString());
  if (!s || s.guestId !== dev.deviceId) {
    res.status(404).json({ success: false, error: 'Session nahi mila.' });
    return;
  }
  if (s.decided === 'pending' && Date.now() > s.expiresAt) {
    pairSessions.delete(s.id);
    res.json({ success: true, state: 'expired' });
    return;
  }
  if (s.decided === 'allowed') {
    res.json({ success: true, state: 'allowed', host: { deviceId: s.hostId, name: s.hostName }, perms: dev.perms?.[s.hostId] || null });
    return;
  }
  res.json({ success: true, state: s.decided === 'denied' ? 'denied' : 'waiting' });
});

// Auth: challenge nonce (public; proves nothing by itself)
app.post('/api/v2/auth/nonce', express.json(), (req, res) => {
  const { deviceId } = req.body || {};
  const dev = linkedDevices.get((deviceId || '').toString());
  if (!dev || dev.revoked || !dev.pubkey) {
    res.status(400).json({ success: false, error: 'AUTHENTICATION_FAILED: unknown/revoked device' });
    return;
  }
  sweepV2();
  const nonce = `n-${Date.now().toString(36)}-${nodeCrypto.randomBytes(12).toString('hex')}`;
  authNonces.set(nonce, { deviceId: dev.deviceId, exp: Date.now() + 2 * 60 * 1000 });
  res.json({ success: true, nonce, serverTime: Date.now() });
});

// Auth: verify signature over `auth|nonce|ts|deviceId` -> short-lived access token
app.post('/api/v2/auth/verify', express.json(), (req, res) => {
  sweepV2();
  const { deviceId, nonce, ts, signature } = req.body || {};
  const dev = linkedDevices.get((deviceId || '').toString());
  const chal = authNonces.get((nonce || '').toString());
  if (!dev || dev.revoked || !dev.pubkey || !chal || chal.deviceId !== dev.deviceId) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED' });
    return;
  }
  authNonces.delete(nonce.toString());
  if (Math.abs(Date.now() - Number(ts)) > TS_SKEW_MS) {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: stale timestamp' });
    return;
  }
  let pub: nodeCrypto.KeyObject;
  try { pub = importDevicePubkey(dev.pubkey); } catch {
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED' });
    return;
  }
  if (!verifyEd((signature || '').toString(), `auth|${nonce}|${ts}|${deviceId}`, pub)) {
    audit(dev.deviceId, dev.name, 'AUTH_VERIFY', 'denied: bad signature');
    res.status(401).json({ success: false, error: 'AUTHENTICATION_FAILED: bad signature' });
    return;
  }
  const token = `at_${nodeCrypto.randomBytes(24).toString('hex')}`;
  accessTokens.set(token, { token, deviceId: dev.deviceId, exp: Date.now() + ACCESS_TTL_MS, kv: dev.keyVersion || 0 });
  dev.lastSeen = Date.now();
  audit(dev.deviceId, dev.name, 'AUTH_VERIFY', 'ok');
  res.json({ success: true, accessToken: token, expiresIn: ACCESS_TTL_MS / 1000 });
});

// Registry: my devices (self + all pairings, REAL online from lastSeen)
app.get('/api/v2/devices', (req, res) => {
  const dev = v2Gate(req, res);
  if (!dev) return;
  const list = [dev, ...(dev.pairings || []).map((id) => linkedDevices.get(id)).filter((d): d is LinkedDevice => !!d && !d.revoked)];
  audit(dev.deviceId, dev.name, 'REGISTRY_LIST', 'ok');
  res.json({
    success: true,
    self: pubDevice(dev, dev.deviceId),
    devices: list.filter((d) => d.deviceId !== dev.deviceId).map((d) => ({
      ...pubDevice(d, dev.deviceId),
      myPerms: dev.perms?.[d.deviceId] || null, // what I granted them
      theirPerms: d.perms?.[dev.deviceId] || null, // what they granted me
    })),
  });
});

// Registry: rename self (alias) — owner action on own box
app.post('/api/v2/device/rename', express.json(), (req, res) => {
  const dev = v2Gate(req, res);
  if (!dev) return;
  const alias = ((req.body || {}).alias || '').toString().trim().slice(0, 40);
  if (!alias) {
    res.status(400).json({ success: false, error: 'Alias khaali nahi ho sakta.' });
    return;
  }
  dev.alias = alias;
  audit(dev.deviceId, dev.name, 'DEVICE_RENAME', `ok -> ${alias}`);
  res.json({ success: true, alias });
});

// Registry: change permissions *I* granted to a paired device
app.post('/api/v2/device/permissions', express.json(), (req, res) => {
  const dev = v2Gate(req, res);
  if (!dev) return;
  const target = ((req.body || {}).targetId || '').toString();
  const peer = linkedDevices.get(target);
  if (!peer || peer.revoked || !pairingOf(dev, target) || !pairingOf(peer, dev.deviceId)) {
    res.status(400).json({ success: false, error: 'DEVICE_OFFLINE: paired device nahi hai' });
    return;
  }
  dev.perms = dev.perms || {};
  dev.perms[target] = cleanPerms((req.body || {}).perms);
  audit(dev.deviceId, dev.name, 'PERMS_CHANGE', `ok ${JSON.stringify(dev.perms[target])}`, target);
  res.json({ success: true, perms: dev.perms[target] });
});

// Registry: REVOKE a device — kills its tokens, blocks refresh, both sides see REVOKED
app.post('/api/v2/device/revoke', express.json(), (req, res) => {
  const dev = v2Gate(req, res);
  if (!dev) return;
  const target = ((req.body || {}).targetId || '').toString();
  const peer = linkedDevices.get(target);
  if (!peer || !pairingOf(dev, target)) {
    res.status(400).json({ success: false, error: 'Device paired nahi hai.' });
    return;
  }
  peer.revoked = true;
  peer.revokedAt = Date.now();
  peer.keyVersion = (peer.keyVersion || 0) + 1; // all its access tokens die
  for (const [t, a] of accessTokens) if (a.deviceId === target) accessTokens.delete(t);
  audit(dev.deviceId, dev.name, 'DEVICE_REVOKE', 'ok', target);
  res.json({ success: true, revoked: target });
});

// Registry: REMOVE pairing (both directions) — revoked stays revoked until re-pair
app.post('/api/v2/device/remove', express.json(), (req, res) => {
  const dev = v2Gate(req, res);
  if (!dev) return;
  const target = ((req.body || {}).targetId || '').toString();
  const peer = linkedDevices.get(target);
  dev.pairings = (dev.pairings || []).filter((id) => id !== target);
  if (dev.perms) delete dev.perms[target];
  if (peer) {
    peer.pairings = (peer.pairings || []).filter((id) => id !== dev.deviceId);
    if (peer.perms) delete peer.perms[dev.deviceId];
    if (peer.pairedWith === dev.deviceId) peer.pairedWith = (peer.pairings || [])[0] || null;
  }
  if (dev.pairedWith === target) dev.pairedWith = (dev.pairings || [])[0] || null;
  audit(dev.deviceId, dev.name, 'DEVICE_REMOVE', 'ok', target);
  res.json({ success: true });
});

// Audit: my own entries (actor == me or target == me), newest first
app.get('/api/v2/audit', (req, res) => {
  const dev = v2Gate(req, res);
  if (!dev) return;
  const mine = auditLog.filter((e) => e.actor === dev.deviceId || e.target === dev.deviceId).slice(-100).reverse();
  res.json({ success: true, entries: mine });
});

// Cloud Sync: pull shared bucket (paired room ya solo)
app.get('/api/sync/pull', (req, res) => {
  const dev = deviceFromToken(req as any);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const room = syncRoomFor(dev);
  const b = syncStore.get(room) || null;
  const other = dev.pairedWith ? linkedDevices.get(dev.pairedWith) : null;
  res.json({ success: true, room, paired: !!other, bucket: b });
});

// Cloud Sync: push (last-write-wins merge per key)
app.post('/api/sync/push', express.json({ limit: '2mb' }), (req, res) => {
  const dev = deviceFromToken(req);
  if (!dev) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  const room = syncRoomFor(dev);
  const prev = syncStore.get(room) || { notes: null, tasks: null, curriculum: null, routines: null, prefs: null, updatedAt: 0, updatedBy: '' };
  const body = req.body || {};
  const next: SyncBucket = {
    notes: body.notes !== undefined ? body.notes : prev.notes,
    tasks: body.tasks !== undefined ? body.tasks : prev.tasks,
    curriculum: body.curriculum !== undefined ? body.curriculum : prev.curriculum,
    routines: body.routines !== undefined ? body.routines : prev.routines,
    prefs: body.prefs !== undefined ? body.prefs : prev.prefs,
    updatedAt: Date.now(),
    updatedBy: dev.deviceId,
  };
  syncStore.set(room, next);
  res.json({ success: true, room, updatedAt: next.updatedAt });
});

// [CloudBuilder hook] mount isolated cloud app-builder API (auth reuses device tokens, read-only adapter)
app.use('/api/app-builder', createCloudBuilderRouter({
  verifyDevice: (req: any) => {
    const dev = deviceFromToken(req);
    return dev ? { deviceId: dev.deviceId, name: dev.name } : null;
  },
  appsRoot: path.join(process.cwd(), 'generated_apps'),
}));

// [FRIDAY v1 hook] versioned backend API: server-side AI router + quota +
// server-decided entitlements. Legacy /api/chat keeps working unchanged.
import { loadConfig } from './server/config.js';
import { AIRouter } from './server/ai/router.js';
import { FridayStore } from './server/store.js';
import { createV1Router } from './server/v1.js';
import { createCashfreeRouter } from './server/cashfree.js';
import { effectivePlan, productById } from './server/billing.js';
import { createPaymentRouter } from './server/payments/router.js';
import { selectProvider } from './server/payments/providers/phonepe.js';
const fridayConfig = loadConfig();
const aiRouter = new AIRouter(fridayConfig);
const fridayStore = new FridayStore(fridayConfig.storePath);
app.use('/api/v1', createV1Router({
  config: fridayConfig,
  router: aiRouter,
  store: fridayStore,
  redact: redactSecrets,
  log: (...a: any[]) => console.log(...a),
  logError: (...a: any[]) => console.error(...a),
}));

// [Cashfree hook] web payments (server-side only; dormant unless
// CASHFREE_APP_ID/SECRET + webhook secret are configured — never grants
// without a verified webhook + confirmed PAID status).
app.use('/api/v1/billing', createCashfreeRouter({
  productById: (id) => {
    const p = productById(id);
    return p ? { productId: p.productId, plan: p.plan, status: p.status, period: p.period, intendedPriceINR: p.intendedPriceINR } : null;
  },
  applyVerifiedOrder: ({ deviceKey, productId, status, expiryAt, verificationSource }) => {
    fridayStore.setSubscription(deviceKey, {
      status, productId, expiryAt, autoRenew: false, autoRenewing: false,
      verificationSource, linkedAccountId: deviceKey,
    });
    const u = fridayStore.getOrCreateUser(deviceKey);
    const plan = effectivePlan('FREE', {
      status: u.subscription.status, productId: u.subscription.productId,
      expiryAt: u.subscription.expiryAt, autoRenew: false, autoRenewing: false,
      updatedAt: u.subscription.updatedAt,
    } as never);
    return { plan };
  },
  log: (...a: any[]) => console.log(...a),
  logError: (...a: any[]) => console.error(...a),
}));

// [UPI payments hook] web subscriptions via configurable provider
// (PhonePe Standard Checkout v2). Secrets stay server-side; plans activate
// ONLY from verified provider state. Works wherever this backend runs
// (Render/Docker); the static Vercel frontend calls it via VITE_API_BASE_URL.
app.use('/api/payment', createPaymentRouter({
  store: fridayStore,
  provider: selectProvider(),
  appUrl: fridayConfig.backendUrl || process.env.APP_URL || 'http://localhost:3000',
  redact: redactSecrets,
  log: (...a: any[]) => console.log(...a),
  logError: (...a: any[]) => console.error(...a),
}));

// Top-level liveness probe (safe info only — never secrets).
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', assistant: 'FRIDAY', version: fridayConfig.version, time: new Date().toISOString() });
});

// Health API — liveness plus honest dependency state (never "online"
// for something merely because the HTTP server runs).
app.get('/api/health', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    status: 'ok',
    assistant: 'FRIDAY',
    hasKey,
    ai: hasKey ? 'configured' : 'missing',
    time: new Date().toISOString(),
  });
});

async function main() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    console.log('[Live] Client connected');
    const apiKey = process.env.GEMINI_API_KEY;

    // Parse connection query params
    const reqUrl = new URL(req.url || '', 'http://localhost');
    const voiceName = reqUrl.searchParams.get('voice') || 'Aoede';

    if (!apiKey) {
      console.error('[Live] Missing GEMINI_API_KEY');
      clientWs.send(
        JSON.stringify({
          type: 'error',
          error: 'GEMINI_API_KEY is not configured in the environment.',
        }),
      );
      clientWs.close();
      return;
    }

    let session: any = null;
    let isCleanedUp = false;

    const setupSession = async (context: any) => {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
        
        const dynamicInstruction = buildSystemInstruction({
          commanderName: context?.commanderName || 'Enayet Hussain',
          callSign: context?.callSign || 'Commander',
          clearance: context?.clearance || 'LEVEL 5 - SUPREME COMMAND',
          enforceOnly: context?.enforceOnly !== false,
          memories: context?.memoriesDigest || '',
          curriculum: context?.curriculumDigest || '',
          routineAndPrefs: context?.routineAndPrefsDigest || '',
        });
        
        session = await ai.live.connect({
          model: 'gemini-3.1-flash-live-preview',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName,
                },
              },
            },
            generationConfig: {
              temperature: 0.8,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 300,
              candidateCount: 1,
            },
            systemInstruction: dynamicInstruction,
            tools: [{ functionDeclarations: toolDeclarations }],
          },
          callbacks: {
            onopen: () => {
              console.log(`[Live] Gemini Live session connected with voice: ${voiceName}`);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'connected' }));
              }
            },
            onmessage: (message: LiveServerMessage) => {
              if (isCleanedUp || clientWs.readyState !== WebSocket.OPEN) return;

              // Audio chunks from model
              const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audioData) {
                clientWs.send(JSON.stringify({ type: 'audio', audio: audioData }));
              }

              // User interruption
              if (message.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({ type: 'interrupted' }));
              }

              // Turn complete
              if (message.serverContent?.turnComplete) {
                clientWs.send(JSON.stringify({ type: 'turnComplete' }));
              }

              // Function tool calls
              if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
                console.log('[Live] Received tool call:', message.toolCall.functionCalls);
                clientWs.send(
                  JSON.stringify({
                    type: 'toolCall',
                    functionCalls: message.toolCall.functionCalls,
                  }),
                );
              }
            },
            onerror: (err: any) => {
              console.error('[Live] Gemini session error:', err);
              if (!isCleanedUp && clientWs.readyState === WebSocket.OPEN) {
                let errorMessage = err?.message || 'Gemini Live session error occurred.';
                
                // Specific handling for resource exhausted (quota)
                if (errorMessage.toLowerCase().includes('resource_exhausted') || errorMessage.toLowerCase().includes('quota')) {
                  errorMessage = 'FRIDAY ENERGY DEPLETED: Core processors are overheating. Please wait 60 seconds for a thermal recharge cycle.';
                }

                clientWs.send(
                  JSON.stringify({
                    type: 'error',
                    error: errorMessage,
                  }),
                );
              }
            },
            onclose: () => {
              console.log('[Live] Gemini session closed');
              if (!isCleanedUp && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'closed' }));
              }
            },
          },
        });
      } catch (err: any) {
        console.error('[Live] Connection setup failed:', err?.stack || err);
        if (clientWs.readyState === WebSocket.OPEN) {
          let errorMessage = err?.message || 'Failed to establish Live session with Gemini.';
          if (errorMessage.toLowerCase().includes('resource_exhausted') || errorMessage.toLowerCase().includes('quota')) {
            errorMessage = 'FRIDAY ENERGY DEPLETED: Core processors are overheating. Please wait 60 seconds for a thermal recharge cycle.';
          }
          clientWs.send(
            JSON.stringify({
              type: 'error',
              error: errorMessage,
            }),
          );
        }
      }
    };

    clientWs.on('message', (rawData) => {
      if (isCleanedUp) return;
      try {
        const payload = JSON.parse(rawData.toString());
        
        if (payload.type === 'setup') {
          setupSession(payload.context);
          return;
        }

        if (!session) return;

        if (payload.type === 'audio' && payload.data) {
            // Send real-time audio chunk (16kHz PCM16 little-endian base64)
            session.sendRealtimeInput({
              audio: {
                data: payload.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (payload.type === 'video' && payload.data) {
            // Stream real-time camera vision frame (JPEG base64)
            session.sendRealtimeInput({
              video: {
                data: payload.data,
                mimeType: 'image/jpeg',
              }
            });
          } else if (payload.type === 'toolResponse' && payload.functionResponses) {
            console.log('[Live] Sending tool responses back to model:', payload.functionResponses);
            session.sendToolResponse({
              functionResponses: payload.functionResponses,
            });
          } else if (payload.type === 'disconnect') {
            cleanup();
          }
        } catch (err) {
          console.error('[Live] Error processing client message:', err);
        }
      });

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        console.log('[Live] Cleaning up session');
        try {
          if (session && typeof session.close === 'function') {
            session.close();
          }
        } catch (e) {
          // ignore cleanup errors
        }
      };

      clientWs.on('close', cleanup);
      clientWs.on('error', (err) => {
        console.error('[Live] Client WS error:', err);
        cleanup();
      });
  });

  // Vite middleware setup (dev only — dynamic import keeps it out of dist/server.cjs)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[JARVIS] Core server running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[JARVIS] Fatal startup error:', err);
});
