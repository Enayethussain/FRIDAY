/**
 * FunHub service - Knowledge & Fun features using free no-key APIs
 * - News: Hacker News top stories (https://github.com/HackerNews/API)
 * - Jokes: JokeAPI v2 (https://v2.jokeapi.dev)
 * - Quiz: Open Trivia DB (https://opentdb.com)
 * - Facts: uselessfacts API
 */

export interface NewsItem {
  id: number;
  title: string;
  url?: string;
  score: number;
}

export interface QuizQuestion {
  question: string;
  correct: string;
  options: string[];
}

function decodeHtml(html: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

export async function fetchTopNews(limit = 8): Promise<NewsItem[]> {
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids: number[] = await res.json();
  const top = ids.slice(0, limit);
  const items = await Promise.all(
    top.map(async (id) => {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const j = await r.json();
      return { id, title: j.title, url: j.url, score: j.score || 0 } as NewsItem;
    })
  );
  return items;
}

export async function fetchJoke(): Promise<string> {
  const res = await fetch('https://v2.jokeapi.dev/joke/Programming,Miscellaneous,Pun?blacklistFlags=nsfw,racist,sexist&type=single,twopart');
  const j = await res.json();
  if (j.type === 'single') return j.joke;
  return `${j.setup}\n${j.delivery}`;
}

export async function fetchFact(): Promise<string> {
  const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
  const j = await res.json();
  return j.text;
}

export async function fetchQuiz(amount = 5): Promise<QuizQuestion[]> {
  const res = await fetch(`https://opentdb.com/api.php?amount=${amount}&type=multiple`);
  const j = await res.json();
  return (j.results || []).map((q: any) => {
    const correct = decodeHtml(q.correct_answer);
    const options = [...q.incorrect_answers.map(decodeHtml), correct].sort(() => Math.random() - 0.5);
    return { question: decodeHtml(q.question), correct, options };
  });
}

const STORY_OPENERS = [
  'Ek chhote se gaon me ek curious robot rehta tha jiska naam Bolt tha.',
  'Gahri space me ek chhota spaceship kho gaya tha, usme Captain Myraa thi.',
  'Ek jadui library me har raat kitabein aapas me baat karti thi.',
  'Samundar ke neeche ek chamakdar sheher tha jahan Robo-fish rehte the.',
];

const STORY_MIDDLES = [
  'Ek din usse ek chamakdar naksha mila jo taaron se bana tha.',
  'Tabhi aasmaan me bijli chamki aur ek portal khul gaya.',
  'Wahan usse ek buddhiman ullu mila jisne ek paheli puchhi.',
  'Achank sab lights gul ho gayin aur sirf ek neeli roshni jal rahi thi.',
];

const STORY_ENDS = [
  'Aur us din usne seekha: himmat aur dosti se har mushkil aasan ho jaati hai. The End.',
  'Aur tab se wo har raat taaron ko dekh kar muskurata hai. The End.',
  'Aur gaon walo ne uski bahaduri par zor daar taaliyan bajayin. The End.',
];

export function generateStory(): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(STORY_OPENERS)} ${pick(STORY_MIDDLES)} ${pick(STORY_ENDS)}`;
}
