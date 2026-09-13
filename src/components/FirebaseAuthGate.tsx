import React, { useState, useEffect } from 'react';
import { auth, signIn } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Shield, Loader2, Database } from 'lucide-react';

export function FirebaseAuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    try {
      setError(null);
      setLoading(true);
      await signIn();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-cyan-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 font-mono">
        <div className="max-w-md w-full bg-[#0a0a0a] border border-cyan-500/30 p-8 rounded-2xl shadow-[0_0_40px_rgba(6,182,212,0.1)] text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500 to-cyan-500/0 opacity-50" />
          
          <div className="w-16 h-16 bg-cyan-950/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-cyan-500/20">
            <Database className="w-8 h-8 text-cyan-400" />
          </div>
          
          <h1 className="text-2xl text-cyan-50 font-semibold mb-2">FRIDAY NEURAL NET</h1>
          <p className="text-cyan-400/60 text-sm mb-8">Secure database connection required to initialize long-term memory arrays.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-950/50 border border-red-500/50 rounded-lg text-red-300 text-sm text-left">
              <p className="font-bold mb-2">Authentication Failed</p>
              {error.includes('admin-restricted-operation') ? (
                <p>
                  Anonymous Authentication is disabled in your Firebase project. To fix this:
                  <br /><br />
                  1. Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">Firebase Console</a>.<br />
                  2. Select your project.<br />
                  3. Navigate to <strong>Authentication &gt; Sign-in method</strong>.<br />
                  4. Enable <strong>Anonymous</strong> provider and save.<br />
                  5. Click the button below to retry.
                </p>
              ) : (
                <p>Error: {error}</p>
              )}
            </div>
          )}
          
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 rounded-xl text-cyan-100 transition-all flex items-center justify-center gap-2 group"
          >
            <Shield className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Authenticate Identity</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
