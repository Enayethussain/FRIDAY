// Payment domain types. Raw provider secrets, UPI PINs, OTPs and card data
// NEVER appear here — the server only handles order IDs, tokens and statuses.
export type OrderStatus = 'created' | 'pending' | 'success' | 'failed' | 'cancelled' | 'expired' | 'fulfilled' | 'refunded';
export type WebhookEventType = 'checkout.order.completed' | 'checkout.order.failed' | 'pg.refund.completed' | 'pg.refund.failed' | 'unknown';

export interface PaymentOrder {
  orderId: string; // internal unique id: frd_ord_<time><rand>
  userKey: string; // device:<id> — owner binding (existing auth model)
  email: string; // lowercase account email when supplied (reinstall sync)
  planId: 'plus' | 'pro';
  period: string; // monthly | 3_month | yearly (server-validated)
  durationDays: number; // entitlement term for this purchase
  amount: number; // INR, from server period table (never frontend)
  amountPaise: number;
  currency: 'INR';
  provider: string; // e.g. 'phonepe'
  providerOrderId: string;
  checkoutUrl: string; // PhonePe pay-page redirect (UPI intent + QR live here)
  checkoutExpiresAt: number; // ms epoch from provider expireAt
  status: OrderStatus;
  providerPaymentId: string; // PhonePe transactionId (verified only)
  failureCode: string;
  expiresAt: number; // internal expiry (ms epoch)
  fulfilledAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookEvent {
  eventKey: string; // provider + order + type + payment id (dedupe key)
  provider: string;
  providerOrderId: string;
  providerPaymentId: string;
  orderId: string;
  eventType: WebhookEventType;
  verified: boolean;
  processedAt: number;
  receivedAt: number;
  note: string;
}

export interface RefundRecord {
  refundId: string; // internal: frd_rfd_...
  providerRefundId: string;
  orderId: string;
  userKey: string;
  amount: number;
  currency: 'INR';
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: number;
  updatedAt: number;
}

export interface ProviderOrderResult {
  providerOrderId: string;
  checkoutUrl: string;
  checkoutExpiresAt: number;
  state: string;
  /** UPI intent / QR / hosted page when the provider supplies them. */
  upiIntent?: string;
  qrCode?: string;
  payUrl?: string;
}

export interface ProviderStatusResult {
  state: 'PENDING' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';
  amountPaise: number;
  providerPaymentId: string;
  paymentMode: string;
  rawCode: string;
}

export interface ProviderRefundResult {
  providerRefundId: string;
  amountPaise: number;
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
}

/** Provider abstraction — swap providers via PAYMENT_PROVIDER env. */
export interface PaymentProvider {
  name: string;
  /** True only when all required credentials are configured. */
  isConfigured(): boolean;
  createOrder(args: {
    internalOrderId: string; amountPaise: number; redirectUrl: string; expireAfterSec: number;
  }): Promise<ProviderOrderResult>;
  getPaymentStatus(internalOrderId: string): Promise<ProviderStatusResult>;
  /** Returns verified event or null when signature/auth fails. */
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<{
    ok: boolean; eventType: WebhookEventType; providerOrderId: string; providerPaymentId: string; amountPaise: number;
  } | null>;
  refund(args: { internalRefundId: string; internalOrderId: string; amountPaise: number }): Promise<ProviderRefundResult>;
  getRefundStatus(internalRefundId: string): Promise<{ state: 'PENDING' | 'COMPLETED' | 'FAILED' }>;
}
