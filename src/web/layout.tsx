import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = `${title} — FRIDAY AI`;
    if (description) {
      let el = document.querySelector('meta[name="description"]');
      if (el) el.setAttribute('content', description);
    }
    window.scrollTo(0, 0);
  }, [title, description]);
}

export function WebHeader() {
  const { pathname } = useLocation();
  const link = (to: string, label: string) => (
    <Link
      key={to}
      to={to}
      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
        pathname === to ? 'text-amber-300 bg-amber-500/10' : 'text-slate-300 hover:text-white hover:bg-slate-800'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="w-full border-b border-slate-800/70 bg-[#030405]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border font-display font-bold text-xs"
            style={{ borderColor: '#FFC40066', background: 'linear-gradient(135deg, #FFC40022, #020617)', color: '#FFE600' }}
          >
            FR
          </div>
          <span className="font-display font-extrabold tracking-wider text-slate-100">FRIDAY AI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {link('/', 'Home')}
          {link('/features', 'Features')}
          {link('/pricing', 'Pricing')}
          {link('/about', 'About')}
          {link('/contact', 'Contact')}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/upgrade" aria-label="Upgrade FRIDAY plan" className="px-4 py-2 rounded-xl text-sm font-bold border border-amber-500/60 text-amber-300 hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-amber-300 transition min-h-[44px] flex items-center">
            Upgrade
          </Link>
          <Link to="/login" className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition min-h-[44px] flex items-center">
            Login
          </Link>
        </div>
      </div>
      <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {link('/', 'Home')}
        {link('/features', 'Features')}
        {link('/pricing', 'Pricing')}
        {link('/upgrade', 'Upgrade')}
        {link('/about', 'About')}
        {link('/contact', 'Contact')}
      </nav>
    </header>
  );
}

export function WebFooter() {
  return (
    <footer className="w-full border-t border-slate-800/70 bg-[#030405] mt-16">
      <div className="max-w-5xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-3 text-sm">
        <div>
          <div className="font-display font-bold text-slate-100 mb-2">FRIDAY AI</div>
          <p className="text-slate-400 leading-relaxed">
            Real-time voice AI assistant with Orb/HUD, memory, phone control, FRIDAY Share and 3D holograms.
          </p>
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-slate-500 mb-2">Product</div>
          <div className="flex flex-col gap-1.5">
            <Link to="/features" className="text-slate-300 hover:text-amber-300">Features</Link>
            <Link to="/pricing" className="text-slate-300 hover:text-amber-300">Pricing</Link>
            <Link to="/upgrade" className="text-slate-300 hover:text-amber-300">Upgrade</Link>
            <Link to="/dashboard" className="text-slate-300 hover:text-amber-300">Open app</Link>
          </div>
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-slate-500 mb-2">Trust</div>
          <div className="flex flex-col gap-1.5">
            <Link to="/privacy" className="text-slate-300 hover:text-amber-300">Privacy Policy</Link>
            <Link to="/terms" className="text-slate-300 hover:text-amber-300">Terms &amp; Conditions</Link>
            <Link to="/refund" className="text-slate-300 hover:text-amber-300">Refund Policy</Link>
            <Link to="/contact" className="text-slate-300 hover:text-amber-300">Contact / Support</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500 font-mono">
        FRIDAY AI — voice-first personal intelligence system
      </div>
    </footer>
  );
}

export function PageShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  usePageTitle(title, description);
  return (
    <div className="min-h-dvh flex flex-col bg-[#030405] text-slate-100 font-sans">
      <WebHeader />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">{children}</main>
      <WebFooter />
    </div>
  );
}

export function CTAButtons() {
  return (
    <div className="flex flex-wrap gap-3 mt-6">
      <Link to="/pricing" className="px-6 py-3 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition min-h-[44px]">
        View Pricing
      </Link>
      <Link to="/dashboard" className="px-6 py-3 rounded-xl font-bold border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 transition min-h-[44px]">
        Open FRIDAY
      </Link>
    </div>
  );
}

export function PlatformBadge({ label }: { label: 'Web' | 'Android' | 'Web + Android' }) {
  const color = label === 'Web' ? '#38bdf8' : label === 'Android' ? '#4ade80' : '#FFE600';
  return (
    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border ml-2 align-middle whitespace-nowrap" style={{ borderColor: `${color}88`, color }}>
      {label}
    </span>
  );
}
