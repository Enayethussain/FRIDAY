// Central web pricing configuration — SINGLE SOURCE for the /upgrade page.
// Placeholder prices until the payment system is connected. To change a
// price later, edit ONLY this file (then wire it to the real checkout).
// Real EKQR/UPI catalog lives server-side and is NOT
// duplicated here. Never report a purchase as successful from this config.
export type WebPlanId = 'free' | 'plus' | 'pro';

export interface WebPlan {
  id: WebPlanId;
  name: string;
  price: number;
  currency: 'INR';
  period: string;
  priceLabel: string;
  tagline: string;
  features: string[];
}

export const PLANS: Record<WebPlanId, WebPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'INR',
    period: '',
    priceLabel: 'Free',
    tagline: 'Everyday FRIDAY, free forever.',
    features: [
      'FRIDAY AI chat (Hindi / English / Hinglish)',
      'FRIDAY female voice + voice commands',
      'Orb / HUD + basic gestures',
      'Basic memory, vault, FRIDAY Share',
      'AI access within server quota',
    ],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    price: 0,
    currency: 'INR',
    period: '/ month',
    priceLabel: '₹XXX / month',
    tagline: 'More power for daily drivers.',
    features: [
      'Everything in Free',
      'Ad-free FRIDAY',
      'JARVIS voice mode',
      'Advanced phone control + Share',
      'Screen awareness (permission-gated)',
      'Higher AI quota + more devices',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 0,
    currency: 'INR',
    period: '/ month',
    priceLabel: '₹XXX / month',
    tagline: 'Maximum FRIDAY for power users.',
    features: [
      'Everything in Plus',
      'Advanced gestures + hologram / 3D library',
      'App Builder + protocols + knowledge graph',
      'Highest AI quota + most devices',
      '3D model upload + early-access shelf',
    ],
  },
};

export const PLAN_ORDER: WebPlanId[] = ['free', 'plus', 'pro'];
