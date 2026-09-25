// Shared Telegram bot-order creation (used by the Express route; the bot
// calls the same logic over internal HTTP per spec). Amounts are RUPEES.
import type { FridayStore } from '../store.js';
import type { PaymentProvider } from '../payments/types.js';

export interface BotOrderInput {
  chatId: string;
  amount: number;
  customerName: string;
}

export interface BotOrderResult {
  orderId: string;
  qrImageUrl: string;
  upiIntentUrl: string;
  payUrl: string;
  amount: number;
  currency: string;
}

function newClientTxnId(): string {
  return `ORD_${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function createBotOrder(
  deps: { store: FridayStore; provider: PaymentProvider; appUrl: string },
  input: BotOrderInput
): Promise<BotOrderResult> {
  const { store, provider, appUrl } = deps;
  const chatId = String(input.chatId ?? '').trim().slice(0, 64);
  const amount = Number(input.amount);
  const customerName = String(input.customerName ?? '').trim().slice(0, 60);
  if (!chatId) throw new Error('chatId is required.');
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    throw new Error('Amount must be 1..100000 INR.');
  }
  if (!customerName) throw new Error('Customer name is required.');
  if (!provider.isConfigured()) throw new Error('UPI payments are not active yet.');
  const clientTxnId = newClientTxnId();
  const now = Date.now();
  // udf1 carries the chatId so the webhook can route delivery back to Telegram.
  const created = await provider.createOrder({
    internalOrderId: clientTxnId,
    amountPaise: amount * 100,
    redirectUrl: `${String(appUrl || '').replace(/\/$/, '')}/payment/success?orderId=${encodeURIComponent(clientTxnId)}`,
    expireAfterSec: 1200,
    planLabel: 'FRIDAY Pro (Telegram)',
    udf1: chatId,
  });
  const upiIntent = (created as any)?.upiIntent ? String((created as any).upiIntent) : '';
  const qrCode = (created as any)?.qrCode ? String((created as any).qrCode) : '';
  const payUrl = String(created.checkoutUrl || upiIntent);
  if (!payUrl) throw new Error('Payment link nahi mila. Dobara try karo.');
  store.saveBotOrder({
    clientTxnId, chatId, amount, amountPaise: amount * 100, customerName,
    status: 'pending', providerOrderId: String(created.providerOrderId || ''),
    createdAt: now, updatedAt: now,
  });
  return { orderId: clientTxnId, qrImageUrl: qrCode, upiIntentUrl: upiIntent, payUrl, amount, currency: 'INR' };
}
