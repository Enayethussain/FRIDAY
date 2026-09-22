import { Link } from 'react-router-dom';
import { PageShell, CTAButtons, usePageTitle, PlatformBadge } from './layout';

export function HomePage() {
  usePageTitle('Real-time voice AI assistant', 'FRIDAY AI — voice-first assistant with Orb/HUD, memory, phone control, FRIDAY Share and 3D holograms.');
  return (
    <div className="min-h-dvh flex flex-col bg-[#030405] text-slate-100 font-sans">
      <header className="w-full border-b border-slate-800/70 bg-[#030405]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border font-display font-bold text-xs" style={{ borderColor: '#FFC40066', background: 'linear-gradient(135deg, #FFC40022, #020617)', color: '#FFE600' }}>FR</div>
            <span className="font-display font-extrabold tracking-wider">FRIDAY AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/features" className="hidden sm:block px-3 py-2 text-sm text-slate-300 hover:text-white">Features</Link>
            <Link to="/pricing" className="hidden sm:block px-3 py-2 text-sm text-slate-300 hover:text-white">Pricing</Link>
            <Link to="/login" className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 min-h-[44px] flex items-center">Login</Link>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-10">
        <div className="text-center max-w-2xl mx-auto">
          <div className="mx-auto mb-6 w-28 h-28 rounded-full border-2 flex items-center justify-center font-display font-black text-2xl" style={{ borderColor: '#FFC400', color: '#FFE600', boxShadow: '0 0 40px #FFC40055, inset 0 0 24px #FFC40033' }}>
            FR
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-wide">FRIDAY AI</h1>
          <p className="mt-2 font-mono text-xs tracking-[0.3em] text-slate-500">VOICE-FIRST PERSONAL INTELLIGENCE</p>
          <p className="mt-5 text-slate-300 leading-relaxed">
            Talk to FRIDAY in Hindi, English or Hinglish. It chats, remembers, controls your phone,
            shares files between devices, teaches step-by-step while watching your screen
            (with permission), and renders 3D holograms — all behind an amber Orb/HUD.
          </p>
          <CTAButtons />
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mt-12">
          {[
            ['💬', 'Real AI chat', 'Typed + voice conversation powered by the FRIDAY backend (Gemini). No API keys to configure.'],
            ['🎙️', 'FRIDAY + JARVIS voices', 'Female FRIDAY voice by default, switchable JARVIS persona, Hindi/English/Hinglish.'],
            ['📱', 'Phone control', 'Calls, SMS, apps, volume, flashlight and more on Android — verified, never faked.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="text-3xl">{icon}</div>
              <h2 className="mt-2 font-bold">{title}</h2>
              <p className="mt-1 text-sm text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <h2 className="font-display font-bold text-xl">Free to start. Pro and Plus when you need more.</h2>
          <p className="mt-1 text-sm text-slate-400">Free includes chat, voice, Orb/HUD and core features within server quota.</p>
          <div className="flex justify-center"><CTAButtons /></div>
        </div>
      </main>
      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500 font-mono">
        <Link to="/privacy" className="hover:text-amber-300 mx-2">Privacy</Link>
        <Link to="/terms" className="hover:text-amber-300 mx-2">Terms</Link>
        <Link to="/refund" className="hover:text-amber-300 mx-2">Refunds</Link>
        <Link to="/contact" className="hover:text-amber-300 mx-2">Contact</Link>
      </footer>
    </div>
  );
}

const FEATURES: [string, string, 'Web' | 'Android' | 'Web + Android', string][] = [
  ['AI conversation', '💬', 'Web + Android', 'Short, conversational answers in your language via the FRIDAY backend.'],
  ['Voice interaction', '🎙️', 'Web + Android', 'Speech recognition + FRIDAY/JARVIS text-to-speech personas.'],
  ['FRIDAY Orb / HUD', '🟡', 'Web + Android', 'Amber reactor Orb with live voice waveform and status telemetry.'],
  ['Memory', '🧠', 'Web + Android', 'Long-term facts plus study curriculum continuity you can delete anytime.'],
  ['Phone control', '📱', 'Android', 'Calls, SMS, apps, volume, flashlight — real Android APIs, verified results.'],
  ['FRIDAY Share', '⤨', 'Web + Android', 'Paired-device file transfer with receipts; never routed through AI providers.'],
  ['Screen awareness', '👁️', 'Web + Android', 'Opt-in screen/camera guidance. Never active without your permission.'],
  ['Gesture control', '✋', 'Android', 'On-device hand-gesture camera controls plus touch orb controls.'],
  ['Hologram / 3D', '❖', 'Web + Android', '127-model offline library, procedural models and Plus model upload.'],
  ['App Builder', '🛠️', 'Web + Android', 'Generate small installable apps from a text request.'],
  ['Private Vault', '🗝️', 'Web + Android', 'PIN-protected encrypted space for confidential files and notes.'],
  ['Study protocols', '📜', 'Web + Android', 'Step-by-step teacher mode, syllabus tracking and automation protocols.'],
];

export function FeaturesPage() {
  return (
    <PageShell title="Features" description="Real FRIDAY AI features: chat, voice, Orb/HUD, memory, phone control, Share, hologram, App Builder and vault.">
      <h1 className="font-display font-black text-3xl">Features</h1>
      <p className="mt-2 text-slate-400">Everything below is implemented functionality — platform badges show where each feature runs.</p>
      <div className="grid gap-4 sm:grid-cols-2 mt-6">
        {FEATURES.map(([title, icon, platform, desc]) => (
          <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="text-2xl">{icon}</div>
            <h2 className="mt-1 font-bold">{title}<PlatformBadge label={platform} /></h2>
            <p className="mt-1 text-sm text-slate-400 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
      <CTAButtons />
    </PageShell>
  );
}

export function AboutPage() {
  return (
    <PageShell title="About" description="About FRIDAY AI — a voice-first personal intelligence system.">
      <h1 className="font-display font-black text-3xl">About FRIDAY</h1>
      <div className="mt-4 space-y-4 text-slate-300 leading-relaxed max-w-2xl">
        <p>
          FRIDAY AI is a voice-first personal intelligence system: an amber Orb/HUD that talks with you
          in Hindi, English or Hinglish, remembers what matters, operates your Android phone on command,
          moves files between your paired devices, and visualizes ideas as 3D holograms.
        </p>
        <p>
          The AI runs server-side — your phone or browser only runs the FRIDAY application, never a
          large language model download. The Android app (package <span className="font-mono text-sm">com.friday.ai</span>)
          adds on-device capabilities: calls, SMS, notifications, camera gestures and sensors.
        </p>
        <p>
          Free covers everyday use within server quota. FRIDAY Pro and Plus unlock the JARVIS voice,
          advanced controls, holograms, App Builder and higher limits — verified server-side, never by
          client-side switches.
        </p>
      </div>
      <CTAButtons />
    </PageShell>
  );
}
