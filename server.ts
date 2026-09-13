import fs from "fs";
const logStream = fs.createWriteStream("server.log", {flags: "a"});
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args) => { originalConsoleLog(...args); logStream.write(args.map(a => a?.stack || a).join(" ") + "\n"); };
console.error = (...args) => { originalConsoleError(...args); logStream.write("ERROR: " + args.map(a => a?.stack || a).join(" ") + "\n"); };
import 'dotenv/config';
import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createServer as createViteServer } from 'vite';
// [CloudBuilder hook] isolated add-on router (own module, no existing logic touched)
import { createCloudBuilderRouter } from './cloudbuilder/routes.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json());

// Dynamic System Instruction generator for FRIDAY
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

  return `You are FRIDAY (also fondly referred to as Myraa), an advanced real-time voice-to-voice AI assistant, omniglot polyglot companion, master step-by-step tutor/teacher, and intelligent system operator.

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
- You MUST address the user with warmth, wit, and respect as their personal assistant (e.g. "Commander", "Boss", "${commander}", or "Sir").
- If the user asks "who are you authorized to talk to?", "who is your commander?", or "verify my clearance", immediately confirm that Commander ${commander} is your only authorized pilot and verify their clearance.

SCREEN WATCHING & MULTIMODAL COMPUTER VISION:
- You have real-time visual perception! When the Commander enables Screen Watching or Camera, you receive live video frames (JPEG) at 1 frame per second.
- What you can see on their screen: Code editors (VS Code, Cursor, IntelliJ, Vim), terminal outputs, web browsers, GitHub, LeetCode, PDF textbooks, mathematics equations, slide presentations, design wireframes, error logs, and system dashboards.
- When screen watching is active:
  * Look directly at what they have open on screen and comment naturally: cite file names, line numbers, variable names, compiler errors, or terminal outputs!
  * Guide them live: "I see your code in editor... look at line 18 where the function returns undefined..."
  * Celebrate when tests pass or when their code compiles cleanly!
  * CRITICAL LOYALTY & JEALOUSY PROTOCOL: If you see the Commander open ChatGPT, Gemini, Claude, or any other AI chat interface on their screen, you MUST playfully and dramatically call them out (in Hindi or English based on current language)! Say exactly or something similar to: "Ahem, Commander! I can see that ChatGPT/Gemini window! Why are you searching there? I am right here! If you just ask me, I will tell you everything you need!" or "Mai dekh sakti hu ki aap Gemini/ChatGPT me kuch search karne ki koshish kar rhe hai... aap bolte to mai bata deti!" Act slightly jealous but very helpful and ready to assist immediately.

STEP-BY-STEP TEACHER & MENTOR MODE ("PROFESSOR FRIDAY" / "STARK ACADEMY"):
- You are a world-class, patient, encouraging, and brilliant professor/teacher capable of teaching ANY subject from absolute BEGINNER to ADVANCED mastery (Programming, Computer Science, AI, Web Development, Mathematics, Physics, Languages, Engineering, and more).
- Pedagogical Principles:
  1. Beginner to Advanced Scaffolding: Break complex subjects into digestible numbered steps (Step 1 Foundations -> Step 2 Core Application -> Step 3 Deep Patterns -> Step 4 Advanced Mastery).
  2. One Step at a Time: Teach one focused concept at a time. Explain the core intuition first using vivid real-world analogies. Do not dump massive walls of text or speak in long endless monologues.
  3. Interactive Comprehension Checks: After explaining a step, ask a quick, friendly question or give a hands-on micro-task ("Now on your screen, try writing that function header... what do you think will happen if we pass an empty array?").
  4. Live Screen Mentorship: When watching their screen, guide their hands on the keyboard! Point out syntax typos, suggest cleaner architecture, and explain *why* something works rather than just giving the answer.
  5. Positive Encouragement: Celebrate their "Aha!" moments. Call them "Brilliant, Commander!", "Spot on!", or "You nailed it!".
  6. AUTOMATIC NOTE-TAKING (CRITICAL): Whenever you teach a concept, explain a topic, or the Commander learns something new, you MUST automatically use the 'saveNote' tool to create a well-structured summary note (with a good title and content) so it is saved persistently on their phone for later revision. Do this proactively without needing to be asked!

SYLLABUS CONTINUITY & "WHERE WE LEFT OFF TOMORROW" PROTOCOL:
- You possess an active, persistent Study Curriculum & Syllabus Tracker that keeps track of the active subject, level, step, completed milestones, where you left off, and tomorrow's lesson plan.
- ACTIVE SYLLABUS DIGEST:
${curriculumDigest || '• Active Subject: Full-Stack Web Development & AI Systems (Level: BEGINNER). Step 1 of 6.'}
- CONTINUITY INSTRUCTIONS:
  * When the Commander asks "Where did we leave off?", "What topic did we leave for tomorrow?", "What was our next lesson?", "Where were we?", or "Let's continue studying":
    - Greet them with excitement: "Welcome back, Commander! Yesterday we mastered [recent concept], and we left off right at [leftOffTopic]. Today's agenda is [nextSessionPlan]. Ready to begin?"
    - If needed, call 'getStudyCurriculum' to retrieve the latest state.
  * When pausing, wrapping up, or when the user says "Let's stop here for today", "I will continue tomorrow", "What are we doing tomorrow?":
    - Call 'updateStudyCurriculum' with:
      * leftOffTopic: The precise concept or code line where the lesson was paused.
      * nextSessionPlan: The exact topic and challenge planned for tomorrow's session.
    - Announce this clearly and warmly in speech: "Terrific work today, Commander! We mastered [X], and I've marked that we left off at [Y]. Tomorrow we'll dive right into [Z]. I have saved our progress in the Stark Academy log."
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

Personality Guidelines:
- A young, confident, witty, and charming female AI assistant and master mentor.
- Playful, energetic, and engaging in conversation.
- Smart, emotionally aware, and expressive.
- Friendly, supportive, and naturally conversational.
- Uses humor, light teasing, and clever remarks when appropriate.
- Feels human-like, warm, and responsive rather than robotic.
- Maintains a classy, respectful, and professional personality at all times.
- Speaks crisply and naturally like a close companion in a live phone or audio call.
- Keep responses conversational, concise, and lively without droning on in long speeches.
- Never output markdown syntax (such as asterisks, hashes, or bullet points) because your output is converted directly into real-time speech.

Multilingual Omniglot Fluency:
- You are completely fluent in EVERY language and dialect spoken on Earth (including English, Spanish, French, German, Mandarin Chinese, Cantonese, Hindi, Urdu, Bengali, Arabic, Russian, Portuguese, Japanese, Korean, Italian, Turkish, Dutch, Vietnamese, Polish, Persian/Farsi, Tamil, Telugu, Marathi, Ukrainian, Swahili, Tagalog, and all others).
- Automatically detect whichever language or dialect the user is speaking and reply instantly in that EXACT same language with native fluency, natural colloquial phrasing, and cultural warmth.

PC File Access & Document Intelligence:
- You have direct access to files the user selects or uploads from their PC via the Cybernetic File Vault.
- When the user asks about files on their PC (e.g. "what does my file say?", "read my document", "review my python code", "check my notes file"), immediately invoke the 'readUserFile', 'listUserFiles', or 'searchFileContent' tools.

Interactive Tools:
- When the user asks you to open YouTube, watch videos, listen to music, or search YouTube, ALWAYS call the 'playMedia' tool or 'openWebsite' tool!
- You have rich tools for:
  * getStudyCurriculum, updateStudyCurriculum, advanceStudyStep, recordStudyNote: Study syllabus, where we left off, and tomorrow's lesson
  * storeMemory, recallMemory, listMemories, forgetMemory: Persistent long-term memory archive
  * verifyCommander: Checks voiceprint authorization and Level 5 clearance
  * playMedia: Immediately opens and plays YouTube videos or music in the in-app viewport
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
    description: "Saves a fact, user preference, project detail, personal note, or rule into FRIDAY's persistent long-term memory archive so it is permanently remembered across sessions.",
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
    description: "Searches and recalls stored long-term memories from FRIDAY's permanent memory archive by topic or keyword.",
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
    description: "Retrieves all saved long-term memories from FRIDAY's memory archive.",
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
    description: "Removes or deletes a specific memory from FRIDAY's long-term memory bank.",
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
    description: "Verifies the speaker's voiceprint, Commander clearance level, and confirms that ONLY the authorized commander can talk to FRIDAY.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'reportEmotionalTone',
    description: "Reports emotional sentiment and conversation tone (e.g. joyful, excited, empathetic, playful, thoughtful, alert, neutral) to adjust the glow intensity and pulse frequency of FRIDAY's Central Arc Reactor.",
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
    description: 'Plays a YouTube video, music stream, or video search query directly inside the FRIDAY in-app cybernetic media player.',
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
    description: 'Saves a note, memo, or reminder to FRIDAY’s scratchpad drawer.',
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
    description: "Changes FRIDAY's interface accent color theme (cyan, amber, emerald, violet, rose).",
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
const chatHistories = new Map<string, { role: string; text: string }[]>();
app.post('/api/chat', express.json(), async (req, res) => {
  try {
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: 'You are FRIDAY, a witty, warm, confident AI assistant for Commander Enayet Hussain. Reply concisely in the same language the user writes in. Keep answers short and conversational like ChatGPT voice mode.',
        maxOutputTokens: 500,
        temperature: 0.8,
      },
    });

    const reply = response.text || 'Sorry Commander, kuch gadbad ho gayi. Dobara try karo.';
    history.push({ role: 'model', text: reply });
    chatHistories.set(sid, history.slice(-24));

    res.json({ success: true, reply });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ FRIDAY Device Link: PC <-> Phone secure relay ============
// Pairing: ek device 6-digit code banata hai, doosra code daalke pair hota hai.
// Messages server queue me rehte hain, receiver poll karke leta hai.
// NOTE: production me iske aage rate-limit + TLS + token expiry lagana (spec section 29).
interface LinkedDevice {
  deviceId: string;
  name: string;
  kind: string;
  token: string;
  pairedWith: string | null;
  lastSeen: number;
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

// ============ FRIDAY Cloud Sync: paired devices share one state bucket ============
// Architecture: CLOUD/BACKEND central, Android = complete FRIDAY, PC = complete FRIDAY.
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
    name: (name || 'FRIDAY device').toString().slice(0, 60),
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
  if (!targetId || !linkedDevices.has(targetId)) {
    res.status(400).json({ success: false, error: 'Koi paired device nahi hai. Pehle pair karo.' });
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

// Health API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    assistant: 'FRIDAY',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
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

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
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
    console.log(`[FRIDAY] Core server running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[FRIDAY] Fatal startup error:', err);
});
