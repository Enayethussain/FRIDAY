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
      <div className="min-h-screen bg-black flex items-center justify-center text-amber-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4 font-mono">
        <div className="max-w-md w-full bg-[#0a0a0a] border border-amber-500/30 p-8 rounded-2xl shadow-[0_0_40px_rgba(255,196,0,0.1)] text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0 opacity-50" />
          
          <div className="w-16 h-16 bg-amber-950/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
            <Database className="w-8 h-8 text-amber-400" />
          </div>
          
          <h1 className="text-2xl text-amber-50 font-semibold mb-2">FRIDAY NEURAL NET</h1>
          <p className="text-amber-400/60 text-sm mb-8">Secure database connection required to initialize long-term memory arrays.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-950/50 border border-red-500/50 rounded-lg text-red-300 text-sm text-left">
              <p className="font-bold mb-2">Authentication Failed</p>
              {error.includes('admin-restricted-operation') ? (
                <p>
                  Anonymous Authentication is disabled in your Firebase project. To fix this:
                  <br /><br />
                  1. Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-amber-400 underline hover:text-amber-300">Firebase Console</a>.<br />
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
            className="w-full py-3 px-4 bg-amber-950 hover:bg-amber-900 border border-amber-500/50 rounded-xl text-amber-100 transition-all flex items-center justify-center gap-2 group"
          >
            <Shield className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Authenticate Identity</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
