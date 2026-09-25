// Lazy Telegraf singleton + delivery helpers for bot sales.
// No token -> every send is a logged no-op (server runs fine without a bot).
// telegraf is dynamically imported so startup never depends on it.
import fs from 'node:fs';

let bot: any = null;
let warnedNoToken = false;

function token(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

async function getBot(): Promise<any> {
  if (bot) return bot;
  if (!token()) {
    if (!warnedNoToken) {
      warnedNoToken = true;
      try { console.log('[Bot] TELEGRAM_BOT_TOKEN unset — Telegram delivery disabled.'); } catch { /* noop */ }
    }
    return null;
  }
  try {
    const { Telegraf } = await import('telegraf');
    bot = new Telegraf(token());
    return bot;
  } catch (e: any) {
    try { console.error(`[Bot] Telegraf init failed: ${e?.message || e}`); } catch { /* noop */ }
    return null;
  }
}

/** Exposed for bot.ts command wiring (null when unconfigured). */
export async function getTelegramBot(): Promise<any> {
  return getBot();
}

export function apkPath(): string {
  return (process.env.APK_FILE_PATH || '').trim() || './files/FRIDAY_AI.apk';
}

function captionFor(licenseKey: string, plan: string): string {
  return [
    '✅ FRIDAY Pro activated!',
    '',
    `🔑 License Key: ${licenseKey}`,
    `📦 Plan: ${plan}`,
    '',
    '⚠️ WARNING: This license is bound to ONE device only.',
    'Sharing it will lock the license on the first phone that activates it.',
    '',
    'Install the APK, open FRIDAY, and enter your key to activate.',
  ].join('\n');
}

/**
 * Deliver the license: APK document + key caption. If the APK file is
 * missing, the key still goes out as text (user is never left hanging).
 */
export async function deliverLicenseApk(chatId: string, licenseKey: string, plan: string): Promise<boolean> {
  const b = await getBot();
  if (!b) return false;
  const caption = captionFor(licenseKey, plan);
  try {
    const file = apkPath();
    if (file && fs.existsSync(file)) {
      await b.telegram.sendDocument(chatId, { source: fs.createReadStream(file), filename: 'FRIDAY_AI.apk' }, { caption });
      return true;
    }
    try { console.error(`[Bot] APK missing at ${file} — sending key as text.`); } catch { /* noop */ }
    await b.telegram.sendMessage(chatId, `${caption}\n\n(APK file will follow — reply here if it doesn't arrive.)`);
    return true;
  } catch (e: any) {
    try { console.error(`[Bot] deliver failed chat=${chatId}: ${e?.message || e}`); } catch { /* noop */ }
    return false;
  }
}

/** QR order message with payment details (photo when possible, text fallback). */
export async function sendQrOrder(
  chatId: string, order: { orderId: string; amount: number; qrCode?: string; upiIntent?: string; payUrl?: string }
): Promise<boolean> {
  const b = await getBot();
  if (!b) return false;
  const lines = [
    '🧾 FRIDAY Pro order ready!',
    '',
    `🆔 Order: ${order.orderId}`,
    `💰 Amount: ₹${order.amount} (UPI)`,
    '',
    '📱 Pay karne ke 2 tarike:',
    '1) UPI app me link kholo (neeche), ya',
    '2) QR scan karo.',
  ];
  if (order.upiIntent) lines.push('', `🔗 ${order.upiIntent}`);
  else if (order.payUrl) lines.push('', `🔗 ${order.payUrl}`);
  lines.push('', 'Payment ke baad APK + License Key yahin milegi. ✅');
  const caption = lines.join('\n');
  try {
    const qr = order.qrCode || '';
    if (qr.startsWith('data:image')) {
      const base64 = qr.split(',')[1] || '';
      await b.telegram.sendPhoto(chatId, { source: Buffer.from(base64, 'base64') }, { caption });
      return true;
    }
    if (/^https?:\/\//i.test(qr)) {
      await b.telegram.sendPhoto(chatId, qr, { caption });
      return true;
    }
    await b.telegram.sendMessage(chatId, caption);
    return true;
  } catch (e: any) {
    try { console.error(`[Bot] QR send failed chat=${chatId}: ${e?.message || e}`); } catch { /* noop */ }
    try { await b.telegram.sendMessage(chatId, caption); return true; } catch { return false; }
  }
}
