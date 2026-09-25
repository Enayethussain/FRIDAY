// Bot checkout routes: POST /api/create-bot-order { chatId, amount, customerName }.
// Same EKQR provider + store as web checkout; chatId rides in udf1.
import express from 'express';
import type { FridayStore } from '../store.js';
import type { PaymentProvider } from '../payments/types.js';
import { createBotOrder } from './orders.js';

export interface BotRouteDeps {
  store: FridayStore;
  provider: PaymentProvider;
  appUrl: string;
  redact: (s: string) => string;
  logError: (...a: any[]) => void;
}

const buckets = new Map<string, { count: number; windowStart: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const e = buckets.get(ip);
  if (!e || now - e.windowStart > 60000) {
    buckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  e.count += 1;
  return e.count > 10;
}

function clientIp(req: express.Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  return (fwd.split(',')[0] || '').trim() || req.ip || 'unknown';
}

export function createBotRouter(deps: BotRouteDeps): express.Router {
  const { store, provider, appUrl, redact, logError } = deps;
  const r = express.Router();

  r.post('/create-bot-order', express.json({ limit: '8kb' }), async (req, res) => {
    try {
      const ip = clientIp(req);
      if (limited(ip)) {
        res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Too many requests. Try again shortly.' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const order = await createBotOrder(
        { store, provider, appUrl },
        {
          chatId: String(body.chatId ?? body.chat_id ?? ''),
          amount: Number(body.amount),
          customerName: String(body.customerName ?? body.customer_name ?? ''),
        }
      );
      res.json({ success: true, ...order });
    } catch (e: any) {
      const msg = redact(String(e?.message || e)).slice(0, 200);
      logError(`bot order failed: ${msg.slice(0, 120)}`);
      res.status(502).json({ success: false, code: 'BOT_ORDER_FAILED', error: msg || 'Order create nahi ho paya.' });
    }
  });

  return r;
}
