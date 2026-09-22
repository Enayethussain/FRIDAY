import React, { useState } from 'react';
import { Newspaper, Laugh, Brain, BookOpen, XCircle, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { fetchTopNews, fetchJoke, fetchFact, fetchQuiz, generateStory, NewsItem, QuizQuestion } from '../services/FunHub';

interface HUDFunHubProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'news' | 'jokes' | 'quiz' | 'story';

export function HUDFunHub({ isOpen, onClose }: HUDFunHubProps) {
  const [tab, setTab] = useState<Tab>('news');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [joke, setJoke] = useState('');
  const [fact, setFact] = useState('');
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [story, setStory] = useState('');

  if (!isOpen) return null;

  const load = async (t: Tab) => {
    setTab(t);
    setError('');
    setLoading(true);
    try {
      if (t === 'news' && news.length === 0) setNews(await fetchTopNews());
      if (t === 'jokes') { setJoke(await fetchJoke()); setFact(await fetchFact()); }
      if (t === 'quiz' && quiz.length === 0) { setQuiz(await fetchQuiz()); setQi(0); setScore(0); setPicked(null); }
      if (t === 'story' && !story) setStory(generateStory());
    } catch {
      setError('Internet slow hai, dobara try karo.');
    }
    setLoading(false);
  };

  const answer = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    if (opt === quiz[qi].correct) setScore((s) => s + 1);
  };

  const nextQ = () => {
    if (qi + 1 >= quiz.length) { setQuiz([]); setQi(0); setScore(0); setPicked(null); load('quiz'); }
    else { setQi((i) => i + 1); setPicked(null); }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'news', label: 'News', icon: Newspaper },
    { id: 'jokes', label: 'Jokes', icon: Laugh },
    { id: 'quiz', label: 'Quiz', icon: Brain },
    { id: 'story', label: 'Story', icon: BookOpen },
  ];

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-fuchsia-500/30 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">🎉 FUN HUB</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2 mb-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => load(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm transition ${tab === t.id ? 'bg-fuchsia-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-amber-400 text-center py-8">Loading...</p>}
        {error && <p className="text-red-400 text-center py-4">{error}</p>}

        {!loading && !error && tab === 'news' && (
          <div className="space-y-2">
            {news.length === 0 && <button onClick={() => load('news')} className="w-full py-3 bg-fuchsia-500 rounded-xl text-white font-semibold">Load Top News</button>}
            {news.map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="block p-3 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-fuchsia-500/50 transition">
                <p className="text-slate-100 text-sm font-medium">{n.title}</p>
                <p className="text-xs text-slate-500 mt-1">▲ {n.score} points</p>
              </a>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'jokes' && (
          <div className="space-y-3">
            {joke ? (
              <>
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700"><p className="text-slate-100 whitespace-pre-line">{joke}</p></div>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"><p className="text-amber-200 text-sm">💡 Fact: {fact}</p></div>
                <button onClick={() => load('jokes')} className="flex items-center gap-2 px-4 py-2 bg-fuchsia-500 rounded-xl text-white font-semibold"><RefreshCw className="w-4 h-4" /> Ek aur!</button>
              </>
            ) : <button onClick={() => load('jokes')} className="w-full py-3 bg-fuchsia-500 rounded-xl text-white font-semibold">Mood fresh karo 😄</button>}
          </div>
        )}

        {!loading && !error && tab === 'quiz' && (
          <div>
            {quiz.length === 0 ? <button onClick={() => load('quiz')} className="w-full py-3 bg-fuchsia-500 rounded-xl text-white font-semibold">Quiz Start Karo 🧠</button> : (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">Q{qi + 1}/{quiz.length} • Score: {score}</p>
                <p className="text-white font-semibold">{quiz[qi].question}</p>
                {quiz[qi].options.map((o) => (
                  <button
                    key={o}
                    onClick={() => answer(o)}
                    className={`w-full text-left p-3 rounded-xl border transition ${picked ? (o === quiz[qi].correct ? 'bg-green-500/20 border-green-500 text-green-200' : o === picked ? 'bg-red-500/20 border-red-500 text-red-200' : 'bg-slate-800 border-slate-700 text-slate-400') : 'bg-slate-800 border-slate-700 text-slate-100 hover:border-fuchsia-500'}`}
                  >
                    <span className="flex items-center gap-2">{picked && o === quiz[qi].correct && <CheckCircle2 className="w-4 h-4" />}{picked && o === picked && o !== quiz[qi].correct && <X className="w-4 h-4" />}{o}</span>
                  </button>
                ))}
                {picked && <button onClick={nextQ} className="w-full py-2.5 bg-fuchsia-500 rounded-xl text-white font-semibold">{qi + 1 >= quiz.length ? `Finish • Score ${score}/${quiz.length}` : 'Next →'}</button>}
              </div>
            )}
          </div>
        )}

        {!loading && !error && tab === 'story' && (
          <div className="space-y-3">
            {story ? (
              <>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"><p className="text-amber-100 leading-relaxed">{story}</p></div>
                <button onClick={() => setStory(generateStory())} className="flex items-center gap-2 px-4 py-2 bg-fuchsia-500 rounded-xl text-white font-semibold"><RefreshCw className="w-4 h-4" /> Nayi Kahani</button>
              </>
            ) : <button onClick={() => load('story')} className="w-full py-3 bg-fuchsia-500 rounded-xl text-white font-semibold">Kahani Suno 📖</button>}
          </div>
        )}
      </div>
    </div>
  );
}
