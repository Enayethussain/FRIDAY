export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  tag: string;
  msg: string;
}

const BUFFER_SIZE = 200;
const buffer: LogEntry[] = [];
const listeners: ((e: LogEntry) => void)[] = [];

function push(level: LogLevel, tag: string, msg: string) {
  const entry: LogEntry = { t: Date.now(), level, tag, msg };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  try {
    if (level === 'error') console.error(`[${tag}] ${msg}`);
    else if (level === 'warn') console.warn(`[${tag}] ${msg}`);
    else console.log(`[${tag}] ${msg}`);
  } catch {}
  listeners.forEach((fn) => {
    try { fn(entry); } catch {}
  });
}

export const FridayLogger = {
  debug(tag: string, msg: string) { push('debug', tag, msg); },
  info(tag: string, msg: string) { push('info', tag, msg); },
  warn(tag: string, msg: string) { push('warn', tag, msg); },
  error(tag: string, msg: string) { push('error', tag, msg); },
  getBuffer(): LogEntry[] { return [...buffer]; },
  onEntry(fn: (e: LogEntry) => void): () => void {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
  exportText(): string {
    return buffer.map((e) => `${new Date(e.t).toISOString()} [${e.level}] [${e.tag}] ${e.msg}`).join('\n');
  },
};
