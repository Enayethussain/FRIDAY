// Telegram sales bot: /start -> Buy button -> EKQR QR order -> APK on payment.
// Uses axios against the internal /api/create-bot-order endpoint (same EKQR
// provider as web checkout). No token -> disabled, server unaffected.
import axios from 'axios';
import { getTelegramBot } from './telegram.js';
import { sendQrOrder } from './telegram.js';

const PRO_PRICE_INR = Number(process.env.PRO_PRICE_INR || 99) || 99;

function baseUrl(): string {
  const port = Number(process.env.PORT || 3000) || 3000;
  return `http://127.0.0.1:${port}`;
}

function welcomeText(): string {
  return [
    '🤖 Welcome to FRIDAY AI!',
    '',
    'Voice-first AI assistant: chat, phone control, holograms, memory.',
    '',
    `💎 FRIDAY Pro — ₹${PRO_PRICE_INR} — UPI payment, instant APK delivery.`,
    'One license = one phone.',
  ].join('\n');
}

let launched = false;
let stopping = false;

async function createOrderViaApi(chatId: string, customerName: string): Promise<{
  orderId: string; qrImageUrl: string; upiIntentUrl: string; payUrl: string; amount: number;
}> {
  const { data } = await axios.post(
    `${baseUrl()}/api/create-bot-order`,
    { chatId, amount: PRO_PRICE_INR, customerName },
    { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
  );
  if (!data?.success || !data?.orderId) {
    throw new Error(String(data?.error || 'Order create nahi ho paya.'));
  }
  return {
    orderId: String(data.orderId),
    qrImageUrl: String(data.qrImageUrl || ''),
    upiIntentUrl: String(data.upiIntentUrl || ''),
    payUrl: String(data.payUrl || ''),
    amount: Number(data.amount || PRO_PRICE_INR) || PRO_PRICE_INR,
  };
}

/** Start polling. Returns false when unconfigured (server keeps running). */
export async function startTelegramBot(): Promise<boolean> {
  if (launched) return true;
  if (!(process.env.TELEGRAM_BOT_TOKEN || '').trim()) {
    try { console.log('[Bot] TELEGRAM_BOT_TOKEN unset — bot disabled.'); } catch { /* noop */ }
    return false;
  }
  const bot = await getTelegramBot();
  if (!bot) return false;

  bot.start(async (ctx: any) => {
    try {
      await ctx.reply(welcomeText(), {
        reply_markup: {
          inline_keyboard: [[{ text: `🚀 Buy FRIDAY Pro (₹${PRO_PRICE_INR})`, callback_data: 'buy_pro' }]],
        },
      });
    } catch { /* send-only */ }
  });

  bot.action('buy_pro', async (ctx: any) => {
    try { await ctx.answerCbQuery('Order bana rahe hain…'); } catch { /* noop */ }
    const chatId = String(ctx.chat?.id || '');
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').slice(0, 60) || 'Telegram User';
    if (!chatId) {
      try { await ctx.reply('Chat ID nahi mila. /start dobara bhejo.'); } catch { /* noop */ }
      return;
    }
    try {
      const order = await createOrderViaApi(chatId, name);
      await sendQrOrder(chatId, {
        orderId: order.orderId,
        amount: order.amount,
        qrCode: order.qrImageUrl,
        upiIntent: order.upiIntentUrl,
        payUrl: order.payUrl,
      });
    } catch (e: any) {
      try { await ctx.reply(`Order create nahi ho paya: ${String(e?.message || e).slice(0, 200)} Dobara try karo.`); } catch { /* noop */ }
    }
  });

  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    try { console.log(`[Bot] ${signal} — stopping polling.`); } catch { /* noop */ }
    try { await bot.stop(signal); } catch { /* noop */ }
  };
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));

  try {
    await bot.launch({ dropPendingUpdates: true });
    launched = true;
    try { console.log('[Bot] Telegram polling started.'); } catch { /* noop */ }
    return true;
  } catch (e: any) {
    try { console.error(`[Bot] launch failed: ${e?.message || e}`); } catch { /* noop */ }
    return false;
  }
}
