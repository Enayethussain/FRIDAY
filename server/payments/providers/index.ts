// Provider selection: PAYMENT_PROVIDER=ekqr | phonepe (default: ekqr).
// Unconfigured providers report isConfigured()===false and every money
// path fails closed — premium is never granted without verification.
import type { PaymentProvider } from './types.js';
import { EkqrProvider } from './ekqr.js';
import { PhonePeProvider } from './phonepe.js';

export function selectProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER || 'ekqr').trim().toLowerCase();
  if (name === 'phonepe') return new PhonePeProvider();
  return new EkqrProvider();
}
